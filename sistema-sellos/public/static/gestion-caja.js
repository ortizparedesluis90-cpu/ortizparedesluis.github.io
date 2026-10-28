/* Cuadre de caja: abrir con un fondo, sacar o agregar dinero y cerrar contando el efectivo (arqueo).
   Quien no es el dueño cuenta «a ciegas»: no ve cuánto debería haber hasta cerrar.
   Usa lo que expone public/static/gestion.js en window.Gestion. Montos en céntimos. */
(function () {
  'use strict';
  var G = window.Gestion;
  if (!G || !document.getElementById('v-cuadre')) return;
  var $ = G.$, el = G.el, S = G.S, api = G.api, aCentimos = G.aCentimos, btn = G.btn;
  var ESTADO = null;
  function dueno() { return G.datos().rol === 'dueno'; }
  function fila(dl, k, v, clase) { dl.appendChild(el('div', { clase: clase || '' }, [el('dt', { texto: k }), el('dd', { texto: v })])); }
  function diferencia(d) { return d === 0 ? 'Cuadra' : d < 0 ? 'Falta ' + S(-d) : 'Sobra ' + S(d); }
  function claseDif(d) { return d === 0 ? 'cuadra' : d < 0 ? 'falta' : 'sobra'; }

  G.CARGAR.cuadre = async function () {
    if (!$('cu-mes').value) $('cu-mes').value = G.hoy().slice(0, 7);
    var r = await api('caja?mes=' + $('cu-mes').value);
    if (!r.ok) return G.aviso(r.datos.error || 'No se pudo cargar la caja.', true);
    ESTADO = r.datos;
    var a = ESTADO.abierta;
    $('cu-cerrada').hidden = !!a; $('cu-abierta').hidden = !a;
    var u = $('cu-ultimo');
    u.hidden = !ESTADO.ultima;
    if (ESTADO.ultima) u.href = '/' + G.slug + '/cierre/' + ESTADO.ultima.id;
    if (!a) {
      var ul = ESTADO.ultima;
      $('cu-cerrada-sub').textContent = ul
        ? 'Último cierre: ' + G.fechaCorta(ul.cierreDia) + ' a las ' + ul.cierreHora + ' por ' + ul.cerro + ' · ' + diferencia(ul.diferencia) + (ul.dejado ? ' · dejó ' + S(ul.dejado) + ' en caja' : '')
        : 'Empieza con el sencillo que tienes en la caja. Al terminar el día la cierras contando el efectivo.';
    } else pintarAbierta(a);
    pintarHistorial();
  };

  function pintarAbierta(a) {
    $('cu-abierta-t').textContent = 'Desde ' + (a.dia === G.hoy() ? 'hoy' : G.fechaCorta(a.dia)) + ' a las ' + a.hora;
    $('cu-abierta-sub').textContent = 'La abrió ' + a.abrio + ' con ' + S(a.fondo) + ' de fondo · ' + a.resumen.ventas + (a.resumen.ventas === 1 ? ' venta' : ' ventas') + ' en este turno' + (a.deAyer ? ' · Quedó abierta de otro día: ciérrala.' : '');
    var c = $('cu-cuenta'); c.textContent = '';
    var r = a.resumen;
    $('cu-ciego').hidden = r.esperado !== undefined;
    if (r.esperado !== undefined) {
      fila(c, 'Fondo inicial', S(r.fondo));
      fila(c, '+ Ventas en efectivo', S(r.ventasEfectivo));
      if (r.cobrosEfectivo) fila(c, '+ Cobros de fiados', S(r.cobrosEfectivo));
      if (r.entradas) fila(c, '+ Dinero agregado', S(r.entradas));
      if (r.gastosEfectivo) fila(c, '− Gastos pagados', S(r.gastosEfectivo));
      if (r.salidas) fila(c, '− Dinero sacado', S(r.salidas));
      fila(c, 'Debería haber', S(r.esperado), 'total');
    }
    var m = $('cu-medios'); m.textContent = '';
    var otros = (r.metodos || []).filter(function (x) { return x.n !== 'Efectivo'; });
    if (!otros.length) m.appendChild(el('p', { clase: 'g-nota', texto: 'Sin cobros por Yape, Plin ni tarjeta en este turno.' }));
    else { var dl = el('dl', { clase: 'g-cu-cuenta' }); otros.forEach(function (x) { fila(dl, x.n, S(x.total + (x.cobros || 0))); }); m.appendChild(dl); }
    var l = $('cu-movs'); l.textContent = '';
    if (!a.movimientos.length) G.vacio(l, 'Si sacas plata para depositar o agregas sencillo, anótalo aquí.');
    a.movimientos.forEach(function (x) {
      l.appendChild(el('li', {}, [el('div', { clase: 'l-quien' }, [el('strong', { texto: (x.tipo === 'salida' ? 'Sacó ' : 'Agregó ') + x.quien }), el('span', { texto: x.hora + (x.motivo ? ' · ' + x.motivo : '') })]),
        el('div', { clase: 'l-fin' }, [el('span', { clase: 'l-monto' + (x.tipo === 'salida' ? ' neg' : ''), texto: (x.tipo === 'salida' ? '− ' : '+ ') + S(x.monto) })])]));
    });
  }

  function pintarHistorial() {
    if (!dueno()) return;
    var k = $('cu-kpis'); k.textContent = '';
    var rm = ESTADO.resumenMes || { cierres: 0, faltante: 0, sobrante: 0, conFaltante: 0 };
    k.append(G.kpi('Cierres', String(rm.cierres)), G.kpi('Faltantes', S(rm.faltante), rm.conFaltante ? rm.conFaltante + (rm.conFaltante === 1 ? ' cierre con faltante' : ' cierres con faltante') : 'Ningún faltante'), G.kpi('Sobrantes', S(rm.sobrante)));
    var t = $('cu-historial'); t.textContent = '';
    t.appendChild(el('thead', {}, [el('tr', {}, ['Cierre', 'Quién', 'Debía haber', 'Contado', 'Resultado', ''].map(function (h, i) { return el('th', { clase: i >= 2 && i <= 3 ? 'g-num' : '', texto: h }); }))]));
    var tb = el('tbody'); t.appendChild(tb);
    if (!ESTADO.historial.length) tb.appendChild(el('tr', {}, [el('td', { clase: 'vacio', colspan: '6', texto: 'Aún no hay cierres este mes.' })]));
    ESTADO.historial.forEach(function (c, i) {
      var acc = el('td', { clase: 'g-num' }, [el('a', { clase: 'g-btn chico', href: '/' + G.slug + '/cierre/' + c.id, target: '_blank', rel: 'noopener', texto: 'Ver' })]);
      if (i === 0 && !ESTADO.abierta && $('cu-mes').value === G.hoy().slice(0, 7)) acc.appendChild(btn('Reabrir', 'chico', async function () {
        if (!confirm('¿Reabrir esta caja? Úsalo si se cerró por error: el conteo se borra y se vuelve a contar al cerrar.')) return;
        var r = await api('caja/' + c.id + '/reabrir', { body: {} });
        if (!r.ok) return G.aviso(r.datos.error || 'No se pudo.', true);
        G.aviso('Caja reabierta.'); G.CARGAR.cuadre();
      }));
      tb.appendChild(el('tr', {}, [el('td', { texto: G.fechaCorta(c.cierreDia) + ' ' + c.cierreHora }), el('td', { clase: 'tenue', texto: c.cerro }),
        el('td', { clase: 'g-num', texto: S(c.esperado) }), el('td', { clase: 'g-num', texto: S(c.contado) }),
        el('td', {}, [el('span', { clase: 'g-cu-chip', 'data-e': claseDif(c.diferencia), texto: diferencia(c.diferencia) })]), acc]));
    });
  }
  $('cu-mes').addEventListener('change', function () { G.CARGAR.cuadre(); });

  // ----- abrir -----
  $('cu-abrir').addEventListener('click', function () {
    var d = G.dialogo('d-cu-abrir'); d.f.reset();
    $('cu-fondo').value = ESTADO && ESTADO.sugerido ? String(ESTADO.sugerido / 100) : '';
    d.abrir(); setTimeout(function () { $('cu-fondo').focus(); }, 30);
  });
  $('d-cu-abrir').querySelector('form').addEventListener('submit', async function (ev) {
    if (ev.submitter && ev.submitter.value === 'cancelar') return;
    ev.preventDefault();
    var d = G.dialogo('d-cu-abrir');
    var r = await api('caja/abrir', { body: { fondo: $('cu-fondo').value } });
    if (!r.ok) return d.mal(r.datos.error || 'No se pudo abrir.');
    d.cerrar(); G.aviso('Caja abierta. ¡Buenas ventas!'); G.recargar();
  });

  // ----- sacar o agregar dinero -----
  var segMov = null;
  document.querySelectorAll('[data-cu-mov]').forEach(function (b) {
    b.addEventListener('click', function () {
      var d = G.dialogo('d-cu-mov'); d.f.reset();
      segMov = segMov || G.segmento($('cu-mov-tipo'), ['Sacar dinero', 'Agregar dinero']);
      segMov.marcar(b.getAttribute('data-cu-mov') === 'salida' ? 'Sacar dinero' : 'Agregar dinero');
      d.abrir(); setTimeout(function () { $('cu-mov-monto').focus(); }, 30);
    });
  });
  $('d-cu-mov').querySelector('form').addEventListener('submit', async function (ev) {
    if (ev.submitter && ev.submitter.value === 'cancelar') return;
    ev.preventDefault();
    var d = G.dialogo('d-cu-mov');
    var r = await api('caja/movimiento', { body: { tipo: segMov.valor() === 'Sacar dinero' ? 'salida' : 'entrada', monto: $('cu-mov-monto').value, motivo: $('cu-mov-motivo').value } });
    if (!r.ok) return d.mal(r.datos.error || 'No se pudo guardar.');
    d.cerrar(); G.aviso('Anotado.'); G.CARGAR.cuadre();
  });

  // ----- cerrar (arqueo) -----
  var billetes = Array.prototype.slice.call(document.querySelectorAll('#cu-billetes-caja input[data-den]'));
  function porBilletes() {
    var t = 0, hay = false;
    billetes.forEach(function (i) { var k = Number(i.value); if (k > 0) { hay = true; t += k * Number(i.getAttribute('data-den')); } });
    return hay ? t : null;
  }
  function contado() { var b = porBilletes(); return b !== null ? b : $('cu-contado').value.trim() === '' ? null : aCentimos($('cu-contado').value); }
  function pintarDif() {
    var b = porBilletes();
    if (b !== null) $('cu-contado').value = (b / 100).toFixed(2);
    var caja = $('cu-c-dif'), r = ESTADO && ESTADO.abierta && ESTADO.abierta.resumen, c = contado();
    // El dueño ve la diferencia mientras cuenta; el resto cuenta a ciegas.
    if (!r || r.esperado === undefined || c === null || isNaN(c)) { caja.hidden = true; return; }
    var d = c - r.esperado;
    caja.hidden = false; caja.setAttribute('data-e', claseDif(d));
    caja.textContent = 'Debería haber ' + S(r.esperado) + ' · ' + diferencia(d);
  }
  billetes.forEach(function (i) { i.addEventListener('input', pintarDif); });
  $('cu-contado').addEventListener('input', function () { billetes.forEach(function (i) { i.value = ''; }); pintarDif(); });
  $('cu-cerrar').addEventListener('click', function () {
    var d = G.dialogo('d-cu-cerrar'); d.f.reset(); $('cu-billetes-caja').open = false;
    $('cu-c-intro').textContent = dueno() ? 'Cuenta todo el efectivo que hay en la caja.' : 'Cuenta todo el efectivo que hay en la caja. Al cerrar verás si cuadra.';
    pintarDif(); d.abrir(); setTimeout(function () { $('cu-contado').focus(); }, 30);
  });
  $('d-cu-cerrar').querySelector('form').addEventListener('submit', async function (ev) {
    if (ev.submitter && ev.submitter.value === 'cancelar') return;
    ev.preventDefault();
    var d = G.dialogo('d-cu-cerrar');
    var b = {}; billetes.forEach(function (i) { if (Number(i.value) > 0) b[i.getAttribute('data-den')] = Number(i.value); });
    var r = await api('caja/cerrar', { body: { contado: $('cu-contado').value, billetes: b, dejado: $('cu-dejado').value, nota: $('cu-nota').value } });
    if (!r.ok) return d.mal(r.datos.error || 'No se pudo cerrar.');
    d.cerrar(); mostrarCierre(r.datos.caja, r.datos.whatsapp); G.CARGAR.cuadre();
  });
  function mostrarCierre(c, wa) {
    var e = $('cu-r-estado'); e.setAttribute('data-e', claseDif(c.diferencia));
    e.textContent = c.diferencia === 0 ? '✓ La caja cuadra' : diferencia(c.diferencia);
    var dl = $('cu-r-cuenta'); dl.textContent = '';
    fila(dl, 'Debería haber', S(c.esperado)); fila(dl, 'Se contó', S(c.contado));
    fila(dl, 'Queda para mañana', S(c.dejado || 0)); fila(dl, 'Se retira', S(c.contado - (c.dejado || 0)), 'total');
    (c.detalle.metodos || []).filter(function (x) { return x.n !== 'Efectivo'; }).forEach(function (x) { fila(dl, x.n, S(x.total + (x.cobros || 0))); });
    var url = location.origin + '/' + G.slug + '/cierre/' + c.id;
    $('cu-r-ticket').href = url;
    var texto = 'Cierre de caja de ' + G.negocio + ' (' + G.fechaCorta(c.cierreDia) + ' ' + c.cierreHora + ', cerró ' + c.cerro + '): debía haber ' + S(c.esperado) + ' en efectivo y se contó ' + S(c.contado) + '. ' + diferencia(c.diferencia) + '.' + (c.nota ? ' Nota: ' + c.nota : '') + ' ' + url;
    $('cu-r-wa').href = 'https://wa.me/' + (dueno() ? '' : wa || '') + '?text=' + encodeURIComponent(texto);
    G.dialogo('d-cu-listo').abrir();
  }

  // ----- aviso en Inicio: caja sin abrir o abierta de otro día -----
  G.avisoCaja = async function () {
    if (!G.activa('cuadre')) return;
    var r = await api('caja');
    if (!r.ok) return;
    var a = r.datos.abierta, caja = $('i-caja');
    if (a && a.deAyer) { $('i-caja-texto').textContent = 'La caja sigue abierta desde el ' + G.fechaCorta(a.dia) + '. Ciérrala contando el efectivo.'; caja.hidden = false; }
    else if (!a) { $('i-caja-texto').textContent = 'La caja está cerrada. Ábrela con el sencillo del día antes de vender.'; caja.hidden = false; }
    else caja.hidden = true;
  };
})();
