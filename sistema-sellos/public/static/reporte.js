/* Reporte del mes de un negocio: una hoja clara y visual para guardar en PDF y mandarla por WhatsApp. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var N = window.Numeros, el = Sellos.el;
  var q = new URLSearchParams(location.search), slug = q.get('n') || '', datos = null;

  function luz(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 0.5;
    var n = parseInt(m[1], 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function tile(titulo, valor, nota, cambio) {
    return el('div', { clase: 'r-tile' }, [
      el('p', { clase: 'r-tile-titulo', texto: titulo }),
      el('p', { clase: 'r-tile-valor', texto: String(valor) }),
      nota ? el('p', { clase: 'r-tile-nota', texto: nota }) : null,
      cambio ? el('p', { clase: 'r-cambio ' + cambio.clase, texto: cambio.texto }) : null,
    ]);
  }
  function seccion(titulo, hijos, clase) { return el('section', { clase: 'r-seccion' + (clase ? ' ' + clase : '') }, [el('h2', { texto: titulo })].concat(hijos)); }
  function ranking(lista, vacio) {
    var ol = el('ol', { clase: 'r-ranking' });
    if (!lista.length) ol.appendChild(el('li', { clase: 'r-vacio', texto: vacio }));
    lista.forEach(function (x, k) {
      ol.appendChild(el('li', {}, [el('span', { clase: 'r-puesto', texto: String(k + 1) }), el('span', { clase: 'r-quien' }, [el('strong', { texto: x[0] }), el('span', { texto: x[1] })])]));
    });
    return ol;
  }

  function pintar(mes) {
    var d = datos, neg = d.negocio, art = $('reporte');
    var i = d.meses.findIndex(function (x) { return x.mes === mes; }); if (i < 0) i = d.meses.length - 1;
    var m = d.meses[i], enCurso = i === d.meses.length - 1;
    var a = enCurso ? d.anteriorAlDia : d.meses[i - 1], antes = a ? (enCurso ? '1–' + a.hasta + ' ' + N.mesDe(a.mes, true) : N.mesDe(a.mes)) : '';
    var cmp = function (x, y) { return a && y ? N.cambio(x, y, antes) : null; };
    var se = N.semana(d), precio = N.ticket(d);
    var perdidos = d.riesgo.total == null ? d.riesgo.clientes.length : d.riesgo.total;
    var perdida = Math.round(perdidos * precio * 30 / (d.fidelidad.cadaDias || 30));
    art.textContent = '';
    document.title = 'Reporte ' + N.mesDe(m.mes) + ' ' + m.mes.slice(0, 4) + ' · ' + neg.nombre;

    // Cabecera con el logo del negocio.
    var logo = el('div', { clase: 'r-logo', 'aria-hidden': 'true' });
    if (neg.logo) logo.appendChild(el('img', { src: '/m/' + neg.logo, alt: '' })); else logo.textContent = neg.nombre.charAt(0).toUpperCase();
    art.appendChild(el('header', { clase: 'r-cabeza' }, [
      logo,
      el('div', {}, [
        el('p', { clase: 'r-ante', texto: 'Reporte de fidelización' }),
        el('h1', { texto: neg.nombre }),
        el('p', { clase: 'r-mes', texto: N.mayus(N.mesDe(m.mes)) + ' ' + m.mes.slice(0, 4) + (enCurso ? ' · hasta hoy' : '') + ' · ' + neg.programa }),
      ]),
    ]));

    // Lo principal, en grande.
    var cm = m.ingresos && a && a.ingresos ? N.cambio(m.ingresos, a.ingresos, antes) : null;
    art.appendChild(el('section', { clase: 'r-heroe' }, [
      el('p', { clase: 'r-heroe-titulo', texto: 'Tus clientes con tarjeta te dejaron' }),
      el('p', { clase: 'r-heroe-valor', texto: m.ingresos ? N.plata(m.ingresos) : '—' }),
      el('p', { clase: 'r-heroe-nota', texto: m.visitas ? N.plural(m.visitas, 'visita', 'visitas') + ' en ' + N.mesDe(m.mes) : 'Aún no hay visitas registradas en ' + N.mesDe(m.mes) + '.' }),
      cm ? el('p', { clase: 'r-cambio ' + cm.clase, texto: cm.texto }) : null,
    ]));

    art.appendChild(el('div', { clase: 'r-tiles' }, [
      tile('Visitas', m.visitas, 'Veces que vinieron', cmp(m.visitas, a && a.visitas)),
      tile('Clientes nuevos', m.nuevos, 'Crearon su tarjeta', cmp(m.nuevos, a && a.nuevos)),
      tile('Volvieron', m.volvieron, 'Ya habían venido antes', cmp(m.volvieron, a && a.volvieron)),
      d.tipo === 'cashback' ? tile('Saldo usado', N.plata(m.premios), N.plural(m.canjes, 'vez', 'veces')) : tile('Premios entregados', m.canjes, 'Clientes que completaron su tarjeta'),
    ]));

    // Últimos 6 meses.
    var g = el('div', { clase: 'grafico r-grafico', 'data-titulo': 'Lo que dejaron los clientes con tarjeta, últimos 6 meses' });
    art.appendChild(seccion('Mes a mes', [g, el('p', { clase: 'r-nota', texto: 'Lo que dejaron tus clientes con tarjeta en los últimos 6 meses.' })]));
    N.columnas(g, d.meses.map(function (x, k) {
      return { etiqueta: N.mayus(N.mesDe(x.mes)), corta: N.mayus(N.mesDe(x.mes, true)), actual: k === i, valores: [x.ingresos] };
    }), [{ nombre: 'Dejaron', clase: 'acento' }], { eje: N.compacto, tip: N.plata }, function (gr) { return gr.actual; });

    // Clientes y servicios.
    var top = d.top.slice(0, 5).map(function (c) { return [c.nombre, N.plural(c.visitas90, 'visita', 'visitas') + (c.premios ? ' · ' + N.plural(c.premios, 'premio', 'premios') : '')]; });
    var vend = (d.vendidos || []).slice(0, 5).map(function (x) { return [x.n, N.plural(x.veces, 'vez', 'veces') + ' · ' + N.plata(x.ingresos)]; });
    art.appendChild(el('div', { clase: 'r-dos' }, [
      seccion('Tus clientes más fieles', [ranking(top, 'Aún no hay visitas.'), el('p', { clase: 'r-nota', texto: 'Últimos 3 meses. Trátalos como VIP: un detalle hace que te recomienden.' })]),
      seccion('Lo que más se pide', [ranking(vend, 'Aún no se registran servicios en las visitas.'), el('p', { clase: 'r-nota', texto: 'Últimos 3 meses.' })]),
    ]));

    // La semana.
    var dias = el('div', { clase: 'grafico r-grafico chico', 'data-titulo': 'Visitas por día de la semana' });
    art.appendChild(seccion('Tus días más fuertes', [dias, el('p', { clase: 'r-nota', texto: se.fuerte ? 'El ' + se.fuerte + ' es tu mejor día. Horas con más visitas: ' + se.horas.replace(/\.$/, '') + '.' : 'Aún no hay visitas suficientes.' })]));
    N.columnas(dias, se.dias.map(function (v, k) { var nom = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][k]; return { etiqueta: nom, corta: N.mayus(nom.slice(0, 3)), valores: [v] }; }),
      [{ nombre: 'Visitas', clase: 'acento' }], { eje: function (v) { return String(Math.round(v)); }, tip: String }, function (gr) { return se.maxDia > 0 && gr.valores[0] === se.maxDia; });

    // Qué hacer el próximo mes: pocas acciones, concretas.
    var acciones = [];
    if (perdidos) acciones.push('Escríbeles a los ' + N.plural(perdidos, 'cliente', 'clientes') + ' que dejaron de venir' + (perdida ? ' (son unos ' + N.plata(perdida) + ' al mes)' : '') + '. Están en «Escríbeles hoy» de tu panel, listos para un WhatsApp.');
    var flojo = se.maxDia ? ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][se.dias.indexOf(Math.min.apply(null, se.dias))] : '';
    if (flojo) acciones.push('Tu día más flojo es el ' + flojo + ': prueba una promoción solo ese día (por ejemplo, sello doble).');
    if (a && m.nuevos < a.nuevos) acciones.push('Llegaron menos clientes nuevos que el mes pasado: ofrece la tarjeta a cada cliente al cobrar y deja el cartel con QR a la vista.');
    else acciones.push('Sigue ofreciendo la tarjeta a cada cliente al cobrar: cada tarjeta nueva es un cliente que vuelve.');
    art.appendChild(seccion('Para el próximo mes', [el('ol', { clase: 'r-acciones' }, acciones.slice(0, 3).map(function (t) { return el('li', { texto: t }); }))], 'r-proximo'));

    art.appendChild(el('footer', { clase: 'r-pie', texto: 'Solo cuenta a los clientes con tarjeta ' + neg.programa + '. Reporte generado el ' + new Date().toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'long', year: 'numeric' }) + '.' }));

    var texto = N.mensaje(neg, d, m.mes);
    $('r-wa').href = neg.whatsapp ? 'https://wa.me/' + neg.whatsapp + '?text=' + encodeURIComponent(texto) : 'https://wa.me/?text=' + encodeURIComponent(texto);
    $('r-wa').hidden = false;
    history.replaceState(null, '', '?n=' + encodeURIComponent(slug) + '&mes=' + m.mes);
  }

  (async function () {
    var r = await Sellos.api('/api/admin/numeros?n=' + encodeURIComponent(slug));
    if (r.status === 401) { $('r-estado').textContent = 'Inicia sesión en /admin y vuelve a abrir el reporte.'; return; }
    if (!r.ok) { $('r-estado').textContent = r.datos.error || 'No se pudo cargar el reporte.'; return; }
    datos = r.datos;
    // En papel blanco, un color de marca muy claro (blanco, crema) no se vería: se usa su fondo o un gris oscuro.
    var neg = datos.negocio, acento = luz(neg.acento) > 0.6 ? (luz(neg.fondo) < 0.35 ? neg.fondo : '#3A3631') : neg.acento;
    if (acento) document.documentElement.style.setProperty('--acento', acento);
    document.documentElement.style.setProperty('--sobre-acento', luz(acento) < 0.4 ? '#FFFFFF' : '#1D1B18');
    // El logo va sobre el fondo de su marca, para que un logo blanco no desaparezca.
    if (neg.fondo) document.documentElement.style.setProperty('--fondo-marca', neg.fondo);
    var sel = $('r-mes'), pedido = q.get('mes');
    datos.meses.slice().reverse().forEach(function (x, k) {
      var o = el('option', { value: x.mes, texto: N.mayus(N.mesDe(x.mes)) + ' ' + x.mes.slice(0, 4) + (k === 0 ? ' (en curso)' : '') });
      if (x.mes === pedido) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { pintar(sel.value); });
    $('r-estado').hidden = true; $('reporte').hidden = false;
    pintar(sel.value);
  })();
  // Hoja A4 con margen (como en cartel.js, la regla @page va por CSSOM: la CSP no permite <style> en línea).
  try {
    var hoja = Array.prototype.filter.call(document.styleSheets, function (s) { return s.href && s.href.indexOf('/static/app.css') >= 0; })[0];
    hoja.insertRule('@page{size:A4;margin:12mm}', hoja.cssRules.length);
  } catch (e) { /* el navegador usa su tamaño de hoja */ }
  $('r-imprimir').addEventListener('click', function () { window.print(); });
})();
