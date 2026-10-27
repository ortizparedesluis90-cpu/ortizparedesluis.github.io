/* Comercio: vender (punto de venta), inventario con variantes y recetas, deudas (fiados y proveedores), proveedores y compras.
   Usa lo que expone public/static/gestion.js en window.Gestion. Montos en céntimos. */
(function () {
  'use strict';
  var G = window.Gestion;
  if (!G) return;
  var $ = G.$, el = G.el, S = G.S, api = G.api, aCentimos = G.aCentimos, btn = G.btn;
  var POR_PESO = ['kg', 'litro', 'metro'];
  var ARTS = [], CATS = [], cargado = 0;
  function D() { return G.datos(); }
  function dueno() { return D().rol === 'dueno'; }

  // ---------- artículos ----------
  async function cargarArticulos(forzar) {
    if (!forzar && ARTS.length && Date.now() - cargado < 60000) return;
    var r = await api('articulos');
    if (!r.ok) return;
    ARTS = r.datos.articulos; CATS = r.datos.categorias; cargado = Date.now();
  }
  function porId(id) { return ARTS.find(function (a) { return a.id === Number(id); }); }
  function hijos(p) { return ARTS.filter(function (a) { return a.padre === p.id; }); }
  function productos() { return ARTS.filter(function (a) { return !a.padre; }); }
  function precioDe(a) { if (a.precio) return a.precio; var p = a.padre ? porId(a.padre) : null; return p ? p.precio : 0; }
  function costoDe(a) {
    if (a.receta && a.receta.length) return Math.round(a.receta.reduce(function (t, x) { var i = porId(x.a); return t + (i ? costoDe(i) : 0) * x.c; }, 0));
    if (a.costo) return a.costo; var p = a.padre ? porId(a.padre) : null; return p ? p.costo : 0;
  }
  function nombreDe(a) { var p = a.padre ? porId(a.padre) : null; return p ? p.nombre + ' — ' + a.variante : a.nombre; }
  function unidadDe(a) { var p = a.padre ? porId(a.padre) : null; return (p || a).unidad; }
  function stockDe(p) { var h = hijos(p); return h.length ? h.reduce(function (t, x) { return t + x.stock; }, 0) : p.stock; }
  function controla(p) { var h = hijos(p); return h.length ? true : p.controla; }
  function cant(c) { return Number.isInteger(c) ? String(c) : String(Math.round(c * 1000) / 1000).replace('.', ','); }
  function stockTexto(a, u) {
    if (a.receta && a.receta.length) return 'Con receta';
    if (!controla(a)) return 'Sin stock';
    var s = stockDe(a);
    return (s <= 0 ? 'Agotado' : 'Stock ' + cant(s)) + (u && u !== 'unidad' && s > 0 ? ' ' + u : '');
  }
  function claseStock(a) {
    if (!controla(a) || (a.receta && a.receta.length)) return '';
    var s = stockDe(a), h = hijos(a);
    var min = h.length ? h.reduce(function (t, x) { return t + x.minimo; }, 0) : a.minimo;
    return s <= 0 ? 'agotado' : min > 0 && s <= min ? 'bajo' : '';
  }
  function buscarCodigo(c) {
    c = String(c || '').trim();
    return c ? ARTS.find(function (a) { return a.codigo && a.codigo === c; }) : null;
  }

  // ---------- vender ----------
  var carrito = [], categoria = '', selPos = null, segPos = null, abiertoMovil = false;
  G.CARGAR.vender = async function () {
    await cargarArticulos(true);
    if (!selPos) prepararPos();
    pintarCats(); pintarGrid(); pintarCarrito();
    if (window.matchMedia('(min-width: 901px)').matches) $('p-q').focus();
  };
  function prepararPos() {
    selPos = G.selectorCliente(document.querySelector('[data-selector=p-cli]'));
    document.querySelector('[data-selector=p-cli]').onCambio = pintarCarrito;
    var metodos = D().metodos.slice(); if (D().ajustes.fiado) metodos.push('Fiado');
    segPos = G.segmento($('p-metodos'), metodos, pintarCarrito);
    var conEquipo = D().equipo.some(function (p) { return p.activo; });
    $('p-vendedor-caja').hidden = !conEquipo || !!D().yo;
    if (conEquipo) G.opcionesEquipo($('p-vendedor'), true, 'Sin asignar');
    if ('BarcodeDetector' in window && navigator.mediaDevices) $('p-camara').hidden = false;
  }
  function pintarCats() {
    var c = $('p-cats'); c.textContent = '';
    if (!CATS.length) { c.hidden = true; return; }
    c.hidden = false;
    [''].concat(CATS).forEach(function (k) {
      var b = el('button', { type: 'button', clase: 'g-chip' + (k === categoria ? ' g-puesto' : ''), 'aria-pressed': String(k === categoria), texto: k || 'Todo' });
      b.addEventListener('click', function () { categoria = k; pintarCats(); pintarGrid(); });
      c.appendChild(b);
    });
  }
  function filtrados() {
    var q = $('p-q').value.trim().toLowerCase();
    return productos().filter(function (p) {
      if (categoria && p.categoria !== categoria) return false;
      if (!q) return true;
      return p.nombre.toLowerCase().indexOf(q) >= 0 || p.codigo === q || hijos(p).some(function (h) { return h.codigo === q || h.variante.toLowerCase().indexOf(q) >= 0; });
    });
  }
  function pintarGrid() {
    var g = $('p-grid'); g.textContent = '';
    var lista = filtrados(), max = 120;
    if (!ARTS.length) {
      g.appendChild(el('p', { clase: 'g-nota', texto: dueno() ? 'Aún no tienes productos. Agrégalos en Inventario (uno por uno o pegando tu lista de Excel). Mientras, puedes vender con «Otro concepto».' : 'Aún no hay productos cargados. Usa «Otro concepto».' }));
    } else if (!lista.length) g.appendChild(el('p', { clase: 'g-nota', texto: 'No hay productos con «' + $('p-q').value + '».' }));
    lista.slice(0, max).forEach(function (p) {
      var h = hijos(p);
      var precios = h.length ? h.map(precioDe) : [p.precio];
      var min = Math.min.apply(null, precios), varios = precios.some(function (x) { return x !== min; });
      var enCarrito = carrito.filter(function (x) { return x.a && (x.a === p.id || (porId(x.a) || {}).padre === p.id); }).reduce(function (t, x) { return t + x.c; }, 0);
      var b = el('button', { type: 'button', clase: 'pos-prod', 'aria-label': p.nombre + ', ' + S(min) }, [
        el('strong', { texto: p.nombre }),
        el('span', { clase: 'pp-stock ' + claseStock(p), texto: (h.length ? h.length + ' variantes · ' : '') + stockTexto(p, p.unidad) }),
        el('span', { clase: 'pp-precio', texto: (varios ? 'desde ' : '') + S(min) + (POR_PESO.indexOf(p.unidad) >= 0 ? ' / ' + p.unidad : '') }),
      ]);
      if (enCarrito) b.appendChild(el('span', { clase: 'pp-cant', 'aria-hidden': 'true', texto: cant(enCarrito) }));
      b.addEventListener('click', function () { elegir(p); });
      g.appendChild(b);
    });
    Sellos.mostrar($('p-mas'), lista.length > max ? 'Mostrando ' + max + ' de ' + lista.length + ' productos. Escribe para encontrar el que buscas.' : '');
  }
  function elegir(p) {
    var h = hijos(p);
    if (!h.length) { agregar(p); return; }
    var dv = G.dialogo('d-variante'), l = $('va-lista'); l.textContent = '';
    $('d-variante-t').textContent = p.nombre;
    h.forEach(function (v) {
      var b = el('button', { type: 'button' }, [el('span', {}, [document.createTextNode(v.variante), el('small', { texto: ' · ' + (v.stock <= 0 ? 'agotado' : 'stock ' + cant(v.stock)) })]), el('strong', { texto: S(precioDe(v)) })]);
      b.addEventListener('click', function () { dv.cerrar(); agregar(v); });
      l.appendChild(b);
    });
    dv.abrir();
  }
  function agregar(a, c) {
    var it = carrito.find(function (x) { return x.a === a.id; });
    if (it) it.c = Math.round((it.c + (c || 1)) * 1000) / 1000;
    else carrito.push({ a: a.id, n: nombreDe(a), p: precioDe(a), c: c || 1, u: unidadDe(a) });
    pintarCarrito(); pintarGrid();
    G.aviso('Agregado: ' + nombreDe(a));
  }
  function totales() {
    var sub = carrito.reduce(function (t, x) { return t + Math.round((x.p || 0) * x.c); }, 0);
    var d = aCentimos($('p-descuento').value); d = isNaN(d) ? 0 : d;
    return { sub: sub, desc: d, total: Math.max(0, sub - d) };
  }
  function pintarCarrito() {
    if (!segPos) return;
    var ul = $('p-items'); ul.textContent = '';
    $('p-vacio').hidden = carrito.length > 0;
    carrito.forEach(function (x, i) {
      var nombre;
      if (x.libre) { nombre = el('input', { value: x.n, maxlength: '60', placeholder: 'Concepto', 'aria-label': 'Concepto' }); nombre.addEventListener('input', function () { x.n = nombre.value; }); }
      else { var a = porId(x.a); nombre = el('span', {}, [document.createTextNode(x.n), el('small', { texto: S(x.p) + (POR_PESO.indexOf(x.u) >= 0 ? ' / ' + x.u : '') + (a && a.controla && a.stock < x.c ? ' · solo hay ' + cant(a.stock) : '') })]); }
      var cantidad;
      if (POR_PESO.indexOf(x.u) >= 0) {
        cantidad = el('input', { type: 'number', step: '0.001', min: '0.001', inputmode: 'decimal', clase: 'i-kg', value: String(x.c), 'aria-label': 'Cantidad en ' + x.u });
        cantidad.addEventListener('input', function () { var v = Number(String(cantidad.value).replace(',', '.')); if (v > 0) { x.c = Math.round(v * 1000) / 1000; actualizarTotal(); } });
      } else {
        var menos = el('button', { type: 'button', 'aria-label': 'Quitar uno', texto: '−' }), mas = el('button', { type: 'button', 'aria-label': 'Agregar uno', texto: '+' });
        menos.addEventListener('click', function () { if (x.c > 1) { x.c--; pintarCarrito(); pintarGrid(); } });
        mas.addEventListener('click', function () { x.c++; pintarCarrito(); pintarGrid(); });
        cantidad = el('div', { clase: 'g-cant' }, [menos, el('span', { texto: cant(x.c) }), mas]);
      }
      var precio = el('input', { inputmode: 'decimal', maxlength: '9', value: x.p ? String(x.p / 100) : '', 'aria-label': 'Precio de ' + (x.n || 'concepto'), placeholder: '0.00' });
      precio.addEventListener('input', function () { var c = aCentimos(precio.value); x.p = isNaN(c) ? 0 : c; actualizarTotal(); });
      var quitar = el('button', { type: 'button', clase: 'g-quitar', 'aria-label': 'Quitar ' + (x.n || 'concepto'), texto: '×' });
      quitar.addEventListener('click', function () { carrito.splice(i, 1); pintarCarrito(); pintarGrid(); });
      ul.appendChild(el('li', {}, [el('div', { clase: 'i-n' }, [nombre]), cantidad, precio, quitar]));
    });
    var metodo = segPos.valor();
    $('p-efectivo').hidden = metodo !== 'Efectivo';
    var tieneTarjeta = selPos.tieneTarjeta();
    $('p-sello-caja').hidden = !tieneTarjeta;
    $('p-sello-t').textContent = D().negocio.tipo === 'puntos' ? 'Sumar sus puntos a la tarjeta' : D().negocio.tipo === 'cashback' ? 'Sumar su saldo a la tarjeta' : 'Sumar el sello a su tarjeta';
    actualizarTotal();
  }
  function actualizarTotal() {
    var t = totales(), recibido = aCentimos($('p-recibido').value);
    $('p-total').textContent = S(t.total);
    $('p-cobrar').textContent = t.total ? (segPos.valor() === 'Fiado' ? 'Fiar ' : 'Cobrar ') + S(t.total) : 'Cobrar';
    $('p-vuelto').textContent = recibido && !isNaN(recibido) && recibido >= t.total ? S(recibido - t.total) : 'S/ 0.00';
    var n = carrito.reduce(function (s, x) { return s + (POR_PESO.indexOf(x.u) >= 0 ? 1 : x.c); }, 0);
    $('p-ver').hidden = !carrito.length || abiertoMovil;
    $('p-ver-n').textContent = n + (n === 1 ? ' producto' : ' productos');
    $('p-ver-total').textContent = S(t.total);
  }
  $('p-q').addEventListener('input', pintarGrid);
  // Lector de código de barras (USB o Bluetooth): escribe el código y da Enter.
  $('p-q').addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    usarCodigo($('p-q').value);
  });
  function usarCodigo(codigo) {
    var a = buscarCodigo(codigo);
    if (a) { agregar(a); $('p-q').value = ''; pintarGrid(); return; }
    var lista = filtrados();
    if (lista.length === 1) { elegir(lista[0]); $('p-q').value = ''; pintarGrid(); return; }
    if (codigo.trim()) G.aviso(lista.length ? 'Hay ' + lista.length + ' productos con «' + codigo + '»: toca el que es.' : 'No hay ningún producto con el código ' + codigo + '.', !lista.length);
  }
  $('p-descuento').addEventListener('input', actualizarTotal);
  $('p-recibido').addEventListener('input', actualizarTotal);
  $('p-otro').addEventListener('click', function () { carrito.push({ n: '', p: 0, c: 1, u: 'unidad', libre: true }); pintarCarrito(); var ins = $('p-items').querySelectorAll('.i-n input'); if (ins.length) ins[ins.length - 1].focus(); });
  $('p-vaciar').addEventListener('click', function () { carrito = []; $('p-descuento').value = ''; $('p-recibido').value = ''; selPos.limpiar(); pintarCarrito(); pintarGrid(); });
  $('p-ver').addEventListener('click', function () { abiertoMovil = true; $('p-carrito').classList.add('abierto'); actualizarTotal(); });
  $('p-cerrar').addEventListener('click', function () { abiertoMovil = false; $('p-carrito').classList.remove('abierto'); actualizarTotal(); });
  document.addEventListener('click', function (ev) {
    if (abiertoMovil && !$('p-carrito').contains(ev.target) && !$('p-ver').contains(ev.target) && !ev.target.closest('dialog')) { abiertoMovil = false; $('p-carrito').classList.remove('abierto'); actualizarTotal(); }
  });
  $('p-cobrar').addEventListener('click', async function () {
    var err = $('p-error');
    var items = carrito.filter(function (x) { return String(x.n).trim(); }).map(function (x) { return x.libre ? { n: x.n, p: x.p / 100, c: x.c } : { a: x.a, p: x.p / 100, c: x.c }; });
    if (!items.length) { Sellos.mostrar(err, 'Agrega al menos un producto.'); return; }
    var t = totales();
    if (isNaN(aCentimos($('p-descuento').value))) { Sellos.mostrar(err, 'Revisa el descuento: solo números.'); return; }
    var metodo = segPos.valor();
    var datos = Object.assign({ items: items, descuento: t.desc / 100, metodo: metodo, sello: $('p-sello').checked, personal_id: $('p-vendedor').value || null }, selPos.valor());
    $('p-cobrar').disabled = true;
    var r = await api('ventas', { body: datos });
    $('p-cobrar').disabled = false;
    if (!r.ok) { Sellos.mostrar(err, r.datos.error || 'No se pudo registrar la venta.'); return; }
    err.hidden = true;
    var recibido = aCentimos($('p-recibido').value);
    mostrarVendido(r.datos, metodo === 'Efectivo' && recibido > t.total ? recibido - t.total : 0, metodo);
    carrito = []; $('p-descuento').value = ''; $('p-recibido').value = ''; selPos.limpiar(); segPos.marcar(D().metodos[0]);
    abiertoMovil = false; $('p-carrito').classList.remove('abierto');
    await cargarArticulos(true); pintarGrid(); pintarCarrito();
  });
  function mostrarVendido(r, vuelto, metodo) {
    var dv = G.dialogo('d-vendido'), c = $('vd-cuerpo'); c.textContent = '';
    c.append(el('p', { clase: 'g-nota', texto: metodo === 'Fiado' ? 'Fiado: se anotó en lo que te debe el cliente.' : 'Pagó con ' + metodo + '.' }), el('strong', { texto: S(r.total) }));
    if (vuelto) c.appendChild(el('p', { clase: 'vd-vuelto' }, [document.createTextNode('Vuelto: '), el('b', { texto: S(vuelto) })]));
    if (r.tarjeta) c.appendChild(el('p', { clase: 'g-nota', texto: r.tarjeta.aviso ? 'La tarjeta no sumó: ' + r.tarjeta.aviso : 'Su tarjeta ya sumó esta compra.' }));
    var url = location.origin + '/' + G.slug + '/v/' + r.token;
    $('vd-comprobante').href = '/' + G.slug + '/v/' + r.token;
    $('vd-wa').href = 'https://wa.me/' + (r.celular || '') + '?text=' + encodeURIComponent('Gracias por tu compra en ' + G.negocio + '. Tu comprobante: ' + url);
    dv.abrir();
  }
  $('vd-nueva').addEventListener('click', function () { setTimeout(function () { $('p-q').focus(); }, 50); });

  // Cámara (celulares con Chrome): lee el código de barras.
  var flujo = null, detector = null;
  $('p-camara').addEventListener('click', async function () {
    var dv = G.dialogo('d-escaner');
    try {
      detector = detector || new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] });
      flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch (e) { G.aviso('No se pudo abrir la cámara. Escribe el código o usa un lector.', true); return; }
    var v = $('es-video'); v.srcObject = flujo; await v.play();
    dv.abrir();
    var buscar = async function () {
      if (!dv.d.open) return;
      try {
        var r = await detector.detect(v);
        if (r.length) { cerrarCamara(); dv.cerrar(); usarCodigo(r[0].rawValue); return; }
      } catch (e) { /* cuadro sin código */ }
      setTimeout(buscar, 250);
    };
    buscar();
  });
  function cerrarCamara() { if (flujo) { flujo.getTracks().forEach(function (t) { t.stop(); }); flujo = null; } }
  $('d-escaner').addEventListener('close', cerrarCamara);

  // ---------- inventario ----------
  G.CARGAR.inventario = async function () {
    await cargarArticulos(true);
    var cat = $('in-cat'), actual = cat.value; cat.textContent = '';
    cat.appendChild(el('option', { value: '', texto: 'Todas las categorías' }));
    CATS.forEach(function (c) { cat.appendChild(el('option', { value: c, texto: c })); });
    cat.value = actual;
    $('in-csv').href = '/api/n/' + G.slug + '/g/inventario.csv';
    var ps = productos(), valor = 0, bajos = 0, agotados = 0;
    ARTS.forEach(function (a) { if (a.controla && a.stock > 0) valor += a.stock * costoDe(a); });
    ps.forEach(function (p) { var c = claseStock(p); if (c === 'bajo') bajos++; if (c === 'agotado') agotados++; });
    var k = $('in-kpis'); k.textContent = '';
    k.append(G.kpi('Productos', String(ps.length), CATS.length ? CATS.length + ' categorías' : ''),
      G.kpi('Valor del inventario', S(Math.round(valor)), 'Al costo'),
      G.kpi('Stock bajo', String(bajos), bajos ? 'Toca «Solo stock bajo» para verlos' : 'Todo en orden'),
      G.kpi('Agotados', String(agotados)));
    pintarInventario();
  };
  function pintarInventario() {
    var q = $('in-q').value.trim().toLowerCase(), cat = $('in-cat').value, bajo = $('in-bajo').checked;
    var lista = productos().filter(function (p) {
      if (cat && p.categoria !== cat) return false;
      if (bajo && !claseStock(p)) return false;
      return !q || p.nombre.toLowerCase().indexOf(q) >= 0 || p.codigo === q || hijos(p).some(function (h) { return h.codigo === q; });
    });
    var t = $('in-tabla'); t.textContent = '';
    t.appendChild(el('thead', {}, [el('tr', {}, ['Producto', 'Código', 'Categoría', 'Precio', 'Costo', 'Ganas', 'Stock', ''].map(function (h, i) { return el('th', { clase: i >= 3 && i <= 6 ? 'g-num' : '', texto: h }); }))]));
    var tb = el('tbody'); t.appendChild(tb);
    if (!ARTS.length) tb.appendChild(el('tr', {}, [el('td', { clase: 'vacio', colspan: '8', texto: dueno() ? 'Aún no tienes productos. Toca «Nuevo producto» o «Importar desde Excel».' : 'Aún no hay productos.' })]));
    else if (!lista.length) tb.appendChild(el('tr', {}, [el('td', { clase: 'vacio', colspan: '8', texto: 'Nada coincide con el filtro.' })]));
    var max = 300;
    lista.slice(0, max).forEach(function (p) {
      var h = hijos(p), costo = costoDe(p), margen = p.precio ? Math.round((p.precio - costo) / p.precio * 100) : 0;
      var nombre = el('td', {}, [document.createTextNode(p.nombre)]);
      if (h.length) nombre.appendChild(el('span', { clase: 'g-chip-tipo', texto: h.length + ' variantes' }));
      if (p.receta && p.receta.length) nombre.appendChild(el('span', { clase: 'g-chip-tipo', texto: 'receta' }));
      var acc = el('td', { clase: 'g-num' });
      if (dueno()) acc.appendChild(btn('Editar', 'chico', function () { abrirArticulo(p); }));
      var st = claseStock(p);
      tb.appendChild(el('tr', {}, [nombre, el('td', { clase: 'tenue', texto: p.codigo || '' }), el('td', { clase: 'tenue', texto: p.categoria }),
        el('td', { clase: 'g-num', texto: S(p.precio) + (POR_PESO.indexOf(p.unidad) >= 0 ? '/' + p.unidad : '') }), el('td', { clase: 'g-num tenue', texto: costo ? S(costo) : '—' }),
        el('td', { clase: 'g-num' + (margen < 0 ? ' g-stock-agotado' : ''), texto: costo ? margen + ' %' : '—' }),
        el('td', { clase: 'g-num' + (st === 'agotado' ? ' g-stock-agotado' : st === 'bajo' ? ' g-stock-bajo' : ''), texto: controla(p) && !(p.receta && p.receta.length) ? cant(stockDe(p)) + (p.unidad !== 'unidad' ? ' ' + p.unidad : '') : '—' }), acc]));
      h.forEach(function (v) {
        var sv = v.stock <= 0 ? ' g-stock-agotado' : v.minimo && v.stock <= v.minimo ? ' g-stock-bajo' : '';
        tb.appendChild(el('tr', { clase: 'var' }, [el('td', { texto: v.variante }), el('td', { clase: 'tenue', texto: v.codigo }), el('td'), el('td', { clase: 'g-num', texto: v.precio ? S(v.precio) : '' }), el('td'), el('td'),
          el('td', { clase: 'g-num' + sv, texto: cant(v.stock) }), el('td')]));
      });
    });
    Sellos.mostrar($('in-nota'), lista.length > max ? 'Mostrando ' + max + ' de ' + lista.length + '. Usa el buscador para encontrar el resto.' : '');
  }
  ['in-q', 'in-cat', 'in-bajo'].forEach(function (id) { $(id).addEventListener(id === 'in-q' ? 'input' : 'change', pintarInventario); });
  $('in-nuevo').addEventListener('click', function () { abrirArticulo(null); });

  // ----- producto (nuevo o editar) -----
  var dArt = null, artEditando = null;
  function filaVariante(v) {
    var tr = el('tr', { 'data-id': v.id ? String(v.id) : '' }, [
      el('td', {}, [el('input', { 'data-k': 'v', maxlength: '40', value: v.variante || '', placeholder: 'M / Negro', 'aria-label': 'Variante' })]),
      el('td', {}, [el('input', { 'data-k': 'codigo', maxlength: '40', value: v.codigo || '', 'aria-label': 'Código' })]),
      el('td', {}, [el('input', { 'data-k': 'precio', inputmode: 'decimal', value: v.precio ? String(v.precio / 100) : '', placeholder: 'igual', 'aria-label': 'Precio' })]),
      el('td', {}, [el('input', { 'data-k': 'stock', type: 'number', step: 'any', value: v.stock !== undefined ? String(v.stock) : '', 'aria-label': 'Stock' })]),
    ]);
    var q = el('button', { type: 'button', clase: 'g-quitar', 'aria-label': 'Quitar variante', texto: '×' });
    q.addEventListener('click', function () { tr.remove(); });
    tr.appendChild(el('td', {}, [q]));
    $('ar-var-filas').appendChild(tr);
    return tr;
  }
  function filaReceta(r) {
    var sel = el('select', { 'data-k': 'a', 'aria-label': 'Insumo' });
    sel.appendChild(el('option', { value: '', texto: 'Elige el insumo…' }));
    ARTS.filter(function (a) { return a.controla && (!artEditando || a.id !== artEditando.id); }).forEach(function (a) { sel.appendChild(el('option', { value: String(a.id), texto: nombreDe(a) + ' (' + unidadDe(a) + ')' })); });
    if (r.a) sel.value = String(r.a);
    var tr = el('tr', {}, [el('td', {}, [sel]), el('td', {}, [el('input', { 'data-k': 'c', type: 'number', step: 'any', min: '0', value: r.c !== undefined ? String(r.c) : '', placeholder: '0.25', 'aria-label': 'Cantidad' })])]);
    var q = el('button', { type: 'button', clase: 'g-quitar', 'aria-label': 'Quitar insumo', texto: '×' });
    q.addEventListener('click', function () { tr.remove(); });
    tr.appendChild(el('td', {}, [q]));
    $('ar-rec-filas').appendChild(tr);
  }
  function abrirArticulo(p) {
    dArt = dArt || G.dialogo('d-articulo');
    artEditando = p;
    dArt.f.reset();
    $('d-articulo-t').textContent = p ? 'Editar producto' : 'Nuevo producto';
    var dl = $('ar-categorias'); dl.textContent = ''; CATS.forEach(function (c) { dl.appendChild(el('option', { value: c })); });
    $('ar-nombre').value = p ? p.nombre : ''; $('ar-codigo').value = p ? p.codigo : ''; $('ar-categoria').value = p ? p.categoria : '';
    $('ar-unidad').value = p ? p.unidad : 'unidad'; $('ar-precio').value = p ? String(p.precio / 100) : ''; $('ar-costo').value = p && p.costo ? String(p.costo / 100) : '';
    $('ar-stock').value = p ? String(p.stock) : ''; $('ar-minimo').value = p && p.minimo ? String(p.minimo) : '';
    $('ar-var-filas').textContent = ''; $('ar-rec-filas').textContent = '';
    var h = p ? hijos(p) : [];
    $('ar-con-variantes').checked = h.length > 0; h.forEach(filaVariante);
    $('ar-con-receta').checked = !!(p && p.receta && p.receta.length); (p && p.receta || []).forEach(filaReceta);
    $('ar-borrar').hidden = !p;
    alternarArticulo(); margen();
    dArt.abrir();
  }
  function alternarArticulo() {
    var v = $('ar-con-variantes').checked, r = $('ar-con-receta').checked;
    $('ar-variantes').hidden = !v; $('ar-receta').hidden = !r;
    $('ar-stock-caja').hidden = v || r || $('ar-unidad').value === 'servicio';
    if (v && !$('ar-var-filas').children.length) { filaVariante({}); filaVariante({}); }
    if (r && !$('ar-rec-filas').children.length) filaReceta({});
  }
  function margen() {
    var p = aCentimos($('ar-precio').value), c = aCentimos($('ar-costo').value), m = $('ar-margen');
    if (!p || !c || isNaN(p) || isNaN(c)) { m.textContent = '—'; m.classList.remove('neg'); return; }
    m.textContent = S(p - c) + ' (' + Math.round((p - c) / p * 100) + ' %)'; m.classList.toggle('neg', p < c);
  }
  ['ar-con-variantes', 'ar-con-receta', 'ar-unidad'].forEach(function (id) { $(id).addEventListener('change', function () {
    if (id === 'ar-con-variantes' && $(id).checked) $('ar-con-receta').checked = false;
    if (id === 'ar-con-receta' && $(id).checked) $('ar-con-variantes').checked = false;
    alternarArticulo();
  }); });
  $('ar-precio').addEventListener('input', margen); $('ar-costo').addEventListener('input', margen);
  $('ar-var-mas').addEventListener('click', function () { filaVariante({}).querySelector('input').focus(); });
  $('ar-rec-mas').addEventListener('click', function () { filaReceta({}); });
  $('d-articulo').querySelector('form').addEventListener('submit', async function (ev) {
    if (ev.submitter && ev.submitter.value === 'cancelar') return;
    ev.preventDefault();
    var datos = { nombre: $('ar-nombre').value, codigo: $('ar-codigo').value, categoria: $('ar-categoria').value, unidad: $('ar-unidad').value,
      precio: $('ar-precio').value, costo: $('ar-costo').value, stock: $('ar-stock').value, minimo: $('ar-minimo').value, variantes: [], receta: [] };
    if ($('ar-con-variantes').checked) datos.variantes = Array.prototype.map.call($('ar-var-filas').children, function (tr) {
      var o = { id: tr.getAttribute('data-id') || null }; tr.querySelectorAll('input').forEach(function (i) { o[i.getAttribute('data-k')] = i.value.trim(); }); return o;
    }).filter(function (o) { return o.v; });
    if ($('ar-con-receta').checked) datos.receta = Array.prototype.map.call($('ar-rec-filas').children, function (tr) {
      return { a: tr.querySelector('select').value, c: tr.querySelector('input').value };
    }).filter(function (o) { return o.a; });
    if ($('ar-con-variantes').checked && !datos.variantes.length) return dArt.mal('Escribe al menos una variante (por ejemplo «M / Negro»).');
    var r = await api('articulos' + (artEditando ? '/' + artEditando.id : ''), { body: datos });
    if (!r.ok) return dArt.mal(r.datos.error || 'No se pudo guardar.');
    dArt.cerrar(); G.aviso('Producto guardado.');
    await cargarArticulos(true); G.recargar();
  });
  $('ar-borrar').addEventListener('click', async function () {
    if (!artEditando || !confirm('¿Dar de baja «' + artEditando.nombre + '»? Sus ventas pasadas se conservan.')) return;
    var r = await api('articulos/' + artEditando.id + '/borrar', { body: {} });
    if (!r.ok) return dArt.mal(r.datos.error || 'No se pudo.');
    dArt.cerrar(); G.aviso('Producto dado de baja.'); await cargarArticulos(true); G.recargar();
  });

  // ----- importar -----
  $('in-importar').addEventListener('click', function () { var d = G.dialogo('d-importar'); d.f.reset(); d.abrir(); });
  $('d-importar').querySelector('form').addEventListener('submit', async function (ev) {
    if (ev.submitter && ev.submitter.value === 'cancelar') return;
    ev.preventDefault();
    var d = G.dialogo('d-importar');
    var r = await api('articulos/importar', { body: { texto: $('im-texto').value } });
    if (!r.ok) return d.mal(r.datos.error || 'No se pudo importar.');
    d.cerrar(); G.aviso('Listo: ' + r.datos.nuevos + ' productos nuevos y ' + r.datos.actualizados + ' actualizados.');
    await cargarArticulos(true); G.recargar();
  });

  // ----- comprar mercadería -----
  var compra = [], segCompra = null, pagadoTocado = false, PROVS = [];
  var abriendoCompra = false;
  G.abrirCompra = async function (proveedorId) {
    if (abriendoCompra || $('d-compra').open) return; // doble clic
    abriendoCompra = true;
    try { await cargarArticulos(true); } finally { abriendoCompra = false; }
    var rp = await api('proveedores'); PROVS = rp.ok ? rp.datos.proveedores : [];
    var d = G.dialogo('d-compra');
    compra = []; pagadoTocado = false;
    var sel = $('co-proveedor'); sel.textContent = '';
    sel.appendChild(el('option', { value: '', texto: 'Sin proveedor' }));
    PROVS.filter(function (p) { return p.activo; }).forEach(function (p) { sel.appendChild(el('option', { value: String(p.id), texto: p.nombre })); });
    sel.value = proveedorId ? String(proveedorId) : '';
    $('co-dia').value = G.hoy(); $('co-dia').max = G.hoy();
    var dl = $('co-productos'); dl.textContent = '';
    ARTS.filter(function (a) { return a.controla; }).forEach(function (a) { dl.appendChild(el('option', { value: nombreDe(a) + (a.codigo ? ' · ' + a.codigo : '') })); });
    segCompra = segCompra || G.segmento($('co-metodos'), D().todosMetodos);
    segCompra.marcar('Efectivo');
    $('co-buscar').value = ''; $('co-pagado').value = '';
    pintarCompra();
    d.abrir();
    setTimeout(function () { $('co-buscar').focus(); }, 30);
  };
  function agregarACompra(texto) {
    texto = String(texto || '').trim();
    if (!texto) return;
    var cod = texto.split(' · ').pop();
    var a = buscarCodigo(cod) || buscarCodigo(texto) || ARTS.find(function (x) { return x.controla && (nombreDe(x) === texto.split(' · ')[0] || nombreDe(x).toLowerCase() === texto.toLowerCase()); });
    if (!a || !a.controla) { G.aviso('No encontré ese producto. Créalo primero en Inventario.', true); return; }
    var f = compra.find(function (x) { return x.a === a.id; });
    if (f) f.c++; else compra.push({ a: a.id, n: nombreDe(a), c: 1, k: costoDe(a) });
    $('co-buscar').value = '';
    pintarCompra();
  }
  $('co-buscar').addEventListener('change', function () { agregarACompra(this.value); });
  $('co-buscar').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); agregarACompra(this.value); } });
  function totalCompra() { return Math.round(compra.reduce(function (t, x) { return t + x.c * x.k; }, 0)); }
  function pintarCompra() {
    var tb = $('co-filas'); tb.textContent = '';
    $('co-vacio').hidden = compra.length > 0;
    compra.forEach(function (x, i) {
      var c = el('input', { type: 'number', step: 'any', min: '0', value: String(x.c), 'aria-label': 'Cantidad de ' + x.n });
      var k = el('input', { inputmode: 'decimal', value: x.k ? String(x.k / 100) : '', placeholder: '0.00', 'aria-label': 'Costo de ' + x.n });
      var sub = el('td', { clase: 'g-num', texto: S(Math.round(x.c * x.k)) });
      c.addEventListener('input', function () { x.c = Number(c.value) || 0; sub.textContent = S(Math.round(x.c * x.k)); totalesCompra(); });
      k.addEventListener('input', function () { var v = aCentimos(k.value); x.k = isNaN(v) ? 0 : v; sub.textContent = S(Math.round(x.c * x.k)); totalesCompra(); });
      var q = el('button', { type: 'button', clase: 'g-quitar', 'aria-label': 'Quitar', texto: '×' });
      q.addEventListener('click', function () { compra.splice(i, 1); pintarCompra(); });
      tb.appendChild(el('tr', {}, [el('td', { texto: x.n }), el('td', {}, [c]), el('td', {}, [k]), sub, el('td', {}, [q])]));
    });
    totalesCompra();
  }
  function totalesCompra() { var t = totalCompra(); $('co-total').textContent = S(t); if (!pagadoTocado) $('co-pagado').value = t ? String(t / 100) : ''; }
  $('co-pagado').addEventListener('input', function () { pagadoTocado = true; });
  $('d-compra').querySelector('form').addEventListener('submit', async function (ev) {
    if (ev.submitter && ev.submitter.value === 'cancelar') return;
    ev.preventDefault();
    var d = G.dialogo('d-compra');
    if (!compra.length) return d.mal('Agrega los productos que compraste.');
    var r = await api('compras', { body: { proveedor_id: $('co-proveedor').value || null, dia: $('co-dia').value, items: compra.map(function (x) { return { a: x.a, c: x.c, k: x.k / 100 }; }), pagado: $('co-pagado').value, metodo: segCompra.valor() } });
    if (!r.ok) return d.mal(r.datos.error || 'No se pudo guardar la compra.');
    d.cerrar(); G.aviso('Compra guardada: ' + S(r.datos.total) + (r.datos.debe ? '. Quedas debiendo ' + S(r.datos.debe) + '.' : '. El stock ya subió.'));
    await cargarArticulos(true); G.recargar();
  });

  // ---------- deudas ----------
  G.CARGAR.deudas = async function () {
    var r = await api('deudas');
    if (!r.ok) return;
    var d = r.datos;
    $('de-csv').href = '/api/n/' + G.slug + '/g/deudas.csv';
    var k = $('de-kpis'); k.textContent = '';
    k.append(G.kpi('Te deben', S(d.porCobrar), d.clientes.length + (d.clientes.length === 1 ? ' cliente' : ' clientes'), 'principal'));
    if (dueno()) k.append(G.kpi('Le debes a proveedores', S(d.porPagar), d.proveedores.length + (d.proveedores.length === 1 ? ' proveedor' : ' proveedores')));
    var l = $('de-clientes'); l.textContent = '';
    if (!d.clientes.length) G.vacio(l, 'Nadie te debe. Para fiar, elige «Fiado» al vender y escoge al cliente.');
    d.clientes.forEach(function (c) {
      var fin = el('div', { clase: 'l-fin' }, [el('span', { clase: 'l-monto', texto: S(c.saldo) })]);
      fin.appendChild(G.enlaceWa(c.celularWa, 'Hola ' + G.primer(c.nombre) + ', te saludamos de ' + G.negocio + '. Te recordamos que tienes un saldo pendiente de ' + S(c.saldo) + '. ¡Gracias!', 'Recordar'));
      fin.appendChild(btn('Registrar pago', 'chico', function () { G.abrirAbono(c, G.recargar); }));
      l.appendChild(el('li', {}, [el('div', { clase: 'l-quien' }, [el('strong', { texto: c.nombre }), el('span', { texto: 'Última compra fiada: ' + (c.dias === 0 ? 'hoy' : 'hace ' + c.dias + (c.dias === 1 ? ' día' : ' días')) })]), fin]));
    });
    var lp = $('de-proveedores'); lp.textContent = '';
    if (!d.proveedores.length) G.vacio(lp, 'No le debes a ningún proveedor.');
    d.proveedores.forEach(function (p) {
      lp.appendChild(el('li', {}, [el('div', { clase: 'l-quien' }, [el('strong', { texto: p.nombre }), el('span', { texto: p.compras + (p.compras === 1 ? ' compra por pagar' : ' compras por pagar') + ' · desde ' + G.fechaCorta(p.desde) })]),
        el('div', { clase: 'l-fin' }, [el('span', { clase: 'l-monto', texto: S(p.saldo) }), btn('Ver y pagar', 'chico', function () { provAbierto = p.id; location.hash = '#proveedores'; })])]));
    });
  };
  var segAbono = null, abonoCliente = null, abonoDespues = null;
  G.abrirAbono = function (c, despues) {
    var d = G.dialogo('d-abono');
    abonoCliente = c; abonoDespues = despues;
    $('ab-quien').textContent = c.nombre + ' debe ' + S(c.saldo) + '.';
    $('ab-monto').value = String(c.saldo / 100);
    segAbono = segAbono || G.segmento($('ab-metodos'), D().todosMetodos);
    segAbono.marcar('Efectivo');
    d.abrir();
    setTimeout(function () { $('ab-monto').select(); }, 30);
  };
  $('d-abono').querySelector('form').addEventListener('submit', async function (ev) {
    if (ev.submitter && ev.submitter.value === 'cancelar') return;
    ev.preventDefault();
    var d = G.dialogo('d-abono');
    var r = await api('abonos', { body: { cliente_id: abonoCliente.id, monto: $('ab-monto').value, metodo: segAbono.valor() } });
    if (!r.ok) return d.mal(r.datos.error || 'No se pudo registrar.');
    d.cerrar(); G.aviso(r.datos.saldo ? 'Pago registrado. Aún debe ' + S(r.datos.saldo) + '.' : 'Pago registrado. Ya no debe nada.');
    if (abonoDespues) abonoDespues();
  });

  // ---------- proveedores ----------
  var provAbierto = null, provEditando = null;
  G.CARGAR.proveedores = async function () {
    var r = await api('proveedores');
    if (!r.ok) return;
    PROVS = r.datos.proveedores;
    var l = $('pr-lista'); l.textContent = '';
    if (!PROVS.length) G.vacio(l, 'Agrega a tus proveedores para saber qué les compras y cuánto les debes.');
    PROVS.forEach(function (p) {
      var b = el('button', { type: 'button' }, [el('div', { clase: 'l-quien' }, [el('strong', { texto: p.nombre }), el('span', { texto: (p.saldo ? 'Le debes ' + S(p.saldo) : 'Al día') + (p.activo ? '' : ' · inactivo') })])]);
      b.addEventListener('click', function () { abrirProveedor(p.id); });
      l.appendChild(el('li', { 'aria-current': String(p.id === provAbierto) }, [b]));
    });
    if (provAbierto) abrirProveedor(provAbierto);
  };
  async function abrirProveedor(id) {
    provAbierto = id;
    var p = PROVS.find(function (x) { return x.id === id; });
    if (!p) return;
    $('pr-lista').querySelectorAll('li').forEach(function (li, i) { li.setAttribute('aria-current', String(PROVS[i] && PROVS[i].id === id)); });
    var r = await api('compras?proveedor=' + id);
    var f = $('pr-ficha'); f.textContent = ''; f.hidden = false; f.classList.add('g-ficha');
    f.appendChild(el('div', { clase: 'g-ficha-cab' }, [el('div', {}, [el('h2', { texto: p.nombre }), el('p', { texto: [p.ruc ? 'RUC ' + p.ruc : '', p.celular, p.contacto].filter(Boolean).join(' · ') || 'Sin datos de contacto' })]),
      el('span', { clase: 'g-tarjeta-chip' + (p.saldo ? '' : ' listo'), texto: p.saldo ? 'Le debes ' + S(p.saldo) : 'Al día' })]));
    var acc = el('div', { clase: 'g-acciones' }, [btn('Comprar', 'primario chico', function () { G.abrirCompra(p.id); }), btn('Editar', 'chico', function () { abrirFormProveedor(p); })]);
    if (p.celularWa) acc.appendChild(G.enlaceWa(p.celularWa, 'Hola, te escribimos de ' + G.negocio + '. ', 'Escribirle'));
    f.appendChild(acc);
    if (p.nota) f.appendChild(el('p', { clase: 'g-nota', texto: p.nota }));
    f.appendChild(el('h3', { texto: 'Compras' }));
    var l = el('ul', { clase: 'g-lista' });
    var compras = r.ok ? r.datos.compras : [];
    if (!compras.length) G.vacio(l, 'Aún no le compraste nada. Toca «Comprar» para registrar mercadería que llegó.');
    compras.forEach(function (c) {
      var debe = c.total - c.pagado;
      var fin = el('div', { clase: 'l-fin' }, [el('span', { clase: 'l-monto', texto: S(c.total) })]);
      if (debe > 0) { fin.appendChild(el('span', { clase: 'g-estado-chip', 'data-e': 'pendiente', texto: 'Debes ' + S(debe) })); fin.appendChild(btn('Pagar', 'chico', function () { abrirPago(c, p); })); }
      else fin.appendChild(el('span', { clase: 'g-estado-chip', 'data-e': 'atendida', texto: 'Pagada' }));
      l.appendChild(el('li', {}, [el('div', { clase: 'l-quien' }, [el('strong', { texto: G.fechaCorta(c.dia) + ' · ' + c.items.length + (c.items.length === 1 ? ' producto' : ' productos') }), el('span', { texto: c.items.map(function (x) { return cant(x.c) + ' × ' + x.n; }).join(', ') })]), fin]));
    });
    f.appendChild(l);
  }
  function abrirFormProveedor(p) {
    provEditando = p;
    var d = G.dialogo('d-proveedor'); d.f.reset();
    $('d-proveedor-t').textContent = p ? 'Editar proveedor' : 'Nuevo proveedor';
    $('pv-nombre').value = p ? p.nombre : ''; $('pv-ruc').value = p ? p.ruc : ''; $('pv-celular').value = p && p.celularWa ? p.celularWa.slice(2) : '';
    $('pv-contacto').value = p ? p.contacto : ''; $('pv-nota').value = p ? p.nota : '';
    d.abrir();
  }
  $('pr-nuevo').addEventListener('click', function () { abrirFormProveedor(null); });
  $('d-proveedor').querySelector('form').addEventListener('submit', async function (ev) {
    if (ev.submitter && ev.submitter.value === 'cancelar') return;
    ev.preventDefault();
    var d = G.dialogo('d-proveedor');
    var r = await api('proveedores' + (provEditando ? '/' + provEditando.id : ''), { body: { nombre: $('pv-nombre').value, ruc: $('pv-ruc').value, celular: $('pv-celular').value, contacto: $('pv-contacto').value, nota: $('pv-nota').value } });
    if (!r.ok) return d.mal(r.datos.error || 'No se pudo guardar.');
    d.cerrar(); G.aviso('Proveedor guardado.'); provAbierto = r.datos.id; G.CARGAR.proveedores();
  });
  var pagoCompra = null, segPago = null;
  function abrirPago(c, p) {
    pagoCompra = c;
    var d = G.dialogo('d-pago');
    $('pa-quien').textContent = 'Compra del ' + G.fechaCorta(c.dia) + ' a ' + p.nombre + ': falta pagar ' + S(c.total - c.pagado) + '.';
    $('pa-monto').value = String((c.total - c.pagado) / 100);
    segPago = segPago || G.segmento($('pa-metodos'), D().todosMetodos);
    segPago.marcar('Efectivo');
    d.abrir();
  }
  $('d-pago').querySelector('form').addEventListener('submit', async function (ev) {
    if (ev.submitter && ev.submitter.value === 'cancelar') return;
    ev.preventDefault();
    var d = G.dialogo('d-pago');
    var r = await api('compras/' + pagoCompra.id + '/pago', { body: { monto: $('pa-monto').value, metodo: segPago.valor() } });
    if (!r.ok) return d.mal(r.datos.error || 'No se pudo registrar.');
    d.cerrar(); G.aviso('Pago al proveedor registrado.'); G.CARGAR.proveedores();
  });

  // ---------- inicio y finanzas del comercio ----------
  G.inicioComercio = function (d) {
    var esDueno = dueno();
    $('i-resumen').textContent = d.dia.ventas ? d.dia.ventas + (d.dia.ventas === 1 ? ' venta hoy' : ' ventas hoy') + (d.stockBajo.length ? ' · ' + d.stockBajo.length + ' productos por reponer' : '') : 'Aún no hay ventas hoy. Toca «Vender» para empezar.';
    var k = $('i-kpis'); k.textContent = '';
    k.append(G.kpi('Vendido hoy', S(d.dia.vendido), d.dia.ventas + (d.dia.ventas === 1 ? ' venta' : ' ventas') + (d.dia.fiado ? ' · ' + S(d.dia.fiado) + ' fiado' : ''), 'principal'),
      esDueno ? G.kpi('Ganancia de hoy', S(d.dia.ganancia), 'Ventas menos lo que costó la mercadería') : G.kpi('Gastos de hoy', S(d.dia.gastado)),
      G.kpi('Efectivo en caja', S(d.dia.efectivo), 'Ventas y cobros en efectivo, menos gastos en efectivo'),
      G.kpi('Te deben', S(d.porCobrar), d.deudores.length ? 'Fiados por cobrar' : 'Nadie te debe'));
    var l = $('i-citas'); l.textContent = '';
    if (!d.masVendidos.length) G.vacio(l, 'Cuando vendas, aquí verás lo que más sale hoy.');
    d.masVendidos.forEach(function (x) { l.appendChild(el('li', {}, [el('div', { clase: 'l-quien' }, [el('strong', { texto: x.n }), el('span', { texto: cant(x.c) + (x.c === 1 ? ' vendido' : ' vendidos') })]), el('div', { clase: 'l-fin' }, [el('span', { clase: 'l-monto', texto: S(x.total) })])])); });
    $('i-mes').hidden = !d.mes;
    if (d.mes) {
      var m = $('i-mes-datos'); m.textContent = '';
      [['Ventas', S(d.mes.ingresos)], ['Costo de lo vendido', '− ' + S(d.mes.costoVendido)], ['Gastos del negocio', '− ' + S(d.mes.gastosOperativos)], ['Ganancia', S(d.mes.gananciaNeta), d.mes.gananciaNeta < 0]].forEach(function (f) {
        m.appendChild(el('div', { clase: 'g-mes-fila' }, [el('span', { texto: f[0] }), el('strong', { clase: f[2] ? 'neg' : '', texto: f[1] })]));
      });
      if (d.mes.meta) {
        var pct = Math.round(d.mes.ingresos / d.mes.meta * 100), esperado = Math.round(d.mes.diaMes / d.mes.diasMes * 100);
        var barra = el('span'); barra.style.width = Math.min(100, pct) + '%';
        m.append(el('p', { clase: 'g-nota', texto: 'Meta del mes: ' + S(d.mes.meta) + ' · vas en ' + pct + ' %' + (pct >= esperado ? ', vas bien.' : ' (a esta fecha deberías ir en ' + esperado + ' %).') }),
          el('div', { clase: 'g-avance', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.min(100, pct)), 'aria-label': 'Avance de la meta' }, [barra]));
      }
    }
    var a = $('i-avisos'); a.textContent = '';
    d.stockBajo.forEach(function (p) {
      a.appendChild(el('li', {}, [el('div', { clase: 'l-quien' }, [el('strong', { texto: (p.s <= 0 ? 'Agotado: ' : 'Queda poco: ') + p.n }), el('span', { texto: 'Stock: ' + cant(p.s) + (p.u !== 'unidad' ? ' ' + p.u : '') + (p.m ? ' (avisas con ' + cant(p.m) + ')' : '') })]),
        esDueno ? el('div', { clase: 'l-fin' }, [btn('Comprar', 'chico', function () { G.abrirCompra(); })]) : null]));
    });
    d.deudores.forEach(function (c) {
      a.appendChild(el('li', {}, [el('div', { clase: 'l-quien' }, [el('strong', { texto: c.nombre + ' te debe ' + S(c.saldo) }), el('span', { texto: 'Última compra fiada ' + (c.dias === 0 ? 'hoy' : 'hace ' + c.dias + (c.dias === 1 ? ' día' : ' días')) })]),
        el('div', { clase: 'l-fin' }, [G.enlaceWa(c.celularWa, 'Hola ' + G.primer(c.nombre) + ', te saludamos de ' + G.negocio + '. Te recordamos que tienes un saldo pendiente de ' + S(c.saldo) + '. ¡Gracias!', 'Recordar'), btn('Cobrar', 'chico', function () { G.abrirAbono(c, G.recargar); })])]));
    });
    d.cumpleanos.forEach(function (c) {
      a.appendChild(el('li', {}, [el('div', { clase: 'l-quien' }, [el('strong', { texto: '🎂 Hoy cumple años ' + c.nombre }), el('span', { texto: 'Salúdalo: un detalle hoy lo hace volver.' })]),
        el('div', { clase: 'l-fin' }, [G.enlaceWa(c.celularWa, '¡Feliz cumpleaños, ' + G.primer(c.nombre) + '! 🎉 Te saludamos de ' + G.negocio + '.', 'Saludar')])]));
    });
    if (!a.children.length) G.vacio(a, 'Todo al día. Aquí verás lo que se está acabando, quién te debe y los cumpleaños de tus clientes.');
  };
  G.finanzasComercio = function (d) {
    var r = $('f-resultado'); r.textContent = '';
    [['Ventas', S(d.ingresos)], ['Costo de lo vendido', '− ' + S(d.costoVendido)], ['Ganancia bruta', S(d.gananciaBruta), false, true], ['Gastos del negocio', '− ' + S(d.gastosOperativos)], ['Ganancia', S(d.ganancia), d.ganancia < 0, true]].forEach(function (f) {
      r.appendChild(el('div', { clase: 'g-mes-fila' }, [el('span', { texto: f[0] }), el(f[3] ? 'strong' : 'span', { clase: f[2] ? 'neg' : '', texto: f[1] })]));
    });
    r.appendChild(el('p', { clase: 'g-nota', texto: 'Este mes compraste mercadería por ' + S(d.compras) + '. No resta aquí: su costo se cuenta cuando la vendes.' }));
    G.barras($('f-ganancia'), (d.topGanancia || []).filter(function (x) { return x.ganancia > 0; }).map(function (x) { return { n: x.n, total: x.ganancia }; }), { vacio: 'Carga el costo de tus productos para ver cuáles te dejan más.' });
  };
})();
