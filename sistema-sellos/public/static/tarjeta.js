/* Tarjeta del cliente: se actualiza sola cuando el negocio registra una visita o un canje. */
(function () {
  'use strict';
  var main = document.getElementById('principal');
  var apiUrl = main && main.getAttribute('data-api');
  if (!apiUrl) return;
  var $ = function (id) { return document.getElementById(id); };
  var actual = null;

  // Misma frase que fraseFalta() en src/paginas.js.
  // (d.premio de la API es la frase del estado; el nombre del premio va en la página).
  var nombrePremio = main.getAttribute('data-premio');
  function frase(nodo, d) {
    var f = Math.max(0, d.meta - d.sellos), b = function (t) { return Sellos.el('strong', { texto: t }); };
    nodo.textContent = '';
    if (!f) nodo.append('¡Completaste tu tarjeta!', document.createElement('br'), 'Pide en caja tu ', b(nombrePremio));
    else if (f === 1) nodo.append('¡Te falta solo ', b('1 sello'), '!', document.createElement('br'), 'para tu ', b(nombrePremio));
    else nodo.append('Te faltan ', b(f + ' sellos'), document.createElement('br'), 'para tu ', b(nombrePremio));
  }
  function pintar(d) {
    var listo = d.sellos >= d.meta, llenos = Math.min(d.sellos, d.meta);
    var extra = Math.max(0, d.sellos - d.meta);
    Sellos.casillas($('sellos'), d.sellos, d.meta);
    $('sellos').setAttribute('aria-label', 'Sellos: ' + llenos + ' de ' + d.meta);
    $('avance').textContent = llenos + ' de ' + d.meta;
    $('barra').setAttribute('aria-valuenow', String(llenos)); Sellos.barras();
    frase($('progreso'), d);
    Sellos.mostrar($('extra'), extra ? '+' + extra + ' sello' + (extra === 1 ? '' : 's') + ' para tu próxima tarjeta' : '');
    $('premio').hidden = !listo;
  }

  async function revisar() {
    if (document.hidden) return;
    var r = await Sellos.api(apiUrl);
    if (!r.ok) return;
    var d = r.datos;
    var clave = d.sellos + '/' + d.puntos + '/' + d.saldo + '/' + d.visitas + '/' + d.premios;
    if (actual !== null && clave !== actual) {
      // Puntos y cashback: la página trae el carnet ya armado, así que se recarga.
      if (main.getAttribute('data-tipo') !== 'sellos') { location.reload(); return; }
      pintar(d);
      if (navigator.vibrate) navigator.vibrate(60);
    }
    actual = clave;
  }
  revisar();
  setInterval(revisar, 15000);
  document.addEventListener('visibilitychange', revisar);

  var borrar = $('eliminar');
  if (borrar) borrar.addEventListener('click', async function () {
    if (!confirm('¿Eliminar tu tarjeta y todos tus sellos? No se puede deshacer.')) return;
    borrar.disabled = true;
    var r = await Sellos.api(apiUrl + '/eliminar', { body: {} });
    if (r.ok) {
      main.textContent = '';
      main.append(Sellos.el('header', { clase: 'cabeza' }, [
        Sellos.el('h1', { texto: 'Tarjeta eliminada', tabindex: '-1', id: 'fin' }),
        Sellos.el('p', { clase: 'bajada', texto: 'Borramos tu nombre, tu celular y tus sellos.' }),
      ]));
      $('fin').focus();
      return;
    }
    borrar.disabled = false;
    Sellos.mostrar($('eliminar-msg'), r.datos.error || 'No se pudo eliminar. Intenta de nuevo.');
  });
})();
