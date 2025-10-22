(function(){
  'use strict';
  var BASE = []; var RECIPES_URL = '/recipes.json';
  function $(sel){ return document.querySelector(sel); }
  function log(){ try { console.log.apply(console, arguments); } catch(_){} }

  function render(recipes){
    var grid = document.querySelector('#grid');
    var tpl  = document.querySelector('#card-tpl');
    if (!grid) return;
    grid.innerHTML = '';

    if (!tpl || !tpl.content) {
      (recipes || []).forEach(function(r){
        var art = document.createElement('article');
        art.className = 'card';
        var h = document.createElement('h3'); h.className = 'title'; h.textContent = r.nombre || '(Sin título)'; art.appendChild(h);
        var p = document.createElement('p'); p.className = 'muted desc'; p.textContent = r.descripcion || ''; art.appendChild(p);
        var tags = document.createElement('div'); tags.className = 'tags';
        (r.palabras_clave || []).slice(0,6).forEach(function(t){
          var s = document.createElement('span'); s.className = 'tag'; s.textContent = t; tags.appendChild(s);
        });
        art.appendChild(tags);
        art.tabIndex = 0;
        art.addEventListener('click', function(){ if (typeof openDetail === 'function') openDetail(r); });
        art.addEventListener('keydown', function(e){ if (e.key === 'Enter' && typeof openDetail === 'function') openDetail(r); });
        grid.appendChild(art);
      });
      return;
    }

    (recipes || []).forEach(function(r){
      var node = document.importNode(tpl.content, true);
      var card = node.querySelector('.card') || node.firstElementChild;
      if (card) {
        card.tabIndex = 0;
        card.addEventListener('click', function(){ if (typeof openDetail === 'function') openDetail(r); });
        card.addEventListener('keydown', function(e){ if (e.key === 'Enter' && typeof openDetail === 'function') openDetail(r); });
      }
      var t = node.querySelector('.title'); if (t) t.textContent = r.nombre || '(Sin título)';
      var d = node.querySelector('.desc');  if (d) d.textContent = r.descripcion || '';
      var tags = node.querySelector('.tags');
      if (tags) {
        (r.palabras_clave || []).slice(0,6).forEach(function(tag){
          var s = document.createElement('span'); s.className = 'tag'; s.textContent = tag; tags.appendChild(s);
        });
      }
      grid.appendChild(node);
    });
  }

  function localSearch(q){
    q = (q || '').toLowerCase().trim();
    var list = BASE.filter(function(r){
      var inTitulo = (r.nombre || '').toLowerCase().indexOf(q) !== -1;
      var inDesc = (r.descripcion || '').toLowerCase().indexOf(q) !== -1;
      var inIng = (r.ingredientes || []).join(' ').toLowerCase().indexOf(q) !== -1;
      var inTags = (r.palabras_clave || []).join(' ').toLowerCase().indexOf(q) !== -1;
      return inTitulo || inDesc || inIng || inTags;
    });
    render(list); return list.length;
  }

  function openDetail(r){
    var dlg = document.getElementById('detail'); if (!dlg) return;
    $('#d-title').textContent = r.nombre || '(Sin título)';
    $('#d-desc').textContent  = r.descripcion || '';
    var ings = $('#d-ings'); ings.innerHTML='';
    (r.ingredientes || []).forEach(function(x){ var li=document.createElement('li'); li.textContent=x; ings.appendChild(li); });
    var steps = $('#d-steps'); steps.innerHTML='';
    (r.instrucciones || []).forEach(function(p){ var li=document.createElement('li'); li.textContent=(p.texto||p.name||'').trim(); steps.appendChild(li); });
    var meta=[];
    if (r.porciones) meta.push('Porciones: '+r.porciones);
    if (r.tiempos && (r.tiempos.total || r.tiempos.preparacion || r.tiempos.coccion)) {
      var t=r.tiempos.total||r.tiempos.preparacion||r.tiempos.coccion; if (t) meta.push('Tiempo (min): '+t);
    }
    $('#d-meta').textContent = meta.join(' · ');
    var origin = $('#d-origin');
    origin.innerHTML = r.origen && r.origen.url && r.origen.url!=='local'
      ? 'Fuente: <a href="'+r.origen.url+'" target="_blank" rel="noopener">'+(r.origen.sitio||r.origen.url)+'</a>'
      : '';
    dlg.style.display='flex';
    $('#d-close').onclick=function(){ dlg.style.display='none'; };
    dlg.onclick=function(e){ if(e.target===dlg) dlg.style.display='none'; };
  }

  function clearWebResults(){
    var box = document.getElementById('web-results'); if (!box) return;
    while (box.firstChild) box.removeChild(box.firstChild);
  }
  function renderNoWebResults(term){
    var box = document.getElementById('web-results'); if (!box) return;
    clearWebResults();
    var p = document.createElement('p'); p.className='muted';
    p.textContent = 'No encontramos resultados web para “'+term+'”. Intenta otra búsqueda.';
    box.appendChild(p);
  }
  function renderWebResults(items){
    var box = document.getElementById('web-results'); if (!box) return;
    clearWebResults();
    if (!items || !items.length) return;
    items.forEach(function(it){
      var wrap = document.createElement('div');
      wrap.style.margin='6px 0'; wrap.style.padding='8px';
      wrap.style.border='1px solid #1f2937'; wrap.style.borderRadius='8px';
      var title = document.createElement('div'); title.style.fontWeight='600'; title.textContent = it.title || it.url; wrap.appendChild(title);
      var site = document.createElement('div'); site.className='muted'; site.textContent = it.site || ''; wrap.appendChild(site);
      var btn = document.createElement('button'); btn.textContent='Importar'; btn.style.marginTop='6px';
      btn.addEventListener('click', function(){ importFromURL(it.url); });
      wrap.appendChild(btn);
      box.appendChild(wrap);
    });
  }

  function importFromURL(url){
    fetch('/api/import?url=' + encodeURIComponent(url))
      .then(function(r){ return r.json(); })
      .then(function(j){
        if (!j.ok) throw new Error(j.error || 'No se pudo importar');
        var receta = j.receta;
        if (!BASE.some(function(r){ return r.id === receta.id; })){ BASE.push(receta); }
        render(BASE);
        openDetail(receta);
        console.log('Receta importada (copia a recipes.json para persistir):', receta);
        clearWebResults();
      }).catch(function(err){ console.error(err); alert('Error al importar: ' + err.message); });
  }

  function doSearchAndMaybeWeb(q){
    log('[recetas] buscar:', q);
    var count = localSearch(q);
    if (!q || q.trim().length < 2) { clearWebResults(); return; }
    if (count === 0){
      fetch('/api/search?q=' + encodeURIComponent(q))
        .then(function(r){ return r.json(); })
        .then(function(j){
          log('[recetas] /api/search ->', j);
          if (j && j.ok && Array.isArray(j.results) && j.results.length){
            renderWebResults(j.results);
          } else {
            renderNoWebResults(q);
          }
        })
        .catch(function(e){ console.warn('search error', e); renderNoWebResults(q); });
    } else {
      clearWebResults();
    }
  }

  function bindSearchEvents() {
    var form = document.getElementById('searchForm');
    var q = document.getElementById('q');
    var btn = document.getElementById('btnBuscar');
    var imp = document.getElementById('btnImport');

    if (form) form.addEventListener('submit', function(e){
      e.preventDefault();
      var val = (q && q.value) ? q.value : '';
      log('[recetas] submit:', val);
      doSearchAndMaybeWeb(val);
    });
    if (btn) btn.addEventListener('click', function(){
      var val = (q && q.value) ? q.value : '';
      log('[recetas] click buscar:', val);
      doSearchAndMaybeWeb(val);
    });
    if (q) {
      q.addEventListener('keyup', function(e){
        if (e.key === 'Enter') {
          log('[recetas] enter:', q.value);
          doSearchAndMaybeWeb(q.value);
        }
      });
      // Si querés búsqueda "en vivo", descomenta:
      // q.addEventListener('input', function(e){ doSearchAndMaybeWeb(e.target.value); });
    }
    if (imp) imp.addEventListener('click', function(){
      var url = prompt('Pega la URL de la receta (con JSON-LD)');
      if (url) importFromURL(url);
    });
  }

  function init(){
    fetch(RECIPES_URL).then(function(res){ if(!res.ok) throw new Error('No se pudo cargar recipes.json'); return res.json(); })
      .then(function(json){ BASE = Array.isArray(json) ? json : []; render(BASE); bindSearchEvents(); })
      .catch(function(err){ console.error(err); render([]); bindSearchEvents(); });
  }

  init();
  window.openDetail = openDetail;
})();