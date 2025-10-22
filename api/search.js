
const ALLOWED=['recetasgratis.net','pequerecetas.com','directoalpaladar.com','cocinafacil.com.mx','cookpad.com'];
function parseDDG(html){ const out=[]; const re=/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi; let m; while((m=re.exec(html))!==null){ const url=m[1]; const title=(m[2]||'').replace(/<[^>]+>/g,'').trim(); try{ const u=new URL(url); if(ALLOWED.some(d=>u.hostname===d||u.hostname.endsWith('.'+d))){ out.push({title,url,site:u.hostname}); } }catch(_){} } return out; }
module.exports=async (req,res)=>{
  const q=(req.query.q||'').toString().trim(); if(!q) return res.status(400).json({ error:"Falta parámetro 'q'." });
  try{
    const all=[];
    for(const d of ALLOWED){
      const url=`https://duckduckgo.com/html/?q=site:${encodeURIComponent(d)}+${encodeURIComponent(q)}`;
      const r=await fetch(url,{ headers:{ 'User-Agent':'Mozilla/5.0 (RecetasESBot)' } });
      const html=await r.text(); const items=parseDDG(html).slice(0,3); all.push(...items);
    }
    const map=new Map(); for(const it of all){ if(!map.has(it.url)) map.set(it.url,it); }
    res.status(200).json({ ok:true, results:Array.from(map.values()) });
  }catch(e){ res.status(500).json({ error:'No se pudo buscar', detail:String(e) }); }
};
