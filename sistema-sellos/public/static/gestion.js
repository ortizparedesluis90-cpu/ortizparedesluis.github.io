/* Gestión del negocio: inicio, agenda, caja, clientes, gastos, finanzas, equipo, catálogo y ajustes.
   Montos en céntimos; días AAAA-MM-DD y horas HH:MM de Lima (los da el servidor). */
(function () {
  'use strict';
  var raiz = document.getElementById('g');
  if (!raiz) return;
  var SLUG = raiz.getAttribute('data-slug'), NEGOCIO = raiz.getAttribute('data-negocio'), MODO = raiz.getAttribute('data-giro') || 'servicios';
  var API = '/api/n/' + encodeURIComponent(SLUG) + '/g/';
  var $ = function (id) { return document.getElementById(id); };
  var el = Sellos.el;
  var D = null; // datos del negocio: rol, equipo, catálogo, ajustes...
  var hoy = '';

  // ---------- formatos ----------
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  function S(c) { c = Number(c || 0); return (c < 0 ? '− ' : '') + 'S/ ' + (Math.abs(c) / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function Scorto(c) { var v = Number(c || 0) / 100; return 'S/ ' + (v >= 1000 ? (v / 1000).toLocaleString('es-PE', { maximumFractionDigits: 1 }) + ' mil' : v.toLocaleString('es-PE', { maximumFractionDigits: 0 })); }
  function aCentimos(t) { t = String(t || '').trim().replace(',', '.'); if (!t) return 0; var x = Math.round(Number(t) * 100); return isFinite(x) && x >= 0 ? x : NaN; }
  function fecha(d) { return new Date(d + 'T12:00:00Z'); }
  function diaSemana(d) { return fecha(d).getUTCDay(); }
  function fechaLarga(d) { var f = fecha(d); return DIAS[f.getUTCDay()] + ' ' + f.getUTCDate() + ' de ' + MESES[f.getUTCMonth()]; }
  function fechaCorta(d) { var f = fecha(d); return f.getUTCDate() + ' ' + MESES[f.getUTCMonth()].slice(0, 3); }
  function sumarDias(d, n) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10); }
  function hora12(h) { if (!h) return ''; var x = Number(h.slice(0, 2)), m = h.slice(3, 5); return (x % 12 || 12) + ':' + m + (x < 12 ? ' a. m.' : ' p. m.'); }
  function aMin(h) { return Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)); }
  function aHora(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function nombreMes(mes) { var p = mes.split('-'); return MESES[Number(p[1]) - 1] + ' ' + p[0]; }
  function primer(n) { return String(n || '').split(' ')[0]; }
  function wa(cel, texto) { return 'https://wa.me/' + cel + '?text=' + encodeURIComponent(texto); }
  function ico(nombre) {
    var p = { wa: 'M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5z', mas: 'M12 5v14M5 12h14' }[nombre];
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'ico'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    var q = document.createElementNS('http://www.w3.org/2000/svg', 'path'); q.setAttribute('d', p); s.appendChild(q);
    return s;
  }
  function btn(texto, clase, fn, attrs) {
    var b = el('button', Object.assign({ type: 'button', clase: 'g-btn ' + (clase || ''), texto: texto }, attrs || {}));
    if (fn) b.addEventListener('click', fn);
    return b;
  }
  function enlaceWa(cel, texto, etiqueta) {
    var a = el('a', { clase: 'g-btn chico', href: wa(cel, texto), target: '_blank', rel: 'noopener' });
    a.append(ico('wa'), etiqueta || 'WhatsApp');
    return a;
  }
  function vacio(lista, texto) { lista.textContent = ''; lista.appendChild(el('li', { clase: 'vacio', texto: texto })); }
  var ESTADOS = { pendiente: 'Por confirmar', confirmada: 'Confirmada', atendida: 'Atendida', no_vino: 'No vino', cancelada: 'Cancelada', bloqueo: 'Bloqueado' };
  function chipEstado(c) {
    var f = document.createDocumentFragment();
    f.appendChild(el('span', { clase: 'g-estado-chip', 'data-e': c.estado, texto: ESTADOS[c.estado] || c.estado }));
    if (c.origen === 'web' && c.estado === 'pendiente') f.appendChild(el('span', { clase: 'g-estado-chip', 'data-e': 'web', texto: 'Reserva web' }));
    return f;
  }
  var tiempoToast;
  function aviso(texto, mal) {
    var t = $('g-toast'); t.textContent = texto; t.classList.toggle('mal', !!mal); t.hidden = false;
    clearTimeout(tiempoToast); tiempoToast = setTimeout(function () { t.hidden = true; }, 3800);
  }
  async function api(ruta, opciones) {
    var r = await Sellos.api(API + ruta, opciones);
    if (r.status === 401) { verLogin(); }
    return r;
  }
  function kpi(titulo, valor, nota, clase) {
    var d = el('div', { clase: 'g-kpi' + (clase ? ' ' + clase : '') }, [el('p', { clase: 'k-t', texto: titulo }), el('strong', { clase: 'k-v', texto: valor })]);
    if (nota) d.appendChild(typeof nota === 'string' ? el('span', { clase: 'k-n', texto: nota }) : nota);
    return d;
  }
  function variacion(actual, antes, etiqueta, alReves) {
    if (!antes) return el('span', { clase: 'k-n', texto: actual ? 'Sin datos del mes pasado' : '' });
    var p = Math.round((actual - antes) / Math.abs(antes) * 100);
    var bueno = alReves ? p <= 0 : p >= 0;
    return el('span', { clase: 'k-n ' + (p === 0 ? '' : bueno ? 'sube' : 'baja'), texto: (p > 0 ? '▲ ' : p < 0 ? '▼ ' : '') + Math.abs(p) + ' % ' + etiqueta });
  }
  function barras(cont, filas, opciones) {
    opciones = opciones || {};
    cont.textContent = '';
    if (!filas.length) { cont.appendChild(el('p', { clase: 'g-nota', texto: opciones.vacio || 'Sin datos este mes.' })); return; }
    var max = Math.max.apply(null, filas.map(function (f) { return f.total; })) || 1;
    var caja = el('div', { clase: 'g-barras' + (opciones.clase ? ' ' + opciones.clase : '') });
    filas.forEach(function (f) {
      var span = el('span');
      span.style.width = Math.max(2, f.total / max * 100) + '%';
      var v = el('span', { clase: 'b-v', texto: S(f.total) });
      if (f.veces) v.appendChild(el('small', { texto: f.veces + (f.veces === 1 ? ' vez' : ' veces') }));
      caja.appendChild(el('div', { clase: 'b-fila' }, [el('span', { clase: 'b-n', texto: f.n }), v, el('div', { clase: 'b-b', 'aria-hidden': 'true' }, [span])]));
    });
    cont.appendChild(caja);
  }
  function mesActual() { return hoy.slice(0, 7); }

  // ---------- sesión ----------
  function verLogin() {
    raiz.classList.add('g-sin-sesion');
    document.querySelectorAll('.g-vista').forEach(function (v) { v.hidden = true; });
    $('login').hidden = false;
    $('clave').focus();
  }
  $('login-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var r = await Sellos.api('/api/n/' + encodeURIComponent(SLUG) + '/login', { body: { clave: $('clave').value, celular: $('login-celular').value } });
    if (!r.ok) { Sellos.mostrar($('login-error'), r.datos.error || 'No se pudo entrar.'); return; }
    $('clave').value = ''; $('login-error').hidden = true;
    arrancar();
  });
  $('salir').addEventListener('click', async function () { await Sellos.api('/api/salir', { body: {} }); location.hash = ''; location.reload(); });

  async function arrancar() {
    var yo = await Sellos.api('/api/n/' + encodeURIComponent(SLUG) + '/yo');
    if (!yo.ok || !yo.datos.sesion) { verLogin(); return; }
    var r = await api('datos');
    if (r.status === 401) return;
    if (r.status === 403) { raiz.classList.add('g-sin-sesion'); $('login').hidden = true; $('no-activa').hidden = false; return; }
    if (!r.ok) { aviso(r.datos.error || 'No se pudo cargar.', true); return; }
    D = r.datos; hoy = D.hoy;
    raiz.classList.remove('g-sin-sesion');
    $('login').hidden = true;
    document.body.classList.toggle('es-caja', D.rol !== 'dueno');
    $('g-rol').textContent = D.rol === 'dueno' ? 'Entraste como dueño' : D.yo ? 'Entraste como ' + D.yo.nombre + ' · sin finanzas' : 'Entraste como caja · sin finanzas';
    // La agenda solo sale si el negocio la usa (Ajustes).
    document.querySelectorAll('[data-agenda]').forEach(function (a) { a.hidden = !D.ajustes.agenda; });
    prepararDialogos();
    ir();
  }

  // ---------- navegación ----------
  var VISTAS = ['inicio', 'vender', 'agenda', 'caja', 'inventario', 'clientes', 'deudas', 'proveedores', 'gastos', 'finanzas', 'equipo', 'catalogo', 'tarjeta', 'ajustes'];
  var SOLO_DUENO = ['proveedores', 'gastos', 'finanzas', 'equipo', 'catalogo', 'tarjeta', 'ajustes'];
  var NOMBRES = { inicio: 'Inicio', vender: 'Vender', agenda: 'Agenda', caja: 'Caja', inventario: 'Inventario', clientes: 'Clientes', deudas: 'Deudas', proveedores: 'Proveedores', gastos: 'Gastos', finanzas: 'Finanzas', equipo: 'Equipo', catalogo: 'Servicios y productos', tarjeta: 'Tu tarjeta de clientes', ajustes: 'Ajustes' };
  function disponible(v) {
    if (!$('v-' + v) || !CARGAR[v]) return false;
    if (SOLO_DUENO.indexOf(v) >= 0 && D.rol !== 'dueno') return false;
    if (v === 'agenda' && !D.ajustes.agenda) return false;
    return true;
  }
  var CARGAR = {};
  function ir() {
    if (!D) return;
    var v = (location.hash || '#inicio').slice(1).split('?')[0];
    if (VISTAS.indexOf(v) < 0 || !disponible(v)) v = 'inicio';
    VISTAS.forEach(function (x) { if ($('v-' + x)) $('v-' + x).hidden = x !== v; });
    document.querySelectorAll('[data-v]').forEach(function (a) { if (a.getAttribute('data-v') === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    cerrarMenu();
    document.title = NOMBRES[v] + ' · ' + NEGOCIO;
    CARGAR[v]();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', ir);
  function cerrarMenu() { $('g-lado').classList.remove('abierto'); $('g-menu-btn').setAttribute('aria-expanded', 'false'); }
  $('g-menu-btn').addEventListener('click', function () {
    var abierto = $('g-lado').classList.toggle('abierto');
    this.setAttribute('aria-expanded', String(abierto));
    if (abierto) $('g-lado').querySelector('.g-nav-item').focus();
  });
  document.addEventListener('click', function (ev) {
    if ($('g-lado').classList.contains('abierto') && !$('g-lado').contains(ev.target) && !$('g-menu-btn').contains(ev.target)) cerrarMenu();
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') cerrarMenu(); });
  // Botones de acción rápida en cualquier vista.
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-accion]');
    if (!b || !D) return;
    var a = b.getAttribute('data-accion');
    if (a === 'cobrar') { if (MODO === 'comercio') location.hash = '#vender'; else abrirVenta({}); }
    if (a === 'compra' && G.abrirCompra) G.abrirCompra();
    if (a === 'cita') abrirCita({ dia: diaAgenda || hoy });
    if (a === 'gasto') abrirGasto();
  });
  function recargar() { var v = (location.hash || '#inicio').slice(1); if (CARGAR[v]) CARGAR[v](); }

  // ---------- inicio ----------
  CARGAR.inicio = async function () {
    var r = await api('inicio');
    if (!r.ok) return;
    var d = r.datos, h = Number(d.hora.slice(0, 2));
    $('i-fecha').textContent = fechaLarga(d.hoy);
    $('i-saludo').textContent = (h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches');
    pintarPasos(d.pasos);
    if (MODO === 'comercio' && G.inicioComercio) { G.inicioComercio(d); return; }
    var pendientesHoy = d.citas.filter(function (c) { return c.estado === 'pendiente' || c.estado === 'confirmada'; }).length;
    $('i-resumen').textContent = d.citas.length
      ? d.citas.length + (d.citas.length === 1 ? ' cita hoy' : ' citas hoy') + (pendientesHoy ? ' · ' + pendientesHoy + ' por atender' : ' · todas atendidas')
      : 'No hay citas para hoy.';
    var k = $('i-kpis'); k.textContent = '';
    k.append(
      kpi('Vendido hoy', S(d.dia.vendido), d.dia.ventas + (d.dia.ventas === 1 ? ' venta' : ' ventas'), 'principal'),
      kpi('Efectivo en caja', S(d.dia.efectivo), 'Ventas en efectivo menos gastos en efectivo'),
      kpi('Gastos de hoy', S(d.dia.gastado)),
      d.mes ? kpi('Ganancia del mes', S(d.mes.ganancia), variacion(d.mes.ganancia, d.mes.anterior.ganancia, 'vs. el mes pasado a la fecha'))
        : kpi('Citas de hoy', String(d.citas.length), pendientesHoy + ' por atender')
    );
    // Citas de hoy
    var l = $('i-citas'); l.textContent = '';
    if (!d.citas.length) vacio(l, 'Sin citas hoy. Toca «Nueva cita» para agendar.');
    d.citas.forEach(function (c) { l.appendChild(filaCita(c, true)); });
    // Este mes (dueño)
    $('i-mes').hidden = !d.mes;
    if (d.mes) {
      var m = $('i-mes-datos'); m.textContent = '';
      [['Ingresos', S(d.mes.ingresos)], ['Gastos', S(d.mes.gastos)], ['Ganancia', S(d.mes.ganancia), d.mes.ganancia < 0]].forEach(function (f) {
        m.appendChild(el('div', { clase: 'g-mes-fila' }, [el('span', { texto: f[0] }), el('strong', { clase: f[2] ? 'neg' : '', texto: f[1] })]));
      });
      if (d.mes.meta) {
        var pct = Math.round(d.mes.ingresos / d.mes.meta * 100), esperado = Math.round(d.mes.diaMes / d.mes.diasMes * 100);
        var barra = el('span'); barra.style.width = Math.min(100, pct) + '%';
        m.append(el('p', { clase: 'g-nota', texto: 'Meta del mes: ' + S(d.mes.meta) + ' · vas en ' + pct + ' %' + (pct >= esperado ? ', vas bien.' : ' (a esta fecha deberías ir en ' + esperado + ' %).') }),
          el('div', { clase: 'g-avance', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.min(100, pct)), 'aria-label': 'Avance de la meta' }, [barra]));
      }
    }
    // Pendientes
    var a = $('i-avisos'); a.textContent = '';
    d.porConfirmar.forEach(function (c) {
      var li = el('li', {}, [
        el('div', { clase: 'l-hora' }, [document.createTextNode(c.dia === d.hoy ? 'Hoy' : fechaCorta(c.dia)), el('small', { texto: hora12(c.hora) })]),
        el('div', { clase: 'l-quien' }, [el('strong', { texto: c.nombre }), el('span', { texto: c.servicio + (c.personal ? ' · ' + c.personal : '') + (c.origen === 'web' ? ' · reservó en línea' : '') })]),
      ]);
      var fin = el('div', { clase: 'l-fin' });
      if (c.celularWa) fin.appendChild(enlaceWa(c.celularWa, mensajeConfirmar(c), 'Pedir confirmación'));
      fin.appendChild(btn('Ya confirmó', 'chico', async function () { await cambiarEstado(c, 'confirmada'); }));
      li.appendChild(fin); a.appendChild(li);
    });
    var conCel = d.manana.filter(function (c) { return c.celularWa; });
    if (conCel.length) {
      var li = el('li', {}, [el('div', { clase: 'l-quien' }, [el('strong', { texto: 'Recordar las citas de mañana' }), el('span', { texto: conCel.length + (conCel.length === 1 ? ' cliente' : ' clientes') + ': ' + conCel.map(function (c) { return primer(c.nombre); }).join(', ') })])]);
      var fin = el('div', { clase: 'l-fin' });
      conCel.slice(0, 6).forEach(function (c) { fin.appendChild(enlaceWa(c.celularWa, mensajeRecordar(c), primer(c.nombre))); });
      li.appendChild(fin); a.appendChild(li);
    }
    d.cumpleanos.forEach(function (c) {
      a.appendChild(el('li', {}, [el('div', { clase: 'l-quien' }, [el('strong', { texto: '🎂 Hoy cumple años ' + c.nombre }), el('span', { texto: 'Salúdalo: un detalle hoy lo hace volver.' })]),
        el('div', { clase: 'l-fin' }, [enlaceWa(c.celularWa, '¡Feliz cumpleaños, ' + primer(c.nombre) + '! 🎉 Todo el equipo de ' + NEGOCIO + ' te desea un gran día.', 'Saludar')])]));
    });
    d.stockBajo.forEach(function (p) {
      a.appendChild(el('li', {}, [el('div', { clase: 'l-quien' }, [el('strong', { texto: 'Queda poco: ' + p.n }), el('span', { texto: 'Stock: ' + p.s + (p.m ? ' (avisas con ' + p.m + ')' : '') })]),
        D.rol === 'dueno' ? el('div', { clase: 'l-fin' }, [el('a', { clase: 'g-btn chico', href: '#catalogo', texto: 'Actualizar stock' })]) : null]));
    });
    if (!a.children.length) vacio(a, 'Todo al día. Aquí verás las reservas por confirmar, los recordatorios de mañana, los cumpleaños y los productos por acabarse.');
  };
  /** «Primeros pasos» de un negocio nuevo: qué le falta configurar. */
  function pintarPasos(pasos) {
    $('i-pasos').hidden = !pasos;
    if (!pasos) return;
    var l = $('i-pasos-lista'); l.textContent = '';
    var hechos = pasos.filter(function (p) { return p.hecho; }).length;
    $('i-pasos-n').textContent = hechos + ' de ' + pasos.length + ' listos';
    pasos.forEach(function (p) {
      l.appendChild(el('li', { clase: p.hecho ? 'hecho' : '' }, [el('a', { href: '#' + p.ir }, [el('span', { clase: 'p-marca', 'aria-hidden': 'true', texto: p.hecho ? '✓' : '' }), el('span', { texto: p.t + (p.hecho ? ' (listo)' : '') })])]));
    });
  }
  function mensajeConfirmar(c) {
    return 'Hola ' + primer(c.nombre) + ', te escribimos de ' + NEGOCIO + '. Tienes una cita el ' + fechaLarga(c.dia) + ' a las ' + hora12(c.hora) + ' para ' + c.servicio + (c.personal ? ' con ' + c.personal : '') + '. ¿Nos confirmas? 😊';
  }
  function mensajeRecordar(c) {
    return 'Hola ' + primer(c.nombre) + ', te recordamos tu cita de mañana a las ' + hora12(c.hora) + ' en ' + NEGOCIO + ' (' + c.servicio + '). ¡Te esperamos!';
  }
  function filaCita(c, conAcciones) {
    var li = el('li', {}, [
      el('div', { clase: 'l-hora' }, [document.createTextNode(hora12(c.hora).replace(/ (a|p)\. m\./, '')), el('small', { texto: hora12(c.hora).slice(-5) })]),
      el('div', { clase: 'l-quien' }, [el('strong', { texto: c.nombre }), el('span', { texto: (c.servicio || '') + (c.personal ? ' · ' + c.personal : '') })]),
    ]);
    var fin = el('div', { clase: 'l-fin' }); fin.appendChild(chipEstado(c));
    if (conAcciones && (c.estado === 'pendiente' || c.estado === 'confirmada')) fin.appendChild(btn('Cobrar', 'chico', function () { cobrarCita(c); }));
    fin.appendChild(btn('Ver', 'chico', function () { verCita(c); }, { 'aria-label': 'Ver la cita de ' + c.nombre }));
    li.appendChild(fin);
    return li;
  }

  // ---------- agenda ----------
  var diaAgenda = '', modoAgenda = 'dia', PX = 72 / 60; // 72 px por hora
  CARGAR.agenda = function () { if (!diaAgenda) diaAgenda = hoy; pintarAgenda(); };
  async function pintarAgenda() {
    $('a-fecha').value = diaAgenda;
    var semana = modoAgenda === 'semana';
    var desde = semana ? sumarDias(diaAgenda, -((diaSemana(diaAgenda) + 6) % 7)) : diaAgenda;
    var r = await api('citas?desde=' + desde + '&dias=' + (semana ? 7 : 1));
    if (!r.ok) return;
    var citas = r.datos.citas;
    $('a-titulo').textContent = semana ? 'Semana del ' + fechaCorta(desde) + ' al ' + fechaCorta(sumarDias(desde, 6)) : (diaAgenda === hoy ? 'Hoy, ' : '') + fechaLarga(diaAgenda);
    $('a-dia').hidden = semana; $('a-semana').hidden = !semana;
    var res = $('a-reservas');
    res.hidden = !(D.ajustes.reservas && D.rol === 'dueno');
    if (!res.hidden) { res.textContent = ''; res.append('Reservas en línea activas. Comparte tu enlace: ', el('a', { href: '/' + SLUG + '/reservar', target: '_blank', rel: 'noopener', texto: location.host + '/' + SLUG + '/reservar' })); }
    if (semana) { pintarSemana(desde, citas); return; }
    pintarDia(citas, r.datos.horario[diaSemana(diaAgenda)], r.datos.intervalo);
  }
  function columnasAgenda() {
    var eq = D.equipo.filter(function (p) { return p.activo && p.agenda; });
    return eq.length ? eq : [{ id: null, nombre: 'Agenda', color: '#2A4BD7' }];
  }
  function pintarDia(citas, horario, intervalo) {
    var cont = $('a-rejilla'); cont.textContent = '';
    var cols = columnasAgenda();
    var abre = horario ? aMin(horario[0]) : 9 * 60, cierra = horario ? aMin(horario[1]) : 20 * 60;
    citas.forEach(function (c) { abre = Math.min(abre, aMin(c.hora)); cierra = Math.max(cierra, aMin(c.hora) + c.dur); });
    abre = Math.floor(abre / 60) * 60; cierra = Math.ceil(cierra / 60) * 60;
    cont.style.setProperty('--cols', cols.length);
    var cab = el('div', { clase: 'ag-cab' }, [el('div')]);
    cols.forEach(function (p) {
      var punto = el('span', { clase: 'g-punto' }); punto.style.background = p.color;
      var n = citas.filter(function (c) { return c.personalId === p.id && c.estado !== 'cancelada' && c.estado !== 'bloqueo'; }).length;
      cab.appendChild(el('div', {}, [punto, document.createTextNode(p.nombre), el('small', { texto: n ? n + (n === 1 ? ' cita' : ' citas') : '' })]));
    });
    cont.appendChild(cab);
    var alto = (cierra - abre) * PX;
    var cuerpo = el('div', { clase: 'ag-cuerpo' });
    var horas = el('div', { clase: 'ag-horas', 'aria-hidden': 'true' }); horas.style.height = alto + 'px';
    for (var t = abre; t <= cierra; t += 60) { var s = el('span', { texto: hora12(aHora(t)).replace(':00', '') }); s.style.top = (t - abre) * PX + 'px'; if (t > abre && t < cierra) horas.appendChild(s); }
    cuerpo.appendChild(horas);
    cols.forEach(function (p) {
      var col = el('div', { clase: 'ag-col' + (horario ? '' : ' cerrado'), 'data-personal': p.id === null ? '' : String(p.id), title: 'Toca un espacio libre para agendar' });
      col.style.height = alto + 'px';
      col.addEventListener('click', function (ev) {
        if (ev.target !== col) return;
        var y = ev.clientY - col.getBoundingClientRect().top;
        var m = abre + Math.floor(y / PX / intervalo) * intervalo;
        abrirCita({ dia: diaAgenda, hora: aHora(m), personalId: p.id });
      });
      citas.filter(function (c) { return p.id === null || c.personalId === p.id || (c.personalId === null && c.estado === 'bloqueo'); }).forEach(function (c) {
        var b = el('button', { type: 'button', clase: 'ag-cita', 'data-e': c.estado, 'aria-label': hora12(c.hora) + ', ' + c.nombre + ', ' + (c.servicio || '') + ', ' + (ESTADOS[c.estado] || '') }, [
          el('strong', { texto: c.estado === 'bloqueo' ? '⛔ ' + c.nombre : c.nombre }),
          el('span', { texto: hora12(c.hora) + ' – ' + hora12(c.fin) + (c.servicio ? ' · ' + c.servicio : '') }),
        ]);
        b.style.top = (aMin(c.hora) - abre) * PX + 'px';
        b.style.height = Math.max(22, c.dur * PX - 2) + 'px';
        var color = (D.equipo.find(function (x) { return x.id === c.personalId; }) || {}).color;
        if (color && c.estado !== 'bloqueo') b.style.borderLeftColor = color;
        b.addEventListener('click', function () { verCita(c); });
        col.appendChild(b);
      });
      if (diaAgenda === hoy && D.hora) {
        var ahora = aMin(horaActual());
        if (ahora >= abre && ahora <= cierra) { var linea = el('div', { clase: 'ag-ahora', 'aria-hidden': 'true' }); linea.style.top = (ahora - abre) * PX + 'px'; col.appendChild(linea); }
      }
      cuerpo.appendChild(col);
    });
    cont.appendChild(cuerpo);
    if (!horario) cont.appendChild(el('p', { clase: 'ag-vacio', texto: 'Este día el local figura cerrado (Ajustes → Horario). Igual puedes agendar si abres.' }));
  }
  function horaActual() { var d = new Date(Date.now() - 5 * 3600000).toISOString(); return d.slice(11, 16); }
  function pintarSemana(desde, citas) {
    var cont = $('a-semana'); cont.textContent = '';
    for (var i = 0; i < 7; i++) {
      var d = sumarDias(desde, i);
      var suyas = citas.filter(function (c) { return c.dia === d && c.estado !== 'cancelada'; });
      var lista = el('ul', { clase: 'g-lista' });
      if (!suyas.length) vacio(lista, D.ajustes.horario[diaSemana(d)] ? 'Sin citas.' : 'Cerrado.');
      suyas.forEach(function (c) { lista.appendChild(filaCita(c, false)); });
      var ver = btn('Ver día', 'chico', (function (dd) { return function () { diaAgenda = dd; modo('dia'); }; })(d));
      cont.appendChild(el('section', { clase: 'g-card' }, [el('div', { clase: 'g-card-cab' }, [el('h3', { texto: (d === hoy ? 'Hoy, ' : '') + fechaLarga(d) }), ver]), lista]));
    }
  }
  function modo(m) {
    modoAgenda = m;
    document.querySelectorAll('[data-modo]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-modo') === m)); });
    pintarAgenda();
  }
  document.querySelectorAll('[data-modo]').forEach(function (b) { b.addEventListener('click', function () { modo(b.getAttribute('data-modo')); }); });
  $('a-prev').addEventListener('click', function () { diaAgenda = sumarDias(diaAgenda, modoAgenda === 'semana' ? -7 : -1); pintarAgenda(); });
  $('a-next').addEventListener('click', function () { diaAgenda = sumarDias(diaAgenda, modoAgenda === 'semana' ? 7 : 1); pintarAgenda(); });
  $('a-hoy').addEventListener('click', function () { diaAgenda = hoy; pintarAgenda(); });
  $('a-fecha').addEventListener('change', function () { if (this.value) { diaAgenda = this.value; pintarAgenda(); } });
  $('a-bloquear').addEventListener('click', function () { abrirCita({ dia: diaAgenda || hoy, bloqueo: true }); });

  // ---------- selector de cliente (venta y cita) ----------
  function selectorCliente(cont) {
    var estado = { elegido: null };
    cont.textContent = '';
    var buscar = el('input', { type: 'search', placeholder: 'Buscar por nombre o celular… (o escribe uno nuevo)', autocomplete: 'off', 'aria-label': 'Cliente' });
    var resultados = el('ul', { clase: 'c-resultados', hidden: '' });
    var elegido = el('div', { clase: 'c-elegido', hidden: '' });
    var nuevo = el('div', { clase: 'c-nuevo', hidden: '' });
    var nNombre = el('input', { maxlength: '60', placeholder: 'Nombre y apellido', 'aria-label': 'Nombre del cliente nuevo', autocomplete: 'off' });
    var nCel = el('input', { type: 'tel', inputmode: 'numeric', maxlength: '11', placeholder: 'Celular (opcional)', 'aria-label': 'Celular del cliente nuevo', autocomplete: 'off' });
    var nTarjeta = el('input', { type: 'checkbox' }); nTarjeta.checked = true;
    var lTarjeta = el('label', { clase: 'g-interruptor' }, [nTarjeta, document.createTextNode(' Crear su tarjeta de cliente frecuente (con su celular)')]);
    nuevo.append(nNombre, nCel, lTarjeta);
    cont.append(buscar, resultados, elegido, nuevo);
    var espera;
    buscar.addEventListener('input', function () {
      clearTimeout(espera);
      var q = buscar.value.trim();
      if (q.length < 2) { resultados.hidden = true; return; }
      espera = setTimeout(async function () {
        var r = await api('clientes?q=' + encodeURIComponent(q));
        if (!r.ok || buscar.value.trim() !== q) return;
        resultados.textContent = '';
        r.datos.clientes.slice(0, 8).forEach(function (c) {
          var b = el('button', { type: 'button' }, [document.createTextNode(c.nombre), el('small', { texto: c.celular })]);
          b.addEventListener('click', function () { elegir(c); });
          resultados.appendChild(el('li', {}, [b]));
        });
        var esNum = /^[\d\s+]+$/.test(q);
        var b = el('button', { type: 'button' }, [document.createTextNode('+ Cliente nuevo: «' + q + '»')]);
        b.addEventListener('click', function () { nuevoCliente(esNum ? '' : q, esNum ? q : ''); });
        resultados.appendChild(el('li', {}, [b]));
        resultados.hidden = false;
      }, 220);
    });
    function elegir(c) {
      estado.elegido = c; resultados.hidden = true; buscar.hidden = true; nuevo.hidden = true;
      elegido.textContent = '';
      var info = el('div', {}, [el('strong', { texto: c.nombre }), el('span', { texto: [c.celular, c.notas ? '📝 ' + c.notas.split('\n')[0].slice(0, 60) : ''].filter(Boolean).join(' · ') })]);
      elegido.append(info, btn('Cambiar', 'chico', limpiar));
      elegido.hidden = false;
      if (cont.onCambio) cont.onCambio();
    }
    function nuevoCliente(nombre, cel) {
      estado.elegido = null; resultados.hidden = true; buscar.hidden = true; elegido.hidden = true;
      nNombre.value = nombre || ''; nCel.value = cel || ''; nuevo.hidden = false;
      var quitar = cont.querySelector('.c-quitar') || btn('Buscar otro', 'chico c-quitar', limpiar);
      nuevo.appendChild(quitar);
      (nombre ? nCel : nNombre).focus();
      if (cont.onCambio) cont.onCambio();
    }
    function limpiar() {
      estado.elegido = null; buscar.value = ''; buscar.hidden = false; elegido.hidden = true; nuevo.hidden = true; resultados.hidden = true;
      buscar.focus();
      if (cont.onCambio) cont.onCambio();
    }
    nTarjeta.addEventListener('change', function () { if (cont.onCambio) cont.onCambio(); });
    nCel.addEventListener('input', function () { if (cont.onCambio) cont.onCambio(); });
    return {
      elegir: elegir, limpiar: limpiar, nuevo: nuevoCliente,
      tieneTarjeta: function () { return !!estado.elegido || (!nuevo.hidden && nTarjeta.checked && nCel.value.replace(/\D/g, '').length >= 9); },
      elegido: function () { return estado.elegido; },
      valor: function () {
        if (estado.elegido) return { cliente_id: estado.elegido.id };
        if (!nuevo.hidden) return { nombre: nNombre.value, celular: nCel.value, tarjeta: nTarjeta.checked };
        var q = buscar.value.trim();
        return q ? { nombre: q } : {};
      },
    };
  }

  // ---------- diálogos ----------
  function dialogo(id) {
    var d = $(id);
    return {
      d: d, f: d.querySelector('form'), error: d.querySelector('.g-error'),
      abrir: function () { this.error.hidden = true; d.showModal(); },
      cerrar: function () { d.close(); },
      mal: function (t) { Sellos.mostrar(this.error, t); },
    };
  }
  var dVenta, dCita, dVerCita, dGasto, dPersona, dCliente, selVenta, selCita;
  function opcionesEquipo(sel, conVacio, textoVacio, soloAgenda) {
    sel.textContent = '';
    if (conVacio) sel.appendChild(el('option', { value: '', texto: textoVacio }));
    D.equipo.filter(function (p) { return p.activo && (!soloAgenda || p.agenda); }).forEach(function (p) { sel.appendChild(el('option', { value: String(p.id), texto: p.nombre + (p.cargo ? ' · ' + p.cargo : '') })); });
  }
  function segmento(cont, opciones, alElegir) {
    cont.textContent = '';
    opciones.forEach(function (o, i) {
      var b = el('button', { type: 'button', 'aria-pressed': i === 0 ? 'true' : 'false', 'data-valor': o, texto: o });
      b.addEventListener('click', function () { marcar(o); if (alElegir) alElegir(o); });
      cont.appendChild(b);
    });
    function marcar(v) { cont.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-valor') === v)); }); }
    return { marcar: marcar, valor: function () { var b = cont.querySelector('[aria-pressed=true]'); return b ? b.getAttribute('data-valor') : opciones[0]; } };
  }
  var segVenta, segGasto;
  function prepararDialogos() {
    if (dVenta) { refrescarListas(); return; }
    dVenta = dialogo('d-venta'); dCita = dialogo('d-cita'); dVerCita = dialogo('d-ver-cita'); dGasto = dialogo('d-gasto'); dPersona = dialogo('d-persona'); dCliente = dialogo('d-cliente');
    selVenta = selectorCliente(document.querySelector('[data-selector=v-cli]'));
    selCita = selectorCliente(document.querySelector('[data-selector=ci-cli]'));
    document.querySelector('[data-selector=v-cli]').onCambio = pintarVenta;
    refrescarListas();
    dVenta.f.addEventListener('submit', enviarVenta);
    dCita.f.addEventListener('submit', enviarCita);
    dGasto.f.addEventListener('submit', enviarGasto);
    dPersona.f.addEventListener('submit', enviarPersona);
    dCliente.f.addEventListener('submit', enviarCliente);
    $('v-otro').addEventListener('click', function () { venta.items.push({ n: '', t: 's', p: 0, c: 1, libre: true }); pintarVenta(true); });
    $('v-descuento').addEventListener('input', pintarVenta);
    $('ci-servicio').addEventListener('change', function () {
      var s = D.servicios.find(function (x) { return x.n === $('ci-servicio').value; });
      if (s) { $('ci-dur').value = s.d || D.ajustes.intervalo; $('ci-precio').value = s.p ? s.p / 100 : ''; }
    });
  }
  function refrescarListas() {
    segVenta = segmento($('v-metodos'), D.metodos);
    segGasto = segmento($('ga-metodos'), D.todosMetodos);
    var dl = $('ci-servicios'); dl.textContent = '';
    D.servicios.forEach(function (s) { dl.appendChild(el('option', { value: s.n })); });
    var cat = $('ga-categoria'); cat.textContent = '';
    D.categorias.forEach(function (c) { cat.appendChild(el('option', { value: c, texto: c })); });
  }

  // ----- venta -----
  var venta = null;
  function abrirVenta(o) {
    venta = { items: [], cita: o.cita || null };
    selVenta.limpiar();
    if (o.cliente) selVenta.elegir(o.cliente);
    else if (o.cita && o.cita.clienteId) selVenta.elegir({ id: o.cita.clienteId, nombre: o.cita.nombre, celular: o.cita.celular });
    else if (o.cita) selVenta.nuevo(o.cita.nombre, o.cita.celular);
    if (o.cita && o.cita.servicio) {
      var s = D.servicios.find(function (x) { return x.n === o.cita.servicio; });
      venta.items.push({ n: o.cita.servicio, t: 's', p: o.cita.precio || (s ? s.p : 0), c: 1, libre: !s });
    }
    opcionesEquipo($('v-personal'), true, D.equipo.length ? 'Elige quién atendió' : 'Sin equipo cargado');
    $('v-personal').value = o.cita && o.cita.personalId ? String(o.cita.personalId) : '';
    $('v-descuento').value = '';
    segVenta.marcar(D.metodos[0]);
    $('v-sello').checked = true;
    $('v-dia-caja').hidden = D.rol !== 'dueno';
    $('v-dia').value = hoy; $('v-dia').max = hoy;
    $('d-venta-t').textContent = o.cita ? 'Cobrar cita de ' + primer(o.cita.nombre) : 'Nueva venta';
    pintarCatalogoVenta();
    pintarVenta();
    dVenta.abrir();
  }
  function cobrarCita(c) { if (dVerCita.d.open) dVerCita.cerrar(); abrirVenta({ cita: c }); }
  function pintarCatalogoVenta() {
    var cont = $('v-chips'); cont.textContent = '';
    function grupo(titulo, lista, t) {
      if (!lista.length) return;
      cont.appendChild(el('span', { clase: 'g-grupo', texto: titulo }));
      lista.forEach(function (x) {
        var b = el('button', { type: 'button', clase: 'g-chip', 'data-n': x.n, 'data-t': t }, [document.createTextNode(x.n), el('small', { texto: S(x.p) })]);
        b.addEventListener('click', function () {
          var it = venta.items.find(function (y) { return y.n === x.n && y.t === t; });
          if (it) it.c = Math.min(99, it.c + 1); else venta.items.push({ n: x.n, t: t, p: x.p, c: 1 });
          pintarVenta();
        });
        cont.appendChild(b);
      });
    }
    grupo('Servicios', D.servicios, 's');
    grupo('Productos', D.productos, 'p');
    if (!D.servicios.length && !D.productos.length) cont.appendChild(el('p', { clase: 'g-nota', texto: D.rol === 'dueno' ? 'Carga tus servicios y precios en «Servicios y productos» para cobrar con un toque. Mientras, usa «Otro concepto».' : 'Aún no hay servicios cargados. Usa «Otro concepto».' }));
  }
  function totalVenta() {
    var sub = venta.items.reduce(function (t, x) { return t + (x.p || 0) * x.c; }, 0);
    var desc = aCentimos($('v-descuento').value);
    return { sub: sub, desc: isNaN(desc) ? 0 : desc, total: Math.max(0, sub - (isNaN(desc) ? 0 : desc)) };
  }
  function pintarVenta(enfocarUltimo) {
    var ul = $('v-items'); ul.textContent = '';
    venta.items.forEach(function (x, i) {
      var nombre = x.libre ? el('input', { value: x.n, maxlength: '60', placeholder: 'Concepto', 'aria-label': 'Concepto' }) : document.createTextNode(x.n + (x.t === 'p' ? ' (producto)' : ''));
      if (x.libre) nombre.addEventListener('input', function () { x.n = nombre.value; });
      var precio = el('input', { inputmode: 'decimal', maxlength: '9', value: x.p ? String(x.p / 100) : '', 'aria-label': 'Precio de ' + (x.n || 'concepto'), placeholder: '0.00' });
      precio.addEventListener('input', function () { var c = aCentimos(precio.value); x.p = isNaN(c) ? 0 : c; $('v-total').textContent = S(totalVenta().total); });
      var cant = el('span', { texto: String(x.c) });
      var menos = el('button', { type: 'button', 'aria-label': 'Quitar uno', texto: '−' }), mas = el('button', { type: 'button', 'aria-label': 'Agregar uno', texto: '+' });
      menos.addEventListener('click', function () { if (x.c > 1) { x.c--; pintarVenta(); } });
      mas.addEventListener('click', function () { if (x.c < 99) { x.c++; pintarVenta(); } });
      var quitar = el('button', { type: 'button', clase: 'g-quitar', 'aria-label': 'Quitar ' + (x.n || 'concepto'), texto: '×' });
      quitar.addEventListener('click', function () { venta.items.splice(i, 1); pintarVenta(); });
      ul.appendChild(el('li', {}, [el('div', { clase: 'i-n' }, [nombre]), el('div', { clase: 'g-cant' }, [menos, cant, mas]), precio, quitar]));
      if (enfocarUltimo === true && i === venta.items.length - 1 && x.libre) setTimeout(function () { nombre.focus(); }, 0);
    });
    $('v-chips').querySelectorAll('.g-chip').forEach(function (b) {
      b.classList.toggle('g-puesto', venta.items.some(function (y) { return y.n === b.getAttribute('data-n') && y.t === b.getAttribute('data-t'); }));
    });
    var t = totalVenta();
    $('v-total').textContent = S(t.total);
    $('v-cobrar').textContent = t.total ? 'Cobrar ' + S(t.total) : 'Cobrar';
    var conTarjeta = selVenta.tieneTarjeta();
    $('v-sello-caja').hidden = !conTarjeta;
    $('v-sello-t').textContent = D.negocio.tipo === 'puntos' ? 'Sumar sus puntos a la tarjeta' : D.negocio.tipo === 'cashback' ? 'Sumar su saldo a la tarjeta' : 'Sumar el sello a su tarjeta';
  }
  async function enviarVenta(ev) {
    if (ev.submitter && ev.submitter.value === 'cancelar') return;
    ev.preventDefault();
    var t = totalVenta();
    if (isNaN(aCentimos($('v-descuento').value))) return dVenta.mal('Revisa el descuento: solo números.');
    var items = venta.items.filter(function (x) { return String(x.n).trim(); }).map(function (x) { return { n: x.n, t: x.t, p: (x.p || 0) / 100, c: x.c }; });
    if (!items.length) return dVenta.mal('Agrega al menos un servicio o producto.');
    if (D.equipo.some(function (p) { return p.activo; }) && !$('v-personal').value) return dVenta.mal('Elige quién atendió (para su comisión).');
    var datos = Object.assign({ items: items, descuento: t.desc / 100, metodo: segVenta.valor(), personal_id: $('v-personal').value || null, sello: $('v-sello').checked }, selVenta.valor());
    if (venta.cita) datos.cita_id = venta.cita.id;
    if (D.rol === 'dueno' && $('v-dia').value && $('v-dia').value !== hoy) datos.dia = $('v-dia').value;
    $('v-cobrar').disabled = true;
    var r = await api('ventas', { body: datos });
    $('v-cobrar').disabled = false;
    if (!r.ok) return dVenta.mal(r.datos.error || 'No se pudo registrar la venta.');
    dVenta.cerrar();
    var msg = 'Venta registrada: ' + S(r.datos.total) + '.';
    if (r.datos.tarjeta) msg += r.datos.tarjeta.aviso ? ' (La tarjeta no sumó: ' + r.datos.tarjeta.aviso + ')' : ' Tarjeta: ' + (r.datos.tarjeta.cliente.sellos !== undefined && D.negocio.tipo === 'sellos' ? r.datos.tarjeta.cliente.sellos + ' de ' + r.datos.tarjeta.cliente.meta + ' sellos.' : 'actualizada.');
    aviso(msg);
    recargar();
  }

  // ----- citas -----
  var citaEditando = null, bloqueoActual = false;
  function abrirCita(o) {
    citaEditando = o.editar || null;
    bloqueoActual = !!(o.bloqueo || (o.editar && o.editar.estado === 'bloqueo'));
    dCita.d.querySelectorAll('[data-solo-cita]').forEach(function (x) { x.hidden = bloqueoActual; });
    dCita.d.querySelectorAll('[data-solo-bloqueo]').forEach(function (x) { x.hidden = !bloqueoActual; });
    $('d-cita-t').textContent = bloqueoActual ? (citaEditando ? 'Editar horario bloqueado' : 'Bloquear horario') : citaEditando ? 'Editar cita' : 'Nueva cita';
    var conAgenda = D.equipo.some(function (p) { return p.activo && p.agenda; });
    opcionesEquipo($('ci-personal'), bloqueoActual || !conAgenda, bloqueoActual ? 'Todo el local' : 'Sin equipo cargado', true);
    $('ci-personal').closest('.g-campo').hidden = !conAgenda && !bloqueoActual;
    var c = citaEditando || {};
    selCita.limpiar();
    if (c.clienteId) selCita.elegir({ id: c.clienteId, nombre: c.nombre, celular: c.celular });
    else if (c.nombre && !bloqueoActual) selCita.nuevo(c.nombre, c.celular);
    if (o.cliente) selCita.elegir(o.cliente);
    $('ci-servicio').value = c.servicio || '';
    $('ci-motivo').value = bloqueoActual ? (c.nombre || '') : '';
    $('ci-personal').value = c.personalId ? String(c.personalId) : o.personalId ? String(o.personalId) : (bloqueoActual ? '' : $('ci-personal').value);
    $('ci-dia').value = c.dia || o.dia || hoy;
    $('ci-hora').value = c.hora || o.hora || '';
    $('ci-dur').value = c.dur || (bloqueoActual ? 60 : D.ajustes.intervalo);
    $('ci-precio').value = c.precio ? c.precio / 100 : '';
    $('ci-nota').value = c.nota || '';
    $('ci-confirmada').checked = c.estado === 'confirmada';
    $('ci-confirmada').closest('label').hidden = !!citaEditando;
    dCita.abrir();
  }
  async function enviarCita(ev, forzar) {
    if (ev && ev.submitter && ev.submitter.value === 'cancelar') return;
    if (ev) ev.preventDefault();
    var datos = {
      dia: $('ci-dia').value, hora: $('ci-hora').value, dur: Number($('ci-dur').value), personal_id: $('ci-personal').value || null,
      servicio: $('ci-servicio').value, precio: $('ci-precio').value, nota: $('ci-nota').value, confirmada: $('ci-confirmada').checked, forzar: !!forzar,
    };
    if (bloqueoActual) { datos.bloqueo = true; datos.nombre = $('ci-motivo').value; }
    else Object.assign(datos, selCita.valor());
    if (!datos.hora) return dCita.mal('Elige la hora.');
    var r = await api('citas' + (citaEditando ? '/' + citaEditando.id : ''), { body: datos });
    if (r.status === 409 && r.datos.choque) {
      if (confirm(r.datos.error + '\n\n¿Agendar de todas formas?')) return enviarCita(null, true);
      return dCita.mal(r.datos.error);
    }
    if (!r.ok) return dCita.mal(r.datos.error || 'No se pudo guardar.');
    dCita.cerrar();
    aviso(bloqueoActual ? 'Horario bloqueado.' : citaEditando ? 'Cita actualizada.' : 'Cita agendada para el ' + fechaLarga(datos.dia) + ' a las ' + hora12(datos.hora));
    if ((location.hash || '#inicio') === '#agenda') { diaAgenda = datos.dia; }
    recargar();
  }
  function verCita(c) {
    var cuerpo = $('vc-cuerpo'); cuerpo.textContent = '';
    $('d-ver-cita-t').textContent = c.estado === 'bloqueo' ? 'Horario bloqueado' : c.nombre;
    var dl = el('dl');
    function fila(t, v) { if (v) dl.append(el('dt', { texto: t }), el('dd', { texto: v })); }
    fila('Cuándo', fechaLarga(c.dia) + ', ' + hora12(c.hora) + ' – ' + hora12(c.fin));
    if (c.estado !== 'bloqueo') { fila('Servicio', c.servicio + (c.precio ? ' · ' + S(c.precio) : '')); fila('Celular', c.celular); }
    fila('Con', c.personal || (c.estado === 'bloqueo' ? 'Todo el local' : ''));
    fila('Nota', c.nota);
    fila('Reservó', c.origen === 'web' ? 'En línea, desde tu enlace de reservas' : '');
    var est = el('dd'); est.appendChild(chipEstado(c));
    dl.append(el('dt', { texto: 'Estado' }), est);
    cuerpo.appendChild(dl);
    var acc = $('vc-acciones'); acc.textContent = '';
    var activa = c.estado === 'pendiente' || c.estado === 'confirmada';
    if (c.estado === 'bloqueo') {
      acc.append(btn('Quitar bloqueo', 'peligro', function () { cambiarEstado(c, 'borrar'); }), btn('Editar', '', function () { dVerCita.cerrar(); abrirCita({ editar: c }); }));
    } else {
      if (activa && c.celularWa) acc.appendChild(enlaceWa(c.celularWa, c.estado === 'pendiente' ? mensajeConfirmar(c) : mensajeRecordar(c), c.estado === 'pendiente' ? 'Pedir confirmación' : 'Recordar'));
      if (c.estado === 'pendiente') acc.appendChild(btn('Marcar confirmada', '', function () { cambiarEstado(c, 'confirmada'); }));
      if (activa) acc.append(btn('No vino', '', function () { cambiarEstado(c, 'no_vino'); }), btn('Cancelar cita', 'peligro', function () { if (confirm('¿Cancelar la cita de ' + c.nombre + '?')) cambiarEstado(c, 'cancelada'); }));
      if (c.estado === 'no_vino' || c.estado === 'cancelada') acc.append(btn('Volver a agendar', '', function () { cambiarEstado(c, 'confirmada'); }), btn('Borrar', 'peligro', function () { if (confirm('¿Borrar esta cita?')) cambiarEstado(c, 'borrar'); }));
      if (!c.ventaId) acc.appendChild(btn('Editar', '', function () { dVerCita.cerrar(); abrirCita({ editar: c }); }));
      if (activa) acc.appendChild(btn('Cobrar', 'primario', function () { cobrarCita(c); }));
      if (c.ventaId) acc.appendChild(el('span', { clase: 'g-nota', texto: 'Ya cobrada.' }));
    }
    dVerCita.abrir();
  }
  async function cambiarEstado(c, estado) {
    var r = await api('citas/' + c.id + '/estado', { body: { estado: estado } });
    if (!r.ok) { aviso(r.datos.error || 'No se pudo cambiar.', true); return; }
    if (dVerCita.d.open) dVerCita.cerrar();
    aviso({ confirmada: 'Cita confirmada.', no_vino: 'Marcada como «No vino».', cancelada: 'Cita cancelada.', borrar: 'Listo, se quitó.' }[estado] || 'Listo.');
    recargar();
  }

  // ----- gastos -----
  function abrirGasto() {
    dGasto.f.reset();
    segGasto.marcar('Efectivo');
    $('ga-dia').value = hoy; $('ga-dia').max = sumarDias(hoy, 31);
    opcionesEquipo($('ga-personal'), true, 'Nadie en particular');
    dGasto.abrir();
    setTimeout(function () { $('ga-monto').focus(); }, 0);
  }
  async function enviarGasto(ev) {
    if (ev.submitter && ev.submitter.value === 'cancelar') return;
    ev.preventDefault();
    var monto = aCentimos($('ga-monto').value);
    if (!monto || isNaN(monto)) return dGasto.mal('Escribe cuánto gastaste.');
    var datos = { categoria: $('ga-categoria').value, monto: monto / 100, detalle: $('ga-detalle').value, metodo: segGasto.valor() };
    if (D.rol === 'dueno') Object.assign(datos, { dia: $('ga-dia').value || hoy, personal_id: $('ga-personal').value || null, fijo: $('ga-fijo').checked });
    var r = await api('gastos', { body: datos });
    if (!r.ok) return dGasto.mal(r.datos.error || 'No se pudo guardar.');
    dGasto.cerrar(); aviso('Gasto anotado: ' + S(monto) + '.'); recargar();
  }

  // ---------- caja ----------
  CARGAR.caja = async function () {
    if (!$('c-dia').value) $('c-dia').value = hoy;
    $('c-dia').max = hoy;
    var dia = D.rol === 'dueno' ? $('c-dia').value : hoy;
    var r = await api('ventas?dia=' + dia);
    if (!r.ok) return;
    var d = r.datos, res = d.resumen;
    var k = $('c-kpis'); k.textContent = '';
    k.append(kpi(dia === hoy ? 'Vendido hoy' : 'Vendido el ' + fechaCorta(dia), S(res.total), res.ventas + (res.ventas === 1 ? ' venta' : ' ventas'), 'principal'),
      kpi('Efectivo en caja', S(res.efectivoCaja), 'Lo que debería haber en la gaveta'),
      kpi('Gastos del día', S(res.gastos)),
      res.ganancia !== undefined && D.rol === 'dueno' ? kpi('Ganancia del día', S(res.ganancia), 'Ventas menos lo que costó la mercadería')
        : kpi('Ticket promedio', S(res.ventas ? Math.round(res.total / res.ventas) : 0)));
    if ($('c-abonos')) {
      var la = $('c-abonos'); la.textContent = '';
      if (!d.abonos || !d.abonos.length) vacio(la, 'Nadie pagó fiados este día.');
      (d.abonos || []).forEach(function (a) { la.appendChild(el('li', {}, [el('div', { clase: 'l-quien' }, [el('strong', { texto: a.nombre }), el('span', { texto: hora12(a.hora) + ' · ' + a.metodo })]), el('div', { clase: 'l-fin' }, [el('span', { clase: 'l-monto', texto: '+ ' + S(a.monto) })])])); });
    }
    barras($('c-metodos'), res.metodos, { vacio: 'Aún no hay ventas.' });
    var t = $('c-ventas'); t.textContent = '';
    t.appendChild(el('thead', {}, [el('tr', {}, ['Hora', 'Cliente y detalle', 'Atendió', 'Pago', 'Total', ''].map(function (h, i) { return el('th', { clase: i === 4 ? 'g-num' : '', texto: h }); }))]));
    var tb = el('tbody'); t.appendChild(tb);
    if (!d.ventas.length) tb.appendChild(el('tr', {}, [el('td', { clase: 'vacio', colspan: '6', texto: 'Sin ventas este día. Toca «Nueva venta» para cobrar.' })]));
    d.ventas.forEach(function (v) {
      var det = v.items.map(function (x) { return (x.c > 1 ? x.c + ' × ' : '') + x.n; }).join(' + ');
      var acc = el('td', { clase: 'g-num' });
      if (v.token) acc.appendChild(el('a', { clase: 'g-btn chico', href: '/' + SLUG + '/v/' + v.token, target: '_blank', rel: 'noopener', texto: 'Comprobante' }));
      if (v.anulada) acc.appendChild(el('span', { clase: 'g-estado-chip', 'data-e': 'cancelada', texto: 'Anulada' }));
      else if (D.rol === 'dueno' || v.dia === hoy) acc.appendChild(btn('Anular', 'chico', async function () {
        if (!confirm('¿Anular esta venta de ' + S(v.total) + '? ' + (v.items.some(function (x) { return x.t === 'p'; }) ? 'Los productos vuelven al stock. ' : '') + 'Si sumó un sello, quítalo desde el panel de tarjetas.')) return;
        var a = await api('ventas/' + v.id + '/anular', { body: {} });
        if (!a.ok) { aviso(a.datos.error || 'No se pudo anular.', true); return; }
        aviso('Venta anulada.'); CARGAR.caja();
      }));
      tb.appendChild(el('tr', { clase: v.anulada ? 'anulada' : '' }, [
        el('td', { texto: hora12(v.hora) }),
        el('td', {}, [el('div', { texto: v.nombre || 'Cliente sin nombre' }), el('div', { clase: 'tenue', texto: det + (v.descuento ? ' · desc. ' + S(v.descuento) : '') })]),
        el('td', { clase: 'tenue', texto: v.personal || '—' }), el('td', { clase: 'tenue', texto: v.metodo }),
        el('td', { clase: 'g-num', texto: S(v.total) }), acc,
      ]));
    });
    var g = $('c-gastos'); g.textContent = '';
    if (!d.gastos.length) vacio(g, 'Sin gastos este día.');
    d.gastos.forEach(function (x) {
      var fin = el('div', { clase: 'l-fin' }, [el('span', { clase: 'l-monto', texto: '− ' + S(x.monto) })]);
      if (D.rol === 'dueno' || d.dia === hoy) fin.appendChild(el('button', { type: 'button', clase: 'g-quitar', 'aria-label': 'Borrar gasto', texto: '×' }));
      var b = fin.querySelector('button');
      if (b) b.addEventListener('click', async function () { if (!confirm('¿Borrar este gasto?')) return; var a = await api('gastos/' + x.id + '/borrar', { body: {} }); if (a.ok) CARGAR.caja(); else aviso(a.datos.error, true); });
      g.appendChild(el('li', {}, [el('div', { clase: 'l-quien' }, [el('strong', { texto: x.categoria }), el('span', { texto: [x.detalle, x.metodo].filter(Boolean).join(' · ') })]), fin]));
    });
  };
  $('c-dia').addEventListener('change', function () { CARGAR.caja(); });

  // ---------- clientes ----------
  var clienteAbierto = null;
  CARGAR.clientes = function () { buscarClientes(); if (clienteAbierto) abrirFicha(clienteAbierto); };
  var esperaCl;
  $('cl-q').addEventListener('input', function () { clearTimeout(esperaCl); esperaCl = setTimeout(buscarClientes, 250); });
  async function buscarClientes() {
    var q = $('cl-q').value.trim();
    var r = await api('clientes' + (q ? '?q=' + encodeURIComponent(q) : ''));
    if (!r.ok) return;
    var l = $('cl-lista'); l.textContent = '';
    if (!r.datos.clientes.length) vacio(l, q ? 'Nadie con «' + q + '». Toca «Nuevo cliente» para registrarlo.' : 'Aún no hay clientes. Se crean al registrarse con el QR, al cobrar o con «Nuevo cliente».');
    r.datos.clientes.forEach(function (c) {
      var b = el('button', { type: 'button' }, [el('div', { clase: 'l-quien' }, [el('strong', { texto: c.nombre }), el('span', { texto: c.celular + (c.ultimaVisita ? ' · última visita ' + fechaCorta(c.ultimaVisita.slice(0, 10)) : '') })])]);
      b.addEventListener('click', function () { abrirFicha(c.id); });
      l.appendChild(el('li', { 'aria-current': String(c.id === clienteAbierto) }, [b]));
    });
  }
  async function abrirFicha(id) {
    clienteAbierto = id;
    var r = await api('clientes/' + id);
    if (!r.ok) { $('cl-ficha').hidden = true; return; }
    var c = r.datos.cliente, res = r.datos.resumen, f = $('cl-ficha');
    f.textContent = ''; f.classList.add('g-ficha'); f.hidden = false;
    $('cl-lista').querySelectorAll('li').forEach(function (li) { li.setAttribute('aria-current', 'false'); });
    var progreso = D.negocio.tipo === 'puntos' ? c.puntos + ' puntos' : D.negocio.tipo === 'cashback' ? S(c.saldo) + ' de saldo' : Math.min(c.sellos, c.meta) + ' de ' + c.meta + ' sellos';
    var listo = c.hitos && c.hitos.some(function (h) { return h.listo; });
    f.appendChild(el('div', { clase: 'g-ficha-cab' }, [
      el('div', {}, [el('h2', { texto: c.nombre }), el('p', { texto: c.celular + ' · cliente desde ' + fechaCorta(String(c.creado).slice(0, 10)) })]),
      el('span', { clase: 'g-tarjeta-chip' + (listo ? ' listo' : ''), texto: (listo ? '🎁 Premio listo · ' : 'Tarjeta: ') + progreso }),
    ]));
    var acc = el('div', { clase: 'g-acciones' }, [
      btn('Cobrar', 'primario chico', function () { abrirVenta({ cliente: c }); }),
      btn('Agendar cita', 'chico', function () { abrirCita({ dia: hoy, cliente: c }); }),
      enlaceWa(c.celularWa, 'Hola ' + primer(c.nombre) + ', te escribimos de ' + NEGOCIO + '. ', 'Escribirle'),
      el('a', { clase: 'g-btn chico', href: '/' + SLUG + '/panel#c=' + c.codigo, texto: 'Ver su tarjeta' }),
    ]);
    f.appendChild(acc);
    if (res.deuda > 0) {
      f.appendChild(el('p', { clase: 'promo-aviso', texto: 'Debe ' + S(res.deuda) + ' por compras fiadas.' }));
      if (G.abrirAbono) acc.appendChild(btn('Registrar pago', 'chico', function () { G.abrirAbono({ id: c.id, nombre: c.nombre, saldo: res.deuda }, function () { abrirFicha(c.id); }); }));
      acc.appendChild(enlaceWa(c.celularWa, 'Hola ' + primer(c.nombre) + ', te saludamos de ' + NEGOCIO + '. Te recordamos que tienes un saldo pendiente de ' + S(res.deuda) + '. ¡Gracias!', 'Recordar deuda'));
    }
    var mini = el('dl', { clase: 'g-mini' });
    [['Gastó en total', S(res.total)], ['Compras', String(res.compras)], ['Ticket promedio', S(res.compras ? Math.round(res.total / res.compras) : 0)], ['Última compra', res.ultima ? fechaCorta(res.ultima) : '—']]
      .forEach(function (x) { mini.append(el('div', {}, [el('dt', { texto: x[0] }), el('dd', { texto: x[1] })])); });
    f.append(el('h3', { texto: 'Resumen' }), mini);
    f.appendChild(el('h3', { texto: 'Notas' }));
    var notas = el('textarea', { rows: '3', maxlength: '1000', 'aria-label': 'Notas del cliente', placeholder: 'Alergias, tipo de piel, fórmula del tinte, cómo le gusta el corte…' });
    notas.value = c.notas || '';
    var est = el('p', { clase: 'g-estado', role: 'status' });
    f.append(notas, el('div', { clase: 'g-acciones' }, [btn('Guardar notas', 'chico', async function () {
      var a = await api('clientes/' + c.id + '/notas', { body: { notas: notas.value } });
      est.className = 'g-estado ' + (a.ok ? 'ok' : 'mal'); est.textContent = a.ok ? 'Notas guardadas.' : a.datos.error || 'No se pudo guardar.';
    })]), est);
    var ahora = r.datos.citas.filter(function (x) { return x.dia >= hoy && (x.estado === 'pendiente' || x.estado === 'confirmada'); });
    if (ahora.length) {
      var lp = el('ul', { clase: 'g-lista' }); ahora.forEach(function (x) { lp.appendChild(el('li', {}, [el('div', { clase: 'l-quien' }, [el('strong', { texto: fechaLarga(x.dia) + ', ' + hora12(x.hora) }), el('span', { texto: x.servicio + (x.personal ? ' · ' + x.personal : '') })]), el('div', { clase: 'l-fin' }, [chipEstado(x)])])); });
      f.append(el('h3', { texto: 'Próximas citas' }), lp);
    }
    var lv = el('ul', { clase: 'g-lista' });
    if (!r.datos.ventas.length) vacio(lv, 'Aún no tiene compras registradas en la caja.');
    r.datos.ventas.forEach(function (v) {
      var finV = el('div', { clase: 'l-fin' }, [el('span', { clase: 'l-monto', texto: S(v.total) })]);
      if (v.token) finV.appendChild(el('a', { clase: 'g-btn chico', href: '/' + SLUG + '/v/' + v.token, target: '_blank', rel: 'noopener', texto: 'Comprobante' }));
      lv.appendChild(el('li', {}, [el('div', { clase: 'l-quien' }, [el('strong', { texto: v.items.map(function (x) { return x.n; }).join(' + ') }), el('span', { texto: fechaCorta(v.dia) + (v.personal ? ' · ' + v.personal : '') + ' · ' + v.metodo })]), finV]));
    });
    f.append(el('h3', { texto: 'Historial de compras' }), lv);
    if (window.matchMedia('(max-width: 900px)').matches) f.focus();
  }
  $('cl-nuevo').addEventListener('click', function () { dCliente.f.reset(); dCliente.abrir(); });
  async function enviarCliente(ev) {
    if (ev.submitter && ev.submitter.value === 'cancelar') return;
    ev.preventDefault();
    var r = await api('clientes', { body: { nombre: $('nc-nombre').value, celular: $('nc-celular').value, notas: $('nc-notas').value, recordatorios: $('nc-recordatorios').checked } });
    if (!r.ok) return dCliente.mal(r.datos.error || 'No se pudo crear.');
    dCliente.cerrar(); aviso('Cliente creado, con su tarjeta.');
    $('cl-q').value = ''; clienteAbierto = r.datos.id; CARGAR.clientes();
  }

  // ---------- gastos (mes) ----------
  CARGAR.gastos = async function () {
    if (!$('ga-mes').value) $('ga-mes').value = mesActual();
    var r = await api('gastos?mes=' + $('ga-mes').value);
    if (!r.ok) return;
    var d = r.datos;
    $('ga-total').textContent = 'Total: ' + S(d.total);
    var pend = $('ga-pend-lista'); pend.textContent = '';
    $('ga-pendientes').hidden = !d.pendientes.length;
    d.pendientes.forEach(function (g) {
      pend.appendChild(el('li', {}, [el('div', { clase: 'l-quien' }, [el('strong', { texto: g.categoria + (g.detalle ? ' · ' + g.detalle : '') }), el('span', { texto: 'El mes pasado: ' + S(g.monto) + ' · ' + g.metodo })]),
        el('div', { clase: 'l-fin' }, [btn('Anotar ' + S(g.monto), 'chico', async function () {
          var a = await api('gastos', { body: { categoria: g.categoria, detalle: g.detalle, monto: g.monto / 100, metodo: g.metodo, personal_id: g.personalId, fijo: true } });
          if (a.ok) { aviso('Gasto fijo anotado.'); CARGAR.gastos(); } else aviso(a.datos.error, true);
        })])]));
    });
    var t = $('ga-tabla'); t.textContent = '';
    t.appendChild(el('thead', {}, [el('tr', {}, ['Fecha', 'Categoría y detalle', 'Pago', 'Monto', ''].map(function (h, i) { return el('th', { clase: i === 3 ? 'g-num' : '', texto: h }); }))]));
    var tb = el('tbody'); t.appendChild(tb);
    if (!d.gastos.length) tb.appendChild(el('tr', {}, [el('td', { clase: 'vacio', colspan: '5', texto: 'Sin gastos en ' + nombreMes(d.mes) + '.' })]));
    d.gastos.forEach(function (g) {
      var q = el('button', { type: 'button', clase: 'g-quitar', 'aria-label': 'Borrar gasto', texto: '×' });
      q.addEventListener('click', async function () { if (!confirm('¿Borrar este gasto de ' + S(g.monto) + '?')) return; var a = await api('gastos/' + g.id + '/borrar', { body: {} }); if (a.ok) CARGAR.gastos(); });
      tb.appendChild(el('tr', {}, [el('td', { texto: fechaCorta(g.dia) }),
        el('td', {}, [el('div', { texto: g.categoria + (g.fijo ? ' · fijo' : '') }), el('div', { clase: 'tenue', texto: [g.detalle, g.personal].filter(Boolean).join(' · ') })]),
        el('td', { clase: 'tenue', texto: g.metodo }), el('td', { clase: 'g-num', texto: S(g.monto) }), el('td', { clase: 'g-num' }, [q])]));
    });
    var cat = {};
    d.gastos.forEach(function (g) { cat[g.categoria] = (cat[g.categoria] || 0) + g.monto; });
    barras($('ga-categorias'), Object.keys(cat).map(function (k) { return { n: k, total: cat[k] }; }).sort(function (a, b) { return b.total - a.total; }), { clase: 'gasto', vacio: 'Sin gastos este mes.' });
  };
  $('ga-mes').addEventListener('change', function () { CARGAR.gastos(); });

  // ---------- finanzas ----------
  CARGAR.finanzas = async function () {
    if (!$('f-mes').value) $('f-mes').value = mesActual();
    $('f-mes').max = mesActual();
    var mes = $('f-mes').value;
    $('f-csv').href = API + 'finanzas.csv?mes=' + mes;
    var r = await api('finanzas?mes=' + mes);
    if (!r.ok) return;
    var d = r.datos, a = d.anterior;
    if (MODO === 'comercio' && G.finanzasComercio) G.finanzasComercio(d);
    $('f-comparacion').textContent = 'Comparado con ' + nombreMes(d.hastaAnterior.slice(0, 7)) + (d.enCurso ? ' hasta el día ' + Number(d.hastaAnterior.slice(8)) : '') + '.';
    var k = $('f-kpis'); k.textContent = '';
    if (MODO === 'comercio') k.append(kpi('Ventas', S(d.ingresos), variacion(d.ingresos, a.ingresos, 'vs. mes pasado')),
      kpi('Costo de lo vendido', S(d.costoVendido), d.ingresos ? Math.round(d.gananciaBruta / d.ingresos * 100) + ' % de margen' : ''),
      kpi('Gastos del negocio', S(d.gastosOperativos), 'Sin las compras de mercadería'));
    else k.append(kpi('Ingresos', S(d.ingresos), variacion(d.ingresos, a.ingresos, 'vs. mes pasado')),
      kpi('Gastos', S(d.gastos), variacion(d.gastos, a.gastos, 'vs. mes pasado', true)));
    k.append(
      kpi('Ganancia', S(d.ganancia), variacion(d.ganancia, a.ganancia, 'vs. mes pasado'), 'principal'));
    if (MODO !== 'comercio') k.append(kpi('Ticket promedio', S(d.ticket), d.ventas + (d.ventas === 1 ? ' venta' : ' ventas') + (d.meta ? ' · meta ' + Math.round(d.ingresos / d.meta * 100) + ' %' : '')));
    $('f-mejor').textContent = d.mejorDia ? 'Tu día más fuerte: ' + d.mejorDia : '';
    graficoDias($('f-dias'), d.porDia);
    var tt = $('f-dias-tabla'); tt.textContent = '';
    tt.appendChild(el('thead', {}, [el('tr', {}, [el('th', { texto: 'Día' }), el('th', { clase: 'g-num', texto: 'Ingresos' }), el('th', { clase: 'g-num', texto: 'Gastos' })])]));
    var tb = el('tbody'); tt.appendChild(tb);
    d.porDia.filter(function (x) { return x.ingresos || x.gastos; }).forEach(function (x) { tb.appendChild(el('tr', {}, [el('td', { texto: fechaLarga(x.dia) }), el('td', { clase: 'g-num', texto: S(x.ingresos) }), el('td', { clase: 'g-num', texto: S(x.gastos) })])); });
    barras($('f-servicios'), d.topServicios);
    barras($('f-productos'), d.topProductos, { vacio: 'Sin productos vendidos este mes.' });
    barras($('f-metodos'), d.metodos);
    barras($('f-categorias'), d.categorias, { clase: 'gasto', vacio: 'Sin gastos anotados este mes.' });
    var te = $('f-equipo'); te.textContent = '';
    te.appendChild(el('thead', {}, [el('tr', {}, ['Persona', 'Ventas', 'Cobrado', 'Comisión'].map(function (h, i) { return el('th', { clase: i ? 'g-num' : '', texto: h }); }))]));
    var teb = el('tbody'); te.appendChild(teb);
    if (!d.equipo.length) teb.appendChild(el('tr', {}, [el('td', { clase: 'vacio', colspan: '4', texto: 'Sin ventas este mes.' })]));
    d.equipo.forEach(function (p) { teb.appendChild(el('tr', {}, [el('td', { texto: p.nombre }), el('td', { clase: 'g-num', texto: String(p.ventas) }), el('td', { clase: 'g-num', texto: S(p.total) }), el('td', { clase: 'g-num', texto: S(p.comision) })])); });
    var c = $('f-citas'); c.textContent = '';
    var asistencia = d.citas.atendidas + d.citas.noVino ? Math.round(d.citas.noVino / (d.citas.atendidas + d.citas.noVino) * 100) + ' %' : '—';
    if (MODO === 'comercio') [['Ventas', d.ventas], ['Ticket promedio', S(d.ticket)], ['Clientes atendidos', d.clientesAtendidos], ['Clientes nuevos', d.clientesNuevos],
      ['Te deben (fiados)', S(d.porCobrar)], ['Cobrado de fiados', S(d.cobradoFiados)], ['Le debes a proveedores', S(d.porPagar)], ['Descuentos dados', S(d.descuentos)]]
      .forEach(function (x) { c.append(el('div', {}, [el('dt', { texto: x[0] }), el('dd', { texto: String(x[1]) })])); });
    else [['Citas agendadas', d.citas.total], ['Reservadas en línea', d.citas.web], ['No vinieron', d.citas.noVino + ' (' + asistencia + ')'], ['Canceladas', d.citas.canceladas],
      ['Clientes atendidos', d.clientesAtendidos], ['Clientes nuevos', d.clientesNuevos], ['Descuentos dados', S(d.descuentos)], ['Productos vendidos', S(d.productos)]]
      .forEach(function (x) { c.append(el('div', {}, [el('dt', { texto: x[0] }), el('dd', { texto: String(x[1]) })])); });
  };
  $('f-mes').addEventListener('change', function () { CARGAR.finanzas(); });
  $('f-imprimir').addEventListener('click', function () { window.print(); });
  /** Barras de ingresos por día (una serie: sin leyenda). Cada barra muestra su valor al pasar el mouse o con el teclado. */
  function graficoDias(cont, dias) {
    cont.textContent = '';
    var NS = 'http://www.w3.org/2000/svg', W = 720, H = 200, iz = 44, ab = 22, ar = 8;
    var max = Math.max.apply(null, dias.map(function (x) { return x.ingresos; }));
    if (!max) { cont.appendChild(el('p', { clase: 'g-nota', texto: 'Aún no hay ventas este mes.' })); return; }
    var paso = Math.pow(10, Math.floor(Math.log10(max / 100))) * 100, tope = Math.ceil(max / paso / 4) * paso * 4 || max; // céntimos
    var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Ingresos por día del mes. El detalle está en «Ver en tabla».');
    function nodo(tag, attrs, texto) { var n = document.createElementNS(NS, tag); Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); if (texto) n.textContent = texto; return n; }
    for (var i = 0; i <= 4; i++) {
      var y = ar + (H - ar - ab) * (1 - i / 4);
      svg.appendChild(nodo('line', { class: 'g-rejilla', x1: iz, x2: W, y1: y, y2: y }));
      svg.appendChild(nodo('text', { class: 'eje', x: iz - 6, y: y + 4, 'text-anchor': 'end' }, Scorto(tope * i / 4)));
    }
    var ancho = (W - iz) / dias.length, barra = Math.max(4, ancho - 3);
    var tip = el('div', { clase: 'g-tip', hidden: '' });
    dias.forEach(function (x, i) {
      var h = (H - ar - ab) * x.ingresos / tope, xx = iz + i * ancho + (ancho - barra) / 2, y0 = H - ab;
      var g = nodo('g', { tabindex: '0', 'aria-label': fechaLarga(x.dia) + ': ' + S(x.ingresos) });
      g.appendChild(nodo('rect', { class: 'golpe', x: iz + i * ancho, y: ar, width: ancho, height: H - ar - ab }));
      if (h > 0) {
        var r = Math.min(4, barra / 2, h);
        // Barra con las esquinas de arriba redondeadas, apoyada en la línea base.
        g.appendChild(nodo('path', { class: 'g-barra-dia' + (x.dia === hoy ? ' es-hoy' : ''), d: 'M' + xx + ' ' + y0 + 'V' + (y0 - h + r) + 'Q' + xx + ' ' + (y0 - h) + ' ' + (xx + r) + ' ' + (y0 - h) + 'H' + (xx + barra - r) + 'Q' + (xx + barra) + ' ' + (y0 - h) + ' ' + (xx + barra) + ' ' + (y0 - h + r) + 'V' + y0 + 'Z' }));
      }
      var dnum = Number(x.dia.slice(8));
      if (dnum === 1 || dnum % 5 === 0) svg.appendChild(nodo('text', { class: 'eje', x: iz + i * ancho + ancho / 2, y: H - 5, 'text-anchor': 'middle' }, String(dnum)));
      function mostrarTip() {
        tip.textContent = ''; tip.append(el('strong', { texto: S(x.ingresos) }), document.createTextNode(DIAS_CORTOS[diaSemana(x.dia)] + ' ' + dnum + (x.gastos ? ' · gastos ' + S(x.gastos) : '')));
        tip.hidden = false;
        tip.style.left = ((iz + i * ancho + ancho / 2) / W * 100) + '%';
        tip.style.top = ((y0 - h) / H * cont.clientWidth * H / W) + 'px';
      }
      g.addEventListener('mouseenter', mostrarTip); g.addEventListener('focus', mostrarTip);
      g.addEventListener('mouseleave', function () { tip.hidden = true; }); g.addEventListener('blur', function () { tip.hidden = true; });
      svg.appendChild(g);
    });
    svg.appendChild(nodo('line', { class: 'g-rejilla', x1: iz, x2: W, y1: H - ab, y2: H - ab }));
    cont.append(svg, tip);
  }

  // ---------- equipo ----------
  var COLORES = ['#2A4BD7', '#0E9384', '#C4320A', '#7A5AF8', '#DD2590', '#B54708', '#475467', '#15803D'];
  var personaEditando = null, colorElegido = COLORES[0];
  CARGAR.equipo = async function () {
    if (!$('e-mes').value) $('e-mes').value = mesActual();
    var r = await api('personal?mes=' + $('e-mes').value);
    if (!r.ok) return;
    var t = $('e-tabla'); t.textContent = '';
    t.appendChild(el('thead', {}, [el('tr', {}, ['Persona', 'Comisión', 'Ventas', 'Cobrado', 'Le toca', 'Pagado', ''].map(function (h, i) { return el('th', { clase: i > 1 && i < 6 ? 'g-num' : '', texto: h }); }))]));
    var tb = el('tbody'); t.appendChild(tb);
    if (!r.datos.equipo.length) tb.appendChild(el('tr', {}, [el('td', { clase: 'vacio', colspan: '7', texto: 'Agrega a tu equipo: así la agenda tiene una columna por persona y sabes cuánto le toca de comisión.' })]));
    r.datos.equipo.forEach(function (p) {
      var punto = el('span', { clase: 'g-punto' }); punto.style.background = p.color;
      var quien = el('td', {}, [el('div', { clase: 'l-quien' }, [el('strong', {}, [punto, document.createTextNode(' ' + p.nombre)]), el('span', { clase: 'tenue', texto: [p.cargo, p.activo ? '' : 'ya no trabaja aquí', p.agenda ? '' : 'sin agenda'].filter(Boolean).join(' · ') })])]);
      if (p.acceso) quien.querySelector('.l-quien span').textContent += (quien.querySelector('.l-quien span').textContent ? ' · ' : '') + 'entra con su celular';
      tb.appendChild(el('tr', { clase: p.activo ? '' : 'tenue' }, [quien,
        el('td', { clase: 'tenue', texto: p.comision + ' % serv.' + (p.comisionProd ? ' · ' + p.comisionProd + ' % prod.' : '') }),
        el('td', { clase: 'g-num', texto: String(p.ventas) }), el('td', { clase: 'g-num', texto: S(p.total) }), el('td', { clase: 'g-num', texto: S(p.comisionMes) }),
        el('td', { clase: 'g-num', texto: S(p.pagado) }), el('td', { clase: 'g-num' }, [btn('Editar', 'chico', function () { abrirPersona(p); })])]));
    });
  };
  $('e-mes').addEventListener('change', function () { CARGAR.equipo(); });
  $('e-nuevo').addEventListener('click', function () { abrirPersona(null); });
  function abrirPersona(p) {
    personaEditando = p;
    dPersona.f.reset();
    $('d-persona-t').textContent = p ? 'Editar a ' + p.nombre : 'Agregar persona';
    $('pe-nombre').value = p ? p.nombre : ''; $('pe-cargo').value = p ? p.cargo : '';
    $('pe-celular').value = p && p.celularWa ? p.celularWa.slice(2) : '';
    $('pe-comision').value = p ? p.comision : ''; $('pe-comision-prod').value = p ? p.comisionProd : '';
    $('pe-agenda').checked = p ? p.agenda : true; $('pe-activo').checked = p ? p.activo : true;
    $('pe-agenda').closest('label').hidden = !D.ajustes.agenda;
    $('pe-clave').value = ''; $('pe-quitar').checked = false;
    $('pe-quitar-caja').hidden = !(p && p.acceso);
    $('pe-acceso-nota').textContent = p && p.acceso ? 'Ya tiene acceso con su celular. Escribe una clave nueva solo si quieres cambiarla.'
      : 'Con su celular y esta clave entra a vender, cobrar y agendar, y sus ventas salen a su nombre. No ve finanzas ni gastos.';
    colorElegido = p ? p.color : COLORES[D.equipo.length % COLORES.length];
    var cc = $('pe-colores'); cc.textContent = '';
    COLORES.forEach(function (c, i) {
      var b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(c === colorElegido), 'aria-label': 'Color ' + (i + 1) });
      b.style.background = c;
      b.addEventListener('click', function () { colorElegido = c; cc.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); }); });
      cc.appendChild(b);
    });
    var sv = $('pe-servicios'); sv.textContent = '';
    if (!D.servicios.length) sv.appendChild(el('p', { clase: 'g-nota', texto: 'Primero carga tus servicios en «Servicios y productos».' }));
    D.servicios.forEach(function (s) {
      var c = el('input', { type: 'checkbox', value: s.n }); c.checked = !!(p && p.servicios.indexOf(s.n) >= 0);
      sv.appendChild(el('label', {}, [c, document.createTextNode(' ' + s.n)]));
    });
    dPersona.abrir();
  }
  async function enviarPersona(ev) {
    if (ev.submitter && ev.submitter.value === 'cancelar') return;
    ev.preventDefault();
    var datos = {
      nombre: $('pe-nombre').value, cargo: $('pe-cargo').value, celular: $('pe-celular').value, color: colorElegido,
      comision: $('pe-comision').value || 0, comision_prod: $('pe-comision-prod').value || 0, agenda: $('pe-agenda').checked, activo: $('pe-activo').checked,
      clave: $('pe-clave').value, quitar_acceso: $('pe-quitar').checked,
      servicios: Array.prototype.map.call($('pe-servicios').querySelectorAll('input:checked'), function (x) { return x.value; }),
    };
    var r = await api('personal' + (personaEditando ? '/' + personaEditando.id : ''), { body: datos });
    if (!r.ok) return dPersona.mal(r.datos.error || 'No se pudo guardar.');
    dPersona.cerrar(); aviso('Equipo actualizado.');
    await recargarDatos(); CARGAR.equipo();
  }
  async function recargarDatos() { var r = await api('datos'); if (r.ok) { D = r.datos; refrescarListas(); } }

  // ---------- catálogo ----------
  CARGAR.catalogo = function () {
    $('k-msg').textContent = '';
    var s = $('k-servicios'), p = $('k-productos'); s.textContent = ''; p.textContent = '';
    D.servicios.forEach(function (x) { filaCatalogo(s, x, 's'); });
    D.productos.forEach(function (x) { filaCatalogo(p, x, 'p'); });
    if (!D.servicios.length) filaCatalogo(s, {}, 's');
  };
  function filaCatalogo(tb, x, t) {
    var cel = function (input) { return el('td', {}, [input]); };
    var n = el('input', { 'data-k': 'n', maxlength: '40', value: x.n || '', placeholder: t === 's' ? 'Corte, manicure, masaje…' : 'Shampoo, cera…', 'aria-label': 'Nombre' });
    var precio = el('input', { 'data-k': 'p', inputmode: 'decimal', maxlength: '9', value: x.p !== undefined ? String(x.p / 100) : '', placeholder: '0.00', 'aria-label': 'Precio' });
    var quitar = el('button', { type: 'button', clase: 'g-quitar', 'aria-label': 'Quitar', texto: '×' });
    var tr = el('tr', {}, [cel(n), cel(precio)]);
    if (t === 's') tr.appendChild(cel(el('input', { 'data-k': 'd', type: 'number', min: '5', max: '600', step: '5', inputmode: 'numeric', value: x.d || '', placeholder: String(D.ajustes.intervalo), 'aria-label': 'Duración en minutos' })));
    else {
      tr.appendChild(cel(el('input', { 'data-k': 's', type: 'number', inputmode: 'numeric', value: x.s !== undefined ? String(x.s) : '', placeholder: '—', 'aria-label': 'Stock' })));
      tr.appendChild(cel(el('input', { 'data-k': 'm', type: 'number', min: '0', inputmode: 'numeric', value: x.m || '', placeholder: '—', 'aria-label': 'Avisar cuando queden' })));
    }
    tr.appendChild(el('td', {}, [quitar]));
    quitar.addEventListener('click', function () { tr.remove(); });
    tb.appendChild(tr);
    return n;
  }
  $('k-mas-s').addEventListener('click', function () { filaCatalogo($('k-servicios'), {}, 's').focus(); });
  $('k-mas-p').addEventListener('click', function () { filaCatalogo($('k-productos'), {}, 'p').focus(); });
  $('k-guardar').addEventListener('click', async function () {
    function leer(tb) {
      return Array.prototype.map.call(tb.querySelectorAll('tr'), function (tr) {
        var o = {}; tr.querySelectorAll('input').forEach(function (i) { o[i.getAttribute('data-k')] = i.value.trim(); }); return o;
      }).filter(function (o) { return o.n; });
    }
    var r = await api('catalogo', { body: { servicios: leer($('k-servicios')), productos: leer($('k-productos')) } });
    var m = $('k-msg');
    m.className = 'g-estado ' + (r.ok ? 'ok' : 'mal');
    m.textContent = r.ok ? 'Guardado. Ya puedes cobrarlos con un toque.' : r.datos.error || 'No se pudo guardar.';
    if (r.ok) { await recargarDatos(); CARGAR.catalogo(); m.className = 'g-estado ok'; m.textContent = 'Guardado. Ya puedes cobrarlos con un toque.'; }
  });

  // ---------- ajustes ----------
  CARGAR.ajustes = function () {
    var a = D.ajustes, h = $('aj-horario'); h.textContent = '';
    [1, 2, 3, 4, 5, 6, 0].forEach(function (i) {
      var x = a.horario[i];
      var abierto = el('input', { type: 'checkbox', 'data-dia': String(i), 'aria-label': 'Abre el ' + DIAS[i] }); abierto.checked = !!x;
      var de = el('input', { type: 'time', value: x ? x[0] : '09:00', 'aria-label': 'Abre a las (' + DIAS[i] + ')' });
      var a2 = el('input', { type: 'time', value: x ? x[1] : '20:00', 'aria-label': 'Cierra a las (' + DIAS[i] + ')' });
      var fila = el('div', { clase: 'h-dia' + (x ? '' : ' cerrado'), 'data-i': String(i) }, [el('label', {}, [abierto, document.createTextNode(DIAS[i].charAt(0).toUpperCase() + DIAS[i].slice(1))]), el('div', { clase: 'h-horas' }, [de, el('span', { texto: 'a' }), a2])]);
      abierto.addEventListener('change', function () { fila.classList.toggle('cerrado', !abierto.checked); });
      h.appendChild(fila);
    });
    $('aj-intervalo').value = String(a.intervalo);
    $('aj-reservas').checked = a.reservas;
    $('aj-anticipacion').value = String(a.anticipacion);
    if (!$('aj-anticipacion').value) $('aj-anticipacion').value = '60';
    $('aj-dias').value = String(a.diasReserva);
    if (!$('aj-dias').value) $('aj-dias').value = '14';
    $('aj-nota').value = a.notaReserva || '';
    $('aj-meta').value = a.meta ? String(a.meta / 100) : '';
    var m = $('aj-metodos'); m.textContent = '';
    D.todosMetodos.forEach(function (x) { var c = el('input', { type: 'checkbox', value: x }); c.checked = a.metodos.indexOf(x) >= 0; m.appendChild(el('label', {}, [c, document.createTextNode(' ' + x)])); });
    var en = $('aj-enlace'); en.textContent = '';
    en.append('Tu enlace de reservas (ponlo en tu Instagram y WhatsApp): ', el('a', { href: '/' + SLUG + '/reservar', target: '_blank', rel: 'noopener', texto: location.host + '/' + SLUG + '/reservar' }));
    $('aj-fiado').checked = !!a.fiado; $('aj-agenda').checked = !!a.agenda;
    $('aj-n-nombre').value = D.negocio.nombre; $('aj-n-ruc').value = D.negocio.ruc || ''; $('aj-n-razon').value = D.negocio.razon || '';
    $('aj-n-dir').value = D.negocio.direccion || ''; $('aj-n-wa').value = (D.negocio.whatsapp || '').replace(/^51/, ''); $('aj-n-correo').value = D.negocio.correo || '';
    $('aj-equipo-nota').textContent = D.claveEquipo ? 'Tu equipo entra con esta clave como caja: vende, cobra y agenda, sin ver finanzas. Cámbiala si alguien se va.'
      : 'Aún no hay clave de caja. Créala para que tu equipo entre sin tu clave de dueño (o dale a cada persona su propio acceso en Equipo).';
    $('aj-clave-nota').textContent = D.claveDueno
      ? 'Ya tienes clave del dueño. Puedes cambiarla aquí; las demás sesiones de dueño se cierran.'
      : 'Aún no tienes clave del dueño: la clave del panel ve todo, incluidas las finanzas. Crea una clave solo para ti y la de caja ya no verá finanzas, gastos ni equipo.';
  };
  $('aj-guardar').addEventListener('click', async function () {
    var horario = [0, 1, 2, 3, 4, 5, 6].map(function (i) {
      var f = $('aj-horario').querySelector('[data-i="' + i + '"]'), t = f.querySelectorAll('input[type=time]');
      return f.querySelector('input[type=checkbox]').checked ? [t[0].value, t[1].value] : null;
    });
    var datos = {
      horario: horario, intervalo: Number($('aj-intervalo').value), reservas: $('aj-reservas').checked, anticipacion: Number($('aj-anticipacion').value),
      diasReserva: Number($('aj-dias').value), notaReserva: $('aj-nota').value, meta: $('aj-meta').value,
      metodos: Array.prototype.map.call($('aj-metodos').querySelectorAll('input:checked'), function (x) { return x.value; }),
      fiado: $('aj-fiado').checked, agenda: $('aj-agenda').checked,
    };
    var neg = await api('negocio', { body: { nombre: $('aj-n-nombre').value, ruc: $('aj-n-ruc').value, razon: $('aj-n-razon').value, direccion: $('aj-n-dir').value, whatsapp: $('aj-n-wa').value, correo: $('aj-n-correo').value } });
    if (!neg.ok) { var mm = $('aj-msg'); mm.className = 'g-estado mal'; mm.textContent = neg.datos.error || 'No se pudo guardar.'; return; }
    var r = await api('ajustes', { body: datos });
    var m = $('aj-msg'); m.className = 'g-estado ' + (r.ok ? 'ok' : 'mal');
    m.textContent = r.ok ? 'Ajustes guardados.' + (datos.reservas ? ' Tus clientes ya pueden reservar desde tu enlace.' : '') : r.datos.error || 'No se pudo guardar.';
    if (r.ok) { await recargarDatos(); document.querySelectorAll('[data-agenda]').forEach(function (x) { x.hidden = !D.ajustes.agenda; }); }
  });
  $('aj-equipo-btn').addEventListener('click', async function () {
    var r = await api('clave-equipo', { body: { clave: $('aj-equipo').value } });
    var m = $('aj-equipo-msg'); m.className = 'g-estado ' + (r.ok ? 'ok' : 'mal');
    m.textContent = r.ok ? 'Clave de caja guardada. Compártela solo con tu equipo.' : r.datos.error || 'No se pudo guardar.';
    if (r.ok) { $('aj-equipo').value = ''; await recargarDatos(); CARGAR.ajustes(); }
  });
  $('aj-clave-btn').addEventListener('click', async function () {
    var r = await api('clave', { body: { clave: $('aj-clave').value } });
    var m = $('aj-clave-msg'); m.className = 'g-estado ' + (r.ok ? 'ok' : 'mal');
    m.textContent = r.ok ? 'Clave del dueño guardada. Desde ahora, la clave del panel solo ve agenda y caja.' : r.datos.error || 'No se pudo guardar.';
    if (r.ok) { $('aj-clave').value = ''; await recargarDatos(); CARGAR.ajustes(); }
  });

  // ---------- tu tarjeta de clientes ----------
  var tipoTarjeta = 'sellos', estiloTarjeta = '';
  CARGAR.tarjeta = function () {
    var t = D.tarjeta; if (!t) return;
    $('t-msg').textContent = '';
    $('t-programa').value = t.programa; $('t-meta').value = String(t.meta); $('t-premio').value = t.premio === 'Un regalo de la casa' ? '' : t.premio;
    $('t-hitos').value = (t.hitos || []).map(function (h) { return h.s + ' = ' + h.n; }).join('\n');
    $('t-regalo').checked = t.selloRegalo; $('t-porsol').value = String(t.porSol);
    $('t-premios').value = (t.premios || []).map(function (p) { return p.p + ' = ' + p.n; }).join('\n');
    $('t-cumple').value = t.regalo;
    $('t-acento').value = t.acento || '#2A4BD7'; $('t-usar-acento').checked = false;
    tipoTarjeta = t.tipo === 'puntos' ? 'puntos' : 'sellos';
    marcarTipo();
    estiloTarjeta = t.estilo || '';
    var c = $('t-estilos'); c.textContent = '';
    t.estilos.forEach(function (x) {
      var m = el('span', { clase: 'muestra', 'aria-hidden': 'true' }, [el('i')]); m.style.background = x.fondo; m.firstChild.style.background = x.acento;
      var b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(x.k === estiloTarjeta), 'data-k': x.k }, [m, document.createTextNode(x.nombre)]);
      b.addEventListener('click', function () { estiloTarjeta = x.k; c.querySelectorAll('button').forEach(function (y) { y.setAttribute('aria-checked', String(y === b)); }); });
      c.appendChild(b);
    });
    var enlace = location.origin + '/' + SLUG;
    $('t-enlace').href = '/' + SLUG; $('t-enlace').textContent = enlace.replace(/^https?:\/\//, '');
    $('t-ver').href = '/' + SLUG; $('t-cartel').href = '/' + SLUG + '/cartel';
  };
  function marcarTipo() {
    $('t-tipo').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-valor') === tipoTarjeta)); });
    $('t-sellos').hidden = tipoTarjeta !== 'sellos'; $('t-puntos').hidden = tipoTarjeta !== 'puntos';
  }
  $('t-tipo').querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { tipoTarjeta = b.getAttribute('data-valor'); marcarTipo(); }); });
  $('t-guardar').addEventListener('click', async function () {
    var d = { programa: $('t-programa').value, tipo: tipoTarjeta, meta: $('t-meta').value, premio: $('t-premio').value, hitos_texto: $('t-hitos').value,
      sello_regalo: $('t-regalo').checked, por_sol: $('t-porsol').value, premios_texto: $('t-premios').value, regalo_cumple: $('t-cumple').value, estilo: estiloTarjeta };
    if ($('t-usar-acento').checked) d.acento = $('t-acento').value;
    var r = await api('tarjeta', { body: d });
    var m = $('t-msg'); m.className = 'g-estado ' + (r.ok ? 'ok' : 'mal');
    m.textContent = r.ok ? 'Tarjeta guardada.' + (r.datos.conservan ? ' ' + r.datos.conservan + ' clientes conservan su promoción anterior hasta canjearla.' : '') : r.datos.error || 'No se pudo guardar.';
    if (r.ok) { await recargarDatos(); }
  });

  // Lo que usa public/static/gestion-comercio.js (vender, inventario, deudas y proveedores).
  var G = window.Gestion = {
    api: api, el: el, $: $, S: S, aCentimos: aCentimos, btn: btn, kpi: kpi, barras: barras, aviso: aviso, vacio: vacio, enlaceWa: enlaceWa, wa: wa,
    dialogo: dialogo, segmento: segmento, selectorCliente: selectorCliente, opcionesEquipo: opcionesEquipo, primer: primer,
    fechaCorta: fechaCorta, fechaLarga: fechaLarga, hora12: hora12, sumarDias: sumarDias, variacion: variacion,
    CARGAR: CARGAR, recargar: recargar, recargarDatos: recargarDatos, abrirGasto: abrirGasto,
    datos: function () { return D; }, hoy: function () { return hoy; }, slug: SLUG, negocio: NEGOCIO, modo: MODO,
  };
  // Se arranca cuando ya cargaron todos los scripts (gestion-comercio.js agrega sus vistas a CARGAR).
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else setTimeout(arrancar, 0);
})();
