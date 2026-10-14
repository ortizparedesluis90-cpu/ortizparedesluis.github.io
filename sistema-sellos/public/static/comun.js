/* Funciones compartidas por las páginas (sin dependencias). */
window.Sellos = (function () {
  'use strict';
  async function api(url, opciones) {
    opciones = opciones || {};
    var init = { method: opciones.method || 'GET', headers: {}, credentials: 'same-origin' };
    if (opciones.body !== undefined) {
      init.method = opciones.method || 'POST';
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opciones.body);
    }
    var r;
    try { r = await fetch(url, init); } catch (e) { return { ok: false, status: 0, datos: { error: 'Sin conexión. Revisa tu internet e intenta de nuevo.' } }; }
    var datos = {};
    try { datos = await r.json(); } catch (e) { /* sin cuerpo */ }
    return { ok: r.ok, status: r.status, datos: datos };
  }
  function el(tag, attrs, hijos) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'texto') n.textContent = attrs[k];
      else if (k === 'clase') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (hijos || []).forEach(function (h) { if (h) n.appendChild(h); });
    return n;
  }
  var SVG = 'http://www.w3.org/2000/svg';
  function check() {
    var s = document.createElementNS(SVG, 'svg');
    s.setAttribute('class', 'ico'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(SVG, 'path'); p.setAttribute('d', 'M5 12.5l4.2 4.2L19 7');
    s.appendChild(p);
    return s;
  }
  /** Dibuja las casillas de sellos dentro de una lista <ol>. */
  function casillas(ol, sellos, meta) {
    var llenos = Math.min(sellos, meta);
    ol.textContent = '';
    for (var i = 0; i < meta; i++) {
      var li = el('li', { clase: 'sello' + (i < llenos ? ' lleno' : '') });
      if (i < llenos) li.appendChild(check()); else li.appendChild(el('span', { texto: String(i + 1) }));
      ol.appendChild(li);
    }
  }
  function mostrar(nodo, texto) { nodo.textContent = texto || ''; nodo.hidden = !texto; }
  return { api: api, el: el, casillas: casillas, mostrar: mostrar };
})();
