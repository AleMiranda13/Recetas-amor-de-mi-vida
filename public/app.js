(() => {
  // ---------- DOM
  const els = {
    tabs: document.querySelectorAll('.tab-btn'),
    panels: {
      buscar: document.getElementById('tab-buscar'),
      importadas: document.getElementById('tab-importadas'),
      favoritas: document.getElementById('tab-favoritas'),
      fitness: document.getElementById('tab-fitness')
    },
    q: document.getElementById('q'),
    searchBtn: document.getElementById('searchBtn'),
    localResults: document.getElementById('localResults'),
    webResults: document.getElementById('webResults'),
    importedList: document.getElementById('importedList'),
    favoriteList: document.getElementById('favoriteList'),
    fitnessList: document.getElementById('fitnessList'),
    importSearch: document.getElementById('importSearch'),
    favSearch: document.getElementById('favSearch'),
    fitSearch: document.getElementById('fitSearch'),
    toastWrap: document.getElementById('toastWrap'),
    modalBackdrop: document.getElementById('modalBackdrop'),
    modalTitle: document.getElementById('modalTitle'),
    modalDesc: document.getElementById('modalDesc'),
    modalIngr: document.getElementById('modalIngr'),
    modalSteps: document.getElementById('modalSteps'),
    modalClose: document.getElementById('modalClose'),
    modalClose2: document.getElementById('modalClose2'),
    syncBtn: document.getElementById('syncBtn'),
  };

  // ---------- storage
  const LS_IMPORTED = 'recetas_importadas_v1';
  const LS_FAVORITES = 'recetas_favoritas_v1';
  const store = {
    getImported(){ return JSON.parse(localStorage.getItem(LS_IMPORTED) || '[]'); },
    setImported(a){ localStorage.setItem(LS_IMPORTED, JSON.stringify(a)); },
    getFavorites(){ return JSON.parse(localStorage.getItem(LS_FAVORITES) || '[]'); },
    setFavorites(a){ localStorage.setItem(LS_FAVORITES, JSON.stringify(a)); },
    isFav(id){ return this.getFavorites().some(r => r.id === id); }
  };
  function upsertImported(r){
    const list = store.getImported();
    const i = list.findIndex(x => x.id === r.id);
    if (i>=0) list[i]=r; else list.unshift(r);
    store.setImported(list);
  }
  function deleteImported(id){
    store.setImported(store.getImported().filter(r => r.id !== id));
    renderImported();
    toast('Eliminada de importadas', 'warn');
  }

  // ---------- toast
  function toast(msg, type='success'){
    const d = document.createElement('div');
    d.className = `toast ${type}`;
    d.textContent = msg;
    els.toastWrap.appendChild(d);
    setTimeout(()=>{ d.style.opacity='0'; setTimeout(()=>d.remove(), 260); }, 2200);
  }

  // ---------- modal
  function openModal(recipe){
    els.modalTitle.textContent = recipe.title || 'Receta';
    els.modalDesc.textContent = recipe.description || '';
    els.modalIngr.innerHTML = '';
    els.modalSteps.innerHTML = '';

    if (recipe.ingredients?.length){
      recipe.ingredients.forEach(i => { const li=document.createElement('li'); li.textContent=i; els.modalIngr.appendChild(li); });
    } else if (recipe.source){
      els.modalIngr.innerHTML = `<li><a href="${recipe.source}" target="_blank" rel="noopener">Ver receta completa en la web</a></li>`;
    }

    if (recipe.steps?.length){
      recipe.steps.forEach(s => { const li=document.createElement('li'); li.textContent=s; els.modalSteps.appendChild(li); });
    }

    els.modalBackdrop.style.display='flex';
    els.modalBackdrop.setAttribute('aria-hidden','false');
  }
  function closeModal(){
    els.modalBackdrop.style.display='none';
    els.modalBackdrop.setAttribute('aria-hidden','true');
  }
  els.modalClose.addEventListener('click', closeModal);
  els.modalClose2?.addEventListener('click', closeModal);
  els.modalBackdrop.addEventListener('click', e => { if (e.target===els.modalBackdrop) closeModal(); });

  // ---------- pestañas
  els.tabs.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      els.tabs.forEach(b=>b.setAttribute('aria-selected','false'));
      btn.setAttribute('aria-selected','true');
      Object.entries(els.panels).forEach(([k,sec])=> sec.hidden = (btn.dataset.tab !== k));
      if (btn.dataset.tab==='importadas') renderImported();
      if (btn.dataset.tab==='favoritas') renderFavorites();
      if (btn.dataset.tab==='fitness') renderFitness();
    });
  });

  // ---------- recetas locales
  let LOCAL_RECIPES = [];
  async function loadLocalRecipes(){
    try{
      const r = await fetch('./recipes.json');
      if(!r.ok) throw 0;
      LOCAL_RECIPES = await r.json();
    }catch(e){
      console.warn('No se pudo cargar recipes.json local:', e);
      LOCAL_RECIPES = [];
    }
    if (!Array.isArray(LOCAL_RECIPES)) LOCAL_RECIPES=[];
  }

  // ---------- enriquecer importadas si faltan datos (vía /api/import)
  async function ensureDetails(recipe){
    const has = (recipe.ingredients && recipe.ingredients.length) || (recipe.steps && recipe.steps.length);
    if (has || !recipe.source) return recipe;
    try{
      let data;
      try{
        const r = await fetch('/api/import', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: recipe.source }) });
        if(!r.ok) throw 0;
        data = await r.json();
      }catch{
        const r = await fetch('/api/import?url='+encodeURIComponent(recipe.source));
        data = await r.json();
      }
      const enriched = {
        ...recipe,
        title: data.title || recipe.title,
        description: data.description || recipe.description,
        ingredients: data.ingredients || recipe.ingredients || [],
        steps: data.steps || data.instructions || recipe.steps || [],
        tags: Array.from(new Set([...(recipe.tags||[]), ...(data.tags||[]), 'importada']))
      };
      upsertImported(enriched);
      return enriched;
    }catch(e){
      console.error(e);
      return recipe;
    }
  }

  // ---------- importar LOCAL (duplica la receta local a Importadas)
  async function importLocal(recipe){
    const copy = {
      id: 'imp_'+Date.now(),
      title: recipe.title || 'Receta',
      description: recipe.description || '',
      ingredients: recipe.ingredients || [],
      steps: recipe.steps || [],
      tags: Array.from(new Set([...(recipe.tags||[]), 'importada','manual'])),
      source: recipe.source || ''
    };
    upsertImported(copy);
    toast('Receta copiada a Importadas ✔');

    // saltar a Importadas
    els.tabs.forEach(b=>b.setAttribute('aria-selected','false'));
    document.querySelector('.tab-btn[data-tab="importadas"]').setAttribute('aria-selected','true');
    Object.entries(els.panels).forEach(([k,sec])=> sec.hidden = (k!=='importadas'));
    renderImported();
    openModal(copy);
  }

  // ---------- tarjeta
  function recipeCard(recipe, opts = {}){
    const card = document.createElement('div'); card.className='card';
    const title = document.createElement('h3'); title.textContent = recipe.title || 'Receta'; card.append(title);
    const desc = document.createElement('div'); desc.className='desc'; desc.textContent = recipe.description || ''; card.append(desc);
    const tags = document.createElement('div'); tags.className='tags';
    (recipe.tags||[]).forEach(t=>{ const s=document.createElement('span'); s.className='tag'; s.textContent=t; tags.appendChild(s); });
    card.append(tags);
    const actions = document.createElement('div'); actions.className='card-actions';

    if (opts.mode !== 'web'){
      // Ver
      const ver = document.createElement('button'); ver.className='ghost'; ver.textContent='Ver';
      ver.addEventListener('click', async ()=> openModal((opts.section==='importadas') ? await ensureDetails(recipe) : recipe));
      actions.append(ver);

      // Importar locales -> duplica para editar
      if (opts.mode==='local' && opts.section!=='importadas'){
        const impL = document.createElement('button'); impL.className='ghost'; impL.textContent='Importar';
        impL.title = 'Copiar a Importadas para poder editar';
        impL.addEventListener('click', ()=> importLocal(recipe));
        actions.append(impL);
      }

      // Importadas: editar / eliminar
      if (opts.section==='importadas'){
        const edt = document.createElement('button'); edt.className='ghost'; edt.textContent='Editar';
        edt.addEventListener('click', ()=> openEditImported(recipe));
        actions.append(edt);

        const del = document.createElement('button'); del.className='ghost danger'; del.textContent='Eliminar';
        del.addEventListener('click', ()=> deleteImported(recipe.id));
        actions.append(del);
      }

      // Favoritos
      const fav = document.createElement('button'); fav.className='ghost'; fav.textContent='★';
      fav.addEventListener('click', ()=> toggleFavorite(recipe));
      actions.append(fav);

    } else {
      // Resultados web
      const imp = document.createElement('button'); imp.className='ghost'; imp.textContent='Importar';
      imp.addEventListener('click', ()=> importFromUrl(opts.sourceUrl, recipe, imp));
      actions.append(imp);

      const man = document.createElement('button'); man.className='ghost'; man.textContent='Importar (manual)';
      man.addEventListener('click', ()=> importManualFromSearch(recipe, opts.sourceUrl));
      actions.append(man);

      if (opts.sourceUrl){
        const a = document.createElement('a'); a.className='ghost'; a.textContent='Fuente';
        a.href=opts.sourceUrl; a.target='_blank'; a.rel='noopener';
        actions.append(a);
      }

      const fav = document.createElement('button'); fav.className='ghost'; fav.textContent='★';
      fav.addEventListener('click', ()=> toggleFavorite(recipe));
      actions.append(fav);
    }

    card.append(actions);
    return card;
  }

  function toggleFavorite(recipe){
    let favs = store.getFavorites();
    const i = favs.findIndex(r => r.id===recipe.id);
    if (i>=0){ favs.splice(i,1); toast('Quitado de favoritos','warn'); }
    else { favs.unshift(recipe); toast('Agregado a favoritos'); }
    store.setFavorites(favs);
    renderFavorites();
  }

  // ---------- importar desde web
  async function importFromUrl(url, meta = {}, button){
    try{
      button && (button.disabled=true, button.textContent='Importando…');
      let data;
      try{
        const res = await fetch('/api/import', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url }) });
        if(!res.ok) throw 0;
        data = await res.json();
      }catch{
        const res = await fetch('/api/import?url='+encodeURIComponent(url));
        data = await res.json();
      }
      const recipe = {
        id: data.id || `imp_${Date.now()}`,
        title: data.title || meta.title || 'Receta importada',
        description: data.description || meta.description || '',
        ingredients: data.ingredients || [],
        steps: data.steps || data.instructions || [],
        tags: Array.from(new Set([...(data.tags||[]),'importada'])),
        source: url
      };
      upsertImported(recipe);
      toast('Receta importada ✔');

      els.tabs.forEach(b=>b.setAttribute('aria-selected','false'));
      document.querySelector('.tab-btn[data-tab="importadas"]').setAttribute('aria-selected','true');
      Object.entries(els.panels).forEach(([k,sec])=> sec.hidden = (k!=='importadas'));
      renderImported();
      openModal(recipe);
    }catch(e){
      console.error(e);
      toast('No se pudo importar esta URL', 'error');
    }finally{
      button && (button.disabled=false, button.textContent='Importar');
    }
  }

  // Importar MANUAL desde resultados web (arranca editor con título/desc)
  function importManualFromSearch(meta = {}, url = ''){
    const recipe = {
      id: 'imp_'+Date.now(),
      title: meta.title || 'Receta importada',
      description: meta.description || '',
      ingredients: [],
      steps: [],
      tags: Array.from(new Set([...(meta.tags||[]), 'importada','manual'])),
      source: url || meta.source || ''
    };
    upsertImported(recipe);
    renderImported();
    toast('Creada en importadas (manual) ✔');
    openEditImported(recipe, { create:true });
  }

  // ---------- búsquedas
  function searchLocal(q){
    const term=(q||'').trim().toLowerCase();
    const base = LOCAL_RECIPES.filter(r => !(r.tags||[]).includes('fitness'));
    if (!term) return base;
    return base.filter(r =>
      (r.title||'').toLowerCase().includes(term) ||
      (r.description||'').toLowerCase().includes(term) ||
      (r.tags||[]).join(' ').toLowerCase().includes(term) ||
      (r.ingredients||[]).join(' ').toLowerCase().includes(term)
    );
  }

  // web: intenta base, luego “receta/recetas”
  async function searchWeb(q){
    const tryFetch = async (term)=>{
      try{
        const res = await fetch('/api/search?q='+encodeURIComponent(term));
        if(!res.ok) return [];
        const data = await res.json();
        const arr = Array.isArray(data) ? data : (data.results || data.organic_results || []);
        return Array.isArray(arr) ? arr : [];
      }catch{ return []; }
    };
    const base = (q||'').trim(); if(!base) return [];
    let out = await tryFetch(base);
    if (!out.length) out = await tryFetch(`${base} receta`);
    if (!out.length) out = await tryFetch(`${base} recetas`);
    return out.slice(0,12);
  }

  function renderList(container, recipes, {mode='local', section=null, sourceUrls=[]} = {}){
    container.innerHTML='';
    if(!recipes.length){
      const empty=document.createElement('div'); empty.className='empty'; empty.textContent='Sin resultados por ahora.';
      container.appendChild(empty); return;
    }
    recipes.forEach((r,i)=>{
      const card = recipeCard(r, {mode, section, sourceUrl: sourceUrls[i]});
      container.appendChild(card);
    });
  }

  async function onSearch(){
    const q = els.q.value;

    // locales
    const local = searchLocal(q);
    renderList(els.localResults, local);
    toggleLocalMoreVisibility(false); // oculta “ver más” durante búsqueda

    // web (loading)
    els.webResults.innerHTML = `<div class="empty">Buscando en la web…</div>`;
    const web = await searchWeb(q);
    if (!web.length){
      els.webResults.innerHTML =
        `<div class="empty">Sin resultados web por ahora.<br><br>
          <a target="_blank" rel="noopener" href="https://www.google.com/search?q=${encodeURIComponent(q)}">
            Abrir búsqueda en Google
          </a>
        </div>`;
      return;
    }
    const webRecipes = web.map((w,i)=>({
      id:`web_${i}_${Date.now()}`,
      title: w.title,
      description: w.snippet || '',
      tags:['web'],
      source: w.url,
      suggestion: !!w.suggestion
    }));
    const urls = web.map(w=>w.url);
    renderList(els.webResults, webRecipes, { mode:'web', sourceUrls: urls });
  }

  function renderImported(){
    const q=(els.importSearch.value||'').toLowerCase();
    const list = store.getImported().filter(r =>
      (r.title||'').toLowerCase().includes(q) ||
      (r.description||'').toLowerCase().includes(q) ||
      (r.tags||[]).join(' ').toLowerCase().includes(q)
    );
    renderList(els.importedList, list, { mode:'local', section:'importadas' });
  }

  function renderFavorites(){
    const q=(els.favSearch.value||'').toLowerCase();
    const list = store.getFavorites().filter(r =>
      (r.title||'').toLowerCase().includes(q) ||
      (r.description||'').toLowerCase().includes(q) ||
      (r.tags||[]).join(' ').toLowerCase().includes(q)
    );
    renderList(els.favoriteList, list);
  }

  function renderFitness(){
    const term=(els.fitSearch.value||'').trim().toLowerCase();
    const base = LOCAL_RECIPES.filter(r => (r.tags||[]).includes('fitness') || (r.tags||[]).includes('saludable'));
    const list = !term ? base : base.filter(r =>
      (r.title||'').toLowerCase().includes(term) ||
      (r.description||'').toLowerCase().includes(term) ||
      (r.ingredients||[]).join(' ').toLowerCase().includes(term)
    );
    renderList(els.fitnessList, list);
  }

  // ---------- “Ver más / Ver menos” locales
  let showAllLocal=false; const LOCAL_PAGE=24;
  let localMoreWrap=null, localMoreBtn=null;
  function ensureLocalMoreButton(){
    if(localMoreWrap) return;
    localMoreWrap = document.createElement('div');
    localMoreWrap.style.display='flex'; localMoreWrap.style.justifyContent='center'; localMoreWrap.style.margin='10px 0 4px';
    localMoreBtn = document.createElement('button'); localMoreBtn.className='ghost'; localMoreBtn.textContent='Ver más';
    localMoreBtn.addEventListener('click', ()=>{
      showAllLocal=!showAllLocal;
      renderLocalInitial();
      localMoreBtn.textContent = showAllLocal ? 'Ver menos' : 'Ver más';
    });
    els.webResults.parentNode.insertBefore(localMoreWrap, els.webResults);
    localMoreWrap.appendChild(localMoreBtn);
  }
  function toggleLocalMoreVisibility(show){ if(localMoreWrap) localMoreWrap.style.display = show ? 'flex' : 'none'; }
  function renderLocalInitial(){
    const base = LOCAL_RECIPES.filter(r => !(r.tags||[]).includes('fitness'));
    const list = showAllLocal ? base : base.slice(0, LOCAL_PAGE);
    renderList(els.localResults, list);
    toggleLocalMoreVisibility(true);
  }

  // ---------- Importadas: agregar por URL / editar manual
  function openAddByUrlModal(){
    const m = document.createElement('div'); m.className='modal-backdrop'; m.style.display='flex';
    m.innerHTML = `
      <div class="modal">
        <header style="display:flex;justify-content:space-between;align-items:center">
          <h3>Agregar por URL</h3><button class="ghost" id="x">✕</button>
        </header>
        <div class="content">
          <label>URL de la receta</label>
          <input id="url" style="width:100%" placeholder="https://...">
          <div style="display:flex;gap:8px;margin-top:12px">
            <button class="ghost" id="imp">Importar</button>
            <button class="ghost" id="man">Crear manual</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.querySelector('#x').onclick = ()=> m.remove();

    m.querySelector('#imp').onclick = async ()=>{
      const u = m.querySelector('#url').value.trim(); if (!u) return;
      try{
        let data;
        try{
          const r = await fetch('/api/import', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url:u }) });
          if(!r.ok) throw 0; data = await r.json();
        }catch{
          const r = await fetch('/api/import?url='+encodeURIComponent(u)); data = await r.json();
        }
        const rec = {
          id:'imp_'+Date.now(),
          title: data.title || 'Receta importada',
          description: data.description || '',
          ingredients: data.ingredients || [],
          steps: data.steps || data.instructions || [],
          tags: Array.from(new Set([...(data.tags||[]),'importada'])),
          source: u
        };
        upsertImported(rec); renderImported(); toast('Importada ✔'); m.remove(); openModal(rec);
      }catch(e){ console.error(e); toast('No se pudo importar','error'); }
    };

    m.querySelector('#man').onclick = ()=>{
      m.remove();
      openEditImported({
        id:'imp_'+Date.now(), title:'Nueva receta', description:'',
        ingredients:[], steps:[], tags:['importada','manual'], source:''
      }, { create:true });
    };
  }
  // botón arriba de Importadas
  (function addAddByUrlButton(){
    const wrap = els.importSearch?.parentElement || els.importedList?.parentElement;
    if(!wrap) return;
    const btn = document.createElement('button'); btn.className='ghost'; btn.textContent='Agregar por URL'; btn.style.marginLeft='8px';
    btn.addEventListener('click', openAddByUrlModal); wrap.appendChild(btn);
  })();

  function openEditImported(recipe, { create=false } = {}){
    const m=document.createElement('div'); m.className='modal-backdrop'; m.style.display='flex';
    const ing=(recipe.ingredients||[]).join('\n'), stp=(recipe.steps||[]).join('\n');
    m.innerHTML = `
      <div class="modal" style="max-width:760px">
        <header style="display:flex;justify-content:space-between;align-items:center">
          <h3>${create?'Crear receta':'Editar receta'}</h3><button class="ghost" id="x">✕</button>
        </header>
        <div class="content">
          <label>Título</label><input id="t" style="width:100%" value="${recipe.title||''}">
          <label style="margin-top:8px">Descripción</label><textarea id="d" style="width:100%;min-height:70px">${recipe.description||''}</textarea>
          <label style="margin-top:8px">Ingredientes (uno por línea)</label><textarea id="i" style="width:100%;min-height:130px">${ing}</textarea>
          <label style="margin-top:8px">Pasos (uno por línea)</label><textarea id="s" style="width:100%;min-height:160px">${stp}</textarea>
          <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
            <button class="ghost danger" id="del" ${create?'disabled':''}>Eliminar</button>
            <button class="ghost" id="ok">Guardar</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.querySelector('#x').onclick = ()=> m.remove();
    m.querySelector('#del')?.addEventListener('click', ()=>{ deleteImported(recipe.id); m.remove(); });
    m.querySelector('#ok').addEventListener('click', ()=>{
      const rec = {
        ...recipe,
        title: m.querySelector('#t').value.trim() || 'Receta',
        description: m.querySelector('#d').value.trim(),
        ingredients: m.querySelector('#i').value.split('\n').map(s=>s.trim()).filter(Boolean),
        steps: m.querySelector('#s').value.split('\n').map(s=>s.trim()).filter(Boolean),
        tags: Array.from(new Set([...(recipe.tags||[]), 'importada']))
      };
      upsertImported(rec); renderImported(); toast('Guardado ✔'); m.remove(); openModal(rec);
    });
  }

  // ---------- eventos & init
  els.searchBtn.addEventListener('click', onSearch);
  els.q.addEventListener('keydown', e=>{ if(e.key==='Enter') onSearch(); });
  els.importSearch.addEventListener('input', renderImported);
  els.favSearch.addEventListener('input', renderFavorites);
  els.fitSearch.addEventListener('input', renderFitness);
  els.syncBtn?.addEventListener('click', async ()=>{ await loadLocalRecipes(); toast('Datos locales recargados'); renderLocalInitial(); renderFitness(); });

  (async ()=>{
    await loadLocalRecipes();
    ensureLocalMoreButton();
    renderLocalInitial();
    renderFitness();
  })();
})();