// Cartel para imprimir: elegir el tamaño (cambia el tamaño de la hoja al imprimir) e imprimir.
(function () {
  var lamina = document.getElementById('lamina');
  var TAM = { a5: '148mm 210mm', a4: '210mm 297mm', mesa: '100mm 150mm' };
  var hoja = Array.prototype.filter.call(document.styleSheets, function (s) { return s.href && s.href.indexOf('/static/app.css') >= 0; })[0];
  var regla = null;
  function formato(f) {
    lamina.setAttribute('data-f', f);
    document.querySelectorAll('button[data-f]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-f') === f)); });
    // El tamaño de la hoja se pone con una regla @page que se cambia según el formato.
    try {
      if (regla !== null) hoja.deleteRule(regla);
      regla = hoja.insertRule('@page{size:' + TAM[f] + ';margin:0}', hoja.cssRules.length);
    } catch (e) { regla = null; }
  }
  document.querySelectorAll('button[data-f]').forEach(function (b) {
    b.addEventListener('click', function () { formato(b.getAttribute('data-f')); });
  });
  document.getElementById('imprimir').addEventListener('click', function () { window.print(); });
  formato('a5');
})();
