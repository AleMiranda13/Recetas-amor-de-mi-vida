import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  try {
    const url = (req.method === 'POST' ? req.body.url : req.query.url || '').trim();
    if (!url) return res.status(400).json({ error: 'Falta URL' });

    const r = await fetch(url, { headers: { 'User-Agent': 'RecetasES/1.0' } });
    if (!r.ok) throw new Error('No se pudo acceder');
    const html = await r.text();
    const $ = cheerio.load(html);

    let data = {};
    // 1️⃣ intenta extraer JSON-LD (schema.org)
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const obj = JSON.parse($(el).contents().text());
        const rec = Array.isArray(obj) ? obj.find(o => o['@type']?.includes('Recipe')) : obj;
        if (rec && rec['@type']?.includes('Recipe')) {
          data = rec;
          throw new Error('found'); // corta el each
        }
      } catch(e) { /* ignore */ }
    });

    // 2️⃣ normaliza
    const ingredients = data.recipeIngredient || data.ingredients || [];
    const steps =
      (Array.isArray(data.recipeInstructions)
        ? data.recipeInstructions.map(s =>
            typeof s === 'string' ? s : s.text || s.name || ''
          )
        : typeof data.recipeInstructions === 'string'
          ? data.recipeInstructions.split(/[\n\.]/).filter(Boolean)
          : []
      );

    let description = data.description || '';
    let title = data.name || $('title').text().trim();

    // 3️⃣ fallback si no encontró nada
    if (!ingredients.length) {
      const alt = $('li:contains(ingrediente), li.ingredient, .ingredientes li');
      if (alt.length) alt.each((_, el) => ingredients.push($(el).text().trim()));
    }
    if (!steps.length) {
      const alt2 = $('ol li, .instrucciones li, .pasos li, p');
      alt2.each((_, el) => {
        const t = $(el).text().trim();
        if (t.length > 20 && t.length < 400) steps.push(t);
      });
    }

    const result = {
      id: 'imp_' + Date.now(),
      title,
      description,
      ingredients,
      steps,
      tags: ['importada'],
      source: url
    };

    return res.status(200).json(result);
  } catch (e) {
    console.error('import error', e);
    return res.status(200).json({ title: 'Error al importar', description: '', ingredients: [], steps: [] });
  }
}

export const config = { runtime: 'nodejs' };
