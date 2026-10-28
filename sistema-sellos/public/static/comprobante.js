/* Comprobante: formato ticket o A4, imprimir o guardar en PDF. */
(function () {
  'use strict';
  var hoja = document.getElementById('c-hoja');
  if (!hoja) return;
  document.querySelectorAll('[data-formato]').forEach(function (b) {
    if (!b.hasAttribute('aria-pressed')) return;
    b.addEventListener('click', function () {
      hoja.setAttribute('data-formato', b.getAttribute('data-formato'));
      document.querySelectorAll('button[data-formato]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    });
  });
  document.getElementById('c-imprimir').addEventListener('click', function () { window.print(); });
  // El mensaje de WhatsApp lleva el enlace de esta página.
  var wa = document.getElementById('c-wa');
  wa.href = 'https://wa.me/?text=' + encodeURIComponent(wa.getAttribute('data-texto') + ' ' + location.href);
})();
