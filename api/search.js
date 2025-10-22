// Búsqueda por nombre en dominios permitidos, con fallback y sin 500.
const ALLOWED = ["recetasgratis.net","pequerecetas.com","directoalpaladar.com","cocinafacil.com.mx","cookpad.com"];

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
    } catch(_) {}
  }
  return out;
}

async function fetchText(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept": "text/html"
      },
      signal: controller.signal
    });
    return await res.text();
  } finally { clearTimeout(t); }
}

module.exports = async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  if (!q) return res.status(400).json({ error: "Falta parámetro 'q'." });

  try {
    const domains = ALLOWED.slice(0, 4);
    const all = [];
    for (const d of domains) {
      try {
        const url1 = `https://duckduckgo.com/html/?kp=-1&kl=es-es&q=site:${encodeURIComponent(d)}+${encodeURIComponent(q)}`;
        const html1 = await fetchText(url1);
        all.push(...parseDDG(html1).slice(0,3));
        continue;
      } catch {}
      try {
        const url2 = `https://lite.duckduckgo.com/lite/?q=site:${encodeURIComponent(d)}+${encodeURIComponent(q)}`;
        const html2 = await fetchText(url2);
        all.push(...parseDDG(html2).slice(0,3));
      } catch {}
    }
    const map = new Map(); for (const it of all) if (!map.has(it.url)) map.set(it.url, it);
    return res.status(200).json({ ok: true, results: Array.from(map.values()) });
  } catch (e) {
    return res.status(200).json({ ok: true, results: [], warn: "fallback", detail: String(e) });
  }
};
module.exports.config = { runtime: "nodejs" };
