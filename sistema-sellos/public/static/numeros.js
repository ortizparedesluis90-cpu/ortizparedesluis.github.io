/* «Tus números» de un negocio: lo que dejaron sus clientes, mes a mes, sus días fuertes y quiénes dejaron de venir.
   Lo usan /admin (para el reporte del mes) y el panel del negocio cuando el administrador se lo activa. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 });
  var nombreMes = new Intl.DateTimeFormat('es-PE', { month: 'long', timeZone: 'UTC' });
  var mesCorto = new Intl.DateTimeFormat('es-PE', { month: 'short', timeZone: 'UTC' });
  function plata(c) { return soles.format(Math.round(c / 100)); }
  function mesDe(m, corto) { return (corto ? mesCorto : nombreMes).format(new Date(m + '-15T12:00:00Z')).replace('.', '').toLowerCase(); }
  function mayus(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function compacto(c) { var s = c / 100; return 'S/ ' + (Math.abs(s) >= 1000 ? (Math.round(s / 100) / 10) + ' mil' : Math.round(s)); }
  function plural(x, uno, varios) { return x + ' ' + (x === 1 ? uno : varios); }
  // Lo que deja en promedio una visita: el precio configurado o, si no hay, el promedio de lo cobrado.
  function ticket(d) {
    if (d.ajustes.precio) return d.ajustes.precio;
    var v = 0, i = 0;
    d.meses.forEach(function (m) { v += m.visitas; i += m.ingresos; });
    return v ? Math.round(i / v) : 0;
  }

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

  // Días de la semana (lunes primero) y las horas pico, en palabras.
  var DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  function semana(d) {
    var dias = [0, 0, 0, 0, 0, 0, 0], horas = {};
    d.horas.forEach(function (h) { dias[(h.dia + 6) % 7] += h.v; horas[h.hora] = (horas[h.hora] || 0) + h.v; });
    var pico = Object.keys(horas).sort(function (x, y) { return horas[y] - horas[x] || x - y; }).slice(0, 3).map(Number).sort(function (x, y) { return x - y; });
    var hora = function (h) { var x = h % 12 || 12; return x + (h % 24 < 12 ? ' a. m.' : ' p. m.'); };
    // Horas seguidas se juntan: 5, 6 y 7 p. m. → «de 5 p. m. a 8 p. m.».
    var tramos = [];
    pico.forEach(function (h) { var t = tramos[tramos.length - 1]; if (t && t[1] === h) t[1] = h + 1; else tramos.push([h, h + 1]); });
    var maxDia = Math.max.apply(null, dias);
    return {
      dias: dias, maxDia: maxDia, fuerte: maxDia ? DIAS[dias.indexOf(maxDia)] : '',
      horas: tramos.map(function (t) { return 'de ' + hora(t[0]) + ' a ' + hora(t[1]); }).join(' y '),
    };
  }

  /** Pinta «Tus números» en la página. o.verCliente(c) abre la ficha de un cliente (solo en el panel);
   *  o.mensaje(c) arma el WhatsApp para un cliente que dejó de venir (sin él, no hay botón). */
  function montar(o) {
    var num = null, real = null, viendoEjemplo = false, anchoAntes = 0, mesPedido = null;
    function pintar() {
      var d = num, sel = $('n-mes'), elegido = mesPedido || sel.value || d.meses[d.meses.length - 1].mes;
      mesPedido = null;
      if (!d.meses.some(function (x) { return x.mes === elegido; })) elegido = d.meses[d.meses.length - 1].mes;
      sel.textContent = '';
      d.meses.slice().reverse().forEach(function (m, i) {
        var op = Sellos.el('option', { value: m.mes, texto: mayus(mesDe(m.mes)) + ' ' + m.mes.slice(0, 4) + (i === 0 ? ' (en curso)' : '') });
        if (m.mes === elegido) op.selected = true;
        sel.appendChild(op);
      });
      var i = d.meses.findIndex(function (m) { return m.mes === elegido; }); if (i < 0) i = d.meses.length - 1;
      var m = d.meses[i], a = d.meses[i - 1] || null, antes = a ? mesDe(a.mes) : '';
      // El mes en curso se compara con el anterior a la misma fecha (del 1 al día de hoy).
      if (a && i === d.meses.length - 1) { a = d.anteriorAlDia; antes = '1–' + a.hasta + ' ' + mesDe(a.mes, true); }
      var a0 = a || {};
      var ej = viendoEjemplo, precio = ticket(d), sinPrecio = !precio;
      $('n-vacio').hidden = ej || real.meses.some(function (x) { return x.visitas; });
      $('n-ejemplo').hidden = !ej;

      // El número principal: lo que dejaron los clientes con tarjeta en el mes.
      var heroe = $('n-heroe'), enCurso = i === d.meses.length - 1;
      heroe.textContent = '';
      heroe.appendChild(Sellos.el('p', { clase: 'heroe-titulo', texto: (enCurso ? 'Este mes' : 'En ' + mesDe(m.mes)) + ' ' + (o.quien || 'tus clientes con tarjeta te dejaron') }));
      var vacio = !m.visitas || (sinPrecio && !m.ingresos);
      heroe.appendChild(Sellos.el('p', { clase: 'heroe-valor', texto: vacio ? '—' : plata(m.ingresos) }));
      heroe.appendChild(Sellos.el('p', { clase: 'heroe-nota', texto: !m.visitas ? 'Aún no hay visitas en ' + mesDe(m.mes) + '.'
        : sinPrecio && !m.ingresos ? 'Faltan los precios: ponlos en «Servicios y precios» para calcular cuánto dejaron.'
        : plural(m.visitas, 'visita', 'visitas') + ' · ' + plural(m.volvieron, 'cliente volvió', 'clientes volvieron') }));
      var cm = !vacio && a && cambio(m.ingresos, a0.ingresos, antes);
      if (cm) heroe.appendChild(Sellos.el('p', { clase: 'dato-nota cambio ' + cm.clase, texto: cm.texto }));

      // Lo que se pierde: los que dejaron de venir, si volvieran a su ritmo de siempre.
      var f = d.fidelidad;
      var perdidos = d.riesgo.total == null ? d.riesgo.clientes.length : d.riesgo.total;
      var perdida = Math.round(perdidos * precio * 30 / (f.cadaDias || 30));
      tiles($('n-datos'), [
        ['Clientes nuevos', m.nuevos, 'Crearon su tarjeta', a && cambio(m.nuevos, a0.nuevos, antes)],
        ['Clientes que volvieron', m.volvieron, 'de ' + plural(m.clientes, 'cliente', 'clientes') + ' que vinieron', a && cambio(m.volvieron, a0.volvieron, antes)],
        ['Visitas', m.visitas, 'Veces que vinieron en total', a && cambio(m.visitas, a0.visitas, antes)],
        d.tipo === 'cashback' ? ['Saldo usado', plata(m.premios), plural(m.canjes, 'vez', 'veces') + ' que usaron su saldo'] : ['Premios entregados', m.canjes, 'Premios que canjearon'],
        ['Dejaron de venir', perdidos, perdidos && !sinPrecio ? 'Se dejan de ganar ' + plata(perdida) + ' al mes' : 'Nadie se ha ido'],
      ]);

      // 6 meses: lo que dejaron los clientes con tarjeta.
      var g = $('n-grafico');
      anchoAntes = g.clientWidth;
      g.setAttribute('data-titulo', 'Lo que dejaron los clientes con tarjeta, por mes');
      columnas(g, d.meses.map(function (x, k) {
        return { etiqueta: mayus(mesDe(x.mes)) + ' ' + x.mes.slice(0, 4), corta: mayus(mesDe(x.mes, true)), actual: k === i, valores: [x.ingresos],
          extra: plural(x.visitas, 'visita', 'visitas') + ' · ' + plural(x.nuevos, 'cliente nuevo', 'clientes nuevos') };
      }), [{ nombre: 'Dejaron', clase: 'acento' }], { eje: compacto, tip: plata });
      var tabla = $('n-tabla');
      tabla.textContent = '';
      var cab = Sellos.el('tr', {}, ['Mes', 'Dejaron', 'Visitas', 'Nuevos', 'Volvieron', 'Premios'].map(function (t) { return Sellos.el('th', { scope: 'col', texto: t }); }));
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
        var ver = ej || !o.verCliente ? null : Sellos.el('button', { clase: 'boton chico', type: 'button', texto: 'Ver' });
        if (ver) ver.addEventListener('click', function () { o.verCliente(c); });
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

      // Días de la semana y horas pico.
      var se = semana(d), cd = $('n-dias');
      cd.setAttribute('data-titulo', 'Visitas por día de la semana, últimos 90 días');
      columnas(cd, se.dias.map(function (v, k) { return { etiqueta: mayus(DIAS[k]), corta: mayus(DIAS[k].slice(0, 3)), valores: [v] }; }), [{ nombre: 'Visitas', clase: 'acento' }],
        { eje: function (v) { return String(Math.round(v)); }, tip: function (v) { return String(v); } },
        function (gr) { return se.maxDia > 0 && gr.valores[0] === se.maxDia; });
      $('n-horas').textContent = se.horas
        ? 'El día más fuerte es el ' + se.fuerte + '. Horas con más visitas: ' + se.horas.replace(/\.$/, '') + '. Sirve para los turnos y para lanzar promociones en los días flojos.'
        : '';

      // Clientes que se están yendo.
      var rz = $('n-riesgo');
      rz.textContent = '';
      $('n-riesgo-nota').textContent = 'Vinieron 2 veces o más y no regresan hace más de ' + d.riesgo.dias + ' días.'
        + (perdidos && !sinPrecio ? ' Si vuelven a su ritmo de siempre, son unos ' + plata(perdida) + ' más al mes.' : '') + ' Un mensaje a tiempo los recupera.';
      if (!d.riesgo.clientes.length) rz.appendChild(Sellos.el('li', { texto: 'Nadie por ahora. ¡Bien!' }));
      d.riesgo.clientes.forEach(function (c) {
        var hace = Math.round((Date.now() - Date.parse(c.ultimaVisita.replace(' ', 'T') + 'Z')) / 86400000);
        var botones = [];
        if (!ej && o.verCliente) {
          var ver = Sellos.el('button', { clase: 'boton chico', type: 'button', texto: 'Ver' });
          ver.addEventListener('click', function () { o.verCliente(c); });
          botones.push(ver);
        }
        if (c.recordatorios && !ej && o.mensaje) {
          botones.push(Sellos.el('a', { clase: 'boton chico primario', href: 'https://wa.me/' + c.celularWa + '?text=' + encodeURIComponent(o.mensaje(c)), target: '_blank', rel: 'noopener', texto: 'Escribir por WhatsApp' }));
        }
        rz.appendChild(Sellos.el('li', {}, [
          Sellos.el('div', { clase: 'quien' }, [
            Sellos.el('strong', { texto: c.nombre }),
            Sellos.el('span', { texto: 'Última visita hace ' + hace + ' días · ' + plural(c.visitas, 'visita', 'visitas') + (c.recordatorios ? '' : ' · no aceptó recordatorios') }),
          ]),
          botones.length ? Sellos.el('div', { clase: 'botones chicos' }, botones) : null,
        ]));
      });
      if (o.alPintar) o.alPintar(d, m, i);
    }

    // Ejemplo con datos inventados, para ver cómo se llena antes de tener visitas.
    function ejemplo() {
      var p = real.ajustes.precio || 3500, cp = real.ajustes.costoPremio || p;
      var vis = [38, 52, 61, 74, 70, 48], reg = [.45, .55, .6, .66, .7, .74], can = [0, 1, 2, 3, 3, 2], nue = [22, 18, 15, 14, 12, 7];
      var mes = function (k, f) {
        f = f || 1;
        var v = Math.round(vis[k] * f), r = Math.round(v * reg[k]), c = Math.round(can[k] * f);
        return { mes: real.meses[k].mes, visitas: v, regreso: r, volvieron: Math.round(r * .85), clientes: Math.round(v * .8), nuevos: Math.round(nue[k] * f), canjes: c,
          ingresos: v * p, ingresosRegreso: r * p, premios: c * cp };
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
    $('n-mes').addEventListener('change', function () { if (num) pintar(); });
    $('n-ver-ejemplo').addEventListener('click', function () { viendoEjemplo = true; num = ejemplo(); pintar(); $('n-salir-ejemplo').focus(); });
    $('n-salir-ejemplo').addEventListener('click', function () { viendoEjemplo = false; num = real; pintar(); });
    window.addEventListener('resize', function () { var w = $('n-grafico').clientWidth; if (num && Math.abs(w - anchoAntes) > 20) { anchoAntes = w; pintar(); } });
    return {
      poner: function (datos, mes) { real = datos; mesPedido = mes || null; if (!viendoEjemplo) { num = real; pintar(); } },
      mes: function () { return $('n-mes').value; },
    };
  }

  /** Mensaje de WhatsApp con el resumen de un mes, para mandárselo al dueño junto al PDF. */
  function mensaje(neg, d, mes) {
    var i = d.meses.findIndex(function (x) { return x.mes === mes; }); if (i < 0) i = d.meses.length - 1;
    var m = d.meses[i], enCurso = i === d.meses.length - 1, a = enCurso ? d.anteriorAlDia : d.meses[i - 1];
    var cv = a && cambio(m.visitas, a.visitas, enCurso ? 'el mes pasado a la misma fecha' : mesDe(a.mes));
    var se = semana(d), perdidos = d.riesgo.total == null ? d.riesgo.clientes.length : d.riesgo.total, top = d.top[0];
    var l = ['Hola, te comparto el reporte de ' + mesDe(m.mes) + (enCurso ? ' (hasta hoy)' : '') + ' de ' + neg.programa + ' en ' + neg.nombre + ':'];
    l.push('• ' + plural(m.visitas, 'visita', 'visitas') + ' de clientes con tarjeta' + (cv ? ' (' + cv.texto + ')' : ''));
    if (m.ingresos) l.push('• Tus clientes con tarjeta te dejaron ' + plata(m.ingresos));
    l.push('• ' + plural(m.nuevos, 'cliente nuevo', 'clientes nuevos') + ' y ' + plural(m.volvieron, 'cliente que volvió', 'clientes que volvieron'));
    if (m.canjes) l.push('• ' + plural(m.canjes, 'premio entregado', 'premios entregados'));
    if (top) l.push('• Tu cliente más fiel: ' + top.nombre + ' (' + plural(top.visitas90, 'visita', 'visitas') + ' en 3 meses)');
    if (se.fuerte) l.push('• Tu día más fuerte: el ' + se.fuerte);
    if (perdidos) l.push('• ' + plural(perdidos, 'cliente dejó', 'clientes dejaron') + ' de venir: aparecen en «Escríbeles hoy» de tu panel para mandarles un mensaje.');
    l.push('Te adjunto el reporte completo en PDF.');
    return l.join('\n');
  }

  window.Numeros = { mensaje: mensaje, montar: montar, plata: plata, mesDe: mesDe, mayus: mayus, plural: plural, cambio: cambio, semana: semana, ticket: ticket, columnas: columnas, compacto: compacto };
})();
