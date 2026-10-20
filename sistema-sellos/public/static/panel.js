/* Panel del negocio: escanear QR, sumar sellos, canjear premios y ver quién está cerca del premio. */
(function () {
  'use strict';
  var main = document.getElementById('principal');
  var slug = main.getAttribute('data-slug');
  var meta = Number(main.getAttribute('data-meta'));
  var premio = main.getAttribute('data-premio');
  var negocio = main.getAttribute('data-negocio');
  var programa = main.getAttribute('data-programa');
  var base = '/api/n/' + slug;
  var $ = function (id) { return document.getElementById(id); };
  var actual = null; // cliente mostrado
  // El QR de la tarjeta es un enlace .../panel#c=CODIGO; también aceptamos el código solo.
  function codigoDe(texto) {
    var m = /[#?&]c=([A-Za-z0-9-]{4,20})/.exec(texto || '');
    return m ? m[1] : texto;
  }
  // Si se abrió el panel escaneando una tarjeta con la cámara del celular, buscamos a ese cliente.
  var pendiente = /[#&]c=/.test(location.hash) ? codigoDe(location.hash) : null;
  function atenderPendiente() {
    if (!pendiente) return;
    var cod = pendiente; pendiente = null;
    history.replaceState(null, '', location.pathname + location.search);
    $('q').value = cod; buscar(cod);
  }
  window.addEventListener('hashchange', function () {
    if (!/[#&]c=/.test(location.hash)) return;
    pendiente = codigoDe(location.hash);
    if (!$('app').hidden) atenderPendiente();
  });

  // ---------- sesión ----------
  function verLogin() {
    detenerCamara();
    $('app').hidden = true; $('salir').hidden = true; $('login').hidden = false;
    $('clave').focus();
  }
  function verApp() {
    $('login').hidden = true; $('app').hidden = false; $('salir').hidden = false;
    cargarCerca(); cargarResumen(); cargarClientes(); cargarNumeros();
    atenderPendiente();
  }
  // Mientras el panel está abierto, se actualiza solo cada minuto.
  setInterval(function () {
    if (!document.hidden && !$('app').hidden) { cargarResumen(); cargarCerca(); if (cargados <= 25) cargarClientes(); cargarNumeros(); }
  }, 60000);
  async function pedir(url, opciones) {
    var r = await Sellos.api(url, opciones);
    if (r.status === 401) { verLogin(); Sellos.mostrar($('login-error'), 'Tu sesión terminó. Vuelve a ingresar.'); }
    if (r.status === 403 && /suspendido/.test(r.datos.error || '')) avisoPlan({ suspendido: true });
    return r;
  }

  $('login').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var boton = this.querySelector('button');
    boton.disabled = true;
    var r = await Sellos.api(base + '/login', { body: { clave: $('clave').value } });
    boton.disabled = false;
    if (r.ok) { $('clave').value = ''; Sellos.mostrar($('login-error'), ''); verApp(); $('escanear').focus(); }
    else Sellos.mostrar($('login-error'), r.datos.error || 'No se pudo ingresar.');
  });
  $('salir').addEventListener('click', async function () {
    await Sellos.api('/api/salir', { body: {} });
    location.reload();
  });

  // ---------- cámara y QR ----------
  var stream = null, lienzo = document.createElement('canvas'), ctx = lienzo.getContext('2d', { willReadFrequently: true }), buscando = false;
  async function abrirCamara() {
    Sellos.mostrar($('buscar-msg'), '');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Sellos.mostrar($('buscar-msg'), 'Este navegador no permite usar la cámara. Escribe el código que aparece debajo del QR.');
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    } catch (e) {
      return Sellos.mostrar($('buscar-msg'), 'No se pudo abrir la cámara (revisa el permiso del navegador). También puedes escribir el código que aparece debajo del QR.');
    }
    var video = $('video');
    video.srcObject = stream;
    $('camara').hidden = false; $('escanear').hidden = true;
    await video.play().catch(function () {});
    buscando = true;
    requestAnimationFrame(leer);
  }
  function detenerCamara() {
    buscando = false;
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    if ($('camara')) { $('camara').hidden = true; $('escanear').hidden = false; }
  }
  var ultimoCuadro = 0;
  function leer(t) {
    if (!buscando) return;
    var video = $('video');
    if (t - ultimoCuadro > 120 && video.readyState >= 2 && video.videoWidth) {
      ultimoCuadro = t;
      var escala = Math.min(1, 640 / video.videoWidth);
      lienzo.width = Math.round(video.videoWidth * escala);
      lienzo.height = Math.round(video.videoHeight * escala);
      ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
      var img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
      var qr = window.jsQR && window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (qr && qr.data) {
        detenerCamara();
        if (navigator.vibrate) navigator.vibrate(80);
        var cod = codigoDe(qr.data);
        $('q').value = cod;
        buscar(cod);
        return;
      }
    }
    requestAnimationFrame(leer);
  }
  $('escanear').addEventListener('click', abrirCamara);
  $('cerrar-camara').addEventListener('click', function () { detenerCamara(); $('escanear').focus(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) detenerCamara(); });

  // ---------- búsqueda ----------
  async function buscar(q) {
    Sellos.mostrar($('buscar-msg'), '');
    $('resultados').hidden = true;
    var r = await pedir(base + '/buscar?q=' + encodeURIComponent(q));
    if (!r.ok) return Sellos.mostrar($('buscar-msg'), r.datos.error || 'No se pudo buscar.');
    var lista = r.datos.clientes;
    if (!lista.length) { ocultarCliente(); return Sellos.mostrar($('buscar-msg'), 'No encontramos ningún cliente con «' + q + '». Si es nuevo, pídele que cree su tarjeta en ' + location.origin + '/' + slug); }
    if (lista.length === 1) return mostrarCliente(lista[0], true);
    var ul = $('resultados');
    ul.textContent = '';
    lista.forEach(function (c) {
      var b = Sellos.el('button', { clase: 'boton', type: 'button' }, [
        Sellos.el('span', { texto: c.nombre + ' · ' + c.celular }),
        Sellos.el('span', { texto: c.sellos + '/' + meta }),
      ]);
      b.addEventListener('click', function () { ul.hidden = true; mostrarCliente(c, true); });
      ul.appendChild(Sellos.el('li', {}, [b]));
    });
    ul.hidden = false;
    ul.querySelector('button').focus();
  }
  $('buscar').addEventListener('submit', function (ev) { ev.preventDefault(); var q = $('q').value.trim(); if (q) buscar(q); });

  // ---------- cliente ----------
  function faltan(c) { return Math.max(0, meta - c.sellos); }
  function mostrarCliente(c, enfocar) {
    actual = c;
    $('cliente').hidden = false;
    $('c-nombre').textContent = c.nombre;
    $('c-codigo').textContent = c.codigo.replace(/(.{4})(.{4})/, '$1 $2');
    $('c-celular').textContent = c.celular + ' · ' + c.visitas + ' visita' + (c.visitas === 1 ? '' : 's') + ' · ' + c.premios + ' premio' + (c.premios === 1 ? '' : 's') + ' canjeado' + (c.premios === 1 ? '' : 's');
    Sellos.casillas($('c-sellos'), c.sellos, meta);
    $('c-progreso').textContent = c.sellos >= meta
      ? '¡Premio listo! Tiene ' + c.sellos + ' sellos: puede canjear «' + premio + '».'
      : c.sellos + ' de ' + meta + ' sellos · le falta' + (faltan(c) === 1 ? '' : 'n') + ' ' + faltan(c) + ' para «' + premio + '».';
    $('canjear').disabled = c.sellos < meta;
    $('c-recordatorios').checked = c.recordatorios;
    var texto = 'Hola ' + c.nombre.split(' ')[0] + ', esta es tu tarjeta ' + programa + ' de ' + negocio + ': ' + c.enlace;
    $('reenviar').href = 'https://wa.me/' + c.celularWa + '?text=' + encodeURIComponent(texto);
    if (enfocar) { estado(''); $('cliente').focus(); $('cliente').scrollIntoView({ block: 'start' }); }
  }
  function ocultarCliente() { actual = null; $('cliente').hidden = true; }
  function estado(texto, tipo) { var n = $('c-msg'); n.textContent = texto; n.className = 'estado' + (tipo ? ' ' + tipo : ''); }

  async function accion(ruta, cuerpo, boton, exito) {
    if (!actual) return;
    boton.disabled = true;
    var r = await pedir(base + '/cliente/' + actual.id + '/' + ruta, { body: cuerpo || {} });
    boton.disabled = false;
    if (r.ok && r.datos.cliente) { mostrarCliente(r.datos.cliente); estado(exito(r.datos.cliente), 'ok'); cargarCerca(); cargarResumen(); cargarClientes(); cargarNumeros(); }
    else { if (actual) mostrarCliente(actual); estado(r.datos.error || 'No se pudo completar.', 'mal'); }
    return r;
  }
  $('sumar').addEventListener('click', function () {
    var monto = $('c-monto').value.trim();
    if (monto && !/^\d{1,6}([.,]\d{1,2})?$/.test(monto)) { estado('Escribe el monto solo con números, por ejemplo 35 o 35.50.', 'mal'); $('c-monto').focus(); return; }
    accion('sello', { monto: monto }, this, function (c) {
      $('c-monto').value = '';
      if (navigator.vibrate) navigator.vibrate(60);
      return c.sellos >= meta ? '✓ Sello sumado. ¡Completó su tarjeta! Ya puede canjear su premio.' : '✓ Sello sumado: ' + c.sellos + ' de ' + meta + '.';
    });
  });
  $('canjear').addEventListener('click', function () {
    if (!confirm('¿Entregar «' + premio + '» a ' + actual.nombre + '? Se descontarán ' + meta + ' sellos.')) return;
    accion('canje', {}, this, function () { return '✓ Premio canjeado. Su tarjeta empieza de nuevo.'; });
  });
  $('deshacer').addEventListener('click', function () {
    accion('deshacer', {}, this, function (c) { return 'Se quitó el último sello. Ahora tiene ' + c.sellos + '.'; });
  });
  $('c-recordatorios').addEventListener('change', function () {
    var activo = this.checked;
    accion('recordatorios', { activo: activo }, this, function () { return activo ? 'Recordatorios activados.' : 'Recordatorios desactivados: no le escribas por promociones.'; });
  });
  $('eliminar').addEventListener('click', async function () {
    if (!actual || !confirm('¿Eliminar a ' + actual.nombre + ' y todos sus sellos? No se puede deshacer.')) return;
    var r = await pedir(base + '/cliente/' + actual.id + '/eliminar', { body: {} });
    if (r.ok) { ocultarCliente(); Sellos.mostrar($('buscar-msg'), 'Cliente eliminado.'); cargarCerca(); cargarResumen(); cargarClientes(); $('q').focus(); }
    else estado(r.datos.error || 'No se pudo eliminar.', 'mal');
  });

  // ---------- clientes registrados ----------
  var fecha = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  var cargados = 0;
  async function cargarClientes(mas) {
    var desde = mas ? cargados : 0;
    var r = await pedir(base + '/clientes?desde=' + desde);
    if (!r.ok) return;
    var ul = $('clientes');
    if (!mas) { ul.textContent = ''; cargados = 0; }
    $('total-clientes').textContent = r.datos.total + (r.datos.total === 1 ? ' cliente' : ' clientes');
    if (!r.datos.total) { ul.appendChild(Sellos.el('li', { texto: 'Aún no hay clientes. Comparte el cartel con QR o tu enlace.' })); }
    r.datos.clientes.forEach(function (c) {
      var cuando = fecha.format(new Date(c.creado.replace(' ', 'T') + 'Z'));
      var ver = Sellos.el('button', { clase: 'boton chico', type: 'button', texto: 'Ver' });
      ver.addEventListener('click', function () { mostrarCliente(c, true); });
      ul.appendChild(Sellos.el('li', {}, [
        Sellos.el('div', { clase: 'quien' }, [
          Sellos.el('strong', { texto: c.nombre }),
          Sellos.el('span', { texto: c.sellos + '/' + meta + ' sellos · se registró el ' + cuando + (c.origen === 'qr' ? ' (QR del cartel)' : '') }),
        ]),
        ver,
      ]));
    });
    cargados = desde + r.datos.clientes.length;
    $('mas-clientes').hidden = cargados >= r.datos.total;
  }
  $('mas-clientes').addEventListener('click', function () { cargarClientes(true); });

  // ---------- cerca del premio ----------
  async function cargarCerca() {
    var r = await pedir(base + '/cerca');
    if (!r.ok) return;
    var ul = $('cerca');
    ul.textContent = '';
    if (!r.datos.clientes.length) { ul.appendChild(Sellos.el('li', { texto: 'Nadie por ahora.' })); return; }
    r.datos.clientes.forEach(function (c) {
      var f = faltan(c);
      var nombre = c.nombre.split(' ')[0];
      var detalle = f === 0 ? 'Premio listo para canjear' : 'Le falta' + (f === 1 ? '' : 'n') + ' ' + f + ' sello' + (f === 1 ? '' : 's');
      var msg = f === 0
        ? 'Hola ' + nombre + ', te escribimos de ' + negocio + '. ¡Completaste tu tarjeta ' + programa + '! Tu premio (' + premio + ') te espera. ¿Te reservamos una cita? (Si no deseas recibir estos mensajes, responde BAJA.)'
        : 'Hola ' + nombre + ', te escribimos de ' + negocio + '. ¡Te falta' + (f === 1 ? '' : 'n') + ' solo ' + f + ' sello' + (f === 1 ? '' : 's') + ' para ' + premio + '! ¿Te reservamos una cita? (Si no deseas recibir estos mensajes, responde BAJA.)';
      var ver = Sellos.el('button', { clase: 'boton chico', type: 'button', texto: 'Ver' });
      ver.addEventListener('click', function () { mostrarCliente(c, true); });
      ul.appendChild(Sellos.el('li', {}, [
        Sellos.el('div', { clase: 'quien' }, [Sellos.el('strong', { texto: c.nombre }), Sellos.el('span', { texto: detalle + ' · ' + c.celular })]),
        Sellos.el('div', { clase: 'botones chicos' }, [
          ver,
          Sellos.el('a', { clase: 'boton chico primario', href: 'https://wa.me/' + c.celularWa + '?text=' + encodeURIComponent(msg), target: '_blank', rel: 'noopener', texto: 'Escribir por WhatsApp' }),
        ]),
      ]));
    });
  }
  $('recargar').addEventListener('click', function () { cargarCerca(); cargarResumen(); cargarClientes(); cargarNumeros(); });

  function llenar(dl, pares) {
    dl.textContent = '';
    pares.forEach(function (p) {
      var dd = Sellos.el('dd', {}, [document.createTextNode(String(p[1])), p[2] ? Sellos.el('span', { clase: 'dato-nota', texto: p[2] }) : null]);
      dl.appendChild(Sellos.el('div', {}, [Sellos.el('dt', { texto: p[0] }), dd]));
    });
  }
  async function cargarResumen() {
    var r = await pedir(base + '/resumen');
    if (!r.ok) return;
    var d = r.datos;
    var conversion = d.aperturas30 ? Math.min(100, Math.round(d.tarjetasNuevas30 / d.aperturas30 * 100)) + ' %' : '—';
    llenar($('res-alcance'), [
      ['Escaneos del QR', d.escaneosQr30, 'Hoy: ' + d.escaneosQrHoy],
      ['Personas que abrieron tu enlace', d.aperturas30, 'Contando QR, bio y WhatsApp'],
      ['Tarjetas nuevas', d.tarjetasNuevas30, d.tarjetasDesdeQr30 + ' desde el QR'],
      ['Crean su tarjeta', conversion, 'De quienes abren el enlace'],
    ]);
    llenar($('res-clientes'), [
      ['Clientes con tarjeta', d.clientes],
      ['Vinieron en 30 días', d.activos30, 'Clientes distintos'],
      ['Visitas hoy', d.visitasHoy],
      ['Visitas (30 días)', d.visitas30],
      ['Premios canjeados', d.premios],
      ['Aceptan recordatorios', d.conRecordatorios],
    ]);
  }

  // ---------- tus números ----------
  var soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 });
  var solesExactos = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 });
  var nombreMes = new Intl.DateTimeFormat('es-PE', { month: 'long', timeZone: 'UTC' });
  var mesCorto = new Intl.DateTimeFormat('es-PE', { month: 'short', timeZone: 'UTC' });
  function plata(c) { return soles.format(Math.round(c / 100)); }
  function mesDe(m, corto) { return (corto ? mesCorto : nombreMes).format(new Date(m + '-15T12:00:00Z')).replace('.', '').toLowerCase(); }
  function mayus(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function compacto(c) { var s = c / 100; return 'S/ ' + (Math.abs(s) >= 1000 ? (Math.round(s / 100) / 10) + ' mil' : Math.round(s)); }
  function plural(x, uno, varios) { return x + ' ' + (x === 1 ? uno : varios); }
  var num = null;

  // Diferencia contra el mes anterior: flecha y signo, no solo color.
  function cambio(ahora, antes, mesAntes) {
    if (!antes) return ahora ? { texto: 'Nuevo vs. ' + mesAntes, clase: 'sube' } : null;
    var p = Math.round((ahora - antes) / antes * 100);
    if (!p) return { texto: '= igual que ' + mesAntes, clase: '' };
    return { texto: (p > 0 ? '▲ +' : '▼ ') + p + ' % vs. ' + mesAntes, clase: p > 0 ? 'sube' : 'baja' };
  }
  function tiles(dl, pares) {
    dl.textContent = '';
    pares.forEach(function (p) {
      var dd = Sellos.el('dd', {}, [document.createTextNode(String(p[1]))]);
      if (p[2]) dd.appendChild(Sellos.el('span', { clase: 'dato-nota', texto: p[2] }));
      if (p[3]) dd.appendChild(Sellos.el('span', { clase: 'dato-nota cambio ' + p[3].clase, texto: p[3].texto }));
      dl.appendChild(Sellos.el('div', {}, [Sellos.el('dt', { texto: p[0] }), dd]));
    });
  }

  // Gráfico de columnas en SVG, con tooltip al pasar el dedo, el mouse o el teclado.
  var NS = 'http://www.w3.org/2000/svg';
  function svg(tag, a) { var n = document.createElementNS(NS, tag); Object.keys(a || {}).forEach(function (k) { n.setAttribute(k, a[k]); }); return n; }
  function columnas(caja, grupos, series, formato, destacar) {
    caja.textContent = '';
    var W = Math.max(300, Math.round(caja.clientWidth || 600)), H = W < 480 ? 190 : 220, izq = 52, abajo = 26, arriba = 18, ancho = W - izq - 8, alto = H - abajo - arriba;
    var max = 0;
    grupos.forEach(function (g) { g.valores.forEach(function (v) { if (v > max) max = v; }); });
    var paso = escalon(max || 1), tope = Math.ceil((max || 1) / paso) * paso;
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': caja.getAttribute('data-titulo') || '' });
    for (var t = 0; t <= tope + 1e-9; t += paso) {
      var y = arriba + alto - t / tope * alto;
      s.appendChild(svg('line', { x1: izq, x2: W - 8, y1: y, y2: y, class: 'rejilla-g' }));
      var et = svg('text', { x: izq - 8, y: y + 4, 'text-anchor': 'end', class: 'eje' }); et.textContent = formato.eje(t); s.appendChild(et);
    }
    var banda = ancho / grupos.length, barra = Math.min(24, (banda - 16) / series.length - 2);
    var tip = Sellos.el('div', { clase: 'tip', role: 'status' }); tip.hidden = true;
    grupos.forEach(function (g, i) {
      var x0 = izq + i * banda + (banda - (barra * series.length + 2 * (series.length - 1))) / 2;
      var gr = svg('g', { tabindex: '0', class: 'grupo', 'aria-label': g.etiqueta + ': ' + series.map(function (se, k) { return se.nombre + ' ' + formato.tip(g.valores[k]); }).join(', ') });
      gr.appendChild(svg('rect', { x: izq + i * banda, y: arriba, width: banda, height: alto, class: 'golpe' }));
      g.valores.forEach(function (v, k) {
        var h = v > 0 ? Math.max(2, v / tope * alto) : 0, x = x0 + k * (barra + 2), y = arriba + alto - h;
        if (h) gr.appendChild(svg('path', { d: columna(x, y, barra, h), class: series[k].clase }));
      });
      if (destacar && destacar(g, i)) {
        var v = Math.max.apply(null, g.valores), lab = svg('text', { x: izq + i * banda + banda / 2, y: arriba + alto - v / tope * alto - 6, 'text-anchor': 'middle', class: 'valor' });
        lab.textContent = formato.eje(v); gr.appendChild(lab);
      }
      var et = svg('text', { x: izq + i * banda + banda / 2, y: H - 8, 'text-anchor': 'middle', class: 'eje' + (g.actual ? ' actual' : '') }); et.textContent = g.corta; gr.appendChild(et);
      function ver() {
        tip.textContent = '';
        tip.appendChild(Sellos.el('strong', { texto: g.etiqueta }));
        series.forEach(function (se, k) { tip.appendChild(Sellos.el('span', {}, [Sellos.el('i', { clase: 'm-' + se.clase }), document.createTextNode(se.nombre + ': ' + formato.tip(g.valores[k]))])); });
        if (g.extra) tip.appendChild(Sellos.el('span', { clase: 'tip-extra', texto: g.extra }));
        tip.hidden = false;
        var r = caja.getBoundingClientRect(), centro = (izq + i * banda + banda / 2) / W * r.width;
        tip.style.left = Math.max(0, Math.min(r.width - tip.offsetWidth, centro - tip.offsetWidth / 2)) + 'px';
      }
      function ocultar() { tip.hidden = true; }
      gr.addEventListener('pointerenter', ver); gr.addEventListener('focus', ver);
      gr.addEventListener('pointerleave', ocultar); gr.addEventListener('blur', ocultar);
      s.appendChild(gr);
    });
    caja.appendChild(s); caja.appendChild(tip);
  }
  function escalon(max) { var e = Math.pow(10, Math.floor(Math.log10(max / 3))), b = max / 3 / e; return (b > 5 ? 10 : b > 2 ? 5 : b > 1 ? 2 : 1) * e; }
  // Columna con la punta redondeada (4 px) y la base recta.
  function columna(x, y, w, h) { var r = Math.min(4, w / 2, h); return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z'; }

  async function cargarNumeros() {
    var r = await pedir(base + '/numeros');
    if (r.ok) { num = r.datos; pintarNumeros(); }
  }
  function pintarNumeros() {
    var d = num, sel = $('n-mes'), elegido = sel.value || d.meses[d.meses.length - 1].mes;
    sel.textContent = '';
    d.meses.slice().reverse().forEach(function (m, i) {
      var o = Sellos.el('option', { value: m.mes, texto: mayus(mesDe(m.mes)) + ' ' + m.mes.slice(0, 4) + (i === 0 ? ' (en curso)' : '') });
      if (m.mes === elegido) o.selected = true;
      sel.appendChild(o);
    });
    var i = d.meses.findIndex(function (m) { return m.mes === elegido; }); if (i < 0) i = d.meses.length - 1;
    var m = d.meses[i], a = d.meses[i - 1] || null, antes = a ? mesDe(a.mes) : '';
    // El mes en curso se compara con el anterior a la misma fecha (del 1 al día de hoy).
    if (a && i === d.meses.length - 1) { a = d.anteriorAlDia; antes = '1–' + a.hasta + ' ' + mesDe(a.mes, true); }
    var a0 = a || {};
    var sinPrecio = !d.ajustes.precio;
    $('n-falta').hidden = !(sinPrecio || !d.ajustes.inversion);
    $('n-ajustes').open = sinPrecio;

    // El número principal: la ganancia que deja el programa en el mes.
    var costo = m.premios + m.inversion, heroe = $('n-heroe');
    heroe.textContent = '';
    heroe.appendChild(Sellos.el('p', { clase: 'heroe-titulo', texto: 'Ganancia del programa en ' + mesDe(m.mes) }));
    heroe.appendChild(Sellos.el('p', { clase: 'heroe-valor' + (m.ganancia < 0 ? ' negativo' : ''), texto: (m.ganancia < 0 ? '− ' : '') + plata(Math.abs(m.ganancia)) }));
    heroe.appendChild(Sellos.el('p', { clase: 'heroe-nota', texto: costo > 0
      ? 'Por cada S/ 1 que te cuesta (premios + sistema), tus clientes que regresan te dejaron ' + solesExactos.format(m.ingresosRegreso / costo) + '.'
      : 'Visitas de clientes que regresan: ' + plata(m.ingresosRegreso) + '. Configura lo que pagas al mes para ver tu retorno.' }));

    var f = d.fidelidad;
    tiles($('n-datos'), [
      ['Ingresos estimados', plata(m.ingresos), plural(m.visitas, 'visita', 'visitas'), a && cambio(m.ingresos, a0.ingresos, antes)],
      ['De clientes que regresan', plata(m.ingresosRegreso), m.ingresos ? Math.round(m.ingresosRegreso / m.ingresos * 100) + ' % de tus ingresos' : '', a && cambio(m.ingresosRegreso, a0.ingresosRegreso, antes)],
      ['Clientes que volvieron', m.volvieron, 'de ' + plural(m.clientes, 'cliente', 'clientes') + ' que vinieron', a && cambio(m.volvieron, a0.volvieron, antes)],
      ['Clientes nuevos', m.nuevos, 'Crearon su tarjeta', a && cambio(m.nuevos, a0.nuevos, antes)],
      ['Premios entregados', m.canjes, 'Te costaron ' + plata(m.premios)],
      ['Lo que pagas por el sistema', plata(m.inversion), 'Este mes'],
      ['Vuelven a venir', f.clientes ? Math.round(f.repiten / f.clientes * 100) + ' %' : '—', plural(f.repiten, 'cliente vino', 'clientes vinieron') + ' 2 veces o más'],
      ['Vuelven cada', f.cadaDias === null ? '—' : plural(f.cadaDias, 'día', 'días'), 'En promedio, entre visita y visita'],
    ]);

    // 6 meses: lo que dejan los que regresan vs. lo que cuesta.
    var g = $('n-grafico');
    g.setAttribute('data-titulo', 'Ingresos de clientes que regresan y costo del programa, por mes');
    columnas(g, d.meses.map(function (x, k) {
      return { etiqueta: mayus(mesDe(x.mes)) + ' ' + x.mes.slice(0, 4), corta: mayus(mesDe(x.mes, true)), actual: k === i, valores: [x.ingresosRegreso, x.premios + x.inversion],
        extra: 'Ganancia: ' + (x.ganancia < 0 ? '− ' : '') + plata(Math.abs(x.ganancia)) };
    }), [{ nombre: 'Regresan', clase: 'acento' }, { nombre: 'Costo', clase: 'suave' }], { eje: compacto, tip: plata });
    var tabla = $('n-tabla');
    tabla.textContent = '';
    var cab = Sellos.el('tr', {}, ['Mes', 'Visitas', 'Volvieron', 'Nuevos', 'Ingresos', 'De los que regresan', 'Premios', 'Sistema', 'Ganancia'].map(function (t) { return Sellos.el('th', { scope: 'col', texto: t }); }));
    tabla.appendChild(Sellos.el('thead', {}, [cab]));
    tabla.appendChild(Sellos.el('tbody', {}, d.meses.slice().reverse().map(function (x) {
      return Sellos.el('tr', {}, [mayus(mesDe(x.mes)) + ' ' + x.mes.slice(0, 4), x.visitas, x.volvieron, x.nuevos, plata(x.ingresos), plata(x.ingresosRegreso), plata(x.premios), plata(x.inversion), (x.ganancia < 0 ? '− ' : '') + plata(Math.abs(x.ganancia))]
        .map(function (v, k) { return Sellos.el(k ? 'td' : 'th', k ? { texto: String(v) } : { scope: 'row', texto: String(v) }); }));
    })));

    // Ranking de clientes.
    var top = $('n-top');
    top.textContent = '';
    if (!d.top.length) top.appendChild(Sellos.el('li', { texto: 'Aún no hay visitas en los últimos 90 días.' }));
    d.top.forEach(function (c, k) {
      var ver = Sellos.el('button', { clase: 'boton chico', type: 'button', texto: 'Ver' });
      ver.addEventListener('click', function () { mostrarCliente(c, true); });
      top.appendChild(Sellos.el('li', {}, [
        Sellos.el('span', { clase: 'puesto', texto: String(k + 1), 'aria-hidden': 'true' }),
        Sellos.el('div', { clase: 'quien' }, [
          Sellos.el('strong', { texto: c.nombre }),
          Sellos.el('span', { texto: plural(c.visitas90, 'visita', 'visitas') + (sinPrecio ? '' : ' · ' + plata(c.gasto90)) + ' · ' + plural(c.premios, 'premio', 'premios') }),
        ]),
        ver,
      ]));
    });

    // Días de la semana (lunes primero) y horas pico.
    var dias = [0, 0, 0, 0, 0, 0, 0], horas = {};
    d.horas.forEach(function (h) { dias[(h.dia + 6) % 7] += h.v; horas[h.hora] = (horas[h.hora] || 0) + h.v; });
    var nombres = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'], maxDia = Math.max.apply(null, dias);
    var cd = $('n-dias');
    cd.setAttribute('data-titulo', 'Visitas por día de la semana, últimos 90 días');
    columnas(cd, dias.map(function (v, k) { return { etiqueta: mayus(nombres[k]), corta: mayus(nombres[k].slice(0, 3)), valores: [v] }; }), [{ nombre: 'Visitas', clase: 'acento' }],
      { eje: function (v) { return String(Math.round(v)); }, tip: function (v) { return String(v); } },
      function (gr) { return maxDia > 0 && gr.valores[0] === maxDia; });
    var pico = Object.keys(horas).sort(function (x, y) { return horas[y] - horas[x] || x - y; }).slice(0, 3).map(Number).sort(function (x, y) { return x - y; });
    var hora = function (h) { var x = h % 12 || 12; return x + (h % 24 < 12 ? ' a. m.' : ' p. m.'); };
    // Horas seguidas se juntan: 5, 6 y 7 p. m. → «de 5 p. m. a 8 p. m.».
    var tramos = [];
    pico.forEach(function (h) { var t = tramos[tramos.length - 1]; if (t && t[1] === h) t[1] = h + 1; else tramos.push([h, h + 1]); });
    $('n-horas').textContent = pico.length
      ? 'Tu día más fuerte es el ' + nombres[dias.indexOf(maxDia)] + '. Horas con más visitas: ' + tramos.map(function (t) { return 'de ' + hora(t[0]) + ' a ' + hora(t[1]); }).join(' y ') + '. Úsalo para tus turnos y para lanzar promociones en los días flojos.'
      : '';

    // Clientes que se están yendo.
    var rz = $('n-riesgo');
    rz.textContent = '';
    $('n-riesgo-nota').textContent = 'Vinieron 2 veces o más y no regresan hace más de ' + d.riesgo.dias + ' días. Un mensaje a tiempo los recupera.';
    if (!d.riesgo.clientes.length) rz.appendChild(Sellos.el('li', { texto: 'Nadie por ahora. ¡Bien!' }));
    d.riesgo.clientes.forEach(function (c) {
      var hace = Math.round((Date.now() - Date.parse(c.ultimaVisita.replace(' ', 'T') + 'Z')) / 86400000);
      var nombre = c.nombre.split(' ')[0];
      var ver = Sellos.el('button', { clase: 'boton chico', type: 'button', texto: 'Ver' });
      ver.addEventListener('click', function () { mostrarCliente(c, true); });
      var botones = [ver];
      if (c.recordatorios) {
        var msg = 'Hola ' + nombre + ', te extrañamos en ' + negocio + ' 💈 Tienes ' + c.sellos + ' de ' + meta + ' sellos en tu tarjeta ' + programa + '. ¿Te reservamos una cita esta semana? (Si no deseas recibir estos mensajes, responde BAJA.)';
        botones.push(Sellos.el('a', { clase: 'boton chico primario', href: 'https://wa.me/' + c.celularWa + '?text=' + encodeURIComponent(msg), target: '_blank', rel: 'noopener', texto: 'Escribir por WhatsApp' }));
      }
      rz.appendChild(Sellos.el('li', {}, [
        Sellos.el('div', { clase: 'quien' }, [
          Sellos.el('strong', { texto: c.nombre }),
          Sellos.el('span', { texto: 'Última visita hace ' + hace + ' días · ' + plural(c.visitas, 'visita', 'visitas') + (c.recordatorios ? '' : ' · no aceptó recordatorios') }),
        ]),
        Sellos.el('div', { clase: 'botones chicos' }, botones),
      ]));
    });

    var aj = d.ajustes, en = function (c) { return c ? String(c / 100) : ''; };
    var foco = document.activeElement;
    if (!(foco && foco.tagName === 'INPUT' && $('f-ajustes').contains(foco))) {
      $('a-precio').value = en(aj.precio); $('a-premio').value = en(aj.costoPremio); $('a-inversion').value = en(aj.inversion);
    }
  }
  $('n-mes').addEventListener('change', function () { if (num) pintarNumeros(); });
  var anchoAntes = 0;
  window.addEventListener('resize', function () { var w = $('n-grafico').clientWidth; if (num && Math.abs(w - anchoAntes) > 20) { anchoAntes = w; pintarNumeros(); } });
  $('f-ajustes').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var boton = this.querySelector('button'), msg = $('a-msg');
    boton.disabled = true;
    var r = await pedir(base + '/ajustes', { body: { precio: $('a-precio').value, costoPremio: $('a-premio').value, inversion: $('a-inversion').value } });
    boton.disabled = false;
    if (r.ok) { num = r.datos; boton.focus(); pintarNumeros(); msg.textContent = '✓ Montos guardados.'; msg.className = 'estado ok'; }
    else { msg.textContent = r.datos.error || 'No se pudieron guardar.'; msg.className = 'estado mal'; }
  });

  var enlace = $('enlace-registro');
  enlace.textContent = location.origin + '/' + slug;

  // ---------- inicio ----------
  // Aviso del plan: suspendido o por vencer.
  function avisoPlan(d) {
    if (d.suspendido) { $('suspendido').hidden = false; $('login').hidden = true; $('app').hidden = true; return true; }
    var a = $('aviso-plan');
    if (d.dias !== null && d.dias !== undefined && d.dias <= 7) {
      var f = d.vence.split('-').reverse().join('/');
      a.textContent = d.dias < 0 ? 'Tu plan venció el ' + f + '. Renuévalo para no perder el servicio.'
        : (d.dias === 0 ? 'Tu plan vence hoy.' : 'Tu plan vence el ' + f + ' (en ' + d.dias + (d.dias === 1 ? ' día' : ' días') + ').') + ' Renuévalo para no perder el servicio.';
      a.hidden = false;
    }
    return false;
  }
  (async function () {
    var r = await Sellos.api(base + '/yo');
    if (r.ok && avisoPlan(r.datos)) return;
    if (r.ok && r.datos.sesion) verApp(); else verLogin();
  })();
})();
