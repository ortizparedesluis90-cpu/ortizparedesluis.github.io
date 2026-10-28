/* Inicio de Tappe: el rubro que cambia en el título, el resumen del día «en vivo» y las secciones que aparecen al bajar.
   Con «reducir movimiento» todo queda quieto. */
(function () {
  'use strict';
  var quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (id) { return document.getElementById(id); };

  // Secciones que aparecen al bajar.
  var secciones = document.querySelectorAll('.s-seccion h2, .s-dos > *, .s-funciones > li, .s-pasos > li');
  if (!quieto && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('visto'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    secciones.forEach(function (s, i) { s.classList.add('s-revela'); s.style.transitionDelay = (i % 4) * 60 + 'ms'; io.observe(s); });
  }
  if (quieto) return;

  // El rubro del título: «Tu bodega, ordenada.» → ferretería, florería...
  var RUBROS = ['bodega', 'ferretería', 'florería', 'barbería', 'tienda', 'botica', 'zapatería', 'librería', 'veterinaria'];
  var rota = $('s-rota'), r = 0;
  function cambiarRubro() {
    if (!rota || document.hidden) return;
    rota.classList.add('sale');
    setTimeout(function () {
      r = (r + 1) % RUBROS.length;
      rota.textContent = RUBROS[r];
      rota.classList.remove('sale'); rota.classList.add('entra');
      void rota.offsetWidth; // aplica la posición de entrada antes de animar
      rota.classList.remove('entra');
    }, 350);
  }
  setInterval(cambiarRubro, 2400);

  // Números que cuentan.
  function soles(c) {
    var t = (c / 100).toFixed(2).split('.');
    return 'S/ ' + t[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + t[1];
  }
  function contar(el, desde, hasta, ms) {
    var t0 = performance.now();
    (function paso(t) {
      var x = Math.min(1, (t - t0) / ms), suave = 1 - Math.pow(1 - x, 3);
      el.textContent = soles(Math.round(desde + (hasta - desde) * suave));
      if (x < 1) requestAnimationFrame(paso);
    })(t0);
    el.setAttribute('data-valor', String(hasta));
  }
  var vendido = $('s-vendido'), ganancia = $('s-ganancia'), ventas = $('s-ventas'), feed = $('s-feed');
  if (!vendido) return;
  contar(vendido, 0, Number(vendido.getAttribute('data-valor')), 1400);
  contar(ganancia, 0, Number(ganancia.getAttribute('data-valor')), 1400);

  // Ventas de ejemplo que van entrando.
  var EJEMPLOS = [
    ['Pan francés × 10', 'Efectivo', 300, 120], ['Leche Gloria × 2', 'Yape', 900, 160], ['Detergente Bolívar', 'Plin', 650, 140],
    ['Gaseosa 1.5 L', 'Efectivo', 750, 230], ['Huevos 1 kg', 'Yape', 980, 150], ['Azúcar rubia 1 kg', 'Efectivo', 420, 50],
    ['Galletas Soda × 3', 'Tarjeta', 360, 110], ['Atún Florida × 2', 'Yape', 1100, 290],
  ];
  var i = 0;
  function nuevaVenta() {
    if (document.hidden) return;
    var x = EJEMPLOS[i++ % EJEMPLOS.length];
    var li = document.createElement('li'); li.className = 's-feed-nuevo';
    var q = document.createElement('div'); q.className = 'l-quien';
    var n = document.createElement('strong'); n.textContent = x[0];
    var m = document.createElement('span'); m.textContent = x[1] + ' · hace un momento';
    var t = document.createElement('span'); t.className = 'l-monto'; t.textContent = soles(x[2]);
    q.append(n, m); li.append(q, t);
    var viejo = feed.querySelector('li:not(:last-child) .l-quien span');
    if (viejo) viejo.textContent = viejo.textContent.replace(' · hace un momento', '');
    feed.insertBefore(li, feed.firstChild);
    var sobran = feed.querySelectorAll('li');
    if (sobran.length > 3) sobran[sobran.length - 2].remove(); // el aviso de stock queda siempre abajo
    contar(vendido, Number(vendido.getAttribute('data-valor')), Number(vendido.getAttribute('data-valor')) + x[2], 700);
    contar(ganancia, Number(ganancia.getAttribute('data-valor')), Number(ganancia.getAttribute('data-valor')) + x[3], 700);
    ventas.textContent = String(Number(ventas.textContent) + 1);
    vendido.classList.add('s-sube'); setTimeout(function () { vendido.classList.remove('s-sube'); }, 900);
  }
  setTimeout(function () { nuevaVenta(); setInterval(nuevaVenta, 3200); }, 2200);
})();
