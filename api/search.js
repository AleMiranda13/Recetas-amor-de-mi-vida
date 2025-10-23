// api/search.js
// Busca recetas en español usando SerpAPI. Si no hay resultados, intenta sin filtro
// y prioriza dominios de recetas. Último recurso: sugiere búsquedas (marcadas suggestion:true).
// Devuelve { ok:true, results:[{ title, url, site, snippet?, suggestion? }] }

const ALLOWED = [
  "recetasgratis.net","pequerecetas.com","directoalpaladar.com","cocinafacil.com.mx",
  "cookpad.com","recetasderechupete.com","kiwilimon.com","bonviveur.es","javirecetas.com","deliciosi.com"
];
// dominios preferidos cuando hacemos una búsqueda “suelta”
const PREFERRED = new Set([
  ...ALLOWED,
  "cocinadelirante.com","paulinacocina.net","annarecetasfaciles.com",
  "todareceta.es","cocinafacil.com.co","cocinaabuenashoras.com"
]);

const UA = "RecetasES/1.1";

function normalize(s){
  return (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
}
const SYN = {
  torta:["pastel","bizcocho","queque","tarta"],
  pastel:["torta","bizcocho","queque","tarta"],
  bizcocho:["pastel","torta","queque","tarta"],
  queque:["bizcocho","pastel","torta","tarta"],
  tarta:["pastel","torta","bizcocho","queque"],
  papa:["papas","patata","patatas"], papas:["papa","patata","patatas"],
  patata:["patatas","papa","papas"], patatas:["patata","papa","papas"]
};
function queryVariants(q){
  const base = normalize(q);
  const toks = base.split(" ").filter(Boolean);
  const variants = new Set([base, `${base} receta`, `${base} recetas`, `"${base}"`]);
  toks.forEach((tk,i)=>{
    const syn = SYN[tk];
    if (syn) syn.forEach(s=>{
      const arr = toks.slice(); arr[i]=s;
      const phrase = arr.join(" ");
      variants.add(phrase);
      variants.add(`${phrase} receta`);
      variants.add(`${phrase} recetas`);
    });
  });
  return Array.from(variants).slice(0,12);
}

async function serpapiRaw(q, key){
  const u = new URL("https://serpapi.com/search.json");
  u.searchParams.set("engine","google");
  u.searchParams.set("hl","es");
  u.searchParams.set("num","10");
  u.searchParams.set("q", q);
  u.searchParams.set("api_key", key);
  const r = await fetch(u, { headers:{ "User-Agent": UA } });
  if (!r.ok) return { list: [], error: `HTTP ${r.status}` };
  const j = await r.json();
  if (j.error) return { list: [], error: j.error };
  const list = Array.isArray(j.organic_results) ? j.organic_results : [];
  return { list, error:null };
}

function mapAllowed(list){
  const out=[];
  for(const it of list){
    const link = it.link || it.formattedUrl;
    if (!link) continue;
    try{
      const u = new URL(link);
      if (ALLOWED.some(d=>u.hostname===d || u.hostname.endsWith("."+d))){
        out.push({ title: it.title || link, url: link, site: u.hostname, snippet: it.snippet || "" });
      }
    }catch{}
  }
  return out;
}
function mapAny(list){
  const out=[];
  for(const it of list){
    const link = it.link || it.formattedUrl;
    if (!link) continue;
    try{
      const u = new URL(link);
      out.push({ title: it.title || link, url: link, site: u.hostname, snippet: it.snippet || "" });
    }catch{}
  }
  return out;
}
// quedarse con páginas con “pinta” de receta
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
function offlineSuggestions(q){
  const s = encodeURIComponent(q);
  return [
    { title:`Buscar "${q}" en RecetasGratis`, url:`https://www.recetasgratis.net/busqueda?q=${s}` },
    { title:`Buscar "${q}" en Directo al Paladar`, url:`https://www.directoalpaladar.com/buscar?q=${s}` },
    { title:`Buscar "${q}" en Kiwilimon`, url:`https://www.kiwilimon.com/buscar?q=${s}` },
    { title:`Buscar "${q}" en Cookpad`, url:`https://cookpad.com/ar/buscar/${s}` },
    { title:`Buscar "${q}" en Google`, url:`https://www.google.com/search?q=${s}+receta` }
  ].map(x=>({ ...x, site: new URL(x.url).hostname, snippet:"", suggestion:true }));
}

const CACHE=new Map(); const TTL_MS=60_000;

module.exports = async (req,res)=>{
  const q=(req.query.q||"").toString().trim();
  if(!q) return res.status(400).json({ error:"Falta parámetro 'q'." });

  const key = process.env.SERPAPI_KEY || "";
  const cacheKey = normalize(q);
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now()-cached.t < TTL_MS) {
    return res.status(200).json({ ok:true, results: cached.data, cached:true });
  }

  let results=[]; let lastErr=null;
  try{
    const vars = queryVariants(q);

    if (key){
      // 1) lista blanca
      const collected=[];
      for(const d of ALLOWED){
        for(const v of vars){
          const { list, error } = await serpapiRaw(`site:${d} ${v}`, key);
          if (error) lastErr = error;
          collected.push(...mapAllowed(list).slice(0,3));
        }
      }
      const ded1 = new Map(); for(const it of collected) if(!ded1.has(it.url)) ded1.set(it.url,it);
      results = Array.from(ded1.values());

      // 2) búsqueda suelta + priorización de dominios de recetas
      if (!results.length){
        const loose=[];
        for(const v of vars){
          const { list, error } = await serpapiRaw(v, key);
          if (error) lastErr = error;
          loose.push(...mapAny(list));
          if (loose.length >= 40) break;
        }
        const filtered = likelyRecipe(loose);
        const ded2 = new Map(); for(const it of filtered) if(!ded2.has(it.url)) ded2.set(it.url,it);
        results = Array.from(ded2.values()).slice(0,12);
      }
    }

    // 3) último recurso: sugerencias
    if (!results.length) results = offlineSuggestions(q);

    CACHE.set(cacheKey, { t:Date.now(), data:results });
    return res.status(200).json({ ok:true, results, warn:lastErr || undefined });
  }catch(e){
    return res.status(200).json({ ok:true, results: offlineSuggestions(q), warn:'fallback:'+String(e) });
  }
};

module.exports.config = { runtime: "nodejs" };
