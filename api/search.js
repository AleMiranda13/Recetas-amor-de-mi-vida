// api/search.js
// Búsqueda web en español con filtros y Fallback sin filtro si no hay resultados.
// Requiere SERPAPI_KEY en variables de entorno (Vercel → Settings → Environment Variables).

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
  const variants = new Set([base, `"${base}"`, `${base} receta`, `${base} recetas`]);
  tokens.forEach((tk, i) => {
    const syns = SYN[tk];
    if (syns) {
      syns.forEach(s => {
        const v = tokens.slice(); v[i] = s;
        variants.add(v.join(" "));
        variants.add(`${v.join(" ")} receta`);
        variants.add(`${v.join(" ")} recetas`);
      });
    }
  });
  // Máximo 12 para no exceder cuota
  return Array.from(variants).slice(0, 12);
}

async function serpapiRaw(query, key) {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("hl", "es");
  url.searchParams.set("num", "10");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", key);
  const r = await fetch(url.toString(), { headers: { "User-Agent": "RecetasES/1.0" } });
  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j.organic_results) ? j.organic_results : [];
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

const CACHE = new Map();
const TTL_MS = 60_000;

module.exports = async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  if (!q) return res.status(400).json({ error: "Falta parámetro 'q'." });

  const key = process.env.SERPAPI_KEY;
  if (!key) {
    // Sin clave, devolvemos vacío pero sin romper el front
    return res.status(200).json({ ok: true, results: [], warn: "Falta SERPAPI_KEY" });
  }

  const cacheKey = normalize(q);
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.t < TTL_MS) {
    return res.status(200).json({ ok: true, results: cached.data, cached: true });
  }

  try {
    const vars = queryVariants(q);

    // 1) Intento principal: site:dominio + variantes
    const collected = [];
    for (const d of ALLOWED) {
      for (const v of vars) {
        const raw = await serpapiRaw(`site:${d} ${v}`, key);
        collected.push(...mapAllowed(raw).slice(0, 3));
      }
    }

    // Dedupe por URL
    const map = new Map();
    for (const it of collected) if (!map.has(it.url)) map.set(it.url, it);
    let results = Array.from(map.values());

    // 2) Fallback: si no hay nada permitido, buscar sin filtro (con las mismas variantes)
    if (!results.length) {
      const any = [];
      for (const v of vars) {
        const raw = await serpapiRaw(v, key);
        any.push(...mapAny(raw));
        if (any.length >= 12) break;
      }
      // dedupe y recortar
      const uniq = new Map();
      for (const it of any) if (!uniq.has(it.url)) uniq.set(it.url, it);
      results = Array.from(uniq.values()).slice(0, 12);
    }

    CACHE.set(cacheKey, { t: Date.now(), data: results });
    return res.status(200).json({ ok: true, results });
  } catch (e) {
    return res.status(200).json({ ok: true, results: [], warn: "fallback", detail: String(e) });
  }
};

module.exports.config = { runtime: "nodejs" };