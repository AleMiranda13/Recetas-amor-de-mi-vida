// tools/freeze.js (Node 20, CommonJS)
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const BASE = process.env.BASE_URL || "http://localhost:3000"; // o tu Vercel: https://tu-app.vercel.app
const URLS_FILE = path.join(process.cwd(), "tools", "urls.txt");
const OUT_FILE  = path.join(process.cwd(), "public", "recipes.json");

function hash(s){ return crypto.createHash("sha1").update(s).digest("hex").slice(0,12); }

async function readUrls(){
  const raw = await fs.readFile(URLS_FILE, "utf8");
  return raw.split("\n")
    .map(l=>l.trim())
    .filter(l=>l && !l.startsWith("#"))
    .map(l=>{
      const [u, tagsRaw=""] = l.split("|").map(s=>s?.trim()||"");
      const tags = tagsRaw.split(",").map(s=>s.trim()).filter(Boolean);
      return { url:u, tags };
    });
}

async function importOne(url){
  const endpoint = `${BASE}/api/import?url=${encodeURIComponent(url)}`;
  const r = await fetch(endpoint, { headers: { "User-Agent":"FreezeScript/1.1" }});
  if (!r.ok) throw new Error("HTTP "+r.status);
  return await r.json();
}

function toLocal(rec, extraTags=[], sourceUrl=""){
  const source = sourceUrl || rec.source || "";
  const id = "local_"+hash(source || (rec.title||"") + JSON.stringify(rec.ingredients||[]));
  return {
    id,
    title: rec.title || "Receta",
    description: rec.description || "",
    ingredients: rec.ingredients || [],
    steps: rec.steps || rec.instructions || [],
    tags: Array.from(new Set(["local", ...extraTags])),
    source
  };
}

async function readExisting(){
  try{
    const s = await fs.readFile(OUT_FILE, "utf8");
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr : [];
  }catch{ return []; }
}

async function backupExisting(){
  try{
    const s = await fs.readFile(OUT_FILE, "utf8");
    const stamp = new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
    const bak = OUT_FILE.replace(/recipes\.json$/, `recipes.backup-${stamp}.json`);
    await fs.writeFile(bak, s, "utf8");
    console.log("Backup:", bak);
  }catch{}
}

function mergeByIdOrSource(oldArr, newArr){
  const map = new Map();
  for (const r of oldArr) map.set(r.id || r.source, r);
  for (const r of newArr) map.set(r.id || r.source, r);
  return Array.from(map.values());
}

function sortNice(a,b){
  const ta = (a.tags||[]).includes("fitness") ? 1 : 0;
  const tb = (b.tags||[]).includes("fitness") ? 1 : 0;
  if (ta !== tb) return ta - tb; // primero no-fitness, después fitness
  return (a.title||"").localeCompare(b.title||"", "es");
}

(async function main(){
  console.log(`Base: ${BASE}`);
  const urls = await readUrls();
  if (!urls.length) { console.log("No hay URLs en tools/urls.txt"); process.exit(0); }

  const existing = await readExisting();
  await backupExisting();

  const imported = [];
  for (const it of urls){
    try{
      const rec = await importOne(it.url);
      const loc = toLocal(rec, it.tags, it.url);
      imported.push(loc);
      console.log("✔", it.url);
    }catch(e){
      console.log("✖", it.url, "-", String(e));
    }
  }

  const merged = mergeByIdOrSource(existing, imported).sort(sortNice);
  await fs.writeFile(OUT_FILE, JSON.stringify(merged, null, 2), "utf8");

  console.log(`\nListo: ${OUT_FILE} -> ${merged.length} recetas`);
})();