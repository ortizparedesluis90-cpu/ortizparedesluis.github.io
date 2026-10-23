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
  var exigirServicio = main.getAttribute('data-pedir') === '1';
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
    if (!document.hidden && !$('app').hidden) { cargarResumen(); cargarCerca(); if (cargados <= 5) cargarClientes(); cargarNumeros(); }
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
    // Con «pedir el servicio», el monto deja de ser opcional.
    if (exigirServicio && tipo === 'sellos') {
      $('c-monto-label').textContent = 'Cobrado en esta visita (S/)';
      $('c-monto-ayuda').textContent = servicios.length ? 'Toca el servicio que se hizo y el monto se llena solo. Si cobraste otro monto, escríbelo.' : 'Escribe cuánto cobraste en esta visita.';
    }
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
    cargarHistorial(c.id);
    if (enfocar) { estado(''); pintarServicios(); $('c-monto').value = ''; $('cliente').focus(); $('cliente').scrollIntoView({ block: 'start' }); }
  }
  // Lo que el cliente se ha hecho: sus servicios de siempre y sus últimas visitas.
  var fechaCorta = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', year: 'numeric' });
  var pidiendoHist = 0;
  async function cargarHistorial(id) {
    var turno = ++pidiendoHist;
    var r = await pedir(base + '/cliente/' + id + '/historial');
    if (turno !== pidiendoHist || !actual || actual.id !== id) return;
    var ul = $('c-hist-lista'), suele = $('c-suele');
    ul.textContent = '';
    var favs = r.ok ? r.datos.favoritos : [];
    suele.hidden = !favs.length;
    suele.textContent = favs.length ? 'Suele pedir: ' + favs.map(function (f) { return f.n + ' (' + f.veces + (f.veces === 1 ? ' vez' : ' veces') + ')'; }).join(', ') : '';
    var movs = r.ok ? r.datos.movimientos : [];
    if (!movs.length) { ul.appendChild(Sellos.el('li', { clase: 'vacio', texto: r.ok ? 'Aún no tiene visitas registradas.' : 'No se pudo cargar su historial.' })); return; }
    movs.forEach(function (m) {
      var que;
      if (m.tipo === 'canje') que = tipo === 'cashback' ? 'Usó ' + solesTxt(m.monto || 0) + ' de saldo' : 'Canjeó: ' + (m.servicio || premio);
      else if (m.tipo === 'traspaso') que = 'Pasó ' + (m.sellos || 0) + ' sello' + (m.sellos === 1 ? '' : 's') + ' de su tarjeta de papel';
      else que = [m.servicio || 'Visita', m.monto ? solesTxt(m.monto) : ''].filter(Boolean).join(' · ');
      ul.appendChild(Sellos.el('li', { clase: 'h-' + m.tipo }, [
        Sellos.el('span', { clase: 'h-fecha', texto: fechaCorta.format(new Date(String(m.creado).replace(' ', 'T') + 'Z')) }),
        Sellos.el('span', { texto: que }),
      ]));
    });
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
    if (exigirServicio && !Number((monto || '0').replace(',', '.')) && !elegidos().length) {
      estado(servicios.length ? 'Elige el servicio que se hizo (o escribe el monto cobrado).' : 'Escribe el monto cobrado en esta visita.', 'mal');
      var primero = $('c-servicios').querySelector('button'); (servicios.length && primero ? primero : $('c-monto')).focus(); return;
    }
    var antes = actual ? { puntos: actual.puntos, saldo: actual.saldo } : { puntos: 0, saldo: 0 };
    // Lo que quedó registrado (servicio y monto), para que el cajero lo confirme de un vistazo.
    var hecho = elegidos().join(' + '), cobro = Number((monto || '0').replace(',', '.'));
    var registro = (hecho || cobro) ? ' Registrado: ' + [hecho, cobro ? solesTxt(Math.round(cobro * 100)) : ''].filter(Boolean).join(', ') + '.' : '';
    accion('sello', { monto: monto, servicios: elegidos() }, this, function (c) {
      $('c-monto').value = ''; pintarServicios();
      if (navigator.vibrate) navigator.vibrate(60);
      if (tipo === 'puntos') return '✓ +' + (c.puntos - antes.puntos) + ' puntos. Ahora tiene ' + c.puntos + '.' + (infoCli(c).listo ? ' Ya puede canjear un premio.' : '');
      if (tipo === 'cashback') return '✓ Ganó ' + solesTxt(c.saldo - antes.saldo) + ' de saldo. Ahora tiene ' + solesTxt(c.saldo) + '.';
      return (c.sellos >= meta ? '✓ Sello sumado. ¡Completó su tarjeta! Ya puede canjear su premio.' : '✓ Sello sumado: ' + c.sellos + ' de ' + meta + '.') + registro;
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
    // Al inicio solo los 5 últimos (el panel queda corto); «Ver más» trae de a 25.
    var r = await pedir(base + '/clientes?desde=' + desde + '&limite=' + (mas ? 25 : 5));
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

  // ---------- escríbeles hoy: cerca del premio y los que dejaron de venir ----------
  function mensajeExtranamos(c) {
    return 'Hola ' + c.nombre.split(' ')[0] + ', te extrañamos en ' + negocio + '. Tienes ' + resumenCli(c) + ' en tu tarjeta ' + programa + '. ¿Te reservamos una cita esta semana? (Si no deseas recibir estos mensajes, responde BAJA.)';
  }
  function filaWa(c, detalle, msg) {
    var ver = Sellos.el('button', { clase: 'boton chico', type: 'button', texto: 'Ver' });
    ver.addEventListener('click', function () { mostrarCliente(c, true); });
    return Sellos.el('li', {}, [
      Sellos.el('div', { clase: 'quien' }, [Sellos.el('strong', { texto: c.nombre }), Sellos.el('span', { texto: detalle })]),
      Sellos.el('div', { clase: 'botones chicos' }, [
        ver,
        Sellos.el('a', { clase: 'boton chico primario', href: 'https://wa.me/' + c.celularWa + '?text=' + encodeURIComponent(msg), target: '_blank', rel: 'noopener', texto: 'Escribir por WhatsApp' }),
      ]),
    ]);
  }
  async function cargarCerca() {
    var r = await pedir(base + '/cerca');
    if (!r.ok) return;
    var ul = $('cerca'), ex = $('extranamos'), d = r.datos;
    ul.textContent = ''; ex.textContent = '';
    d.clientes.forEach(function (c) { var info = infoCli(c); ul.appendChild(filaWa(c, info.detalle, info.msg)); });
    (d.extranamos || []).forEach(function (c) {
      var hace = Math.round((Date.now() - Date.parse(c.ultimaVisita.replace(' ', 'T') + 'Z')) / 86400000);
      ex.appendChild(filaWa(c, 'No viene hace ' + hace + ' días · venía seguido', mensajeExtranamos(c)));
    });
    $('cerca-caja').hidden = !d.clientes.length;
    $('extranamos-caja').hidden = !(d.extranamos || []).length;
    $('escribir-vacio').hidden = !!(d.clientes.length || (d.extranamos || []).length);
    var total = d.clientes.length + (d.extranamos || []).length;
    $('escribir-total').textContent = total ? String(total) : '';
    $('escribir-total').hidden = !total;
  }
  $('recargar').addEventListener('click', function () { cargarCerca(); cargarResumen(); cargarClientes(); cargarNumeros(); });

  // ---------- este mes y tus mejores clientes ----------
  var mesNombre = new Intl.DateTimeFormat('es-PE', { month: 'long', timeZone: 'America/Lima' });
  async function cargarResumen() {
    var r = await pedir(base + '/resumen');
    if (!r.ok) return;
    var d = r.datos, dl = $('res-mes');
    $('mes-nombre').textContent = mesNombre.format(new Date()).replace(/^./, function (x) { return x.toUpperCase(); });
    dl.textContent = '';
    [
      ['Visitas hoy', d.visitasHoy],
      ['Visitas del mes', d.mes.visitas],
      ['Clientes nuevos', d.mes.nuevos],
      [tipo === 'cashback' ? 'Veces que usaron saldo' : 'Premios entregados', d.mes.premios],
    ].forEach(function (p) { dl.appendChild(Sellos.el('div', {}, [Sellos.el('dt', { texto: p[0] }), Sellos.el('dd', { texto: String(p[1]) })])); });
    var ol = $('top');
    ol.textContent = '';
    if (!d.top.length) ol.appendChild(Sellos.el('li', { clase: 'vacio', texto: 'Aquí aparecerán los clientes que más vienen, apenas registres visitas.' }));
    d.top.forEach(function (c, k) {
      var ver = Sellos.el('button', { clase: 'boton chico', type: 'button', texto: 'Ver' });
      ver.addEventListener('click', function () { mostrarCliente(c, true); });
      ol.appendChild(Sellos.el('li', {}, [
        Sellos.el('span', { clase: 'puesto', texto: String(k + 1), 'aria-hidden': 'true' }),
        Sellos.el('div', { clase: 'quien' }, [Sellos.el('strong', { texto: c.nombre }), Sellos.el('span', { texto: c.visitas90 + (c.visitas90 === 1 ? ' visita' : ' visitas') + ' en 3 meses · ' + resumenCli(c) })]),
        ver,
      ]));
    });
  }

  // ---------- tus números (solo si el administrador los activó) ----------
  var numeros = $('t-numeros') && window.Numeros ? Numeros.montar({
    verCliente: function (c) { mostrarCliente(c, true); },
    mensaje: mensajeExtranamos,
  }) : null;
  async function cargarNumeros() {
    if (!numeros) return;
    var r = await pedir(base + '/numeros');
    if (r.ok) numeros.poner(r.datos);
  }

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
