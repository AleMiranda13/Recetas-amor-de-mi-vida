
(() => {
  const els = {
    tabs: document.querySelectorAll('.tab-btn'),
    panels: {
      buscar: document.getElementById('tab-buscar'),
      importadas: document.getElementById('tab-importadas'),
      favoritas: document.getElementById('tab-favoritas'),
      fitness: document.getElementById('tab-fitness'),
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

  // ---- Storage helpers
  const LS_IMPORTED = 'recetas_importadas_v1';
  const LS_FAVORITES = 'recetas_favoritas_v1';

  const store = {
    getImported(){ return JSON.parse(localStorage.getItem(LS_IMPORTED) || '[]'); },
    setImported(arr){ localStorage.setItem(LS_IMPORTED, JSON.stringify(arr)); },
    getFavorites(){ return JSON.parse(localStorage.getItem(LS_FAVORITES) || '[]'); },
    setFavorites(arr){ localStorage.setItem(LS_FAVORITES, JSON.stringify(arr)); },
    isFav(id){
      return this.getFavorites().some(r => r.id === id);
    }
  };

  // ---- Toasts
  function toast(msg, type='success'){
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.textContent = msg;
    els.toastWrap.appendChild(div);
    setTimeout(() => {
      div.style.transform = 'translateY(10px)';
      div.style.opacity = '0';
      setTimeout(() => div.remove(), 250);
    }, 2200);
  }

  // ---- Modal
  function openModal(recipe){
    els.modalTitle.textContent = recipe.title || 'Receta';
    els.modalDesc.textContent = recipe.description || '';
    els.modalIngr.innerHTML = '';
    (recipe.ingredients || []).forEach(i => {
      const li = document.createElement('li');
      li.textContent = i;
      els.modalIngr.appendChild(li);
    });
    els.modalSteps.innerHTML = '';
    (recipe.steps || []).forEach(s => {
      const li = document.createElement('li');
      li.textContent = s;
      els.modalSteps.appendChild(li);
    });
    els.modalBackdrop.style.display = 'flex';
    els.modalBackdrop.setAttribute('aria-hidden','false');
  }
  function closeModal(){
    els.modalBackdrop.style.display = 'none';
    els.modalBackdrop.setAttribute('aria-hidden','true');
  }
  els.modalClose.addEventListener('click', closeModal);
  els.modalClose2.addEventListener('click', closeModal);
  els.modalBackdrop.addEventListener('click', (e)=>{
    if(e.target === els.modalBackdrop){ closeModal(); }
  });

  // ---- Tabs
  els.tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      els.tabs.forEach(b => b.setAttribute('aria-selected', 'false'));
      btn.setAttribute('aria-selected', 'true');
      Object.entries(els.panels).forEach(([key, sec]) => {
        sec.hidden = (btn.dataset.tab !== key);
      });
      // Refresh lists on tab switch
      if(btn.dataset.tab==='importadas') renderImported();
      if(btn.dataset.tab==='favoritas') renderFavorites();
      if(btn.dataset.tab==='fitness') renderFitness();
    });
  });

  // ---- Fetch local recipes (with fallback to static file)
  let LOCAL_RECIPES = [];
  async function loadLocalRecipes(){
    try{
      const res = await fetch('/api/recipes');
      if(!res.ok) throw 0;
      LOCAL_RECIPES = await res.json();
    }catch{
      const res2 = await fetch('./recipes.json');
      LOCAL_RECIPES = await res2.json();
    }
  }

  // ---- Render helpers
  function recipeCard(recipe, opts = {}){
    const card = document.createElement('div');
    card.className = 'card';
    const title = document.createElement('h3');
    title.textContent = recipe.title;
    const desc = document.createElement('div');
    desc.textContent = recipe.description || '';
    const tags = document.createElement('div');
    tags.className = 'tags';
    (recipe.tags || []).forEach(t => {
      const s = document.createElement('span');
      s.className = 'tag'; s.textContent = t;
      tags.appendChild(s);
    });
    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const btnView = document.createElement('button');
    btnView.className = 'ghost';
    btnView.textContent = 'Ver';
    btnView.addEventListener('click', ()=> openModal(recipe));

    const fav = document.createElement('button');
    fav.className = 'icon fav' + (store.isFav(recipe.id) ? ' active' : '');
    fav.innerHTML = '★';
    fav.title = store.isFav(recipe.id) ? 'Quitar de favoritos' : 'Agregar a favoritos';
    fav.addEventListener('click', ()=> toggleFavorite(recipe, fav));

    actions.append(btnView, fav);

    if(opts.allowImport){
      const imp = document.createElement('button');
      imp.className = 'ghost';
      imp.textContent = 'Importar';
      imp.addEventListener('click', ()=> importFromUrl(opts.sourceUrl, recipe, imp));
      actions.prepend(imp);
    }

    card.append(title, desc, tags, actions);
    return card;
  }

  function toggleFavorite(recipe, btn){
    let favs = store.getFavorites();
    const exists = favs.some(r => r.id === recipe.id);
    if(exists){
      favs = favs.filter(r => r.id !== recipe.id);
      btn && (btn.classList.remove('active'), btn.title='Agregar a favoritos');
      toast('Quitado de favoritos', 'warn');
    }else{
      favs.unshift(recipe);
      btn && (btn.classList.add('active'), btn.title='Quitar de favoritos');
      toast('Agregado a favoritos');
    }
    store.setFavorites(favs);
    renderFavorites();
  }

  // ---- Import flow (no campo de URL, sólo desde resultados web)
  async function importFromUrl(url, meta = {}, button){
    try{
      button && (button.disabled = true, button.textContent = 'Importando...');
      // Prefer POST JSON; fallback to GET if fails
      let data;
      try{
        const res = await fetch('/api/import', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ url })
        });
        if(!res.ok) throw new Error('POST no disponible');
        data = await res.json();
      }catch(_e){
        const res = await fetch('/api/import?url=' + encodeURIComponent(url));
        data = await res.json();
      }
      // Normalize minimal fields we rely on
      const recipe = {
        id: data.id || `imp_${Date.now()}`,
        title: data.title || meta.title || 'Receta importada',
        description: data.description || meta.description || '',
        ingredients: data.ingredients || [],
        steps: data.steps || data.instructions || [],
        tags: Array.from(new Set([...(data.tags||[]),'importada'])),
        source: url
      };
      const list = store.getImported();
      list.unshift(recipe);
      store.setImported(list);
      toast('Receta importada ✔');
      renderImported();
    }catch(e){
      console.error(e);
      toast('No se pudo importar esta URL', 'error');
    }finally{
      button && (button.disabled = false, button.textContent = 'Importar');
    }
  }

  // ---- Search Local
  function searchLocal(q){
    const term = (q||'').trim().toLowerCase();
    if(!term) return LOCAL_RECIPES;
    return LOCAL_RECIPES.filter(r => 
      (r.title||'').toLowerCase().includes(term) ||
      (r.description||'').toLowerCase().includes(term) ||
      (r.tags||[]).join(' ').toLowerCase().includes(term) ||
      (r.ingredients||[]).join(' ').toLowerCase().includes(term)
    );
  }

  // ---- Search Web (uses /api/search)
 async function searchWeb(q){
  if(!q) return [];
  try{
    const res = await fetch('/api/search?q=' + encodeURIComponent(q));
    if(!res.ok) throw 0;
    const data = await res.json();

    // Normalizar: aceptar {results:[...]} o {organic_results:[...]} o array directo
    const arr = Array.isArray(data)
      ? data
      : data.results || data.organic_results || [];

    return arr.slice(0, 12);
  }catch{
    toast('No se pudo buscar en la web ahora', 'warn');
    return [];
  }
}

  // ---- Render sections
  function renderList(container, recipes, {allowImport=false, sourceUrls=[]} = {}){
    container.innerHTML = '';
    if(!recipes.length){
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Sin resultados por ahora.';
      container.appendChild(empty);
      return;
    }
    recipes.forEach((r, idx) => {
      const card = recipeCard(r, allowImport ? {allowImport, sourceUrl: sourceUrls[idx]} : {});
      container.appendChild(card);
    });
  }

  async function onSearch(){
    const q = els.q.value;
    // local first
    const local = searchLocal(q);
    renderList(els.localResults, local);
    // then web
    const web = await searchWeb(q);
    const webRecipes = web.map((w, i) => ({
      id: `web_${i}_${Date.now()}`,
      title: w.title,
      description: w.snippet || '',
      tags: ['web'],
    }));
    const urls = web.map(w => w.url);
    renderList(els.webResults, webRecipes, {allowImport:true, sourceUrls: urls});
  }

  function renderImported(){
    const q = (els.importSearch.value||'').toLowerCase();
    const list = store.getImported().filter(r => 
      r.title.toLowerCase().includes(q) ||
      (r.description||'').toLowerCase().includes(q) ||
      (r.tags||[]).join(' ').toLowerCase().includes(q)
    );
    renderList(els.importedList, list);
  }

  function renderFavorites(){
    const q = (els.favSearch.value||'').toLowerCase();
    const list = store.getFavorites().filter(r => 
      r.title.toLowerCase().includes(q) ||
      (r.description||'').toLowerCase().includes(q) ||
      (r.tags||[]).join(' ').toLowerCase().includes(q)
    );
    renderList(els.favoriteList, list);
  }

  function renderFitness(){
    const q = (els.fitSearch.value||'').toLowerCase();
    const list = LOCAL_RECIPES
      .filter(r => (r.tags||[]).map(t=>t.toLowerCase()).includes('fitness') || (r.tags||[]).map(t=>t.toLowerCase()).includes('saludable'))
      .filter(r => 
        r.title.toLowerCase().includes(q) ||
        (r.description||'').toLowerCase().includes(q) ||
        (r.ingredients||[]).join(' ').toLowerCase().includes(q)
      );
    renderList(els.fitnessList, list);
  }

  // ---- Events
  els.searchBtn.addEventListener('click', onSearch);
  els.q.addEventListener('keydown', e => { if(e.key==='Enter') onSearch(); });
  els.importSearch.addEventListener('input', renderImported);
  els.favSearch.addEventListener('input', renderFavorites);
  els.fitSearch.addEventListener('input', renderFitness);
  els.syncBtn.addEventListener('click', async ()=>{
    await loadLocalRecipes();
    toast('Datos locales recargados');
    onSearch();
    renderFitness();
  });

  // ---- Startup
  (async () => {
    await loadLocalRecipes();
    renderList(els.localResults, LOCAL_RECIPES.slice(0, 8)); // initial
    renderFitness();
  })();
})();
