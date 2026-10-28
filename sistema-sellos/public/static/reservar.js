/* Reserva en línea: servicio → con quién → día → hora → datos. Solo muestra horas libres de verdad. */
(function () {
  'use strict';
  var main = document.getElementById('principal');
  var slug = main && main.getAttribute('data-slug');
  if (!slug || !document.getElementById('form-reserva')) return;
  var API = '/api/n/' + encodeURIComponent(slug) + '/reserva';
  var $ = function (id) { return document.getElementById(id); };
  var el = Sellos.el;
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var O = null, eleccion = { servicio: null, personal: '', dia: '', hora: '' };
  function fecha(d) { return new Date(d + 'T12:00:00Z'); }
  function fechaLarga(d) { var f = fecha(d); return DIAS[f.getUTCDay()] + ' ' + f.getUTCDate() + ' de ' + MESES[f.getUTCMonth()]; }
  function hora12(h) { var x = Number(h.slice(0, 2)); return (x % 12 || 12) + ':' + h.slice(3) + (x < 12 ? ' a. m.' : ' p. m.'); }
  function S(c) { return 'S/ ' + (c / 100).toFixed(2).replace(/\.00$/, ''); }
  function duracion(m) { return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : ''); }

  /** Grupo de opciones tipo radio, con flechas del teclado. */
  function radio(cont, opciones, alElegir, clase) {
    cont.textContent = '';
    var botones = opciones.map(function (o) {
      var b = el('button', { type: 'button', role: 'radio', 'aria-checked': 'false', clase: clase, tabindex: '-1' }, o.hijos);
      if (o.desactivado) b.disabled = true;
      b.addEventListener('click', function () { marcar(b); alElegir(o.valor); });
      b.addEventListener('keydown', function (ev) {
        var activos = botones.filter(function (x) { return !x.disabled; }), i = activos.indexOf(b);
        var sig = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? activos[i + 1] : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? activos[i - 1] : null;
        if (sig) { ev.preventDefault(); sig.focus(); sig.click(); }
      });
      cont.appendChild(b);
      return b;
    });
    var primero = botones.find(function (x) { return !x.disabled; });
    if (primero) primero.tabIndex = 0;
    function marcar(b) { botones.forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); x.tabIndex = x === b ? 0 : -1; }); }
  }

  function pasos() {
    var hayEquipo = equipoDelServicio().length > 1;
    $('r-paso-equipo').hidden = !eleccion.servicio || !hayEquipo;
    $('r-n-dia').textContent = hayEquipo ? '3' : '2';
    $('r-n-hora').textContent = hayEquipo ? '4' : '3';
    $('r-n-datos').textContent = hayEquipo ? '5' : '4';
    $('r-paso-dia').hidden = !eleccion.servicio;
    $('r-paso-hora').hidden = !eleccion.dia;
    $('r-paso-datos').hidden = !eleccion.hora;
    if (eleccion.hora) {
      var p = eleccion.personal ? O.equipo.find(function (x) { return String(x.id) === String(eleccion.personal); }) : null;
      $('r-resumen').textContent = eleccion.servicio.n + ' · ' + fechaLarga(eleccion.dia) + ', ' + hora12(eleccion.hora) + (p ? ' · con ' + p.nombre : '');
    }
  }
  function equipoDelServicio() {
    if (!eleccion.servicio) return [];
    return O.equipo.filter(function (p) { return !p.servicios.length || p.servicios.indexOf(eleccion.servicio.n) >= 0; });
  }

  async function cargar() {
    var r = await Sellos.api(API + '/opciones');
    if (!r.ok) { Sellos.mostrar($('r-error'), r.datos.error || 'No se pudo cargar.'); $('r-paso-datos').hidden = false; return; }
    O = r.datos;
    if (O.nota) Sellos.mostrar($('r-nota'), O.nota);
    if (!O.servicios.length) { $('r-servicios').appendChild(el('p', { clase: 'nota', texto: 'Pronto podrás reservar aquí. Mientras, escríbenos por WhatsApp.' })); return; }
    radio($('r-servicios'), O.servicios.map(function (s) {
      return { valor: s, hijos: [el('span', {}, [el('strong', { texto: s.n }), el('small', { texto: duracion(s.d) })]), s.p ? el('span', { clase: 'r-precio', texto: S(s.p) }) : null] };
    }), function (s) {
      eleccion.servicio = s; eleccion.hora = '';
      var eq = equipoDelServicio();
      if (eleccion.personal && !eq.some(function (p) { return String(p.id) === String(eleccion.personal); })) eleccion.personal = '';
      if (eq.length > 1) {
        radio($('r-equipo'), [{ valor: '', hijos: [el('span', {}, [el('strong', { texto: 'Cualquiera' }), el('small', { texto: 'El primero disponible' })])] }].concat(eq.map(function (p) {
          return { valor: String(p.id), hijos: [el('span', {}, [el('strong', { texto: p.nombre }), p.cargo ? el('small', { texto: p.cargo }) : null])] };
        })), function (v) { eleccion.personal = v; eleccion.hora = ''; if (eleccion.dia) horas(); pasos(); }, 'r-op');
      } else eleccion.personal = '';
      pintarDias();
      if (eleccion.dia) horas();
      pasos();
    }, 'r-op');
  }
  function pintarDias() {
    radio($('r-dias'), O.dias.map(function (d, i) {
      var f = fecha(d.dia);
      return { valor: d.dia, desactivado: !d.abierto, hijos: [el('small', { texto: i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : DIAS[f.getUTCDay()].slice(0, 3) }), el('strong', { texto: String(f.getUTCDate()) }), el('small', { texto: MESES[f.getUTCMonth()].slice(0, 3) })] };
    }), function (d) { eleccion.dia = d; eleccion.hora = ''; horas(); pasos(); }, 'r-dia');
    if (eleccion.dia) {
      var b = Array.prototype.find.call($('r-dias').children, function (x, i) { return O.dias[i].dia === eleccion.dia; });
      if (b) { b.setAttribute('aria-checked', 'true'); }
    }
  }
  var pedido = 0;
  async function horas() {
    var cont = $('r-horas'), yo = ++pedido;
    cont.textContent = ''; cont.appendChild(el('p', { clase: 'nota', texto: 'Buscando horas libres…' }));
    var q = '?servicio=' + encodeURIComponent(eleccion.servicio.n) + '&dia=' + eleccion.dia + (eleccion.personal ? '&personal=' + eleccion.personal : '');
    var r = await Sellos.api(API + '/horas' + q);
    if (yo !== pedido) return;
    cont.textContent = '';
    if (!r.ok) { cont.appendChild(el('p', { clase: 'nota', texto: r.datos.error || 'No se pudo cargar.' })); return; }
    if (!r.datos.horas.length) { cont.appendChild(el('p', { clase: 'nota', texto: 'No quedan horas libres este día. Prueba con otro día' + (eleccion.personal ? ' o con «Cualquiera».' : '.') })); return; }
    radio(cont, r.datos.horas.map(function (h) { return { valor: h, hijos: [document.createTextNode(hora12(h))] }; }), function (h) {
      eleccion.hora = h; pasos();
      setTimeout(function () { $('r-paso-datos').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
    }, 'r-hora');
  }

  var cel = $('r-celular');
  cel.addEventListener('input', function () {
    var d = cel.value.replace(/\D/g, '').replace(/^51(?=9\d{8}$)/, '').slice(0, 9);
    cel.value = d.replace(/^(\d{3})(\d{0,3})(\d{0,3}).*/, function (_, a, b, c) { return [a, b, c].filter(Boolean).join(' '); });
  });
  $('form-reserva').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var msg = $('r-error'), nombre = $('r-nombre'), digitos = cel.value.replace(/\D/g, '');
    if (nombre.value.trim().length < 2) { Sellos.mostrar(msg, 'Escribe tu nombre.'); nombre.focus(); return; }
    if (!/^9\d{8}$/.test(digitos)) { Sellos.mostrar(msg, 'Revisa tu celular: deben ser 9 dígitos y empezar con 9.'); cel.focus(); return; }
    if (!$('r-acepta').checked) { Sellos.mostrar(msg, 'Para reservar debes aceptar el aviso de privacidad.'); $('r-acepta').focus(); return; }
    var b = $('r-enviar'); b.disabled = true; b.textContent = 'Reservando…';
    var r = await Sellos.api(API, { body: { servicio: eleccion.servicio.n, personal: eleccion.personal || null, dia: eleccion.dia, hora: eleccion.hora, nombre: nombre.value, celular: digitos, acepta: true } });
    b.disabled = false; b.textContent = 'Reservar';
    if (!r.ok) {
      Sellos.mostrar(msg, r.datos.error || 'No se pudo reservar. Intenta de nuevo.');
      if (r.status === 409) { eleccion.hora = ''; horas(); pasos(); }
      return;
    }
    Sellos.mostrar(msg, '');
    var c = r.datos.cita, texto = c.servicio + ' · ' + fechaLarga(c.dia) + ', ' + hora12(c.hora) + (c.personal ? ' · con ' + c.personal : '');
    $('r-listo-texto').textContent = texto;
    var w = $('r-listo-wa'); w.textContent = '';
    if (r.datos.whatsapp) {
      w.appendChild(el('a', { clase: 'boton primario ancho', target: '_blank', rel: 'noopener', texto: 'Avisar por WhatsApp',
        href: 'https://wa.me/' + r.datos.whatsapp + '?text=' + encodeURIComponent('Hola, acabo de reservar: ' + texto + '. Mi nombre es ' + nombre.value.trim() + '.') }));
    }
    $('form-reserva').hidden = true; $('r-listo').hidden = false; $('r-listo').focus();
  });
  $('r-otra').addEventListener('click', function () {
    eleccion.hora = ''; $('r-listo').hidden = true; $('form-reserva').hidden = false; horas(); pasos();
  });
  cargar();
})();
