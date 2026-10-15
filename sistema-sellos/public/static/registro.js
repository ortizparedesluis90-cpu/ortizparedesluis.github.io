/* Registro del cliente: envía el formulario por JSON y abre la tarjeta. */
(function () {
  'use strict';
  var form = document.getElementById('form-registro');
  if (!form) return;
  var slug = form.getAttribute('action').split('/')[1];
  var msg = document.getElementById('registro-error');
  var cel = document.getElementById('celular');
  cel.addEventListener('input', function () {
    var d = cel.value.replace(/\D/g, '').slice(0, 9);
    cel.value = d.replace(/^(\d{3})(\d{0,3})(\d{0,3}).*/, function (_, a, b, c) { return [a, b, c].filter(Boolean).join(' '); });
  });
  function fallo(texto, campo) {
    Sellos.mostrar(msg, texto);
    if (campo) { campo.setAttribute('aria-invalid', 'true'); campo.focus(); } else msg.focus && msg.focus();
  }
  form.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    ['nombre', 'celular', 'acepta'].forEach(function (id) { document.getElementById(id).removeAttribute('aria-invalid'); });
    Sellos.mostrar(msg, '');
    var nombre = document.getElementById('nombre');
    var acepta = document.getElementById('acepta');
    var digitos = cel.value.replace(/\D/g, '');
    if (nombre.value.trim().length < 2) return fallo('Escribe tu nombre.', nombre);
    if (!/^9\d{8}$/.test(digitos)) return fallo('Revisa tu celular: deben ser 9 dígitos y empezar con 9.', cel);
    if (!acepta.checked) return fallo('Para crear tu tarjeta debes aceptar el aviso de privacidad.', acepta);
    var boton = form.querySelector('button[type=submit]');
    boton.disabled = true; boton.textContent = 'Creando tu tarjeta…';
    var r = await Sellos.api('/api/n/' + slug + '/registro', {
      body: { nombre: nombre.value, celular: digitos, acepta: true, recordatorios: document.getElementById('recordatorios').checked, origen: document.getElementById('origen').value },
    });
    if (r.ok && r.datos.url) { location.href = r.datos.url; return; }
    boton.disabled = false; boton.textContent = 'Crear mi tarjeta';
    fallo(r.datos.error || 'No se pudo crear la tarjeta. Intenta de nuevo.');
  });
})();
