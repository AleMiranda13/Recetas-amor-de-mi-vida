function parseISO8601DurationToMinutes(iso){ if(!iso) return null; const m=iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i); if(!m) return null; const d=+(m[1]||0), h=+(m[2]||0), min=+(m[3]||0); return d*24*60+h*60+min; }
function normalizeRecipe(r, sourceUrl){
  if(!r) return null; let instrucciones=[];
  if(Array.isArray(r.recipeInstructions)){
    instrucciones=r.recipeInstructions.map(step=>{
      if(typeof step==='string') return {tipo:'texto',texto:step.trim()};
      if(step && typeof step==='object'){ const txt=step.text||step.name||''; return {tipo:step['@type']||'paso',texto:String(txt||'').trim()}; }
      return null;
    }).filter(Boolean);
  } else if (typeof r.recipeInstructions==='string'){
    instrucciones=r.recipeInstructions.split(/\r?\n+/).map(t=>({tipo:'texto',texto:t.trim()})).filter(s=>s.texto);
  }
  const ingredientes=Array.isArray(r.recipeIngredient)?r.recipeIngredient:[];
  let imagen=null; if(Array.isArray(r.image)) imagen=r.image[0]; else if(r.image && typeof r.image==='object' && r.image.url) imagen=r.image.url; else if(typeof r.image==='string') imagen=r.image;
  const tiempos={ preparacion:parseISO8601DurationToMinutes(r.prepTime), coccion:parseISO8601DurationToMinutes(r.cookTime), total:parseISO8601DurationToMinutes(r.totalTime) };
  let autor=null; if(r.author){ if(typeof r.author==='string') autor=r.author; else if(Array.isArray(r.author)) autor=r.author.map(a=>a.name||a).filter(Boolean).join(', '); else if(typeof r.author==='object') autor=r.author.name||null; }
  let palabras=[]; if(r.keywords){ if(typeof r.keywords==='string') palabras=r.keywords.split(',').map(s=>s.trim()).filter(Boolean); else if(Array.isArray(r.keywords)) palabras=r.keywords; }
  let porciones=null; if(r.recipeYield){ if(typeof r.recipeYield==='string') porciones=r.recipeYield; else if(Array.isArray(r.recipeYield)) porciones=r.recipeYield.join(', '); }
  const slug=(r.name||'receta').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  return { id:slug, nombre:r.name||null, descripcion:r.description||null, ingredientes, instrucciones, porciones, tiempos, imagen, autor, palabras_clave:palabras, origen:{url:sourceUrl, sitio:(new URL(sourceUrl)).hostname} };
}
function findRecipeInJSONLD(block){
  try{ const data=JSON.parse(block);
    const get=(obj)=>{ if(!obj) return null; const t=obj['@type']; const isR=t==='Recipe'||(Array.isArray(t)&&t.includes('Recipe')); if(isR) return obj;
      if(obj['@graph'] && Array.isArray(obj['@graph'])){ return obj['@graph'].find(n=>{ const tt=n['@type']; return tt==='Recipe'||(Array.isArray(tt)&&tt.includes('Recipe')); })||null; } return null; };
    if(Array.isArray(data)){ for(const e of data){ const r=get(e); if(r) return r; } } else if (typeof data==='object'){ const r=get(data); if(r) return r; }
  } catch(e){}
  return null;
}
module.exports = async (req,res)=>{
  const url=(req.query.url||'').toString().trim(); if(!url) return res.status(400).json({ error:"Falta el parámetro 'url'." });
  try{
    const response=await fetch(url,{ headers:{ 'User-Agent':'Mozilla/5.0 (compatible; RecetasESBot/1.0)','Accept':'text/html,application/xhtml+xml' } });
    const html=await response.text();
    const matches=[...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    let recipe=null; for(const m of matches){ const block=(m[1]||'').trim(); const cand=findRecipeInJSONLD(block); if(cand){ recipe=cand; break; } }
    if(!recipe) return res.status(404).json({ error:'No se encontró JSON-LD de tipo Recipe en la página.' });
    const normalized=normalizeRecipe(recipe,url); return res.status(200).json({ ok:true, receta:normalized, original:recipe });
  }catch(err){ return res.status(500).json({ error:'Fallo al importar la URL', detail:String(err) }); }
};
module.exports.config = { runtime: 'nodejs' };
