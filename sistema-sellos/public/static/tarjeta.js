/* Tarjeta del cliente: se actualiza sola cuando el negocio le suma un sello. */
(function () {
  'use strict';
  var main = document.getElementById('principal');
  var apiUrl = main && main.getAttribute('data-api');
  if (!apiUrl) return;
  var $ = function (id) { return document.getElementById(id); };
  var actual = null;

  function pintar(d) {
    var listo = d.sellos >= d.meta;
    var extra = Math.max(0, d.sellos - d.meta);
    Sellos.casillas($('sellos'), d.sellos, d.meta);
    $('sellos').setAttribute('aria-label', 'Sellos: ' + Math.min(d.sellos, d.meta) + ' de ' + d.meta);
    $('progreso').innerHTML = '';
    if (listo) $('progreso').textContent = '¡Completaste tu tarjeta!';
    else {
      $('progreso').append('Llevas ', Sellos.el('strong', { texto: String(d.sellos) }), ' de ' + d.meta + ' sellos');
    }
    Sellos.mostrar($('extra'), extra ? '+' + extra + ' sello' + (extra === 1 ? '' : 's') + ' para tu próxima tarjeta' : '');
    var premio = $('premio');
    premio.classList.toggle('listo', listo);
    var span = premio.querySelector('span');
    span.textContent = '';
    if (listo) span.append(Sellos.el('strong', { texto: '¡Premio listo!' }), ' Pide en caja: ' + d.premio);
    else span.textContent = 'Premio: ' + d.premio;
    $('visitas').textContent = d.visitas;
    $('premios').textContent = d.premios;
  }

  async function revisar() {
    if (document.hidden) return;
    var r = await Sellos.api(apiUrl);
    if (!r.ok) return;
    var d = r.datos;
    var clave = d.sellos + '/' + d.visitas + '/' + d.premios;
    if (actual !== null && clave !== actual) {
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
