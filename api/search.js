// /api/search.js — búsqueda robusta con variantes del término
const ALLOWED = [
  "recetasgratis.net",
  "pequerecetas.com",
  "directoalpaladar.com",
  "cocinafacil.com.mx",
  "cookpad.com",
  "recetasderechupete.com",
  "kiwilimon.com",
  "bonviveur.es"
];


// genera variantes útiles para ES/AR/MX
function queryVariants(q) {
  const s = q.toLowerCase().trim();
  const vars = new Set([s]);

  // plurales y sinónimos de "papa"
  if (/\bpapa\b/.test(s)) vars.add(s.replace(/\bpapa\b/g, "papas"));
  if (/\bpapas\b/.test(s)) vars.add(s.replace(/\bpapas\b/g, "papa"));
  if (/\bpapa(s)?\b/.test(s)) {
    vars.add(s.replace(/\bpapa(s)?\b/g, "patata"));
    vars.add(s.replace(/\bpapa(s)?\b/g, "patatas"));
  }
  // combinaciones típicas
  if (s.includes("pastel")) {
    vars.add(s + " de carne");
    vars.add(s + " al horno");
  }
  // dedupe a array
  return Array.from(vars);
}

function parseDDG(html) {
  const out = [];
  const re = /<a[^>]+class="[^"]*(result__a|result-link)[^"]*"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = m[2];
    const title = (m[3] || "").replace(/<[^>]+>/g, "").trim();
    try {
      const u = new URL(url);
      if (ALLOWED.some(d => u.hostname === d || u.hostname.endsWith("." + d))) {
        out.push({ title, url, site: u.hostname });
      }
    } catch (_) {}
  }
  return out;
}

async function fetchText(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "text/html",
      },
      signal: controller.signal,
    });
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

module.exports = async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  if (!q) return res.status(400).json({ error: "Falta parámetro 'q'." });

  try {
    const variants = queryVariants(q);         // ← variantes del término
    const domains = ALLOWED.slice(0, 5);       // limita por seguridad
    const all = [];

    for (const v of variants) {
      for (const d of domains) {
        // 1) primario
        try {
          const url1 = `https://duckduckgo.com/html/?kp=-1&kl=es-es&q=site:${encodeURIComponent(d)}+${encodeURIComponent(v)}`;
          const html1 = await fetchText(url1);
          all.push(...parseDDG(html1).slice(0, 3));
          continue; // si ya anduvo, evitamos fallback
        } catch {}

        // 2) fallback lite
        try {
          const url2 = `https://lite.duckduckgo.com/lite/?q=site:${encodeURIComponent(d)}+${encodeURIComponent(v)}`;
          const html2 = await fetchText(url2);
          all.push(...parseDDG(html2).slice(0, 3));
        } catch {}
      }
    }

    // dedupe por URL
    const map = new Map();
    for (const it of all) if (!map.has(it.url)) map.set(it.url, it);

    return res.status(200).json({ ok: true, results: Array.from(map.values()) });
  } catch (e) {
    // nunca romper el frontend
    return res.status(200).json({ ok: true, results: [], warn: "fallback", detail: String(e) });
  }
};

// Fuerza NodeJS (no edge)
module.exports.config = { runtime: "nodejs" };
