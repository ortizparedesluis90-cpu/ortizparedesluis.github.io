/* Administración: crear y editar negocios, su diseño y ver su actividad. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var negocios = [];
  var cat = null; // catálogo de opciones de diseño
  var diseno = {};
  var CAMPOS_D = ['fondoColor', 'acento', 'tipografia', 'fondo', 'animacion', 'oscurecer', 'tarjeta', 'forma', 'icono', 'esquinas'];

  function verLogin() { $('app').hidden = true; $('salir').hidden = true; $('login').hidden = false; $('clave').focus(); }
  function verApp() { $('login').hidden = true; $('app').hidden = false; $('salir').hidden = false; }

  // ---------- lista de negocios ----------
  async function cargar() {
    var r = await Sellos.api('/api/admin/negocios');
    if (r.status === 401) return verLogin();
    if (!r.ok) return;
    verApp();
    if (!cat) await cargarCatalogo();
    negocios = r.datos.negocios;
    planes = r.datos.planes || {};
    cargarRendimiento();
    var tb = $('negocios');
    tb.textContent = '';
    resumenCobros();
    if (!negocios.length) {
      tb.appendChild(Sellos.el('tr', {}, [Sellos.el('td', { colspan: '7', texto: 'Aún no hay negocios. Agrega el primero abajo.' })]));
      return;
    }
    negocios.forEach(function (n) {
      var editar = Sellos.el('button', { clase: 'boton chico', type: 'button', texto: 'Editar' });
      editar.addEventListener('click', function () { llenar(n); });
      tb.appendChild(Sellos.el('tr', {}, [
        Sellos.el('td', {}, [Sellos.el('strong', { texto: n.nombre }), Sellos.el('br'), Sellos.el('span', { clase: 'nota', texto: n.programa + ' · ' + resumenPrograma(n) }), Sellos.el('br'), botonNumeros(n.slug)]),
        Sellos.el('td', { texto: String(n.clientes) }),
        Sellos.el('td', { texto: String(n.escaneos30) }),
        Sellos.el('td', { texto: String(n.visitas30) }),
        Sellos.el('td', { texto: String(n.cerca) }),
        celdaPlan(n),
        Sellos.el('td', {}, [
          Sellos.el('a', { href: '/' + n.slug, texto: 'Registro' }),
          Sellos.el('a', { href: '/' + n.slug + '/panel', texto: 'Panel' }),
          n.gestion ? Sellos.el('a', { href: '/' + n.slug + '/gestion', texto: 'Gestión' }) : null,
          Sellos.el('a', { href: '/' + n.slug + '/cartel', texto: 'Cartel QR' }),
          Sellos.el('a', { href: '/' + n.slug + '/privacidad', texto: 'Privacidad' }),
          editar,
        ]),
      ]));
    });
  }

  // ---------- rendimiento de cada negocio ----------
  var soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 });
  var mesLargo = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  function plata(c) { return (c < 0 ? '− ' : '') + soles.format(Math.round(Math.abs(c) / 100)); }
  function nombreMes(m) { return mesLargo.format(new Date(m + '-15T12:00:00Z')).toLowerCase(); }
  function cambio(ahora, antes) {
    if (!antes) return null;
    var p = Math.round((ahora - antes) / antes * 100);
    return p ? (p > 0 ? '▲ +' : '▼ ') + p + ' %' : '= igual';
  }
  function plural(x, uno, varios) { return x + ' ' + (x === 1 ? uno : varios); }
  function retorno(x) { var costo = x.premios + x.inversion; return costo > 0 ? 'S/ ' + (x.ingresosRegreso / costo).toFixed(2) : '—'; }
  async function cargarRendimiento() {
    var r = await Sellos.api('/api/admin/rendimiento');
    if (!r.ok) return;
    var d = r.datos, tb = $('rendimiento'), corto = d.anterior ? '1–' + d.dia + ' de ' + nombreMes(d.anterior).split(' ')[0] : '';
    $('r-mes').textContent = nombreMes(d.mes).replace(/^./, function (c) { return c.toUpperCase(); }) + ' (en curso)';
    $('r-nota').textContent = 'Del 1 al ' + d.dia + ' de este mes. Las flechas comparan con el ' + corto + '.';
    var t = { visitas: 0, regreso: 0, ganancia: 0, riesgo: 0, positivos: 0, conMontos: 0 };
    tb.textContent = '';
    d.negocios.forEach(function (n) {
      var x = n.actual, a = n.anteriorAlDia;
      t.visitas += x.visitas; t.regreso += x.ingresosRegreso; t.riesgo += n.riesgo;
      if (n.conMontos) { t.conMontos++; t.ganancia += x.ganancia; if (x.ganancia > 0) t.positivos++; }
      var celda = function (texto, delta) {
        return Sellos.el('td', {}, [document.createTextNode(texto), delta ? Sellos.el('span', { clase: 'dato-nota cambio ' + (/▲/.test(delta) ? 'sube' : /▼/.test(delta) ? 'baja' : ''), texto: delta }) : null]);
      };
      var neg = negocios.filter(function (m) { return m.slug === n.slug; })[0];
      var wa = '';
      try { wa = JSON.parse((neg && neg.redes) || '{}').whatsapp || ''; } catch (e) { wa = ''; }
      var informe = 'Hola, te comparto cómo va tu programa de fidelización en ' + n.nombre + ' (del 1 al ' + d.dia + ' de ' + nombreMes(d.mes).split(' ')[0] + '):\n'
        + '• ' + x.visitas + ' visitas registradas' + (a && cambio(x.visitas, a.visitas) ? ' (' + cambio(x.visitas, a.visitas) + ' vs. el mes pasado a la misma fecha)' : '') + '\n'
        + (n.conMontos ? '• Tus clientes con tarjeta te dejaron ' + plata(x.ingresos) + '\n' : '')
        + '• ' + x.volvieron + (x.volvieron === 1 ? ' cliente volvió' : ' clientes volvieron') + '\n'
        + (n.riesgo ? '• ' + n.riesgo + (n.riesgo === 1 ? ' cliente dejó' : ' clientes dejaron') + ' de venir: aparecen en «Escríbeles hoy» de tu panel.\n' : '')
        + 'A fin de mes te mando tu reporte completo.';
      var acciones = [botonNumeros(n.slug)];
      acciones.push(wa
        ? Sellos.el('a', { href: 'https://wa.me/' + wa + '?text=' + encodeURIComponent(informe), target: '_blank', rel: 'noopener', texto: 'Enviar por WhatsApp' })
        : Sellos.el('span', { clase: 'nota', texto: 'Sin WhatsApp del negocio' }));
      tb.appendChild(Sellos.el('tr', {}, [
        Sellos.el('td', {}, [Sellos.el('strong', { texto: n.nombre }), n.conMontos ? null : Sellos.el('span', { clase: 'dato-nota alerta', texto: 'Falta su precio promedio («Editar» → 3. Servicios y precios)' })]),
        celda(String(x.visitas), a && cambio(x.visitas, a.visitas)),
        celda(n.conMontos ? plata(x.ingresosRegreso) : x.volvieron + ' clientes', a && cambio(n.conMontos ? x.ingresosRegreso : x.volvieron, n.conMontos ? a.ingresosRegreso : a.volvieron)),
        celda(n.conMontos ? plata(x.ganancia) : '—'),
        celda(n.conMontos ? retorno(x) : '—'),
        celda(String(n.riesgo)),
        Sellos.el('td', {}, acciones),
      ]));
    });
    if (!d.negocios.length) tb.appendChild(Sellos.el('tr', {}, [Sellos.el('td', { colspan: '7', texto: 'Aún no hay negocios.' })]));
    // Lo que cobras cada mes: cuotas de los negocios activos que ya pagan.
    var cobro = { total: 0, pagan: 0, gratis: 0 };
    negocios.forEach(function (n) {
      if (n.suspendido) return;
      if (n.plan === 'prueba') { cobro.gratis++; return; }
      if (n.plan !== 'cortesia' && n.cuota) { cobro.total += n.cuota; cobro.pagan++; }
    });
    var dl = $('r-total');
    dl.textContent = '';
    [
      ['Cobras al mes', plata(cobro.total), plural(cobro.pagan, 'negocio paga', 'negocios pagan') + (cobro.gratis ? ' · ' + cobro.gratis + ' en mes gratis' : '')],
      ['Visitas en todos tus negocios', String(t.visitas), 'Este mes'],
      ['Dejaron los clientes que regresan', plata(t.regreso), 'En los negocios con sus montos'],
      ['Negocios con ganancia', t.positivos + ' de ' + t.conMontos, t.conMontos < d.negocios.length ? (d.negocios.length - t.conMontos) + ' sin montos configurados' : 'Todos con montos'],
      ['Clientes que dejaron de venir', String(t.riesgo), 'Sin visitas en ' + d.diasRiesgo + ' días'],
    ].forEach(function (p) {
      dl.appendChild(Sellos.el('div', {}, [Sellos.el('dt', { texto: p[0] }), Sellos.el('dd', {}, [document.createTextNode(p[1]), Sellos.el('span', { clase: 'dato-nota', texto: p[2] })])]));
    });
  }

  // ---------- números de un negocio (antes en su panel) ----------
  function botonNumeros(slug) {
    var b = Sellos.el('button', { clase: 'boton chico primario', type: 'button', texto: 'Ver números' });
    b.addEventListener('click', function () { verNumeros(slug); });
    return b;
  }
  var detalle = null, numeros = window.Numeros ? Numeros.montar({ quien: 'sus clientes con tarjeta le dejaron', alPintar: alPintar }) : null;
  function alPintar(d, m) {
    if (!detalle) return;
    var neg = detalle.negocio;
    $('det-reporte').href = '/admin/reporte?n=' + encodeURIComponent(neg.slug) + '&mes=' + m.mes;
    var texto = Numeros.mensaje(neg, d, m.mes);
    $('det-wa').href = neg.whatsapp ? 'https://wa.me/' + neg.whatsapp + '?text=' + encodeURIComponent(texto) : 'https://wa.me/?text=' + encodeURIComponent(texto);
  }
  async function verNumeros(slug) {
    var r = await Sellos.api('/api/admin/numeros?n=' + encodeURIComponent(slug));
    if (!r.ok) return alert(r.datos.error || 'No se pudieron cargar los números.');
    detalle = r.datos;
    var neg = detalle.negocio, caja = $('det-logo');
    $('det-nombre').textContent = neg.nombre;
    caja.textContent = '';
    if (neg.logo) caja.appendChild(Sellos.el('img', { src: '/m/' + neg.logo, alt: '' }));
    else caja.textContent = neg.nombre.charAt(0).toUpperCase();
    var al = detalle.alcance, dl = $('det-alcance');
    var conversion = al.aperturas30 ? Math.min(100, Math.round(al.tarjetasNuevas30 / al.aperturas30 * 100)) + ' %' : '—';
    dl.textContent = '';
    [
      ['Escaneos del QR', al.escaneosQr30, 'Hoy: ' + al.escaneosQrHoy],
      ['Abrieron su enlace', al.aperturas30, 'Contando QR, bio y WhatsApp'],
      ['Tarjetas nuevas', al.tarjetasNuevas30, al.tarjetasDesdeQr30 + ' desde el QR'],
      ['Crean su tarjeta', conversion, 'De quienes abren el enlace'],
      ['Clientes con tarjeta', al.clientes, al.conRecordatorios + ' aceptan recordatorios'],
    ].forEach(function (p) {
      dl.appendChild(Sellos.el('div', {}, [Sellos.el('dt', { texto: p[0] }), Sellos.el('dd', {}, [document.createTextNode(String(p[1])), Sellos.el('span', { clase: 'dato-nota', texto: p[2] })])]));
    });
    $('detalle').hidden = false;
    numeros.poner(detalle);
    $('detalle').focus();
    $('detalle').scrollIntoView({ block: 'start' });
  }
  $('det-cerrar').addEventListener('click', function () { $('detalle').hidden = true; detalle = null; $('t-negocios').scrollIntoView(); });

  // ---------- tipo de tarjeta ----------
  function reglasDe(n) { try { return JSON.parse(n.reglas || '{}') || {}; } catch (e) { return {}; } }
  function serviciosDe(n) { try { return JSON.parse(n.servicios || '[]') || []; } catch (e) { return []; } }
  function resumenPrograma(n) {
    var r = reglasDe(n);
    if (n.tipo === 'puntos') return 'Puntos: ' + (r.porSol || 1) + ' por S/ 1 · ' + (r.premios || []).length + ' premios';
    if (n.tipo === 'cashback') return 'Cashback: ' + (r.pct || 5) + ' % de vuelta';
    return n.meta + ' sellos → ' + n.premio + ((r.hitos || []).length ? ' · ' + r.hitos.length + ' premio' + (r.hitos.length === 1 ? '' : 's') + ' en el camino' : '');
  }
  // Muestra solo los campos del tipo elegido; los ocultos no son obligatorios.
  function mostrarTipo() {
    var tipo = $('f-tipo').value;
    Array.prototype.forEach.call(document.querySelectorAll('[data-solo]'), function (c) {
      var ver = c.getAttribute('data-solo') === tipo; c.hidden = !ver;
      Array.prototype.forEach.call(c.querySelectorAll('input,textarea'), function (i) { if (i.name === 'premio') i.required = ver; });
    });
  }
  $('f-tipo').addEventListener('change', function () { mostrarTipo(); vistaPrevia(); });

  // ---------- vencimientos y cobros ----------
  var planes = {};
  function fecha(f) { if (!f) return 'sin fecha'; var p = f.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function estado(n) {
    if (n.suspendido) return { clase: 'mal', texto: 'Suspendido' };
    if (n.dias === null) return { clase: '', texto: 'Sin fecha de vencimiento' };
    if (n.dias < 0) return { clase: 'mal', texto: 'Venció hace ' + (-n.dias) + (n.dias === -1 ? ' día' : ' días') };
    if (n.dias === 0) return { clase: 'alerta', texto: 'Vence hoy' };
    if (n.dias <= 7) return { clase: 'alerta', texto: 'Vence en ' + n.dias + (n.dias === 1 ? ' día' : ' días') };
    return { clase: 'ok', texto: 'Al día' };
  }
  function celdaPlan(n) {
    var e = estado(n);
    var td = Sellos.el('td', {}, [
      Sellos.el('span', { clase: 'estado-plan ' + e.clase, texto: e.texto }), Sellos.el('br'),
      Sellos.el('span', { clase: 'nota', texto: (planes[n.plan] || 'Sin plan') + (n.cuota ? ' · S/ ' + n.cuota / 100 + ' al mes' : ' · sin cuota') + ' · vence ' + fecha(n.vence) }),
    ]);
    var botones = Sellos.el('div', { clase: 'botones chicos' });
    [['+1 mes', 1], ['+1 año', 12]].forEach(function (b) {
      var x = Sellos.el('button', { clase: 'boton chico', type: 'button', texto: b[0], 'aria-label': 'Renovar ' + n.nombre + ' ' + b[0] });
      x.addEventListener('click', function () { cambiarEstado(n, 'renovar', b[1]); });
      botones.appendChild(x);
    });
    var s = Sellos.el('button', { clase: 'boton chico' + (n.suspendido ? '' : ' peligro'), type: 'button', texto: n.suspendido ? 'Reactivar' : 'Suspender', 'aria-label': (n.suspendido ? 'Reactivar ' : 'Suspender ') + n.nombre });
    s.addEventListener('click', function () {
      if (!n.suspendido && !confirm('¿Suspender «' + n.nombre + '»? Su panel deja de funcionar y sus clientes no podrán registrarse ni sumar sellos (sus datos se guardan). Puedes reactivarlo cuando quieras.')) return;
      cambiarEstado(n, n.suspendido ? 'reactivar' : 'suspender');
    });
    botones.appendChild(s);
    td.appendChild(botones);
    return td;
  }
  async function cambiarEstado(n, accion, meses) {
    var r = await Sellos.api('/api/admin/estado', { body: { slug: n.slug, accion: accion, meses: meses } });
    if (!r.ok) return alert(r.datos.error || 'No se pudo cambiar el estado.');
    cargar();
  }
  function resumenCobros() {
    var vencidos = negocios.filter(function (n) { return !n.suspendido && n.dias !== null && n.dias < 0; });
    var pronto = negocios.filter(function (n) { return !n.suspendido && n.dias !== null && n.dias >= 0 && n.dias <= 7; });
    var caja = $('cobros'); caja.textContent = '';
    if (!vencidos.length && !pronto.length) { caja.hidden = true; return; }
    caja.hidden = false;
    var nombres = function (l) { return l.map(function (n) { return n.nombre + ' (' + fecha(n.vence) + ')'; }).join(', '); };
    if (vencidos.length) caja.appendChild(Sellos.el('p', { clase: 'mal', texto: '⚠ Vencidos: ' + vencidos.length + ' — ' + nombres(vencidos) }));
    if (pronto.length) caja.appendChild(Sellos.el('p', { clase: 'alerta', texto: '⏰ Vencen en los próximos 7 días: ' + pronto.length + ' — ' + nombres(pronto) }));
  }

  function llenar(n) {
    var f = $('form-negocio');
    ['slug', 'nombre', 'programa', 'meta', 'premio', 'espera_min', 'razon_social', 'ruc', 'direccion', 'correo', 'plan', 'vence']
      .forEach(function (k) { if (f.elements[k]) f.elements[k].value = n[k] == null ? '' : n[k]; });
    var r = {};
    try { r = JSON.parse(n.redes || '{}'); } catch (e) { r = {}; }
    ['whatsapp', 'instagram', 'tiktok', 'facebook', 'maps', 'web'].forEach(function (k) {
      f.elements['red_' + k].value = k === 'whatsapp' && r[k] ? r[k].slice(2) : (r[k] || '');
    });
    f.elements.cuota.value = n.cuota ? String(n.cuota / 100) : '';
    var r = reglasDe(n);
    f.elements.tipo.value = n.tipo || 'sellos';
    f.elements.por_sol.value = r.porSol || 1;
    f.elements.premios_texto.value = (r.premios || []).map(function (p) { return p.p + ' = ' + p.n; }).join('\n');
    f.elements.pct.value = r.pct || 5;
    f.elements.minimo.value = r.minimo !== undefined ? String(r.minimo / 100) : '5';
    f.elements.servicios_texto.value = serviciosDe(n).map(function (x) { return x.n + ' = ' + x.p / 100; }).join('\n');
    var pr = []; try { pr = JSON.parse(n.productos || '[]') || []; } catch (e) { pr = []; }
    f.elements.productos_texto.value = pr.map(function (x) { return x.n + ' = ' + x.p / 100; }).join('\n');
    f.elements.hitos_texto.value = (r.hitos || []).map(function (h) { return h.s + ' = ' + h.n; }).join('\n');
    f.elements.regalo_cumple.value = n.regalo_cumple || '';
    mostrarTipo();
    f.elements.precio.value = n.precio ? String(n.precio / 100) : '';
    f.elements.pedir_servicio.checked = n.pedir_servicio === undefined || n.pedir_servicio === null ? true : !!n.pedir_servicio;
    f.elements.costo_premio.value = n.costo_premio ? String(n.costo_premio / 100) : '';
    f.elements.mostrar_numeros.checked = !!n.mostrar_numeros;
    f.elements.gestion.checked = !!n.gestion;
    f.elements.rubro.value = n.rubro || '';
    f.elements.clave_dueno.value = '';
    f.elements.sello_regalo.checked = !!n.sello_regalo;
    f.elements.editar.value = n.slug;
    f.elements.clave.value = '';
    ponerDiseno(n.diseno || {});
    f.elements.slug.focus();
    f.scrollIntoView({ block: 'start' });
  }

  // ---------- diseño ----------
  async function cargarCatalogo() {
    var r = await Sellos.api('/api/admin/catalogo');
    if (!r.ok) return;
    cat = r.datos;
    var opciones = function (id, lista) {
      var s = $(id); s.textContent = '';
      Object.keys(lista).forEach(function (k) {
        var v = lista[k];
        s.appendChild(Sellos.el('option', { value: k, texto: typeof v === 'string' ? v : v.nombre + (v.titulo ? ' · ' + v.titulo + ' + ' + v.texto : '') }));
      });
    };
    opciones('d-tipografia', cat.tipografias);
    opciones('d-fondo', cat.fondos);
    opciones('d-animacion', cat.animaciones);
    opciones('d-tarjeta', cat.tarjetas);
    opciones('d-forma', cat.formas);
    opciones('d-icono', cat.iconos);
    opciones('d-esquinas', cat.esquinas);
    var est = $('d-estilos'); est.textContent = '';
    Object.keys(cat.estilos).forEach(function (k) {
      var e = cat.estilos[k];
      var b = Sellos.el('button', { type: 'button', clase: 'opcion', 'data-estilo': k, 'aria-pressed': 'false' }, [
        Sellos.el('span', { clase: 'muestra', 'aria-hidden': 'true' }),
        Sellos.el('span', { texto: e.nombre }),
      ]);
      b.firstChild.style.background = 'linear-gradient(135deg,' + e.colores[1] + ' 0 55%,' + e.colores[2] + ' 55% 100%)';
      b.addEventListener('click', function () { aplicarEstilo(k); });
      est.appendChild(b);
    });
    var pal = $('d-paletas'); pal.textContent = '';
    Object.keys(cat.paletas).forEach(function (k) {
      var p = cat.paletas[k];
      var b = Sellos.el('button', { type: 'button', clase: 'opcion paleta', 'data-paleta': k, 'aria-pressed': 'false', title: p[0] }, [
        Sellos.el('span', { clase: 'muestra', 'aria-hidden': 'true' }),
        Sellos.el('span', { texto: p[0] }),
      ]);
      b.firstChild.style.background = 'linear-gradient(135deg,' + p[1] + ' 0 55%,' + p[2] + ' 55% 100%)';
      b.addEventListener('click', function () { diseno.paleta = k; diseno.fondoColor = p[1]; diseno.acento = p[2]; ponerDiseno(diseno); });
      pal.appendChild(b);
    });
    $('d-medios-aviso').hidden = !!cat.medios;
    CAMPOS_D.forEach(function (k) {
      $('d-' + k).addEventListener(k === 'oscurecer' || k === 'fondoColor' || k === 'acento' ? 'input' : 'change', function () {
        diseno[k] = this.value;
        if (k === 'fondoColor' || k === 'acento') diseno.paleta = 'propia';
        marcar(); vistaPrevia();
      });
    });
    $('d-efecto3d').addEventListener('change', function () { diseno.efecto3d = this.checked; vistaPrevia(); });
    Array.prototype.forEach.call(document.querySelectorAll('.medio input[type=file]'), function (inp) {
      inp.addEventListener('change', function () { if (this.files[0]) subir(this.getAttribute('data-tipo'), this.files[0], this); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-quitar]'), function (b) {
      b.addEventListener('click', function () { diseno[b.getAttribute('data-quitar')] = ''; pintarMedios(); vistaPrevia(); });
    });
    ponerDiseno({});
  }

  function aplicarEstilo(k) {
    var e = cat.estilos[k];
    var d = { estilo: k };
    Object.keys(e).forEach(function (c) { if (c !== 'nombre' && c !== 'colores') d[c] = e[c]; });
    d.fondoColor = e.colores[1]; d.acento = e.colores[2];
    ['logo', 'portada', 'imagen', 'video', 'oscurecer'].forEach(function (c) { if (diseno[c]) d[c] = diseno[c]; });
    ponerDiseno(d);
  }

  function ponerDiseno(d) {
    if (!cat) return;
    diseno = d && d.tipografia ? d : Object.assign(primerEstilo(), d || {});
    CAMPOS_D.forEach(function (k) { if (diseno[k] != null) $('d-' + k).value = diseno[k]; });
    $('d-efecto3d').checked = !!diseno.efecto3d;
    marcar(); pintarMedios(); vistaPrevia();
  }
  function primerEstilo() {
    var e = cat.estilos.clasico, d = { estilo: 'clasico' };
    Object.keys(e).forEach(function (c) { if (c !== 'nombre' && c !== 'colores') d[c] = e[c]; });
    d.fondoColor = e.colores[1]; d.acento = e.colores[2];
    return d;
  }
  function marcar() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-estilo]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-estilo') === diseno.estilo)); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-paleta]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-paleta') === diseno.paleta)); });
    var f = diseno.fondo;
    $('c-animacion').hidden = f !== 'animado';
    $('c-oscurecer').hidden = f !== 'imagen' && f !== 'video';
  }

  // ---------- fotos y videos ----------
  function guardado() {
    var f = $('form-negocio');
    return f.elements.editar.value && f.elements.editar.value === f.elements.slug.value ? f.elements.editar.value : '';
  }
  function pintarMedios() {
    var slug = guardado();
    $('d-medios-guardar').hidden = !!slug || !cat || !cat.medios;
    ['logo', 'portada', 'imagen', 'video'].forEach(function (t) {
      var caja = $('mv-' + t); caja.textContent = '';
      var id = diseno[t];
      if (!id) caja.appendChild(Sellos.el('span', { texto: 'Sin archivo' }));
      else if (t === 'video') caja.appendChild(Sellos.el('video', { src: '/m/' + id, muted: '', loop: '', autoplay: '', playsinline: '' }));
      else caja.appendChild(Sellos.el('img', { src: '/m/' + id, alt: 'Archivo subido' }));
      var inp = document.querySelector('.medio input[data-tipo="' + t + '"]');
      inp.disabled = !slug || !cat.medios;
      inp.parentNode.classList.toggle('desactivado', inp.disabled);
    });
  }
  function leerImagen(archivo) {
    return new Promise(function (ok, mal) {
      var lector = new FileReader();
      lector.onload = function () { var img = new Image(); img.onload = function () { ok(img); }; img.onerror = mal; img.src = lector.result; };
      lector.onerror = mal;
      lector.readAsDataURL(archivo);
    });
  }
  function aBlob(lienzo, tipo, calidad) { return new Promise(function (ok) { lienzo.toBlob(ok, tipo, calidad); }); }
  /** Achica la imagen en el navegador para que cargue rápido en los celulares. */
  async function preparar(tipo, archivo) {
    var img = await leerImagen(archivo);
    var max = tipo === 'logo' ? 600 : 1600;
    var k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    var c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    var b = await aBlob(c, 'image/webp', 0.86);
    if (!b || b.type !== 'image/webp') b = await aBlob(c, tipo === 'logo' ? 'image/png' : 'image/jpeg', 0.86);
    return b;
  }
  async function subir(tipo, archivo, input) {
    var slug = guardado(); var msg = $('form-msg');
    msg.classList.remove('ok');
    if (!slug) return Sellos.mostrar(msg, 'Guarda el negocio primero para poder subir archivos.');
    Sellos.mostrar(msg, 'Subiendo ' + (tipo === 'video' ? 'video' : 'imagen') + '…');
    var datos = archivo;
    try {
      if (tipo === 'video') {
        if (archivo.size > 15 * 1024 * 1024) return Sellos.mostrar(msg, 'El video debe pesar menos de 15 MB. Recórtalo a 10–15 segundos.');
      } else datos = await preparar(tipo, archivo);
    } catch (e) { return Sellos.mostrar(msg, 'No pudimos leer ese archivo. Prueba con una imagen JPG o PNG.'); }
    var r;
    try {
      r = await fetch('/api/admin/medios?n=' + encodeURIComponent(slug) + '&tipo=' + tipo, { method: 'POST', body: datos, headers: { 'Content-Type': datos.type || 'application/octet-stream' }, credentials: 'same-origin' });
    } catch (e) { return Sellos.mostrar(msg, 'Sin conexión. Intenta de nuevo.'); }
    var j = {}; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
    input.value = '';
    if (!r.ok) return Sellos.mostrar(msg, j.error || 'No se pudo subir el archivo.');
    diseno[tipo] = j.id;
    if (tipo === 'imagen') diseno.fondo = 'imagen';
    if (tipo === 'video') diseno.fondo = 'video';
    if (tipo === 'logo' && diseno.icono === 'check') diseno.icono = 'logo';
    ponerDiseno(diseno);
    msg.classList.add('ok');
    Sellos.mostrar(msg, 'Archivo subido. Toca «Guardar negocio» para publicarlo.');
  }

  // ---------- vista previa ----------
  var espera = null;
  function vistaPrevia() {
    clearTimeout(espera);
    espera = setTimeout(function () {
      var f = $('form-negocio');
      var d = { nombre: f.elements.nombre.value, programa: f.elements.programa.value, premio: f.elements.premio.value, meta: f.elements.meta.value, diseno: diseno };
      ['tipo', 'por_sol', 'premios_texto', 'pct', 'minimo', 'hitos_texto', 'regalo_cumple'].forEach(function (k) { d[k] = f.elements[k].value; });
      d.sello_regalo = f.elements.sello_regalo.checked;
      ['whatsapp', 'instagram', 'tiktok', 'facebook', 'maps', 'web'].forEach(function (k) { d['red_' + k] = f.elements['red_' + k].value; });
      var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(d)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      $('v-registro').src = '/admin/vista/registro?d=' + b64;
      $('v-tarjeta').src = '/admin/vista/tarjeta?d=' + b64;
    }, 450);
  }
  ['nombre', 'programa', 'premio', 'meta', 'por_sol', 'premios_texto', 'pct', 'minimo', 'hitos_texto', 'regalo_cumple'].forEach(function (k) { $('form-negocio').elements[k].addEventListener('input', vistaPrevia); });
  $('form-negocio').elements.slug.addEventListener('input', pintarMedios);
  $('form-negocio').elements.sello_regalo.addEventListener('change', vistaPrevia);
  // Pestañas de la vista previa: tarjeta o página de registro.
  document.querySelectorAll('[data-vista]').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('[data-vista]').forEach(function (x) {
        var activa = x === b;
        x.setAttribute('aria-pressed', String(activa));
        $(x.getAttribute('data-vista')).parentNode.hidden = !activa;
      });
    });
  });

  // ---------- sesión y guardado ----------
  $('login').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var r = await Sellos.api('/api/admin/login', { body: { clave: $('clave').value } });
    if (r.ok) { $('clave').value = ''; Sellos.mostrar($('login-error'), ''); cargar(); }
    else Sellos.mostrar($('login-error'), r.datos.error || 'No se pudo ingresar.');
  });
  $('salir').addEventListener('click', async function () { await Sellos.api('/api/salir', { body: {} }); location.reload(); });

  $('form-negocio').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var f = this, datos = {};
    Array.prototype.forEach.call(f.elements, function (el) { if (el.name) datos[el.name] = el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value; });
    datos.diseno = diseno;
    var boton = $('guardar-negocio');
    boton.disabled = true;
    var r = await Sellos.api('/api/admin/negocios', { body: datos });
    boton.disabled = false;
    $('form-msg').classList.toggle('ok', r.ok);
    if (r.ok) {
      Sellos.mostrar($('form-msg'), r.datos.creado ? 'Negocio creado. Ya puedes subir su logo y fotos, y compartir su enlace de registro.'
        : 'Cambios guardados.' + (r.datos.conservan ? ' ' + r.datos.conservan + (r.datos.conservan === 1 ? ' cliente conserva' : ' clientes conservan') + ' su promoción anterior hasta canjearla; las tarjetas nuevas ya usan la nueva.' : ''));
      f.elements.editar.value = datos.slug;
      f.elements.clave.value = '';
      f.elements.clave_dueno.value = '';
      pintarMedios();
      cargar();
    } else Sellos.mostrar($('form-msg'), r.datos.error || 'No se pudo guardar.');
  });

  mostrarTipo();
  (async function () {
    var r = await Sellos.api('/api/admin/sesion');
    if (r.ok && r.datos.sesion) cargar(); else verLogin();
  })();
})();
