/* Panel del negocio: escanear QR, registrar visitas (sellos, puntos o cashback), canjear premios y ver quién está cerca del premio. */
(function () {
  'use strict';
  var main = document.getElementById('principal');
  var slug = main.getAttribute('data-slug');
  var meta = Number(main.getAttribute('data-meta'));
  var premio = main.getAttribute('data-premio');
  var tipo = main.getAttribute('data-tipo') || 'sellos';
  var reglas = JSON.parse(main.getAttribute('data-reglas') || '{}');
  var servicios = JSON.parse(main.getAttribute('data-servicios') || '[]');
  var negocio = main.getAttribute('data-negocio');
  var programa = main.getAttribute('data-programa');
  var base = '/api/n/' + slug;
  var $ = function (id) { return document.getElementById(id); };
  var actual = null; // cliente mostrado
  // El QR de la tarjeta es un enlace .../SLUG/K/CODIGO (antes .../panel#c=CODIGO); también aceptamos el código solo.
  function codigoDe(texto) {
    var m = /[#?&]c=([A-Za-z0-9-]{4,20})/.exec(texto || '') || /\/K\/([A-Za-z0-9-]{4,20})\/?$/i.exec(texto || '');
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
  // Lector nativo del celular (BarcodeDetector) si existe; si no, jsQR sobre el centro de la imagen,
  // en buena resolución, que es donde el cliente pone su QR.
  var stream = null, pista = null, detector = null, lienzo = document.createElement('canvas'), ctx = lienzo.getContext('2d', { willReadFrequently: true }), buscando = false, ocupado = false, vuelta = 0;
  async function abrirCamara() {
    Sellos.mostrar($('buscar-msg'), '');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Sellos.mostrar($('buscar-msg'), 'Este navegador no permite usar la cámara. Escribe el código que aparece debajo del QR.');
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    } catch (e) {
      return Sellos.mostrar($('buscar-msg'), 'No se pudo abrir la cámara (revisa el permiso del navegador). También puedes escribir el código que aparece debajo del QR.');
    }
    pista = stream.getVideoTracks()[0];
    var cap = pista.getCapabilities ? pista.getCapabilities() : {};
    // Enfoque continuo: sin esto algunos celulares enfocan lejos y el QR de cerca sale borroso.
    if (cap.focusMode && cap.focusMode.indexOf('continuous') >= 0) pista.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {});
    $('linterna').hidden = !cap.torch; $('linterna').setAttribute('aria-pressed', 'false');
    if (!detector && 'BarcodeDetector' in window) {
      try {
        var formatos = await window.BarcodeDetector.getSupportedFormats();
        if (formatos.indexOf('qr_code') >= 0) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch (e) { detector = null; }
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
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; pista = null; }
    if ($('camara')) { $('camara').hidden = true; $('escanear').hidden = false; }
  }
  function encontrado(texto) {
    detenerCamara();
    if (navigator.vibrate) navigator.vibrate(80);
    var cod = codigoDe(texto);
    $('q').value = cod;
    buscar(cod);
  }
  var ultimoCuadro = 0;
  async function leer(t) {
    if (!buscando) return;
    var video = $('video');
    if (!ocupado && t - ultimoCuadro > 70 && video.readyState >= 2 && video.videoWidth) {
      ultimoCuadro = t; ocupado = true;
      try {
        if (detector) {
          var codigos = await detector.detect(video);
          if (codigos.length && codigos[0].rawValue) { ocupado = false; return encontrado(codigos[0].rawValue); }
        } else {
          // 3 de cada 4 vueltas: el cuadrado central (donde está la guía) en buena resolución; la otra, la imagen completa.
          var vw = video.videoWidth, vh = video.videoHeight, completa = (vuelta++ % 4) === 3;
          var lado = completa ? Math.max(vw, vh) : Math.min(vw, vh) * 0.8;
          var sx = completa ? 0 : (vw - lado) / 2, sy = completa ? 0 : (vh - lado) / 2, sw = completa ? vw : lado, sh = completa ? vh : lado;
          var esc = Math.min(1, (completa ? 960 : 720) / Math.max(sw, sh));
          lienzo.width = Math.round(sw * esc); lienzo.height = Math.round(sh * esc);
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, lienzo.width, lienzo.height);
          var img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
          var qr = window.jsQR && window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (qr && qr.data) { ocupado = false; return encontrado(qr.data); }
        }
      } catch (e) { /* cuadro no listo: se intenta en el siguiente */ }
      ocupado = false;
    }
    requestAnimationFrame(leer);
  }
  $('linterna').addEventListener('click', function () {
    if (!pista) return;
    var on = this.getAttribute('aria-pressed') !== 'true', b = this;
    pista.applyConstraints({ advanced: [{ torch: on }] }).then(function () { b.setAttribute('aria-pressed', String(on)); }).catch(function () {});
  });
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
        Sellos.el('span', { texto: resumenCli(c) }),
      ]);
      b.addEventListener('click', function () { ul.hidden = true; mostrarCliente(c, true); });
      ul.appendChild(Sellos.el('li', {}, [b]));
    });
    ul.hidden = false;
    ul.querySelector('button').focus();
  }
  $('buscar').addEventListener('submit', function (ev) { ev.preventDefault(); var q = $('q').value.trim(); if (q) buscar(q); });

  // ---------- tipo de programa ----------
  function solesTxt(c) { return 'S/ ' + (c / 100).toFixed(2).replace(/\.00$/, ''); }
  function resumenCli(c) {
    if (tipo === 'puntos') return c.puntos + ' punto' + (c.puntos === 1 ? '' : 's');
    if (tipo === 'cashback') return solesTxt(c.saldo) + ' de saldo';
    return c.sellos + '/' + meta + ' sellos';
  }
  // Estado del cliente: si puede canjear, el texto de avance y el mensaje para escribirle.
  function infoCli(c) {
    var nombre = c.nombre.split(' ')[0], baja = ' (Si no deseas recibir estos mensajes, responde BAJA.)';
    if (tipo === 'puntos') {
      var alc = (reglas.premios || []).filter(function (p) { return p.p <= c.puntos; }), sig = (reglas.premios || []).filter(function (p) { return p.p > c.puntos; })[0];
      var mejor = alc[alc.length - 1];
      return {
        listo: alc.length > 0,
        progreso: 'Tiene ' + c.puntos + ' puntos' + (mejor ? ': puede canjear «' + mejor.n + '».' : sig ? ' · le faltan ' + (sig.p - c.puntos) + ' para «' + sig.n + '».' : '.'),
        detalle: mejor ? 'Puede canjear «' + mejor.n + '»' : sig ? 'Le faltan ' + (sig.p - c.puntos) + ' puntos para «' + sig.n + '»' : c.puntos + ' puntos',
        msg: 'Hola ' + nombre + ', te escribimos de ' + negocio + '. ¡Tienes ' + c.puntos + ' puntos en tu tarjeta ' + programa + '! '
          + (mejor ? 'Ya puedes canjear: ' + mejor.n + '.' : sig ? 'Te faltan solo ' + (sig.p - c.puntos) + ' para ' + sig.n + '.' : '') + ' ¿Te esperamos esta semana?' + baja,
      };
    }
    if (tipo === 'cashback') {
      var ok = c.saldo > 0 && c.saldo >= (reglas.minimo || 0);
      return {
        listo: ok,
        progreso: 'Tiene ' + solesTxt(c.saldo) + ' de saldo' + (ok ? ': puede usarlo en esta compra.' : reglas.minimo ? ' (se usa desde ' + solesTxt(reglas.minimo) + ').' : '.'),
        detalle: 'Tiene ' + solesTxt(c.saldo) + ' de saldo para usar',
        msg: 'Hola ' + nombre + ', te escribimos de ' + negocio + '. ¡Tienes ' + solesTxt(c.saldo) + ' de saldo a favor en tu tarjeta ' + programa + ' para tu próxima compra! ¿Te esperamos esta semana?' + baja,
      };
    }
    var f = faltan(c);
    return {
      listo: c.sellos >= meta,
      progreso: c.sellos >= meta ? '¡Premio listo! Tiene ' + c.sellos + ' sellos: puede canjear «' + premio + '».'
        : c.sellos + ' de ' + meta + ' sellos · le falta' + (f === 1 ? '' : 'n') + ' ' + f + ' para «' + premio + '».',
      detalle: f === 0 ? 'Premio listo para canjear' : 'Le falta' + (f === 1 ? '' : 'n') + ' ' + f + ' sello' + (f === 1 ? '' : 's'),
      msg: f === 0
        ? 'Hola ' + nombre + ', te escribimos de ' + negocio + '. ¡Completaste tu tarjeta ' + programa + '! Tu premio (' + premio + ') te espera. ¿Te reservamos una cita?' + baja
        : 'Hola ' + nombre + ', te escribimos de ' + negocio + '. ¡Te falta' + (f === 1 ? '' : 'n') + ' solo ' + f + ' sello' + (f === 1 ? '' : 's') + ' para ' + premio + '! ¿Te reservamos una cita?' + baja,
    };
  }
  // Botones y textos según el tipo de programa.
  (function () {
    $('sumar').textContent = tipo === 'puntos' ? 'Sumar puntos' : tipo === 'cashback' ? 'Registrar compra' : '+1 sello';
    $('canjear').textContent = tipo === 'puntos' ? 'Canjear puntos' : tipo === 'cashback' ? 'Usar saldo' : 'Canjear premio';
    if (tipo !== 'sellos') {
      $('c-monto-label').textContent = 'Monto de la compra (S/)';
      $('c-monto-ayuda').textContent = tipo === 'puntos' ? 'Con este monto se calculan sus puntos: ' + (reglas.porSol || 1) + ' por cada S/ 1.' : 'Con este monto se calcula su saldo: ' + reglas.pct + ' % de vuelta.';
      $('c-sellos').hidden = true;
    }
  })();
  // Servicios del catálogo: un toque los elige y el monto se suma solo.
  function pintarServicios() {
    var caja = $('c-servicios');
    caja.textContent = '';
    caja.hidden = !servicios.length;
    servicios.forEach(function (sv) {
      var b = Sellos.el('button', { clase: 'chip-servicio', type: 'button', 'aria-pressed': 'false' }, [Sellos.el('span', { texto: sv.n }), Sellos.el('small', { texto: solesTxt(sv.p) })]);
      b.addEventListener('click', function () {
        b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
        var total = 0;
        caja.querySelectorAll('[aria-pressed=true]').forEach(function (x, k) { total += servicios[Array.prototype.indexOf.call(caja.children, x)].p; });
        $('c-monto').value = total ? String(total / 100) : '';
      });
      caja.appendChild(b);
    });
  }
  function elegidos() {
    var caja = $('c-servicios');
    return Array.prototype.filter.call(caja.children, function (x) { return x.getAttribute('aria-pressed') === 'true'; })
      .map(function (x) { return servicios[Array.prototype.indexOf.call(caja.children, x)].n; });
  }

  // ---------- cliente ----------
  function faltan(c) { return Math.max(0, meta - c.sellos); }
  function mostrarCliente(c, enfocar) {
    actual = c;
    $('cliente').hidden = false;
    $('c-nombre').textContent = c.nombre;
    $('c-codigo').textContent = c.codigo.replace(/(.{4})(.{4})/, '$1 $2');
    $('c-celular').textContent = c.celular + ' · ' + c.visitas + ' visita' + (c.visitas === 1 ? '' : 's') + ' · ' + c.premios + ' premio' + (c.premios === 1 ? '' : 's') + ' canjeado' + (c.premios === 1 ? '' : 's');
    if (tipo === 'sellos') Sellos.casillas($('c-sellos'), c.sellos, meta);
    var info = infoCli(c);
    $('c-progreso').textContent = info.progreso;
    $('canjear').disabled = !info.listo;
    $('c-canje').hidden = true;
    $('c-recordatorios').checked = c.recordatorios;
    // Sellos de papel: solo en tarjetas de sellos y mientras no se hayan pasado.
    $('c-papel').hidden = tipo !== 'sellos' || !!c.traspaso;
    if (enfocar) { $('c-papel').open = false; $('c-papel-n').value = ''; }
    var texto = 'Hola ' + c.nombre.split(' ')[0] + ', esta es tu tarjeta ' + programa + ' de ' + negocio + ': ' + c.enlace;
    $('reenviar').href = 'https://wa.me/' + c.celularWa + '?text=' + encodeURIComponent(texto);
    if (enfocar) { estado(''); pintarServicios(); $('c-monto').value = ''; $('cliente').focus(); $('cliente').scrollIntoView({ block: 'start' }); }
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
    if (tipo !== 'sellos' && !Number((monto || '0').replace(',', '.'))) { estado('Escribe el monto de la compra o elige los servicios.', 'mal'); $('c-monto').focus(); return; }
    var antes = actual ? { puntos: actual.puntos, saldo: actual.saldo } : { puntos: 0, saldo: 0 };
    accion('sello', { monto: monto, servicios: elegidos() }, this, function (c) {
      $('c-monto').value = ''; pintarServicios();
      if (navigator.vibrate) navigator.vibrate(60);
      if (tipo === 'puntos') return '✓ +' + (c.puntos - antes.puntos) + ' puntos. Ahora tiene ' + c.puntos + '.' + (infoCli(c).listo ? ' Ya puede canjear un premio.' : '');
      if (tipo === 'cashback') return '✓ Ganó ' + solesTxt(c.saldo - antes.saldo) + ' de saldo. Ahora tiene ' + solesTxt(c.saldo) + '.';
      return c.sellos >= meta ? '✓ Sello sumado. ¡Completó su tarjeta! Ya puede canjear su premio.' : '✓ Sello sumado: ' + c.sellos + ' de ' + meta + '.';
    });
  });
  $('canjear').addEventListener('click', function () {
    if (!actual) return;
    var boton = this;
    if (tipo === 'sellos') {
      if (!confirm('¿Entregar «' + premio + '» a ' + actual.nombre + '? Se descontarán ' + meta + ' sellos.')) return;
      return accion('canje', {}, boton, function () { return '✓ Premio canjeado. Su tarjeta empieza de nuevo.'; });
    }
    // Puntos: elige un premio que le alcance. Cashback: cuánto saldo usar en esta compra.
    var caja = $('c-canje');
    caja.textContent = '';
    if (tipo === 'puntos') {
      caja.appendChild(Sellos.el('p', { clase: 'nota', texto: 'Elige el premio que se lleva:' }));
      (reglas.premios || []).forEach(function (p, i) {
        var b = Sellos.el('button', { clase: 'boton', type: 'button', texto: p.n + ' · ' + p.p + ' pts' });
        b.disabled = p.p > actual.puntos;
        b.addEventListener('click', function () {
          if (!confirm('¿Entregar «' + p.n + '» a ' + actual.nombre + '? Se descontarán ' + p.p + ' puntos.')) return;
          accion('canje', { premio: i }, b, function (c) { return '✓ Canjeó «' + p.n + '». Le quedan ' + c.puntos + ' puntos.'; });
        });
        caja.appendChild(b);
      });
    } else {
      var inp = Sellos.el('input', { id: 'c-usar', type: 'text', inputmode: 'decimal', maxlength: '9', value: String(actual.saldo / 100) });
      var b = Sellos.el('button', { clase: 'boton primario', type: 'button', texto: 'Descontar de esta compra' });
      b.addEventListener('click', function () {
        var v = inp.value.trim();
        if (!/^\d{1,6}([.,]\d{1,2})?$/.test(v)) return estado('Escribe el monto solo con números.', 'mal');
        accion('canje', { monto: v }, b, function (c) { return '✓ Se descontaron S/ ' + v + '. Le queda ' + solesTxt(c.saldo) + ' de saldo.'; });
      });
      caja.appendChild(Sellos.el('label', { for: 'c-usar', texto: 'Saldo a usar (S/), máximo ' + solesTxt(actual.saldo) }));
      caja.appendChild(Sellos.el('div', { clase: 'fila-input' }, [inp, b]));
    }
    caja.hidden = false;
    var primero = caja.querySelector('button:not([disabled]), input'); if (primero) primero.focus();
  });
  $('deshacer').addEventListener('click', function () {
    accion('deshacer', {}, this, function (c) { return 'Se deshizo el último registro. Ahora tiene ' + resumenCli(c) + '.'; });
  });
  $('c-papel-btn').addEventListener('click', function () {
    if (!actual) return;
    var n = Number($('c-papel-n').value);
    if (!(n >= 1 && n <= meta && Math.round(n) === n)) { estado('Escribe cuántos sellos tenía en papel: de 1 a ' + meta + '.', 'mal'); $('c-papel-n').focus(); return; }
    if (!confirm('¿Pasar ' + n + ' sello' + (n === 1 ? '' : 's') + ' de papel a ' + actual.nombre + '? Se hace una sola vez. Quédate con su tarjeta de papel.')) return;
    accion('traspaso', { sellos: n }, this, function (c) {
      return '✓ Se pasaron ' + n + ' sello' + (n === 1 ? '' : 's') + ' de papel: ahora tiene ' + c.sellos + ' de ' + meta + '.' + (c.sellos >= meta ? ' ¡Ya puede canjear su premio!' : '');
    });
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
          Sellos.el('span', { texto: resumenCli(c) + ' · se registró el ' + cuando + (c.origen === 'qr' ? ' (QR del cartel)' : '') }),
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
      var info = infoCli(c), detalle = info.detalle, msg = info.msg;
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
  var nombreMes = new Intl.DateTimeFormat('es-PE', { month: 'long', timeZone: 'UTC' });
  var mesCorto = new Intl.DateTimeFormat('es-PE', { month: 'short', timeZone: 'UTC' });
  function plata(c) { return soles.format(Math.round(c / 100)); }
  function mesDe(m, corto) { return (corto ? mesCorto : nombreMes).format(new Date(m + '-15T12:00:00Z')).replace('.', '').toLowerCase(); }
  function mayus(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function compacto(c) { var s = c / 100; return 'S/ ' + (Math.abs(s) >= 1000 ? (Math.round(s / 100) / 10) + ' mil' : Math.round(s)); }
  function plural(x, uno, varios) { return x + ' ' + (x === 1 ? uno : varios); }
  var num = null, real = null, viendoEjemplo = false, anchoAntes = 0;

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
    if (!r.ok) return;
    real = r.datos; servicios = r.datos.servicios || servicios;
    if (!viendoEjemplo) { num = real; pintarNumeros(); }
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
    var ej = viendoEjemplo, sinPrecio = !d.ajustes.precio;
    // Sin precio, lo primero es preguntarlo; sin visitas, se ofrece un ejemplo.
    $('n-inicio').hidden = ej || !!real.ajustes.precio;
    $('n-vacio').hidden = ej || real.meses.some(function (x) { return x.visitas; });
    $('n-ejemplo').hidden = !ej;

    // El número principal: lo que dejaron los clientes con tarjeta en el mes.
    var heroe = $('n-heroe'), enCurso = i === d.meses.length - 1;
    heroe.textContent = '';
    heroe.appendChild(Sellos.el('p', { clase: 'heroe-titulo', texto: (enCurso ? 'Este mes' : 'En ' + mesDe(m.mes)) + ' tus clientes con tarjeta te dejaron' }));
    var vacio = sinPrecio || !m.visitas;
    heroe.appendChild(Sellos.el('p', { clase: 'heroe-valor', texto: vacio ? '—' : plata(m.ingresos) }));
    heroe.appendChild(Sellos.el('p', { clase: 'heroe-nota', texto: sinPrecio ? 'Escribe arriba cuánto cobras por servicio para ver cuánto te dejan tus clientes.'
      : !m.visitas ? 'Aún no hay visitas en ' + mesDe(m.mes) + '. Apenas registres visitas, aquí verás cuánto te dejan.'
      : plural(m.visitas, 'visita', 'visitas') + ' · ' + plural(m.volvieron, 'cliente volvió', 'clientes volvieron') }));
    var cm = !vacio && a && cambio(m.ingresos, a0.ingresos, antes);
    if (cm) heroe.appendChild(Sellos.el('p', { clase: 'dato-nota cambio ' + cm.clase, texto: cm.texto }));

    // Lo que se pierde: los que dejaron de venir, si volvieran a su ritmo de siempre.
    var f = d.fidelidad;
    var perdidos = d.riesgo.total == null ? d.riesgo.clientes.length : d.riesgo.total;
    var perdida = Math.round(perdidos * d.ajustes.precio * 30 / (f.cadaDias || 30));
    tiles($('n-datos'), [
      ['Clientes nuevos', m.nuevos, 'Crearon su tarjeta', a && cambio(m.nuevos, a0.nuevos, antes)],
      ['Clientes que volvieron', m.volvieron, 'de ' + plural(m.clientes, 'cliente', 'clientes') + ' que vinieron', a && cambio(m.volvieron, a0.volvieron, antes)],
      ['Visitas', m.visitas, 'Veces que vinieron en total', a && cambio(m.visitas, a0.visitas, antes)],
      d.tipo === 'cashback' ? ['Saldo usado', plata(m.premios), plural(m.canjes, 'vez', 'veces') + ' que usaron su saldo'] : ['Premios entregados', m.canjes, 'Premios que canjearon'],
      ['Dejaron de venir', perdidos, perdidos && !sinPrecio ? 'Dejas de ganar ' + plata(perdida) + ' al mes. Escríbeles abajo.' : 'Nadie se te ha ido'],
    ]);

    // 6 meses: lo que dejaron los clientes con tarjeta.
    var g = $('n-grafico');
    anchoAntes = g.clientWidth;
    g.setAttribute('data-titulo', 'Lo que te dejaron tus clientes con tarjeta, por mes');
    columnas(g, d.meses.map(function (x, k) {
      return { etiqueta: mayus(mesDe(x.mes)) + ' ' + x.mes.slice(0, 4), corta: mayus(mesDe(x.mes, true)), actual: k === i, valores: [x.ingresos],
        extra: plural(x.visitas, 'visita', 'visitas') + ' · ' + plural(x.nuevos, 'cliente nuevo', 'clientes nuevos') };
    }), [{ nombre: 'Te dejaron', clase: 'acento' }], { eje: compacto, tip: plata });
    var tabla = $('n-tabla');
    tabla.textContent = '';
    var cab = Sellos.el('tr', {}, ['Mes', 'Te dejaron', 'Visitas', 'Nuevos', 'Volvieron', 'Premios'].map(function (t) { return Sellos.el('th', { scope: 'col', texto: t }); }));
    tabla.appendChild(Sellos.el('thead', {}, [cab]));
    tabla.appendChild(Sellos.el('tbody', {}, d.meses.slice().reverse().map(function (x) {
      return Sellos.el('tr', {}, [mayus(mesDe(x.mes)) + ' ' + x.mes.slice(0, 4), plata(x.ingresos), x.visitas, x.nuevos, x.volvieron, d.tipo === 'cashback' ? plata(x.premios) : x.canjes]
        .map(function (v, k) { return Sellos.el(k ? 'td' : 'th', k ? { texto: String(v) } : { scope: 'row', texto: String(v) }); }));
    })));

    // Ranking de clientes.
    var top = $('n-top');
    top.textContent = '';
    if (!d.top.length) top.appendChild(Sellos.el('li', { texto: 'Aún no hay visitas en los últimos 90 días.' }));
    d.top.forEach(function (c, k) {
      var ver = ej ? null : Sellos.el('button', { clase: 'boton chico', type: 'button', texto: 'Ver' });
      if (ver) ver.addEventListener('click', function () { mostrarCliente(c, true); });
      top.appendChild(Sellos.el('li', {}, [
        Sellos.el('span', { clase: 'puesto', texto: String(k + 1), 'aria-hidden': 'true' }),
        Sellos.el('div', { clase: 'quien' }, [
          Sellos.el('strong', { texto: c.nombre }),
          Sellos.el('span', { texto: plural(c.visitas90, 'visita', 'visitas') + (sinPrecio ? '' : ' · ' + plata(c.gasto90)) + ' · ' + plural(c.premios, 'premio', 'premios') }),
        ]),
        ver,
      ]));
    });

    // Servicios más vendidos.
    var vend = d.vendidos || [];
    $('n-vendidos-caja').hidden = !vend.length;
    var ol = $('n-vendidos'); ol.textContent = '';
    vend.forEach(function (x, k) {
      ol.appendChild(Sellos.el('li', {}, [
        Sellos.el('span', { clase: 'puesto', texto: String(k + 1), 'aria-hidden': 'true' }),
        Sellos.el('div', { clase: 'quien' }, [Sellos.el('strong', { texto: x.n }), Sellos.el('span', { texto: plural(x.veces, 'vez', 'veces') + ' · ' + plata(x.ingresos) })]),
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
      ? 'Tu día más fuerte es el ' + nombres[dias.indexOf(maxDia)] + '. Horas con más visitas: ' + tramos.map(function (t) { return 'de ' + hora(t[0]) + ' a ' + hora(t[1]); }).join(' y ') + ' Úsalo para tus turnos y para lanzar promociones en los días flojos.'
      : '';

    // Clientes que se están yendo.
    var rz = $('n-riesgo');
    rz.textContent = '';
    $('n-riesgo-nota').textContent = 'Vinieron 2 veces o más y no regresan hace más de ' + d.riesgo.dias + ' días.'
      + (perdidos && !sinPrecio ? ' Si vuelven a su ritmo de siempre, son unos ' + plata(perdida) + ' más al mes.' : '') + ' Un mensaje a tiempo los recupera.';
    if (!d.riesgo.clientes.length) rz.appendChild(Sellos.el('li', { texto: 'Nadie por ahora. ¡Bien!' }));
    d.riesgo.clientes.forEach(function (c) {
      var hace = Math.round((Date.now() - Date.parse(c.ultimaVisita.replace(' ', 'T') + 'Z')) / 86400000);
      var nombre = c.nombre.split(' ')[0];
      var botones = [];
      if (!ej) {
        var ver = Sellos.el('button', { clase: 'boton chico', type: 'button', texto: 'Ver' });
        ver.addEventListener('click', function () { mostrarCliente(c, true); });
        botones.push(ver);
      }
      if (c.recordatorios && !ej) {
        var msg = 'Hola ' + nombre + ', te extrañamos en ' + negocio + ' 💈 Tienes ' + resumenCli(c) + ' en tu tarjeta ' + programa + '. ¿Te reservamos una cita esta semana? (Si no deseas recibir estos mensajes, responde BAJA.)';
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
      $('a-precio').value = en(aj.precio); $('a-premio').value = en(aj.costoPremio);
      if (!ej) $('a-servicios').value = (d.servicios || []).map(function (x) { return x.n + ' = ' + x.p / 100; }).join('\n');
    }
  }
  $('n-mes').addEventListener('change', function () { if (num) pintarNumeros(); });

  // Ejemplo con datos inventados, para ver cómo se llena «Tus números» antes de tener visitas.
  function ejemplo() {
    var p = real.ajustes.precio || 3500, cp = real.ajustes.costoPremio || p;
    var vis = [38, 52, 61, 74, 70, 48], reg = [.45, .55, .6, .66, .7, .74], can = [0, 1, 2, 3, 3, 2], nue = [22, 18, 15, 14, 12, 7];
    var mes = function (k, f) {
      f = f || 1;
      var v = Math.round(vis[k] * f), r = Math.round(v * reg[k]), c = Math.round(can[k] * f);
      var x = { mes: real.meses[k].mes, visitas: v, regreso: r, volvieron: Math.round(r * .85), clientes: Math.round(v * .8), nuevos: Math.round(nue[k] * f), canjes: c,
        ingresos: v * p, ingresosRegreso: r * p, premios: c * cp };
      return x;
    };
    var hoy = real.anteriorAlDia.hasta, ant = mes(4, hoy / 30);
    ant.hasta = hoy;
    var horas = [];
    [6, 12, 10, 13, 16, 24, 28].forEach(function (total, dia) {
      [10, 11, 12, 15, 16, 17, 18, 19].forEach(function (h, k) { horas.push({ dia: dia, hora: h, v: Math.max(1, Math.round(total * [.6, .7, .5, .6, .8, 1.4, 1.6, 1.2][k] / 7.4 * 3)) }); });
    });
    var persona = function (nombre, v, premios, dias) {
      return { nombre: nombre, visitas90: v, gasto90: v * p, premios: premios, visitas: v + 4, sellos: v % 10, puntos: v * 30, saldo: v * 150, recordatorios: true, ultimaVisita: new Date(Date.now() - dias * 864e5).toISOString().slice(0, 19).replace('T', ' ') };
    };
    return {
      ajustes: { precio: p, costoPremio: real.ajustes.costoPremio }, meses: [0, 1, 2, 3, 4, 5].map(function (k) { return mes(k); }), anteriorAlDia: ant,
      top: [persona('Carlos R.', 9, 1, 3), persona('Luis T.', 8, 1, 6), persona('Diego F.', 7, 0, 2), persona('Jorge C.', 7, 0, 9), persona('Miguel A.', 6, 0, 12)],
      horas: horas, fidelidad: { clientes: 124, repiten: 79, cadaDias: 24 }, tipo: real.tipo,
      vendidos: (real.servicios.length ? real.servicios : [{ n: 'Servicio A', p: p }, { n: 'Servicio B', p: Math.round(p * 0.6) }, { n: 'Servicio C', p: Math.round(p * 1.4) }])
        .slice(0, 5).map(function (x, k) { var v = [46, 31, 22, 14, 9][k]; return { n: x.n, veces: v, ingresos: v * x.p }; }),
      riesgo: { dias: 45, total: 9, clientes: [persona('Andrés V.', 6, 0, 52), persona('Kevin H.', 4, 0, 61), persona('Piero C.', 3, 0, 75)] },
    };
  }
  $('n-ver-ejemplo').addEventListener('click', function () { viendoEjemplo = true; num = ejemplo(); pintarNumeros(); $('n-salir-ejemplo').focus(); });
  $('n-salir-ejemplo').addEventListener('click', function () { viendoEjemplo = false; num = real; pintarNumeros(); $('n-ver-ejemplo').hidden || $('t-numeros').focus(); });
  $('n-inicio').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var v = $('i-precio').value.trim(), msg = $('i-msg'), boton = this.querySelector('button');
    if (!/^\d{1,6}([.,]\d{1,2})?$/.test(v) || !Number(v.replace(',', '.'))) { msg.textContent = 'Escribe el monto solo con números, por ejemplo 35.'; msg.className = 'estado mal'; return; }
    var en = function (c) { return c ? String(c / 100) : ''; };
    boton.disabled = true;
    var r = await pedir(base + '/ajustes', { body: { precio: v, costoPremio: en(real.ajustes.costoPremio) } });
    boton.disabled = false;
    if (!r.ok) { msg.textContent = r.datos.error || 'No se pudo guardar.'; msg.className = 'estado mal'; return; }
    real = r.datos; viendoEjemplo = false; num = real; pintarNumeros();
    $('a-msg').textContent = '✓ Listo: ya calculamos tus números con S/ ' + v + ' por servicio.'; $('a-msg').className = 'estado ok';
    $('n-heroe').focus();
  });
  window.addEventListener('resize', function () { var w = $('n-grafico').clientWidth; if (num && Math.abs(w - anchoAntes) > 20) { anchoAntes = w; pintarNumeros(); } });
  $('f-ajustes').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var boton = this.querySelector('button'), msg = $('a-msg');
    boton.disabled = true;
    var r = await pedir(base + '/ajustes', { body: { precio: $('a-precio').value, costoPremio: $('a-premio').value, servicios: $('a-servicios').value } });
    boton.disabled = false;
    if (r.ok) { real = num = r.datos; servicios = r.datos.servicios || []; viendoEjemplo = false; boton.focus(); pintarNumeros(); msg.textContent = '✓ Montos guardados.'; msg.className = 'estado ok'; }
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
