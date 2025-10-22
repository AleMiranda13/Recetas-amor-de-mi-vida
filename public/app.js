(function(){
  'use strict';
  var BASE = []; var RECIPES_URL = '/recipes.json';
  function $(sel){ return document.querySelector(sel); }

  function render(recipes){
    var grid = $('#grid'); var tpl = document.querySelector('#card-tpl');
    grid.innerHTML = '';
    recipes.forEach(function(r){
      var node = document.importNode(tpl.content, true);
      node.querySelector('.title').textContent = r.nombre || '(Sin título)';
      node.querySelector('.desc').textContent = r.descripcion || '';
      var tags = node.querySelector('.tags');
      (r.palabras_clave || []).slice(0,6).forEach(function(t){
        var span = document.createElement('span'); span.className = 'tag'; span.textContent = t; tags.appendChild(span);
      });
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

  
// (Reemplazo) Renderizado seguro sin innerHTML: construye DOM y evita escapado manual
function renderWebResults(items){
  var box = document.getElementById('web-results');
  if (!box) return;
  while (box.firstChild) box.removeChild(box.firstChild);
  if (!items || !items.length) return;

  var h3 = document.createElement('h3');
  h3.textContent = 'Resultados web';
  h3.style.margin = '0 0 8px';
  box.appendChild(h3);

  items.forEach(function(it){
    var wrap = document.createElement('div');
    wrap.style.margin = '6px 0';
    wrap.style.padding = '8px';
    wrap.style.border = '1px solid #1f2937';
    wrap.style.borderRadius = '8px';

    var title = document.createElement('div');
    title.style.fontWeight = '600';
    title.textContent = it.title || it.url;
    wrap.appendChild(title);

    var site = document.createElement('div');
    site.className = 'muted';
    site.textContent = it.site || '';
    wrap.appendChild(site);

    var btn = document.createElement('button');
    btn.textContent = 'Importar';
    btn.style.marginTop = '6px';
    btn.addEventListener('click', function(){
      importFromURL(it.url);
    });
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
        alert('Receta importada TEMPORALMENTE. Copia el objeto de la consola a public/recipes.json para persistir.');
        console.log('Receta importada (copia a recipes.json):', receta);
        renderWebResults([]);
      }).catch(function(err){ console.error(err); alert('Error al importar: ' + err.message); });
  }

  function doSearchAndMaybeWeb(q){
    var count = localSearch(q);
    if (!q || q.trim().length < 2) { renderWebResults([]); return; }
    if (count === 0){
      fetch('/api/search?q=' + encodeURIComponent(q))
        .then(function(r){ return r.json(); })
        .then(function(j){ if (j && j.ok) renderWebResults(j.results); })
        .catch(function(){});
    } else { renderWebResults([]); }
  }

  function initEvents(){
    var q = $('#q'); var b = $('#btnBuscar'); var imp = $('#btnImport');
    if (b) b.addEventListener('click', function(){ doSearchAndMaybeWeb(q.value); });
    if (imp) imp.addEventListener('click', function(){ var url = prompt('Pega la URL de la receta'); if (url) importFromURL(url); });
    if (q) q.addEventListener('input', function(e){ doSearchAndMaybeWeb(e.target.value); });
  }

  function init(){
    fetch(RECIPES_URL).then(function(res){ if(!res.ok) throw new Error('No se pudo cargar recipes.json'); return res.json(); })
      .then(function(json){ BASE = Array.isArray(json) ? json : []; render(BASE); initEvents(); })
      .catch(function(err){ console.error(err); render([]); initEvents(); });
  }
  init();
})();

// Si el backend devuelve ok:true pero sin results, mostrar aviso
(function ensureNoResultsMessage(){
  const orig = window.renderWebResults;
  if (!orig) return;
  window.renderWebResults = function(items){
    orig(items);
    const box = document.getElementById('web-results');
    if (!box) return;
    if ((!items || !items.length) && (document.querySelector('#grid article') == null)) {
      box.textContent = 'No encontramos resultados en la web ahora mismo. Intenta otra búsqueda o vuelve a intentar en unos segundos.';
    }
  };
})();
