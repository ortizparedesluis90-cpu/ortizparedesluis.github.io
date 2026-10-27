/* Crear cuenta y entrar (/crear y /entrar). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function fallo(caja, texto, campo) { Sellos.mostrar(caja, texto); if (campo) campo.focus(); }
  var crear = $('form-crear');
  if (crear) crear.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var msg = $('c-error'), cel = $('c-celular').value.replace(/\D/g, '').replace(/^51(?=9\d{8}$)/, '');
    if ($('c-negocio').value.trim().length < 2) return fallo(msg, 'Escribe el nombre de tu negocio.', $('c-negocio'));
    if (!$('c-rubro').value) return fallo(msg, 'Elige el tipo de negocio.', $('c-rubro'));
    if ($('c-nombre').value.trim().length < 2) return fallo(msg, 'Escribe tu nombre.', $('c-nombre'));
    if (!/^9\d{8}$/.test(cel)) return fallo(msg, 'Revisa tu celular: 9 dígitos que empiezan con 9.', $('c-celular'));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test($('c-correo').value.trim())) return fallo(msg, 'Revisa tu correo.', $('c-correo'));
    if ($('c-clave').value.length < 8) return fallo(msg, 'Tu clave debe tener al menos 8 caracteres.', $('c-clave'));
    if (!$('c-acepta').checked) return fallo(msg, 'Para crear tu cuenta, acepta los términos del servicio.', $('c-acepta'));
    var b = crear.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Creando tu cuenta…';
    var r = await Sellos.api('/api/cuenta/crear', { body: { negocio: $('c-negocio').value, rubro: $('c-rubro').value, nombre: $('c-nombre').value, celular: cel, correo: $('c-correo').value, clave: $('c-clave').value, acepta: true } });
    if (r.ok) { location.href = r.datos.url + '#inicio'; return; }
    b.disabled = false; b.textContent = 'Crear mi cuenta';
    fallo(msg, r.datos.error || 'No se pudo crear la cuenta. Intenta de nuevo.');
  });
  var entrar = $('form-entrar');
  if (entrar) entrar.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var b = entrar.querySelector('button[type=submit]'); b.disabled = true;
    var r = await Sellos.api('/api/cuenta/entrar', { body: { correo: $('e-correo').value, clave: $('e-clave').value } });
    b.disabled = false;
    if (r.ok) { location.href = r.datos.url + '#inicio'; return; }
    fallo($('e-error'), r.datos.error || 'No se pudo entrar.');
  });
})();
