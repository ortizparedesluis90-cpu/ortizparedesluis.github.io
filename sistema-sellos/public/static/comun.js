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
  function regalito() {
    var i = el('i', { clase: 'hito-marca', 'aria-hidden': 'true' }), s = document.createElementNS(SVG, 'svg');
    s.setAttribute('class', 'ico'); s.setAttribute('viewBox', '0 0 24 24');
    var p = document.createElementNS(SVG, 'path'); p.setAttribute('d', 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-3-5-3.5-5-1.5S10 7 12 7zm0 0c1.5-3 5-3.5 5-1.5S14 7 12 7z');
    s.appendChild(p); i.appendChild(s);
    return i;
  }
  /** Dibuja las casillas de sellos dentro de una lista <ol>. hitos: sellos que dan un premio en el camino (llevan un regalito). */
  function casillas(ol, sellos, meta, hitos) {
    var llenos = Math.min(sellos, meta);
    ol.textContent = '';
    for (var i = 0; i < meta; i++) {
      var li = el('li', { clase: 'sello' + (i < llenos ? ' lleno' : '') });
      var plantilla = document.getElementById('sello-lleno');
      if (i < llenos) li.appendChild(plantilla ? plantilla.content.cloneNode(true) : check());
      else li.appendChild(el('span', { texto: String(i + 1) }));
      if (hitos && hitos.indexOf(i + 1) >= 0) { li.classList.add('hito'); li.appendChild(regalito()); }
      ol.appendChild(li);
    }
  }
  function mostrar(nodo, texto) { nodo.textContent = texto || ''; nodo.hidden = !texto; }
  /** Barras de avance: el ancho sale de aria-valuenow / aria-valuemax (la CSP no permite style="" en el HTML). */
  function barras() {
    document.querySelectorAll('.barra[role=progressbar]').forEach(function (b) {
      var max = Number(b.getAttribute('aria-valuemax')) || 100, v = Number(b.getAttribute('aria-valuenow')) || 0;
      var span = b.querySelector('span');
      if (span) span.style.width = Math.max(0, Math.min(100, v / max * 100)) + '%';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', barras); else barras();
  return { api: api, el: el, casillas: casillas, mostrar: mostrar, barras: barras };
})();
