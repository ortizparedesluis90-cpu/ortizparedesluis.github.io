/* Tarjeta en 3D: se inclina con el dedo o el mouse y un brillo sigue el movimiento. */
(function () {
  'use strict';
  if (document.documentElement.getAttribute('data-3d') !== '1') return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var carnet = document.querySelector('.carnet');
  if (!carnet) return;
  var activo = false, quieto = null;
  function mover(x, y) { // x, y entre -1 y 1
    carnet.style.setProperty('--rx', (-y * 9).toFixed(2) + 'deg');
    carnet.style.setProperty('--ry', (x * 12).toFixed(2) + 'deg');
    carnet.style.setProperty('--mx', (50 + x * 45).toFixed(1) + '%');
    carnet.style.setProperty('--my', (50 + y * 45).toFixed(1) + '%');
  }
  function desde(ev) {
    var r = carnet.getBoundingClientRect();
    var p = ev.touches ? ev.touches[0] : ev;
    mover(Math.max(-1, Math.min(1, ((p.clientX - r.left) / r.width) * 2 - 1)), Math.max(-1, Math.min(1, ((p.clientY - r.top) / r.height) * 2 - 1)));
    if (!activo) { activo = true; carnet.classList.add('tocando'); }
    clearTimeout(quieto);
    quieto = setTimeout(function () { activo = false; carnet.classList.remove('tocando'); mover(0, 0); }, 1600);
  }
  carnet.addEventListener('pointermove', desde);
  carnet.addEventListener('touchmove', desde, { passive: true });
  carnet.addEventListener('pointerleave', function () { activo = false; carnet.classList.remove('tocando'); mover(0, 0); });
})();
