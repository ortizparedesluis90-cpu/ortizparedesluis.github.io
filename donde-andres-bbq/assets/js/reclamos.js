/* Libro de Reclamaciones virtual — genera la hoja de reclamación y la envía por correo
   (con copia al consumidor) usando la aplicación de correo del dispositivo.
   Esta web es estática: no guarda las hojas en un servidor. Ver LEEME.md. */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', function () {
    var CFG = window.DA_CONFIG, B = CFG.business;
    var $ = function (id) { return document.getElementById(id); };
    var form = $('lr-form');
    var v = function (id) { return String($(id).value || '').replace(/\s+/g, ' ').trim(); };
    var radio = function (n) { var r = form.querySelector('input[name="' + n + '"]:checked'); return r ? r.value : ''; };

    $('r-minor').addEventListener('change', function () { $('r-parent-box').hidden = !this.checked; });
    form.addEventListener('input', function (e) { clear(e.target.id.replace(/^r-/, '')); });
    form.addEventListener('change', function (e) { if (e.target.id) clear(e.target.id.replace(/^r-/, '')); });

    function clear(k) {
      var i = $('r-' + k), e = $('re-' + k);
      if (e) e.textContent = '';
      if (i) i.removeAttribute('aria-invalid');
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var errs = [];
      var add = function (k, m) { $('re-' + k).textContent = m; $('r-' + k).setAttribute('aria-invalid', 'true'); errs.push({ id: 'r-' + k, m: m }); };
      ['name', 'doc', 'address', 'phone', 'email', 'parent', 'amount', 'desc', 'detail', 'request', 'ok'].forEach(clear);
      if (v('r-name').length < 5) add('name', 'Escribe tu nombre y apellidos.');
      var dt = v('r-doctype'), dn = v('r-doc');
      if (dt === 'DNI' ? !/^\d{8}$/.test(dn) : !/^[A-Za-z0-9]{6,15}$/.test(dn)) add('doc', dt === 'DNI' ? 'El DNI debe tener 8 dígitos.' : 'Escribe un número de documento válido.');
      if (v('r-address').length < 6) add('address', 'Escribe tu domicilio.');
      if (!/^\+?\d{6,15}$/.test(v('r-phone').replace(/\s/g, ''))) add('phone', 'Escribe un teléfono válido.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('r-email'))) add('email', 'Escribe un correo válido.');
      if ($('r-minor').checked && v('r-parent').length < 5) add('parent', 'Escribe el nombre de tu padre, madre o representante.');
      if (v('r-amount') && !/^\d+([.,]\d{1,2})?$/.test(v('r-amount'))) add('amount', 'Escribe el monto solo con números, por ejemplo 45.90.');
      if (v('r-desc').length < 3) add('desc', 'Describe el producto o servicio.');
      if (v('r-detail').length < 10) add('detail', 'Cuéntanos qué pasó.');
      if (v('r-request').length < 5) add('request', 'Indica qué solicitas.');
      if (!$('r-ok').checked) add('ok', 'Debes confirmar la declaración para continuar.');

      var box = $('lr-err');
      box.textContent = '';
      if (errs.length) {
        var s = document.createElement('strong'); s.textContent = 'Revisa ' + (errs.length === 1 ? 'este dato:' : 'estos ' + errs.length + ' datos:');
        var ul = document.createElement('ul');
        errs.forEach(function (x) {
          var li = document.createElement('li'), a = document.createElement('a');
          a.href = '#' + x.id; a.textContent = x.m;
          a.addEventListener('click', function (e) { e.preventDefault(); $(x.id).focus(); });
          li.appendChild(a); ul.appendChild(li);
        });
        box.appendChild(s); box.appendChild(ul); box.focus();
        return;
      }
      generate();
    });

    function generate() {
      var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
      var rnd = new Uint32Array(1); crypto.getRandomValues(rnd);
      var code = 'LR-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + String(rnd[0] % 100000).padStart(5, '0');
      var L = [
        'HOJA DE RECLAMACIÓN ' + code,
        'Fecha: ' + d.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }),
        'Proveedor: ' + (B.legalName || B.name) + ' - RUC ' + (B.ruc || '(por completar)'),
        'Domicilio del proveedor: ' + B.address,
        '',
        '1. IDENTIFICACIÓN DEL CONSUMIDOR',
        'Nombre: ' + v('r-name'),
        'Documento: ' + v('r-doctype') + ' ' + v('r-doc'),
        'Domicilio: ' + v('r-address'),
        'Teléfono: ' + v('r-phone'),
        'Correo: ' + v('r-email')
      ];
      if ($('r-minor').checked) L.push('Menor de edad. Padre, madre o representante: ' + v('r-parent'));
      L.push('', '2. IDENTIFICACIÓN DEL BIEN CONTRATADO',
        'Tipo: ' + radio('r-good'),
        'Monto reclamado: ' + (v('r-amount') ? 'S/ ' + v('r-amount').replace(',', '.') : 'No indicado'));
      if (v('r-order')) L.push('Pedido o fecha de consumo: ' + v('r-order'));
      L.push('Descripción: ' + v('r-desc'),
        '', '3. DETALLE DE LA RECLAMACIÓN',
        'Tipo: ' + radio('r-type'),
        'Detalle: ' + v('r-detail'),
        'Pedido del consumidor: ' + v('r-request'),
        '', 'El proveedor deberá dar respuesta al reclamo o queja en un plazo no mayor a quince (15) días hábiles.',
        'La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.');
      var text = L.join('\n');

      $('lr-code').textContent = code;
      $('lr-preview').textContent = text;
      var acts = $('lr-actions');
      acts.textContent = '';
      var info = document.createElement('p');
      info.className = 'note';
      if (B.email && !CFG.demo) {
        var a = document.createElement('a');
        a.className = 'btn btn-primary btn-block';
        a.href = 'mailto:' + encodeURIComponent(B.email) + '?cc=' + encodeURIComponent(v('r-email')) +
          '&subject=' + encodeURIComponent(radio('r-type') + ' ' + code + ' - ' + B.name) + '&body=' + encodeURIComponent(text);
        a.textContent = 'Enviar hoja por correo';
        info.textContent = 'Para registrar tu ' + radio('r-type').toLowerCase() + ', pulsa «Enviar hoja por correo» y envía el mensaje que se abrirá: llegará al negocio y recibirás una copia en tu correo. Guarda también una copia con el botón de imprimir.';
        acts.appendChild(info); acts.appendChild(a);
      } else {
        info.textContent = CFG.demo
          ? 'Modo demostración: el envío por correo aún no está activo. Mientras tanto, puedes registrar tu reclamo en el Libro de Reclamaciones físico de nuestro local o escribirnos por WhatsApp al ' + B.phoneDisplay + ' enviando esta hoja.'
          : 'Envía esta hoja por WhatsApp al ' + B.phoneDisplay + ' o regístrala en el Libro de Reclamaciones físico de nuestro local.';
        acts.appendChild(info);
        var w = document.createElement('a');
        w.className = 'btn btn-block';
        w.href = 'https://wa.me/' + B.whatsapp + '?text=' + encodeURIComponent(text);
        w.target = '_blank'; w.rel = 'noopener';
        w.textContent = 'Enviar por WhatsApp';
        if (!CFG.demo) acts.appendChild(w);
      }
      form.hidden = true;
      $('lr-done').hidden = false;
      $('lr-done-title').focus();
    }
    $('lr-print').addEventListener('click', function () { window.print(); });
  });
})();
