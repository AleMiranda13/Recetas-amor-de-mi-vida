// /api/search.js
// Búsqueda por nombre en dominios permitidos con fallback y sin 500.
// Si todo falla, devolvemos { ok: true, results: [] } (la app no se rompe).

const ALLOWED = [
  "recetasgratis.net",
  "pequerecetas.com",
  "directoalpaladar.com",
  "cocinafacil.com.mx",
  "cookpad.com"
];

// Parseador para DuckDuckGo HTML y Lite
function parseDDG(html) {
  const out = [];
  const re = /<a[^>]+class="[^"]*(result__a|result-link)[^"]*"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = m[2];
    const title = (m[3] || '').replace(/<[^>]+>/g, '').trim();
    try {
      const u = new URL(url);
      if (ALLOWED.some(d => u.hostname === d || u.hostname.endsWith('.' + d))) {
        out.push({ title, url, site: u.hostname });
      }
    } catch (_) {}
  }
  return out;
}

async function fetchText(url) {
  // Timeout + headers + retry
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept": "text/html"
      },
      signal: controller.signal
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
    // Para reducir bloqueos: menos dominios por consulta
    const domains = ALLOWED.slice(0, 4);

    const all = [];
    for (const d of domains) {
      // 1) Primario: DuckDuckGo HTML
      try {
        const url1 = `https://duckduckgo.com/html/?kp=-1&kl=es-es&q=site:${encodeURIComponent(d)}+${encodeURIComponent(q)}`;
        const html1 = await fetchText(url1);
        const items1 = parseDDG(html1).slice(0, 3);
        all.push(...items1);
        continue; // si funcionó, no vamos al fallback
      } catch {}

      // 2) Fallback: DuckDuckGo Lite
      try {
        const url2 = `https://lite.duckduckgo.com/lite/?q=site:${encodeURIComponent(d)}+${encodeURIComponent(q)}`;
        const html2 = await fetchText(url2);
        const items2 = parseDDG(html2).slice(0, 3);
        all.push(...items2);
      } catch {}
    }

    // Dedupe por URL
    const map = new Map();
    for (const it of all) if (!map.has(it.url)) map.set(it.url, it);

    // NUNCA 500: si hay bloqueo, devolvemos ok:true con results vacíos
    return res.status(200).json({ ok: true, results: Array.from(map.values()) });
  } catch (e) {
    // También evitamos reventar aquí
    return res.status(200).json({ ok: true, results: [], warn: "fallback", detail: String(e) });
  }
};

module.exports.config = { runtime: "nodejs" };