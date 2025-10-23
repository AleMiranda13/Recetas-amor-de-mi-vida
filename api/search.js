// api/search.js
// Busca en la web (ES). Si SerpAPI falla o no hay resultados, devuelve sugerencias útiles.
// Compatible con el front: { ok:true, results:[{title,url,snippet?,site?}] }

const ALLOWED = [
  "recetasgratis.net",
  "pequerecetas.com",
  "directoalpaladar.com",
  "cocinafacil.com.mx",
  "cookpad.com",
  "recetasderechupete.com",
  "kiwilimon.com",
  "bonviveur.es",
  "javirecetas.com",
  "deliciosi.com"
];

const UA = "RecetasES/1.0";

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const SYN = {
  papa:["papas","patata","patatas"], papas:["papa","patata","patatas"],
  patata:["patatas","papa","papas"], patatas:["patata","papa","papas"],
  maiz:["maíz","choclo","elote"], choclo:["maíz","maiz","elote"], elote:["maíz","maiz","choclo"],
  poroto:["frijol","alubia","habichuela"], frijol:["poroto","alubia","habichuela"], alubia:["poroto","frijol","habichuela"],
  arveja:["guisante","chícharo"], guisante:["arveja","chícharo"], "chícharo":["arveja","guisante"],
  camote:["batata","boniato"], batata:["camote","boniato"], boniato:["batata","camote"],
  aguacate:["palta"], palta:["aguacate"],
  zucchini:["calabacín","calabacin"], calabacin:["zucchini","calabacín"], "calabacín":["zucchini","calabacin"],
  remolacha:["betabel"], betabel:["remolacha"],
  torta:["pastel","bizcocho","queque","tarta"],
  pastel:["torta","bizcocho","queque","tarta"],
  bizcocho:["pastel","torta","queque","tarta"],
  queque:["bizcocho","pastel","torta","tarta"],
  tarta:["pastel","torta","bizcocho","queque"]
};

function queryVariants(q) {
  const base = normalize(q);
  const tokens = base.split(" ").filter(Boolean);
  const variants = new Set([base, `${base} receta`, `${base} recetas`, `"${base}"`]);

  tokens.forEach((tk, i) => {
    const syns = SYN[tk];
    if (syns) {
      syns.forEach(s => {
        const v = tokens.slice(); v[i] = s;
        const phrase = v.join(" ");
        variants.add(phrase);
        variants.add(`${phrase} receta`);
        variants.add(`${phrase} recetas`);
      });
    }
  });
  return Array.from(variants).slice(0, 12);
}

async function serpapiRaw(query, key) {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("hl", "es");
  url.searchParams.set("num", "10");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", key);
  const r = await fetch(url.toString(), { headers: { "User-Agent": UA } });
  if (!r.ok) return { list: [], error: `HTTP ${r.status}` };
  const j = await r.json();
  if (j.error) return { list: [], error: j.error };           // rate limit u otros
  const list = Array.isArray(j.organic_results) ? j.organic_results : [];
  return { list, error: null };
}
function mapAllowed(list) {
  const out = [];
  for (const it of list) {
    const link = it.link || it.formattedUrl;
    if (!link) continue;
    try {
      const u = new URL(link);
      if (ALLOWED.some(d => u.hostname === d || u.hostname.endsWith("." + d))) {
        out.push({ title: it.title || link, url: link, site: u.hostname, snippet: it.snippet || "" });
      }
    } catch {}
  }
  return out;
}
function mapAny(list) {
  const out = [];
  for (const it of list) {
    const link = it.link || it.formattedUrl;
    if (!link) continue;
    try {
      const u = new URL(link);
      out.push({ title: it.title || link, url: link, site: u.hostname, snippet: it.snippet || "" });
    } catch {}
  }
  return out;
}

// Sugerencias offline (sin SerpAPI) para no dejar vacío
function offlineSuggestions(q) {
  const s = encodeURIComponent(q);
  const sug = [
    { title: `Buscar "${q}" en RecetasGratis`, url: `https://www.recetasgratis.net/busqueda?q=${s}` },
    { title: `Buscar "${q}" en Directo al Paladar`, url: `https://www.directoalpaladar.com/buscar?q=${s}` },
    { title: `Buscar "${q}" en Kiwilimon`, url: `https://www.kiwilimon.com/buscar?q=${s}` },
    { title: `Buscar "${q}" en Cookpad`, url: `https://cookpad.com/ar/buscar/${s}` },
    { title: `Buscar "${q}" en Google`, url: `https://www.google.com/search?q=${s}+receta` }
  ];
  return sug.map(x => ({ ...x, site: new URL(x.url).hostname, snippet: "" }));
}

const CACHE = new Map();
const TTL_MS = 60_000;

module.exports = async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  if (!q) return res.status(400).json({ error: "Falta parámetro 'q'." });

  const key = process.env.SERPAPI_KEY || "";
  const cacheKey = normalize(q);
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.t < TTL_MS) {
    return res.status(200).json({ ok: true, results: cached.data, cached: true });
  }

  let results = [];
  let lastErr = null;

  try {
    const variants = queryVariants(q);

    if (key) {
      // 1) Intento con dominios permitidos
      const collected = [];
      for (const d of ALLOWED) {
        for (const v of variants) {
          const { list, error } = await serpapiRaw(`site:${d} ${v}`, key);
          if (error) lastErr = error; // guardamos el último error visto
          collected.push(...mapAllowed(list).slice(0, 3));
        }
      }
      // dedupe
      const map = new Map();
      for (const it of collected) if (!map.has(it.url)) map.set(it.url, it);
      results = Array.from(map.values());

      // 2) Fallback sin filtro
      if (!results.length) {
        const any = [];
        for (const v of variants) {
          const { list, error } = await serpapiRaw(v, key);
          if (error) lastErr = error;
          any.push(...mapAny(list));
          if (any.length >= 20) break;
        }
        const uniq = new Map();
        for (const it of any) if (!uniq.has(it.url)) uniq.set(it.url, it);
        results = Array.from(uniq.values()).slice(0, 12);
      }
    }

    // 3) Último recurso sin SerpAPI / o si no hubo resultados
    if (!results.length) {
      results = offlineSuggestions(q);
    }

    CACHE.set(cacheKey, { t: Date.now(), data: results });
    return res.status(200).json({ ok: true, results, warn: lastErr ? String(lastErr) : undefined });
  } catch (e) {
    // en error duro, devolvemos igualmente sugerencias
    const results = offlineSuggestions(q);
    return res.status(200).json({ ok: true, results, warn: "fallback:" + String(e) });
  }
};

module.exports.config = { runtime: "nodejs" };