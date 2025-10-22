
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
function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
const SYN = {
  "papa": ["papas","patata","patatas"],
  "papas": ["papa","patata","patatas"],
  "patata": ["patatas","papa","papas"],
  "patatas": ["patata","papa","papas"],
  "maiz": ["maíz","choclo","elote"],
  "choclo": ["maíz","maiz","elote"],
  "elote": ["maíz","maiz","choclo"],
  "poroto": ["frijol","alubia","habichuela"],
  "frijol": ["poroto","alubia","habichuela"],
  "alubia": ["poroto","frijol","habichuela"],
  "arveja": ["guisante","chícharo"],
  "guisante": ["arveja","chícharo"],
  "chícharo": ["arveja","guisante"],
  "camote": ["batata","boniato"],
  "batata": ["camote","boniato"],
  "boniato": ["batata","camote"],
  "aguacate": ["palta"],
  "palta": ["aguacate"],
  "zucchini": ["calabacín","calabacin"],
  "calabacin": ["zucchini","calabacín"],
  "calabacín": ["zucchini","calabacin"],
  "remolacha": ["betabel"],
  "betabel": ["remolacha"],
  "torta": ["pastel","bizcocho","queque","tarta"],
  "pastel": ["torta","bizcocho","queque","tarta"],
  "bizcocho": ["pastel","torta","queque","tarta"],
  "queque": ["bizcocho","pastel","torta","tarta"],
  "tarta": ["pastel","torta","bizcocho","queque"]
};
function queryVariants(q) {
  const base = normalize(q);
  const tokens = base.split(" ");
  const variants = new Set([base, `"${base}"`]);
  tokens.forEach((tk, i) => {
    const syns = SYN[tk];
    if (syns) {
      syns.forEach(s => {
        const v = tokens.slice(); v[i] = s;
        variants.add(v.join(" "));
      });
    }
  });
  return Array.from(variants).slice(0, 10);
}
async function serpapiSearch(query, key) {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("hl", "es");
  url.searchParams.set("num", "10");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", key);
  const r = await fetch(url.toString(), { headers: { "User-Agent": "RecetasES/1.0" } });
  if (!r.ok) return [];
  const j = await r.json();
  const list = Array.isArray(j.organic_results) ? j.organic_results : [];
  const out = [];
  for (const it of list) {
    const url = it.link || it.formattedUrl;
    const title = it.title || url;
    if (!url) continue;
    try {
      const u = new URL(url);
      if (ALLOWED.some(d => u.hostname === d || u.hostname.endsWith("." + d))) {
        out.push({ title, url, site: u.hostname });
      }
    } catch {}
  }
  return out;
}
const CACHE = new Map();
const TTL_MS = 60_000;
module.exports = async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  if (!q) return res.status(400).json({ error: "Falta parámetro 'q'." });
  const key = process.env.SERPAPI_KEY;
  if (!key) return res.status(200).json({ ok: true, results: [], warn: "Falta SERPAPI_KEY" });
  const cacheKey = normalize(q);
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.t < TTL_MS) {
    return res.status(200).json({ ok: true, results: cached.data, cached: true });
  }
  try {
    const vars = queryVariants(q);
    const all = [];
    for (const d of ALLOWED) {
      for (const v of vars) {
        const q2 = `site:${d} ${v}`;
        const items = await serpapiSearch(q2, key);
        all.push(...items.slice(0, 3));
      }
    }
    const map = new Map();
    for (const it of all) if (!map.has(it.url)) map.set(it.url, it);
    const results = Array.from(map.values());
    CACHE.set(cacheKey, { t: Date.now(), data: results });
    return res.status(200).json({ ok: true, results });
  } catch (e) {
    return res.status(200).json({ ok: true, results: [], warn: "fallback", detail: String(e) });
  }
};
module.exports.config = { runtime: "nodejs" };
