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

  // ---------- sesión ----------
  function verLogin() {
    detenerCamara();
    $('app').hidden = true; $('salir').hidden = true; $('login').hidden = false;
    $('clave').focus();
  }
  function verApp() {
    $('login').hidden = true; $('app').hidden = false; $('salir').hidden = false;
    cargarCerca(); cargarResumen(); cargarClientes();
  }
  // Mientras el panel está abierto, se actualiza solo cada minuto.
  setInterval(function () {
    if (!document.hidden && !$('app').hidden) { cargarResumen(); cargarCerca(); if (cargados <= 25) cargarClientes(); }
  }, 60000);
  async function pedir(url, opciones) {
    var r = await Sellos.api(url, opciones);
    if (r.status === 401) { verLogin(); Sellos.mostrar($('login-error'), 'Tu sesión terminó. Vuelve a ingresar.'); }
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
        $('q').value = qr.data;
        buscar(qr.data);
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
    if (r.ok && r.datos.cliente) { mostrarCliente(r.datos.cliente); estado(exito(r.datos.cliente), 'ok'); cargarCerca(); cargarResumen(); cargarClientes(); }
    else { if (actual) mostrarCliente(actual); estado(r.datos.error || 'No se pudo completar.', 'mal'); }
    return r;
  }
  $('sumar').addEventListener('click', function () {
    accion('sello', {}, this, function (c) {
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
  $('recargar').addEventListener('click', function () { cargarCerca(); cargarResumen(); cargarClientes(); });

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

  var enlace = $('enlace-registro');
  enlace.textContent = location.origin + '/' + slug;

  // ---------- inicio ----------
  (async function () {
    var r = await Sellos.api(base + '/yo');
    if (r.ok && r.datos.sesion) verApp(); else verLogin();
  })();
})();
