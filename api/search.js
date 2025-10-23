// api/search.js — “real recipes first”
const ALLOWED = [
  // ES / global
  "recetasgratis.net","pequerecetas.com","directoalpaladar.com","recetasderechupete.com",
  "bonviveur.es","javirecetas.com","deliciosi.com","cookpad.com",
  // LATAM
  "cocinafacil.com.mx","kiwilimon.com","cocinadelirante.com","paulinacocina.net",
  "annarecetasfaciles.com","todareceta.es","cocinafacil.com.co","cocinayvino.com",
  "comedera.com","elsemanario.com.mx","midiario.com","midiariodecocina.com" // puedes quitar/añadir
];

// dominios preferidos cuando buscamos “suelto”
const PREFERRED = new Set(ALLOWED);

const UA = "RecetasES/1.2";

function normalize(s){
  return (s||"").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\s+/g," ").trim();
}

const SYN = {
  torta:["pastel","bizcocho","queque","tarta"],
  pastel:["torta","bizcocho","queque","tarta"],
  bizcocho:["pastel","torta","queque","tarta"],
  queque:["bizcocho","pastel","torta","tarta"],
  tarta:["pastel","torta","bizcocho","queque"],
  papa:["papas","patata","patatas"],papas:["papa","patata","patatas"],
  patata:["patatas","papa","papas"],patatas:["patata","papa","papas"]
};

function queryVariants(q){
  const base = normalize(q);
  const toks = base.split(" ").filter(Boolean);
  const out = new Set([base, `${base} receta`, `${base} recetas`, `"${base}"`]);
  toks.forEach((tk,i)=>{
    const syn = SYN[tk];
    if (syn) syn.forEach(s=>{
      const arr = toks.slice(); arr[i]=s;
      const p = arr.join(" ");
      out.add(p); out.add(`${p} receta`); out.add(`${p} recetas`);
    });
  });
  return Array.from(out).slice(0,12);
}

async function serpapi(q, key){
  const u = new URL("https://serpapi.com/search.json");
  u.searchParams.set("engine","google");
  u.searchParams.set("hl","es");
  u.searchParams.set("num","10");
  u.searchParams.set("q", q);
  u.searchParams.set("api_key", key);
  const r = await fetch(u, { headers:{ "User-Agent": UA } });
  if (!r.ok) return { list:[], error:`HTTP ${r.status}` };
  const j = await r.json();
  if (j.error) return { list:[], error:j.error };
  const list = Array.isArray(j.organic_results) ? j.organic_results : [];
  return { list, error:null };
}

function mapResults(list){
  const out=[];
  for (const it of list){
    const link = it.link || it.formattedUrl;
    if (!link) continue;
    try{
      const u = new URL(link);
      out.push({ title: it.title || link, url: link, site: u.hostname, snippet: it.snippet || "" });
    }catch{}
  }
  return out;
}

// Quitar listados/portadas
function dropListingPages(items){
  const BAD = /(buscar|b[úu]squeda|search|categoria|categor[ií]a|tag|etiqueta|listado|coleccion|collection)/i;
  return items.filter(it=>{
    try{
      const u = new URL(it.url);
      const path = u.pathname || "/";
      const tooShort = path === "/" || path.split("/").filter(Boolean).length < 2;
      const isBad = BAD.test(path) || BAD.test(u.search || "");
      const titleLooksSearch = /^buscar\s+/i.test(it.title || "");
      const looksLikeListing = /resultados|recetas\s*de\s|todas\s+las\s+recetas/i.test(it.title || "");
      return !tooShort && !isBad && !titleLooksSearch && !looksLikeListing;
    }catch{ return false; }
  });
}

// Quedarnos con páginas con “pinta” de receta
function likelyRecipe(items){
  const WORDS = /receta|ingredientes|preparaci[oó]n|paso a paso|cómo hacer/i;
  return items.filter(it=>{
    try{
      const u = new URL(it.url);
      const hostOk = PREFERRED.has(u.hostname) || ALLOWED.some(d=>u.hostname===d||u.hostname.endsWith("."+d));
      const pathOk = /receta|recipe/i.test(u.pathname);
      const textOk = WORDS.test(it.title||"") || WORDS.test(it.snippet||"");
      return hostOk || pathOk || textOk;
    }catch{ return false; }
  });
}

function suggestions(q){
  const s = encodeURIComponent(q);
  return [
    { title:`Buscar "${q}" en RecetasGratis`, url:`https://www.recetasgratis.net/busqueda?q=${s}` },
    { title:`Buscar "${q}" en Directo al Paladar`, url:`https://www.directoalpaladar.com/buscar?q=${s}` },
    { title:`Buscar "${q}" en Kiwilimon`, url:`https://www.kiwilimon.com/buscar?q=${s}` },
    { title:`Buscar "${q}" en Cookpad`, url:`https://cookpad.com/es/search/${s}` },
    { title:`Buscar "${q}" en Google`, url:`https://www.google.com/search?q=${s}+receta` }
  ].map(x => ({ ...x, site: new URL(x.url).hostname, snippet:"", suggestion:true }));
}

const CACHE = new Map();
const TTL_MS = 20_000;

module.exports = async (req,res)=>{
  const q=(req.query.q||"").toString().trim();
  if(!q) return res.status(400).json({ error:"Falta parámetro 'q'." });

  const key = process.env.SERPAPI_KEY || "";
  const cacheKey = normalize(q);
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now()-cached.t < TTL_MS){
    return res.status(200).json({ ok:true, results: cached.data, cached:true });
  }

  let final = [];
  let lastErr = null;

  try{
    const vars = queryVariants(q);

    if (key){
      // 1) Búsqueda por dominio (lista blanca)
      const perDomain = [];
      for (const d of ALLOWED){
        for (const v of vars){
          const { list, error } = await serpapi(`site:${d} ${v}`, key);
          if (error) lastErr = error;
          perDomain.push(...mapResults(list));
        }
      }

      // 2) Búsqueda suelta
      const loose = [];
      for (const v of vars){
        const { list, error } = await serpapi(v, key);
        if (error) lastErr = error;
        loose.push(...mapResults(list));
      }

      // 3) Fusionar, filtrar y deduplicar
      const merged = [...perDomain, ...loose];
      const cleaned = dropListingPages(likelyRecipe(merged));
      const ded = new Map();
      for (const it of cleaned) if (!ded.has(it.url)) ded.set(it.url, it);
      final = Array.from(ded.values()).slice(0, 12);
    }

    // 4) último recurso
    if (!final.length) final = suggestions(q);

    CACHE.set(cacheKey, { t: Date.now(), data: final });
    return res.status(200).json({ ok:true, results: final, warn: lastErr || undefined });
  }catch(e){
    return res.status(200).json({ ok:true, results: suggestions(q), warn: 'fallback:'+String(e) });
  }
};

module.exports.config = { runtime: "nodejs" };