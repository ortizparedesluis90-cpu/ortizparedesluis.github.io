/* Donde Andrés BBQ — linktree + tienda
   Flujo: carrito → datos → pago (Yape / Plin / transferencia) → pedido por WhatsApp.
   No se piden ni se guardan datos de tarjeta. Los datos personales del formulario
   no se guardan en el navegador: solo viajan en el mensaje que el cliente envía. */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', init);

  var CFG, B, PAY, DEL, store, PRODUCTS = [], cart = {}, step = 1, order = null;
  var CART_KEY = 'da_cart';
  var MAX_QTY = 20;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- utilidades ---------- */
  var money = function (n) { return 'S/ ' + n.toFixed(2); };
  function priceOf(p) {
    var v = Number(p.price) || 0;
    if (!v && CFG.demo && window.DA_DEMO_PRICES) v = Number(window.DA_DEMO_PRICES[p.id]) || 0;
    return v > 0 ? Math.round(v * 100) / 100 : 0;
  }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function svg(path, extra) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    if (extra) s.setAttribute('class', extra);
    s.innerHTML = path; // solo trazos fijos definidos en este archivo
    return s;
  }
  var ICON_PLUS = '<path d="M12 5v14M5 12h14"/>';
  function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  /* ---------- inicio ---------- */
  function init() {
    CFG = window.DA_CONFIG; B = CFG.business; PAY = CFG.payments || {}; DEL = CFG.delivery || {};
    store = window.DA.store;
    PRODUCTS = (CFG.products || []).filter(function (p) { return p && p.id && p.name; });
    if (CFG.demo) $('demo-bar').hidden = false;

    var fee = Number(DEL.fee) || 0;
    $('perk-delivery').textContent = fee > 0 ? 'Delivery en Lima desde ' + money(fee) : 'Delivery incluido en Lima';

    loadCart();
    renderProducts();
    setupDock();
    setupLightbox();
    setupCheckout();
    updateCartUI();
  }

  /* ---------- carrito ---------- */
  function loadCart() {
    var saved = store.get(CART_KEY) || {};
    cart = {};
    PRODUCTS.forEach(function (p) {
      var q = parseInt(saved[p.id], 10);
      if (q > 0 && p.available !== false && priceOf(p) > 0) cart[p.id] = Math.min(q, MAX_QTY);
    });
  }
  function saveCart() { store.set(CART_KEY, cart); }
  function setQty(id, q) {
    q = Math.max(0, Math.min(MAX_QTY, q));
    if (q) cart[id] = q; else delete cart[id];
    saveCart();
    updateCartUI();
  }
  function cartItems() {
    return PRODUCTS.filter(function (p) { return cart[p.id]; }).map(function (p) {
      var price = priceOf(p);
      return { p: p, qty: cart[p.id], price: price, total: Math.round(price * cart[p.id] * 100) / 100 };
    });
  }
  function cartCount() { return Object.keys(cart).reduce(function (s, k) { return s + cart[k]; }, 0); }
  function deliveryFee(district) {
    var by = DEL.feeByDistrict || {};
    if (district && by[district] != null) return Number(by[district]) || 0;
    return Number(DEL.fee) || 0;
  }
  function totals(district) {
    var sub = cartItems().reduce(function (s, i) { return s + i.total; }, 0);
    sub = Math.round(sub * 100) / 100;
    var fee = deliveryFee(district);
    return { sub: sub, fee: fee, total: Math.round((sub + fee) * 100) / 100 };
  }

  /* ---------- productos ---------- */
  function renderProducts() {
    var list = $('products');
    list.textContent = '';
    PRODUCTS.forEach(function (p, i) {
      var price = priceOf(p);
      var buyable = p.available !== false && price > 0;
      var pic = el('button', { class: 'pic', type: 'button', 'data-lb': i, 'aria-label': 'Ver foto de ' + p.name },
        [el('img', { src: p.image, alt: p.alt || p.name, loading: 'lazy', decoding: 'async', width: 540, height: 795 })]);
      var foot = el('div', { class: 'foot', 'data-foot': p.id });
      if (buyable) foot.appendChild(el('span', { class: 'price', text: money(price) }));
      else foot.appendChild(el('span', { class: 'price na', text: p.available === false ? 'No disponible para delivery' : 'Precio por confirmar' }));
      var body = el('div', { class: 'body' }, [el('h3', { text: p.name }), p.desc ? el('p', { text: p.desc }) : null, foot]);
      list.appendChild(el('li', { class: 'card' }, [pic, body]));
    });
    list.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]');
      if (!b) return;
      var id = b.getAttribute('data-id'), q = cart[id] || 0, act = b.getAttribute('data-act');
      if (act === 'add') { setQty(id, 1); window.DA_track('add_to_cart', { item_id: id }); focusStepper(id); }
      else if (act === 'inc') setQty(id, q + 1);
      else if (act === 'dec') { setQty(id, q - 1); if (q - 1 <= 0) focusAdd(id); }
    });
  }
  function focusStepper(id) { var b = document.querySelector('[data-foot="' + id + '"] [data-act="inc"]'); if (b) b.focus(); }
  function focusAdd(id) { var b = document.querySelector('[data-foot="' + id + '"] [data-act="add"]'); if (b) b.focus(); }

  function stepper(p, q) {
    return el('div', { class: 'stepper', role: 'group', 'aria-label': 'Cantidad de ' + p.name }, [
      el('button', { type: 'button', 'data-act': 'dec', 'data-id': p.id, 'aria-label': 'Quitar uno de ' + p.name, text: '−' }),
      el('output', { 'aria-live': 'polite', text: String(q) }),
      el('button', { type: 'button', 'data-act': 'inc', 'data-id': p.id, 'aria-label': 'Agregar uno más de ' + p.name, text: '+', disabled: q >= MAX_QTY })
    ]);
  }

  function updateCartUI() {
    PRODUCTS.forEach(function (p) {
      var foot = document.querySelector('[data-foot="' + p.id + '"]');
      if (!foot || p.available === false || !priceOf(p)) return;
      var ctl = foot.querySelector('.stepper, .add');
      var q = cart[p.id] || 0;
      var next = q ? stepper(p, q) : el('button', { class: 'add', type: 'button', 'data-act': 'add', 'data-id': p.id, 'aria-label': 'Agregar ' + p.name + ' al pedido' }, [svg(ICON_PLUS), 'Agregar']);
      // conservar el foco al pasar de stepper a stepper
      var hadFocus = ctl && ctl.contains(document.activeElement) ? document.activeElement.getAttribute('data-act') : null;
      if (ctl) foot.replaceChild(next, ctl); else foot.appendChild(next);
      if (hadFocus && q) { var f = next.querySelector('[data-act="' + hadFocus + '"]'); if (f && !f.disabled) f.focus(); else next.querySelector('[data-act="dec"]').focus(); }
    });
    var n = cartCount();
    $('cart-count').textContent = String(n);
    $('open-cart').setAttribute('aria-label', 'Ver pedido: ' + n + (n === 1 ? ' producto' : ' productos') + ', ' + money(totals().sub));
    $('dock').classList.toggle('has-cart', n > 0);
    updateDock();
    if ($('checkout').open && step === 1) renderCart();
  }

  /* ---------- barra inferior ---------- */
  var ctaOut = false, cookieOpen = false;
  function setupDock() {
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) {
        ctaOut = !e[0].isIntersecting && e[0].boundingClientRect.top < 0;
        updateDock();
      }).observe($('reserve'));
    }
    document.addEventListener('da:cookie-banner', function (e) { cookieOpen = e.detail.open; updateDock(); });
    $('open-cart').addEventListener('click', function () { openCheckout(1); });
  }
  function updateDock() {
    var show = !cookieOpen && (ctaOut || cartCount() > 0);
    var d = $('dock');
    d.classList.toggle('show', show);
    d.querySelectorAll('a,button').forEach(function (x) { x.tabIndex = show ? 0 : -1; });
    d.setAttribute('aria-hidden', show ? 'false' : 'true');
  }

  /* ---------- visor de fotos ---------- */
  function setupLightbox() {
    var d = $('lb'), im = $('lbimg'), cap = $('lbcap'), cnt = $('lbcount'), i = 0;
    function show(n) {
      i = (n + PRODUCTS.length) % PRODUCTS.length;
      var p = PRODUCTS[i];
      im.src = p.image; im.alt = p.alt || p.name;
      cap.textContent = p.name; cnt.textContent = (i + 1) + ' de ' + PRODUCTS.length;
    }
    $('products').addEventListener('click', function (e) {
      var b = e.target.closest('[data-lb]');
      if (!b) return;
      show(parseInt(b.getAttribute('data-lb'), 10));
      if (d.showModal) d.showModal(); else window.open(im.src, '_blank');
    });
    $('lbclose').addEventListener('click', function () { d.close(); });
    $('lbprev').addEventListener('click', function () { show(i - 1); });
    $('lbnext').addEventListener('click', function () { show(i + 1); });
    $('lbstage').addEventListener('click', function (e) { if (e.target !== im) d.close(); });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') show(i - 1); else if (e.key === 'ArrowRight') show(i + 1);
    });
    var x0 = null;
    d.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    d.addEventListener('touchend', function (e) {
      if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) show(dx < 0 ? i + 1 : i - 1);
    });
  }

  /* ---------- checkout ---------- */
  var TITLES = { 1: 'Tu pedido', 2: 'Tus datos', 3: 'Pago', 4: '¡Pedido listo!' };

  function methods() {
    var m = [];
    var y = PAY.yape || {}, pl = PAY.plin || {}, t = PAY.transfer || {};
    var yOk = !!(y.number && y.holder), pOk = !!(pl.number && pl.holder), tOk = !!(t.bank && t.holder && t.account && t.cci);
    if (yOk || CFG.demo) m.push({ id: 'yape', name: 'Yape', sub: 'Pago inmediato desde tu app', ok: yOk });
    if (pOk || CFG.demo) m.push({ id: 'plin', name: 'Plin', sub: 'Desde la app de tu banco', ok: pOk });
    if (tOk || CFG.demo) m.push({ id: 'transfer', name: 'Transferencia bancaria', sub: 'Mismo banco o interbancaria (CCI)', ok: tOk });
    return m;
  }

  function setupCheckout() {
    var d = $('checkout');
    $('co-close').addEventListener('click', function () { d.close(); });
    d.addEventListener('close', function () { if (step === 4) { order = null; step = 1; } });
    $('co-next').addEventListener('click', next);
    $('co-back').addEventListener('click', function () { go(step - 1); });

    // lista de distritos
    var sel = $('f-district');
    (DEL.districts || []).slice().sort(function (a, b) { return a.localeCompare(b, 'es'); }).forEach(function (x) {
      sel.appendChild(el('option', { value: x, text: x }));
    });
    sel.addEventListener('change', function () {
      var f = deliveryFee(sel.value);
      $('h-district').textContent = sel.value ? (f > 0 ? 'Delivery a ' + sel.value + ': ' + money(f) : 'Delivery incluido en ' + sel.value + '.') : '';
    });
    $('h-district').textContent = 'Solo entregamos en Lima Metropolitana' + ((DEL.districts || []).length < 43 ? ', en los distritos de la lista.' : '.');

    // boleta / factura
    $('form-data').addEventListener('change', function (e) {
      if (e.target.name === 'doc') $('factura-fields').hidden = e.target.value !== 'factura';
    });
    // solo números en celular / RUC
    ['f-phone', 'f-ruc'].forEach(function (id) {
      $(id).addEventListener('input', function () { this.value = this.value.replace(/\D/g, ''); });
    });
    // Enter en un campo no debe enviar el formulario
    ['form-data', 'form-pay'].forEach(function (id) {
      $(id).addEventListener('submit', function (e) { e.preventDefault(); next(); });
    });

    // medios de pago
    var list = $('pay-list');
    methods().forEach(function (m) {
      list.appendChild(el('label', { class: 'choice' }, [
        el('input', { type: 'radio', name: 'method', value: m.id, 'aria-describedby': 'e-method' }),
        el('span', {}, [el('span', { class: 'c-t', text: m.name }), el('span', { class: 'c-s', text: m.sub })])
      ]));
    });
    if (!list.children.length) list.appendChild(el('p', { class: 'note', text: 'Por ahora recibimos pedidos solo por WhatsApp. Escríbenos al ' + B.phoneDisplay + '.' }));
    list.addEventListener('change', function (e) { if (e.target.name === 'method') { renderPaybox(e.target.value); clearErr('method'); } });

    // limpiar error al corregir
    d.addEventListener('input', function (e) { if (e.target.id && e.target.id.indexOf('f-') === 0) clearErr(e.target.id.slice(2)); });
    d.addEventListener('change', function (e) { if (e.target.id && e.target.id.indexOf('f-') === 0) clearErr(e.target.id.slice(2)); });

    // copiar datos de pago
    $('paybox').addEventListener('click', function (e) {
      var b = e.target.closest('[data-copy]');
      if (!b) return;
      var txt = b.getAttribute('data-copy');
      var done = function () { b.textContent = 'Copiado'; setTimeout(function () { b.textContent = 'Copiar'; }, 1800); };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(done, function () {});
    });
  }

  function openCheckout(s) {
    var d = $('checkout');
    go(s || 1, true);
    if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
    window.DA_track('view_cart', { value: totals().sub, currency: 'PEN' });
  }

  function go(s, silent) {
    step = s;
    document.querySelectorAll('#checkout .pane').forEach(function (p) { p.hidden = String(p.getAttribute('data-pane')) !== String(s); });
    document.querySelectorAll('#checkout .steps li').forEach(function (li) {
      var n = +li.getAttribute('data-step');
      if (n === s) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      li.classList.toggle('done', n < s);
    });
    $('co-title').textContent = TITLES[s];
    $('co-back').hidden = s === 1 || s === 4;
    var nx = $('co-next');
    nx.disabled = false;
    if (s === 1) { renderCart(); nx.textContent = 'Continuar con mis datos'; }
    if (s === 2) nx.textContent = 'Continuar al pago';
    if (s === 3) { nx.textContent = 'Enviar pedido por WhatsApp'; renderPayTotals(); }
    if (s === 4) nx.textContent = 'Cerrar';
    $('co-body').scrollTop = 0;
    if (!silent) $('co-title').focus();
  }

  function next() {
    if (step === 1) {
      if (!cartCount()) return;
      var t = totals();
      if (DEL.minOrder && t.sub < DEL.minOrder) return;
      window.DA_track('begin_checkout', { value: t.sub, currency: 'PEN' });
      go(2);
    } else if (step === 2) {
      if (validateData()) go(3);
    } else if (step === 3) {
      if (validatePay()) submitOrder();
    } else if (step === 4) {
      $('checkout').close();
    }
  }

  function renderCart() {
    var ul = $('cart-lines'), items = cartItems();
    ul.textContent = '';
    items.forEach(function (it) {
      ul.appendChild(el('li', { class: 'line' }, [
        el('img', { src: it.p.image, alt: '', width: 56, height: 56 }),
        el('div', {}, [el('h3', { text: it.p.name }), el('span', { class: 'unit', text: money(it.price) + ' c/u' })]),
        el('div', { class: 'right' }, [el('strong', { text: money(it.total) }), stepper(it.p, it.qty)])
      ]));
    });
    ul.onclick = function (e) {
      var b = e.target.closest('button[data-act]');
      if (!b) return;
      var id = b.getAttribute('data-id'), q = cart[id] || 0;
      setQty(id, b.getAttribute('data-act') === 'inc' ? q + 1 : q - 1);
      renderCart();
      var again = ul.querySelector('[data-id="' + id + '"][data-act="' + b.getAttribute('data-act') + '"]');
      if (again && !again.disabled) again.focus(); else $('co-title').focus();
    };
    var empty = !items.length;
    $('cart-empty').hidden = !empty;
    var t = totals(), dl = $('cart-totals');
    dl.textContent = '';
    var note = $('cart-note');
    if (!empty) {
      dl.appendChild(el('dt', { text: 'Subtotal' })); dl.appendChild(el('dd', { text: money(t.sub) }));
      dl.appendChild(el('dt', { text: 'Delivery' })); dl.appendChild(el('dd', { text: t.fee > 0 ? 'desde ' + money(t.fee) : 'Incluido' }));
      dl.appendChild(el('dt', { class: 'grand', text: 'Total' })); dl.appendChild(el('dd', { class: 'grand', text: money(t.total) }));
    }
    var msg = [];
    if (DEL.eta) msg.push('Tiempo estimado de entrega: ' + DEL.eta + '.');
    if (DEL.hours) msg.push('Horario de pedidos: ' + DEL.hours + '.');
    var below = DEL.minOrder && t.sub < DEL.minOrder;
    if (below && !empty) msg.push('El pedido mínimo es ' + money(DEL.minOrder) + '.');
    note.textContent = msg.join(' ');
    note.hidden = !msg.length || empty;
    $('co-next').disabled = empty || !!below;
  }

  /* ---------- validación ---------- */
  function setErr(key, msg) {
    var input = $('f-' + key), e = $('e-' + key);
    if (e) e.textContent = msg;
    if (input) input.setAttribute('aria-invalid', 'true');
  }
  function clearErr(key) {
    var input = $('f-' + key), e = $('e-' + key);
    if (e) e.textContent = '';
    if (input) input.removeAttribute('aria-invalid');
  }
  function showSummary(boxId, errors) {
    var box = $(boxId);
    box.textContent = '';
    if (!errors.length) return true;
    box.appendChild(el('strong', { text: errors.length === 1 ? 'Revisa este dato:' : 'Revisa estos ' + errors.length + ' datos:' }));
    var ul = el('ul');
    errors.forEach(function (x) {
      var a = el('a', { href: '#' + x.focus, text: x.msg });
      a.addEventListener('click', function (ev) { ev.preventDefault(); $(x.focus).focus(); });
      ul.appendChild(el('li', {}, [a]));
    });
    box.appendChild(ul);
    box.focus();
    return false;
  }
  function validRuc(r) {
    if (!/^(10|15|16|17|20)\d{9}$/.test(r)) return false;
    var w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2], s = 0;
    for (var i = 0; i < 10; i++) s += +r[i] * w[i];
    var d = 11 - (s % 11); if (d === 10) d = 0; if (d === 11) d = 1;
    return d === +r[10];
  }
  function val(id) { return clean($(id).value); }

  function validateData() {
    var errs = [], add = function (k, m) { setErr(k, m); errs.push({ focus: 'f-' + k, msg: m }); };
    ['name', 'phone', 'email', 'district', 'address', 'ruc', 'company', 'terms'].forEach(clearErr);
    var name = val('f-name'), phone = val('f-phone'), email = val('f-email');
    if (name.length < 3 || !/\s/.test(name)) add('name', 'Escribe tu nombre y apellido.');
    if (!/^9\d{8}$/.test(phone)) add('phone', 'Escribe un celular de 9 dígitos que empiece con 9.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) add('email', 'Escribe un correo válido, por ejemplo nombre@correo.com.');
    if (!val('f-district') || (DEL.districts || []).indexOf(val('f-district')) < 0) add('district', 'Elige el distrito de entrega.');
    if (val('f-address').length < 6) add('address', 'Escribe la dirección completa de entrega.');
    if (docType() === 'factura') {
      if (!validRuc(val('f-ruc'))) add('ruc', 'Escribe un RUC válido de 11 dígitos.');
      if (val('f-company').length < 3) add('company', 'Escribe la razón social.');
    }
    if (!$('f-terms').checked) add('terms', 'Debes aceptar los términos y la política de privacidad para continuar.');
    return showSummary('err-2', errs);
  }
  function docType() { var c = document.querySelector('input[name="doc"]:checked'); return c ? c.value : 'boleta'; }
  function method() { var c = document.querySelector('input[name="method"]:checked'); return c ? c.value : ''; }

  function validatePay() {
    var errs = [];
    clearErr('method'); clearErr('op');
    var m = method();
    if (!m) { $('e-method').textContent = 'Elige un medio de pago.'; errs.push({ focus: firstMethodId(), msg: 'Elige un medio de pago.' }); }
    else if (!/^[A-Za-z0-9-]{4,20}$/.test(val('f-op'))) { setErr('op', 'Escribe el número de operación que figura en tu constancia.'); errs.push({ focus: 'f-op', msg: 'Escribe el número de operación.' }); }
    return showSummary('err-3', errs);
  }
  function firstMethodId() {
    var r = document.querySelector('input[name="method"]');
    if (r && !r.id) r.id = 'f-method-first';
    return r ? r.id : 'co-title';
  }

  /* ---------- pago ---------- */
  function renderPayTotals() {
    var m = method();
    if (m) renderPaybox(m);
  }
  function row(dt, value, copy) {
    var dd = el('dd');
    if (value) {
      dd.appendChild(document.createTextNode(value));
      if (copy) dd.appendChild(el('button', { type: 'button', class: 'copy-btn', 'data-copy': value.replace(/\s/g, ''), 'aria-label': 'Copiar ' + dt, text: 'Copiar' }));
    } else dd.appendChild(window.DA.todo());
    return [el('dt', { text: dt }), dd];
  }
  function renderPaybox(m) {
    var box = $('paybox'), t = totals(val('f-district'));
    box.textContent = '';
    box.hidden = false;
    $('op-field').hidden = false;
    var name = m === 'yape' ? 'Yape' : m === 'plin' ? 'Plin' : 'Transferencia bancaria';
    box.appendChild(el('h3', { text: 'Paga con ' + name }));
    box.appendChild(el('p', { class: 'amount', text: money(t.total) }));
    var dl = el('dl');
    var add = function (pair) { dl.appendChild(pair[0]); dl.appendChild(pair[1]); };
    if (m === 'transfer') {
      var tr = PAY.transfer || {};
      add(row('Banco', tr.bank)); add(row('Titular', tr.holder));
      add(row('Cuenta en soles', tr.account, true)); add(row('CCI', tr.cci, true));
    } else {
      var w = PAY[m] || {};
      add(row('Número', w.number, true)); add(row('A nombre de', w.holder));
    }
    box.appendChild(dl);
    var qr = (PAY[m] || {}).qr;
    if (qr && m !== 'transfer') box.appendChild(el('img', { class: 'qr', src: qr, alt: 'Código QR de ' + name + ' de ' + B.name, width: 180, height: 180 }));
    box.appendChild(el('p', { class: 'hint', text: 'Verifica que el titular coincida antes de pagar. Paga el monto exacto y luego escribe el número de operación.' }));
  }

  /* ---------- envío ---------- */
  function code() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = '';
    var rnd = new Uint32Array(4);
    (window.crypto || window.msCrypto).getRandomValues(rnd);
    for (var i = 0; i < 4; i++) r += chars[rnd[i] % chars.length];
    return 'DA-' + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + '-' + r;
  }
  function buildMessage(o) {
    var L = [];
    L.push('*NUEVO PEDIDO ' + o.code + '*');
    L.push('Fecha: ' + o.date);
    L.push('');
    L.push('*Productos*');
    o.items.forEach(function (i) { L.push(i.qty + ' x ' + i.p.name + ' - ' + money(i.total)); });
    L.push('Subtotal: ' + money(o.t.sub));
    L.push('Delivery (' + o.district + '): ' + (o.t.fee > 0 ? money(o.t.fee) : 'incluido'));
    L.push('*Total pagado: ' + money(o.t.total) + '*');
    L.push('');
    L.push('*Pago*');
    L.push('Medio: ' + o.methodName);
    L.push('N.° de operación: ' + o.op);
    L.push('');
    L.push('*Cliente*');
    L.push('Nombre: ' + o.name);
    L.push('Celular: ' + o.phone);
    L.push('Correo: ' + o.email);
    L.push('');
    L.push('*Entrega*');
    L.push('Distrito: ' + o.district);
    L.push('Dirección: ' + o.address);
    if (o.ref) L.push('Referencia: ' + o.ref);
    if (o.notes) L.push('Indicaciones: ' + o.notes);
    L.push('');
    L.push('*Comprobante:* ' + (o.doc === 'factura' ? 'Factura - RUC ' + o.ruc + ' - ' + o.company : 'Boleta'));
    L.push('');
    L.push('Acepté los Términos, la Política de reembolsos y la Política de privacidad (versión ' + CFG.policiesUpdated + ').');
    return L.join('\n');
  }

  function submitOrder() {
    var district = val('f-district');
    var m = method();
    var o = {
      code: code(),
      date: new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }),
      items: cartItems(), t: totals(district),
      methodName: m === 'yape' ? 'Yape' : m === 'plin' ? 'Plin' : 'Transferencia bancaria',
      op: val('f-op'), name: val('f-name'), phone: val('f-phone'), email: val('f-email'),
      district: district, address: val('f-address'), ref: val('f-ref'), notes: val('f-notes'),
      doc: docType(), ruc: val('f-ruc'), company: val('f-company')
    };
    var text = buildMessage(o);
    var wa = 'https://wa.me/' + B.whatsapp + '?text=' + encodeURIComponent(text);
    order = o;

    $('done-code').textContent = o.code;
    var live = $('done-live');
    live.textContent = '';

    if (CFG.demo) {
      $('done-demo').hidden = false;
      $('done-preview').textContent = text;
      live.hidden = true;
    } else {
      $('done-demo').hidden = true;
      live.hidden = false;
      window.open(wa, '_blank', 'noopener');
      live.appendChild(el('p', { class: 'note', text: 'Abrimos WhatsApp con el detalle de tu pedido. Toca «Enviar» en WhatsApp para completarlo. Te confirmaremos por ese medio cuando verifiquemos tu pago.' }));
      live.appendChild(el('a', { class: 'btn btn-primary btn-block', href: wa, target: '_blank', rel: 'noopener', text: 'Abrir WhatsApp de nuevo' }));
      if (B.email) {
        var subject = 'Pedido ' + o.code + ' - ' + B.name;
        var mail = 'mailto:' + encodeURIComponent(B.email) + '?cc=' + encodeURIComponent(o.email) +
          '&subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text.replace(/\*/g, ''));
        live.appendChild(el('a', { class: 'btn btn-block', href: mail, text: 'Enviar también por correo (con copia para ti)' }));
      }
      live.appendChild(el('p', { class: 'hint', text: 'Guarda tu código de pedido. Si tienes algún problema, escríbenos al ' + B.phoneDisplay + '.' }));
      // pedido enviado: vaciamos el carrito y los datos del formulario
      cart = {}; saveCart(); updateCartUI();
      $('form-data').reset(); $('form-pay').reset();
      $('factura-fields').hidden = true; $('paybox').hidden = true; $('op-field').hidden = true;
    }
    window.DA_track('purchase_request', { value: o.t.total, currency: 'PEN', payment_type: m });
    go(4);
  }
})();
