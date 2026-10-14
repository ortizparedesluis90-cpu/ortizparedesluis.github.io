/* Administración: crear y editar negocios, ver su actividad. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var negocios = [];

  function verLogin() { $('app').hidden = true; $('salir').hidden = true; $('login').hidden = false; $('clave').focus(); }
  function verApp() { $('login').hidden = true; $('app').hidden = false; $('salir').hidden = false; }

  async function cargar() {
    var r = await Sellos.api('/api/admin/negocios');
    if (r.status === 401) return verLogin();
    if (!r.ok) return;
    verApp();
    negocios = r.datos.negocios;
    var tb = $('negocios');
    tb.textContent = '';
    if (!negocios.length) {
      tb.appendChild(Sellos.el('tr', {}, [Sellos.el('td', { colspan: '5', texto: 'Aún no hay negocios. Agrega el primero abajo.' })]));
      return;
    }
    negocios.forEach(function (n) {
      var editar = Sellos.el('button', { clase: 'boton chico', type: 'button', texto: 'Editar' });
      editar.addEventListener('click', function () { llenar(n); });
      tb.appendChild(Sellos.el('tr', {}, [
        Sellos.el('td', {}, [Sellos.el('strong', { texto: n.nombre }), Sellos.el('br'), Sellos.el('span', { clase: 'nota', texto: n.programa + ' · ' + n.meta + ' sellos → ' + n.premio })]),
        Sellos.el('td', { texto: String(n.clientes) }),
        Sellos.el('td', { texto: String(n.visitas30) }),
        Sellos.el('td', { texto: String(n.cerca) }),
        Sellos.el('td', {}, [
          Sellos.el('a', { href: '/' + n.slug, texto: 'Registro' }),
          Sellos.el('a', { href: '/' + n.slug + '/panel', texto: 'Panel' }),
          Sellos.el('a', { href: '/' + n.slug + '/privacidad', texto: 'Privacidad' }),
          editar,
        ]),
      ]));
    });
  }

  function llenar(n) {
    var f = $('form-negocio');
    ['slug', 'nombre', 'programa', 'meta', 'premio', 'espera_min', 'razon_social', 'ruc', 'direccion', 'correo', 'color', 'tema']
      .forEach(function (k) { if (f.elements[k]) f.elements[k].value = n[k] == null ? '' : n[k]; });
    f.elements.clave.value = '';
    f.elements.slug.focus();
    f.scrollIntoView({ block: 'start' });
  }

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
    Array.prototype.forEach.call(f.elements, function (el) { if (el.name) datos[el.name] = el.value; });
    var boton = f.querySelector('button[type=submit]');
    boton.disabled = true;
    var r = await Sellos.api('/api/admin/negocios', { body: datos });
    boton.disabled = false;
    if (r.ok) {
      Sellos.mostrar($('form-msg'), r.datos.creado ? 'Negocio creado. Ya puedes compartir su enlace de registro.' : 'Cambios guardados.');
      f.elements.clave.value = '';
      cargar();
    } else Sellos.mostrar($('form-msg'), r.datos.error || 'No se pudo guardar.');
  });

  (async function () {
    var r = await Sellos.api('/api/admin/sesion');
    if (r.ok && r.datos.sesion) cargar(); else verLogin();
  })();
})();
