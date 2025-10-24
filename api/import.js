// api/import.js
const cheerio = require('cheerio');

const UA = 'RecetasES/1.0 (+vercel)';

const clean = (s) =>
  (s || '')
    .replace(/\s+/g, ' ')
    .replace(/[·•►]/g, '')
    .trim();

const uniq = (arr) => Array.from(new Set(arr.map(clean))).filter(Boolean);

function pickJSONLD($) {
  let found = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).contents().text();
      const obj = JSON.parse(raw);
      const arr = Array.isArray(obj) ? obj : [obj];
      for (const it of arr) {
        const type = it['@type'];
        if (!type) continue;
        const types = Array.isArray(type) ? type : [type];
        if (types.map(String).includes('Recipe')) {
          found = it;
          return false; // break .each
        }
      }
    } catch {}
  });
  return found;
}

function extractFromJSONLD(rec) {
  const title = rec.name || '';
  const description = rec.description || '';

  let ingredients = rec.recipeIngredient || rec.ingredients || [];
  if (typeof ingredients === 'string') {
    ingredients = ingredients.split(/\r?\n|·|•|,/g);
  }

  let steps = [];
  if (Array.isArray(rec.recipeInstructions)) {
    steps = rec.recipeInstructions.map((s) =>
      typeof s === 'string' ? s : s.text || s.name || ''
    );
  } else if (typeof rec.recipeInstructions === 'string') {
    steps = rec.recipeInstructions.split(/\r?\n|\.\s+/g);
  }

  return {
    title: clean(title),
    description: clean(description),
    ingredients: uniq(ingredients),
    steps: uniq(steps),
  };
}

function extractMicrodata($) {
  const ingredients = [];
  const steps = [];

  // itemprop-based
  $('[itemprop="recipeIngredient"], [itemprop="ingredients"]').each((_, el) => {
    ingredients.push($(el).text());
  });

  // HowToStep / recipeInstructions itemprop
  $('[itemprop="recipeInstructions"]').each((_, el) => {
    const $el = $(el);
    if ($el.find('[itemprop="text"]').length) {
      $el.find('[itemprop="text"]').each((_, li) => steps.push($(li).text()));
    } else if ($el.find('li').length) {
      $el.find('li').each((_, li) => steps.push($(li).text()));
    } else {
      steps.push($el.text());
    }
  });

  return {
    ingredients: uniq(ingredients),
    steps: uniq(steps),
  };
}

function extractHeuristics($) {
  const ingredients = [];
  const steps = [];

  // Sitios comunes (clases/ids frecuentes)
  const ING_SEL = [
    '.ingredientes li',
    '.ingredients li',
    '.lista-ingredientes li',
    '.ingredient',
    'li.ingredient',
    '.ingredients__list li',
    '#ingredientes li',
    '[class*="ingredien"] li',
  ];

  const STEP_SEL = [
    '.pasos li',
    '.instrucciones li',
    '.preparacion li',
    '.preparation li',
    '.instructions li',
    '.recipe-steps li',
    'ol li',
    '.step',
    '.howto-step',
    '[class*="paso"] li',
  ];

  for (const sel of ING_SEL) {
    if ($(sel).length) {
      $(sel).each((_, el) => ingredients.push($(el).text()));
      break;
    }
  }

  if (!steps.length) {
    for (const sel of STEP_SEL) {
      if ($(sel).length) {
        $(sel).each((_, el) => steps.push($(el).text()));
        break;
      }
    }
  }

  // fallback ultra genérico: párrafos que parezcan instrucciones
  if (!steps.length) {
    $('p').each((_, el) => {
      const t = clean($(el).text());
      if (t.length > 30 && t.length < 400) steps.push(t);
    });
  }

  return {
    ingredients: uniq(ingredients),
    steps: uniq(steps),
  };
}

async function fetchHTML(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('No se pudo acceder a la URL');
  return await r.text();
}

module.exports = async (req, res) => {
  try {
    const url = (req.method === 'POST' ? req.body?.url : req.query?.url || '').toString().trim();
    if (!url) return res.status(400).json({ error: 'Falta parámetro url' });

    const html = await fetchHTML(url);
    const $ = cheerio.load(html);

    // 1) JSON-LD
    let title = clean($('title').first().text());
    let description = clean($('meta[name="description"]').attr('content') || '');

    const ld = pickJSONLD($);
    let ingredients = [];
    let steps = [];
    if (ld) {
      const fromLD = extractFromJSONLD(ld);
      title = fromLD.title || title;
      description = fromLD.description || description;
      ingredients = fromLD.ingredients;
      steps = fromLD.steps;
    }

    // 2) Microdata si faltan
    if (!ingredients.length || !steps.length) {
      const md = extractMicrodata($);
      if (!ingredients.length) ingredients = md.ingredients;
      if (!steps.length) steps = md.steps;
    }

    // 3) Heurísticas si aún faltan
    if (!ingredients.length || !steps.length) {
      const hx = extractHeuristics($);
      if (!ingredients.length) ingredients = hx.ingredients;
      if (!steps.length) steps = hx.steps;
    }

    return res.status(200).json({
      id: 'imp_' + Date.now(),
      title,
      description,
      ingredients,
      steps,
      tags: ['importada'],
      source: url,
    });
  } catch (e) {
    console.error('import error:', e);
    return res.status(200).json({
      title: 'No se pudo importar',
      description: '',
      ingredients: [],
      steps: [],
      tags: ['importada'],
    });
  }
};

module.exports.config = { runtime: 'nodejs' };