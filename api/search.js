// api/search.js — funciona con o sin SERPAPI
const ALLOWED = [
  "recetasgratis.net",
  "directoalpaladar.com",
  "kiwilimon.com",
  "cookpad.com",
];

const UA = "RecetasES/1.3";
const CACHE = new Map();
const TTL_MS = 15_000;

// -------- util
function normalize(s){
  return (s||"").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\s+/g," ").trim();
}
function dedupe(items){
  const m = new Map();
  for (const it of items) if (it.url && !m.has(it.url)) m.set(it.url, it);
  return Array.from(m.values());
}
function onlyAllowed(items){
  return items.filter(it=>{
    try{
      const h = new URL(it.url).hostname;
      return ALLOWED.some(d => h===d || h.endsWith("."+d));
    }catch{ return false; }
  });
}
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

// -------- SerpAPI (si hay y tiene cupo)
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
  const mapped = list.map(it=>{
    const url = it.link || it.formattedUrl;
    return url ? { title: it.title || url, url, site: safeHost(url), snippet: it.snippet || "" } : null;
  }).filter(Boolean);
  return { list: mapped, error:null };
}
function safeHost(url){ try{ return new URL(url).hostname; }catch{ return ""; } }

// -------- Scrapers sin API (HTML público)
async function fetchHTML(url){
  const r = await fetch(url, { headers:{ "User-Agent": UA } });
  if (!r.ok) throw new Error("HTTP "+r.status);
  return await r.text();
}

// RecetasGratis
async function scrapeRecetasGratis(q){
  const s = encodeURIComponent(q);
  const url = `https://www.recetasgratis.net/busqueda?q=${s}`;
  const html = await fetchHTML(url);
  const out = [];
  const re = /<a[^>]+href="(https:\/\/www\.recetasgratis\.net\/receta[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 8){
    const u = m[1];
    let title = m[2].replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim();
    if (!title) title = u;
    out.push({ title, url:u, site:"recetasgratis.net", snippet:"" });
  }
  return out;
}

// Directo al Paladar
async function scrapeDirecto(q){
  const s = encodeURIComponent(q);
  const url = `https://www.directoalpaladar.com/buscar?q=${s}`;
  const html = await fetchHTML(url);
  const out = [];
  const re = /<a class="link"[^>]+href="(https:\/\/www\.directoalpaladar\.com\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 8){
    const u = m[1];
    if (/\/categoria\//i.test(u)) continue;
    let title = m[2].replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim();
    out.push({ title: title || u, url:u, site:"directoalpaladar.com", snippet:"" });
  }
  return out;
}

// Kiwilimon
async function scrapeKiwilimon(q){
  const s = encodeURIComponent(q);
  const url = `https://www.kiwilimon.com/buscar?q=${s}`;
  const html = await fetchHTML(url);
  const out = [];
  const re = /<a[^>]+href="(https:\/\/www\.kiwilimon\.com\/receta[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 8){
    const u = m[1];
    let title = m[2].replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim();
    out.push({ title: title || u, url:u, site:"kiwilimon.com", snippet:"" });
  }
  return out;
}

// Cookpad
async function scrapeCookpad(q){
  const s = encodeURIComponent(q);
  const url = `https://cookpad.com/es/search/${s}`;
  const html = await fetchHTML(url);
  const out = [];
  const re = /<a[^>]+class="recipe-name"[^>]+href="(\/es\/recetas\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 8){
    const path = m[1].replace(/&amp;/g,"&");
    const u = `https://cookpad.com${path}`;
    let title = m[2].replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim();
    out.push({ title: title || u, url:u, site:"cookpad.com", snippet:"" });
  }
  return out;
}

// Sugerencias (fallback)
function suggestions(q){
  const s = encodeURIComponent(q);
  return [
    { title:`Buscar "${q}" en RecetasGratis`, url:`https://www.recetasgratis.net/busqueda?q=${s}` },
    { title:`Buscar "${q}" en Directo al Paladar`, url:`https://www.directoalpaladar.com/buscar?q=${s}` },
    { title:`Buscar "${q}" en Kiwilimon`, url:`https://www.kiwilimon.com/buscar?q=${s}` },
    { title:`Buscar "${q}" en Cookpad`, url:`https://cookpad.com/es/search/${s}` },
    { title:`Buscar "${q}" en Google`, url:`https://www.google.com/search?q=${s}+receta` }
  ].map(x => ({ ...x, site: safeHost(x.url), snippet:"", suggestion:true }));
}

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
  let warn = null;

  try{
    if (key){
      // Intentar con SerpAPI
      const { list, error } = await serpapi(`${q} receta`, key);
      if (error) warn = error;
      let filtered = dropListingPages(onlyAllowed(list));
      final = dedupe(filtered).slice(0,12);
    }

    if (!final.length){
      // Scrapers sin API
      const results = await Promise.allSettled([
        scrapeRecetasGratis(q),
        scrapeDirecto(q),
        scrapeKiwilimon(q),
        scrapeCookpad(q),
      ]);
      const merged = results
        .filter(r=>r.status==="fulfilled")
        .flatMap(r=>r.value || []);
      let filtered = dropListingPages(onlyAllowed(merged));
      final = dedupe(filtered).slice(0,12);
      if (!final.length) warn = (warn||"")+" no_api_results";
    }

    if (!final.length){
      final = suggestions(q);
      warn = (warn||"")+" fallback_suggestions";
    }

    CACHE.set(cacheKey, { t: Date.now(), data: final });
    res.status(200).json({ ok:true, results: final, warn: warn || undefined });
  }catch(e){
    res.status(200).json({ ok:true, results: suggestions(q), warn: 'fallback:'+String(e) });
  }
};

module.exports.config = { runtime: "nodejs" };