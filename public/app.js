(() => {
  // --------- refs del DOM
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

  // --------- storage
  const LS_IMPORTED = 'recetas_importadas_v1';
  const LS_FAVORITES = 'recetas_favoritas_v1';
  const store = {
    getImported(){ return JSON.parse(localStorage.getItem(LS_IMPORTED) || '[]'); },
    setImported(a){ localStorage.setItem(LS_IMPORTED, JSON.stringify(a)); },
    getFavorites(){ return JSON.parse(localStorage.getItem(LS_FAVORITES) || '[]'); },
    setFavorites(a){ localStorage.setItem(LS_FAVORITES, JSON.stringify(a)); },
    isFav(id){ return this.getFavorites().some(r => r.id === id); }
  };

  function upsertImported(updated){
    const list = store.getImported();
    const i = list.findIndex(r => r.id === updated.id);
    if (i >= 0) list[i] = updated; else list.unshift(updated);
    store.setImported(list);
  }
  function deleteImported(id){
    const list = store.getImported().filter(r => r.id !== id);
    store.setImported(list);
    renderImported();
    toast('Eliminada de importadas', 'warn');
  }

  // --------- toast
  function toast(msg, type='success'){
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.textContent = msg;
    els.toastWrap.appendChild(div);
    setTimeout(() => { div.style.opacity='0'; setTimeout(()=>div.remove(), 260); }, 2200);
  }

  // --------- modal
  function openModal(recipe){
    els.modalTitle.textContent = recipe.title || 'Receta';
    els.modalDesc.textContent = recipe.description || '';
    els.modalIngr.innerHTML = '';
    els.modalSteps.innerHTML = '';

    if (recipe.ingredients?.length) {
      recipe.ingredients.forEach(i => { const li=document.createElement('li'); li.textContent=i; els.modalIngr.appendChild(li); });
    } else if (recipe.source) {
      els.modalIngr.innerHTML = `<li><a href="${recipe.source}" target="_blank" rel="noopener">Ver receta completa en la web</a></li>`;
    }
    if (recipe.steps?.length) {
      recipe.steps.forEach(s => { const li=document.createElement('li'); li.textContent=s; els.modalSteps.appendChild(li); });
    }

    els.modalBackdrop.style.display = 'flex';
    els.modalBackdrop.setAttribute('aria-hidden','false');
  }
  function closeModal(){
    els.modalBackdrop.style.display = 'none';
    els.modalBackdrop.setAttribute('aria-hidden','true');
  }
  els.modalClose.addEventListener('click', closeModal);
  els.modalClose2?.addEventListener('click', closeModal);
  els.modalBackdrop.addEventListener('click', e => { if (e.target === els.modalBackdrop) closeModal(); });

  // --------- tabs
  els.tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      els.tabs.forEach(b => b.setAttribute('aria-selected', 'false'));
      btn.setAttribute('aria-selected', 'true');
      Object.entries(els.panels).forEach(([k, sec]) => sec.hidden = (btn.dataset.tab !== k));
      if (btn.dataset.tab === 'importadas') renderImported();
      if (btn.dataset.tab === 'favoritas') renderFavorites();
      if (btn.dataset.tab === 'fitness') renderFitness();
    });
  });

  // --------- datos locales
  let LOCAL_RECIPES = [];
  async function loadLocalRecipes(){
    try{
      const r = await fetch('/api/recipes');
      if(!r.ok) throw 0;
      LOCAL_RECIPES = await r.json();
    }catch{
      const r2 = await fetch('./recipes.json');
      LOCAL_RECIPES = await r2.json();
    }
    if (!Array.isArray(LOCAL_RECIPES)) LOCAL_RECIPES = [];
  }

  // --------- enriquecer detalles (re-import si faltan)
  async function ensureDetails(recipe){
    const has = (recipe.ingredients && recipe.ingredients.length) || (recipe.steps && recipe.steps.length);
    if (has || !recipe.source) return recipe;

    try{
      let data;
      try{
        const r = await fetch('/api/import', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ url: recipe.source })
        });
        if(!r.ok) throw 0;
        data = await r.json();
      }catch{
        const r = await fetch('/api/import?url=' + encodeURIComponent(recipe.source));
        data = await r.json();
      }

      const enriched = {
        ...recipe,
        title: data.title || recipe.title,
        description: data.description || recipe.description,
        ingredients: data.ingredients || recipe.ingredients || [],
        steps: data.steps || data.instructions || recipe.steps || [],
        tags: Array.from(new Set([...(recipe.tags||[]), ...(data.tags||[]), 'importada'])),
      };
      upsertImported(enriched);
      return enriched;
    }catch(e){
      console.error('ensureDetails', e);
      return recipe;
    }
  }

  // --------- tarjeta
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

    if (opts.mode !== 'web') {
      // Ver (en importadas intenta enriquecer antes)
      const btnView = document.createElement('button');
      btnView.className = 'ghost';
      btnView.textContent = 'Ver';
      btnView.addEventListener('click', async () => {
        const r = (opts.section === 'importadas') ? await ensureDetails(recipe) : recipe;
        openModal(r);
      });
      actions.append(btnView);

      // Eliminar (solo en importadas)
      if (opts.section === 'importadas') {
        const del = document.createElement('button');
        del.className = 'ghost danger';
        del.textContent = 'Eliminar';
        del.addEventListener('click', () => deleteImported(recipe.id));
        actions.append(del);
      }
    } else {
      // Resultados web: Importar + Fuente
      const imp = document.createElement('button');
      imp.className = 'ghost';
      imp.textContent = 'Importar';
      imp.addEventListener('click', ()=> importFromUrl(opts.sourceUrl, recipe, imp));
      actions.append(imp);

      if (opts.sourceUrl) {
        const a = document.createElement('a');
        a.className = 'ghost';
        a.textContent = 'Fuente';
        a.href = opts.sourceUrl;
        a.target = '_blank';
        a.rel = 'noopener';
        a.style.textDecoration = 'none';
        actions.append(a);
      }
    }

    // Favoritos
    const fav = document.createElement('button');
    fav.className = 'icon fav' + (store.isFav(recipe.id) ? ' active' : '');
    fav.innerHTML = '★';
    fav.title = store.isFav(recipe.id) ? 'Quitar de favoritos' : 'Agregar a favoritos';
    fav.addEventListener('click', ()=> toggleFavorite(recipe, fav));
    actions.append(fav);

    card.append(title, desc, tags, actions);
    return card;
  }

  function toggleFavorite(recipe, btn){
    let favs = store.getFavorites();
    const exists = favs.some(r => r.id === recipe.id);
    if (exists) {
      favs = favs.filter(r => r.id !== recipe.id);
      btn?.classList.remove('active');
      btn.title = 'Agregar a favoritos';
      toast('Quitado de favoritos', 'warn');
    } else {
      favs.unshift(recipe);
      btn?.classList.add('active');
      btn.title = 'Quitar de favoritos';
      toast('Agregado a favoritos');
    }
    store.setFavorites(favs);
    renderFavorites();
  }

  // --------- importar (desde resultados web)
  async function importFromUrl(url, meta = {}, button){
    try{
      button && (button.disabled = true, button.textContent = 'Importando...');
      let data;
      try{
        const res = await fetch('/api/import', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ url })
        });
        if(!res.ok) throw 0;
        data = await res.json();
      }catch{
        const res = await fetch('/api/import?url=' + encodeURIComponent(url));
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

      const list = store.getImported();
      list.unshift(recipe);
      store.setImported(list);
      toast('Receta importada ✔');

      // mover a Importadas y abrir modal
      els.tabs.forEach(b => b.setAttribute('aria-selected','false'));
      document.querySelector('.tab-btn[data-tab="importadas"]').setAttribute('aria-selected','true');
      Object.entries(els.panels).forEach(([k, sec]) => sec.hidden = (k !== 'importadas'));
      renderImported();
      openModal(recipe);

    }catch(e){
      console.error(e);
      toast('No se pudo importar esta URL', 'error');
    }finally{
      button && (button.disabled = false, button.textContent = 'Importar');
    }
  }

  // --------- búsquedas
  function searchLocal(q){
    const term = (q||'').trim().toLowerCase();
    // excluye fitness del buscador local
    const base = LOCAL_RECIPES.filter(r => !(r.tags||[]).includes('fitness'));
    if(!term) return base;
    return base.filter(r =>
      (r.title||'').toLowerCase().includes(term) ||
      (r.description||'').toLowerCase().includes(term) ||
      (r.tags||[]).join(' ').toLowerCase().includes(term) ||
      (r.ingredients||[]).join(' ').toLowerCase().includes(term)
    );
  }

  // soporta array directo o { ok, results } o { organic_results }
  async function searchWeb(q){
    if(!q) return [];
    try{
      const res = await fetch('/api/search?q=' + encodeURIComponent(q));
      if(!res.ok) throw 0;
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data.results || data.organic_results || []);
      return arr.slice(0, 12);
    }catch{
      return [];
    }
  }

  // --------- render genérico
  function renderList(container, recipes, {mode='local', section=null, sourceUrls=[]} = {}){
    container.innerHTML = '';
    if(!recipes.length){
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Sin resultados por ahora.';
      container.appendChild(empty);
      return;
    }
    recipes.forEach((r, idx) => {
      container.appendChild(recipeCard(r, {mode, section, sourceUrl: sourceUrls[idx]}));
    });
  }

  // --------- handlers
  async function onSearch(){
    const q = els.q.value;

    // locales (sin fitness)
    const local = searchLocal(q);
    renderList(els.localResults, local);
    toggleLocalMoreVisibility(false); // oculta "Ver más" al estar en modo búsqueda

    // web
    const web = await searchWeb(q);
    if (!web.length) {
      els.webResults.innerHTML = `
        <div class="empty">
          Sin resultados por ahora.<br/><br/>
          <a href="https://www.google.com/search?q=${encodeURIComponent(q)}" target="_blank" rel="noopener">
            Abrir búsqueda en Google
          </a>
        </div>`;
      return;
    }

    const webRecipes = web.map((w, i) => ({
      id: `web_${i}_${Date.now()}`,
      title: w.title,
      description: w.snippet || '',
      tags: ['web'],
      source: w.url
    }));
    const urls = web.map(w => w.url);
    renderList(els.webResults, webRecipes, {mode:'web', sourceUrls: urls});
  }

  function renderImported(){
    const q = (els.importSearch.value||'').toLowerCase();
    const list = store.getImported().filter(r =>
      r.title.toLowerCase().includes(q) ||
      (r.description||'').toLowerCase().includes(q) ||
      (r.tags||[]).join(' ').toLowerCase().includes(q)
    );
    renderList(els.importedList, list, { mode:'local', section:'importadas' });
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
    const term = (els.fitSearch.value||'').trim().toLowerCase();
    const base = LOCAL_RECIPES.filter(r => (r.tags||[]).includes('fitness') || (r.tags||[]).includes('saludable'));
    const list = !term ? base : base.filter(r =>
      (r.title||'').toLowerCase().includes(term) ||
      (r.description||'').toLowerCase().includes(term) ||
      (r.ingredients||[]).join(' ').toLowerCase().includes(term)
    );
    renderList(els.fitnessList, list); // sin slice: muestra todas las fitness
  }

  // --------- "Ver más / Ver menos" para locales (inicio)
  let showAllLocal = false;      // por defecto mostramos una parte
  const LOCAL_PAGE = 24;         // cantidad inicial

  // botón creado dinámicamente y colocado entre locales y web
  let localMoreWrap = null;
  let localMoreBtn = null;

  function ensureLocalMoreButton(){
    if (localMoreWrap) return;
    localMoreWrap = document.createElement('div');
    localMoreWrap.style.display = 'flex';
    localMoreWrap.style.justifyContent = 'center';
    localMoreWrap.style.margin = '10px 0 4px 0';

    localMoreBtn = document.createElement('button');
    localMoreBtn.className = 'ghost';
    localMoreBtn.textContent = 'Ver más';
    localMoreBtn.addEventListener('click', () => {
      showAllLocal = !showAllLocal;
      renderLocalInitial(); // vuelve a pintar locales
      localMoreBtn.textContent = showAllLocal ? 'Ver menos' : 'Ver más';
    });

    // Insertar antes de la sección de resultados web
    els.webResults.parentNode.insertBefore(localMoreWrap, els.webResults);
    localMoreWrap.appendChild(localMoreBtn);
  }

  function toggleLocalMoreVisibility(show){
    if (!localMoreWrap) return;
    localMoreWrap.style.display = show ? 'flex' : 'none';
  }

  function renderLocalInitial(){
    // lista local sin fitness
    const base = LOCAL_RECIPES.filter(r => !(r.tags||[]).includes('fitness'));
    const list = showAllLocal ? base : base.slice(0, LOCAL_PAGE);
    renderList(els.localResults, list);
    // el botón solo aparece cuando NO hay búsqueda activa
    toggleLocalMoreVisibility(true);
  }

  // --------- eventos e init
  els.searchBtn.addEventListener('click', onSearch);
  els.q.addEventListener('keydown', e => { if(e.key==='Enter') onSearch(); });
  els.importSearch.addEventListener('input', renderImported);
  els.favSearch.addEventListener('input', renderFavorites);
  els.fitSearch.addEventListener('input', renderFitness);
  els.syncBtn.addEventListener('click', async ()=>{ await loadLocalRecipes(); toast('Datos locales recargados'); renderLocalInitial(); renderFitness(); });

  (async () => {
    await loadLocalRecipes();

    // preparar botón "Ver más" y pintar locales/finess iniciales
    ensureLocalMoreButton();
    renderLocalInitial();   // locales (24 o todos si showAllLocal = true)
    renderFitness();        // fitness: todas las fitness disponibles
  })();
})();