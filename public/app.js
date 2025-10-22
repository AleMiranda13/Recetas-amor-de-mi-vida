/* App JS limpio y compatible */
(function(){
  'use strict';

  var BASE = []; // recetas locales
  var RECIPES_URL = '/recipes.json';

  function $(sel){ return document.querySelector(sel); }

  function render(recipes){
    var grid = $('#grid');
    var tpl = document.querySelector('#card-tpl');
    grid.innerHTML = '';
    recipes.forEach(function(r){
      var node = document.importNode(tpl.content, true);
      node.querySelector('.title').textContent = r.nombre || '(Sin titulo)';
      node.querySelector('.desc').textContent = r.descripcion || '';
      var tags = node.querySelector('.tags');
      (r.palabras_clave || []).slice(0,6).forEach(function(t){
        var span = document.createElement('span');
        span.className = 'tag';
        span.textContent = t;
        tags.appendChild(span);
      });
      grid.appendChild(node);
    });
  }

  function search(q){
    q = (q || '').toLowerCase();
    var list = BASE.filter(function(r){
      var inTitulo = (r.nombre || '').toLowerCase().indexOf(q) !== -1;
      var inDesc = (r.descripcion || '').toLowerCase().indexOf(q) !== -1;
      var inIng = (r.ingredientes || []).join(' ').toLowerCase().indexOf(q) !== -1;
      var inTags = (r.palabras_clave || []).join(' ').toLowerCase().indexOf(q) !== -1;
      return inTitulo || inDesc || inIng || inTags;
    });
    render(list);
  }

  function initEvents(){
    $('#btnBuscar').addEventListener('click', function(){
      search($('#q').value);
    });
    $('#q').addEventListener('input', function(e){
      search(e.target.value);
    });
  }

  function init(){
    fetch(RECIPES_URL).then(function(res){
      if(!res.ok) throw new Error('No se pudo cargar recipes.json');
      return res.json();
    }).then(function(json){
      BASE = Array.isArray(json) ? json : [];
      render(BASE);
      initEvents();
    }).catch(function(err){
      console.error(err);
      render([]);
    });
  }

  // start
  init();
})();