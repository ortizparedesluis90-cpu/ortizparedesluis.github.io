/* Donde Andrés BBQ — funciones comunes a todas las páginas:
   - datos del negocio desde config.js (atributos data-cfg)
   - consentimiento de cookies y carga condicionada de Google Analytics 4 */
(function () {
  'use strict';
  var CFG = window.DA_CONFIG || {};
  var CONSENT_KEY = 'da_consent';
  var CONSENT_VERSION = 1;

  /* ---------- almacenamiento seguro ---------- */
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  function pick(path) {
    return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, CFG);
  }
  function todo(label) {
    var s = document.createElement('span');
    s.className = 'todo';
    s.textContent = 'Por completar' + (label ? ': ' + label : '');
    return s;
  }

  /* ---------- datos del negocio ---------- */
  function fillConfig(root) {
    (root || document).querySelectorAll('[data-cfg]').forEach(function (el) {
      var v = pick(el.getAttribute('data-cfg'));
      el.textContent = '';
      if (v === undefined || v === null || v === '') el.appendChild(todo(el.getAttribute('data-label')));
      else el.textContent = v;
    });
    (root || document).querySelectorAll('[data-cfg-mail]').forEach(function (el) {
      var v = pick(el.getAttribute('data-cfg-mail'));
      if (v) { el.href = 'mailto:' + v; el.textContent = v; }
      else { el.removeAttribute('href'); el.textContent = ''; el.appendChild(todo('correo')); }
    });
    (root || document).querySelectorAll('[data-year]').forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
    var up = CFG.policiesUpdated;
    if (up) {
      var p = up.split('-');
      document.querySelectorAll('[data-updated]').forEach(function (el) {
        el.textContent = p[2] + '/' + p[1] + '/' + p[0];
      });
    }
  }

  /* ---------- analítica (solo con consentimiento) ---------- */
  var gaLoaded = false;
  function loadAnalytics() {
    var id = CFG.analytics && CFG.analytics.ga4Id;
    if (gaLoaded || !id || !/^G-[A-Z0-9]+$/.test(id)) return;
    gaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', id);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(s);
  }
  function clearAnalyticsCookies() {
    var host = location.hostname, parts = host.split('.'), domains = ['', host];
    for (var i = 1; i < parts.length - 1; i++) domains.push('.' + parts.slice(i).join('.'));
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (/^_ga/.test(name) || /^_gid$/.test(name)) {
        domains.forEach(function (d) {
          document.cookie = name + '=; Max-Age=0; path=/' + (d ? '; domain=' + d : '');
        });
      }
    });
  }
  /* Evento de analítica sin datos personales. No hace nada sin consentimiento. */
  window.DA_track = function (name, params) {
    if (gaLoaded && window.gtag) window.gtag('event', name, params || {});
  };

  /* ---------- consentimiento de cookies ---------- */
  function readConsent() {
    var c = store.get(CONSENT_KEY);
    if (!c || c.v !== CONSENT_VERSION) return null;
    // el consentimiento se renueva cada 12 meses
    if (Date.now() - new Date(c.date).getTime() > 365 * 864e5) return null;
    return c;
  }
  function saveConsent(analytics) {
    var prev = readConsent();
    store.set(CONSENT_KEY, { v: CONSENT_VERSION, analytics: !!analytics, date: new Date().toISOString() });
    if (analytics) loadAnalytics();
    else {
      clearAnalyticsCookies();
      // si la analítica ya estaba cargada, recargamos para detenerla por completo
      if (prev && prev.analytics && gaLoaded) location.reload();
    }
  }

  var analyticsConfigured = !!(CFG.analytics && CFG.analytics.ga4Id);
  var bannerNeeded = analyticsConfigured || CFG.demo;

  function buildBanner() {
    var legalBase = document.body.getAttribute('data-base') || '';
    var box = document.createElement('section');
    box.className = 'cookie';
    box.id = 'cookie-banner';
    box.setAttribute('aria-labelledby', 'cookie-title');
    box.hidden = true;
    box.innerHTML =
      '<h2 id="cookie-title">Tu privacidad</h2>' +
      '<p>Usamos almacenamiento necesario para que la tienda funcione (tu carrito y esta elección). ' +
      (analyticsConfigured
        ? 'Con tu permiso, también usamos Google Analytics para medir visitas de forma agregada. '
        : 'Por ahora no usamos cookies de analítica ni publicidad. ') +
      'Más información en la <a href="' + legalBase + 'cookies.html">Política de cookies</a>.</p>' +
      '<div class="prefs" id="cookie-prefs" hidden>' +
        '<div class="pref"><label class="check"><input type="checkbox" checked disabled> Necesarias (siempre activas)</label>' +
        '<p>Carrito de compras y tus preferencias de privacidad. Se guardan solo en tu dispositivo.</p></div>' +
        '<div class="pref"><label class="check"><input type="checkbox" id="cookie-analytics"' + (analyticsConfigured ? '' : ' disabled') + '> Analítica</label>' +
        '<p>' + (analyticsConfigured ? 'Google Analytics 4: páginas vistas y uso de la tienda, sin tus datos de contacto. Implica transferencia de datos a Google (EE. UU.).' : 'No configurada actualmente.') + '</p></div>' +
      '</div>' +
      '<div class="acts">' +
        '<button type="button" class="btn" data-c="reject">Rechazar</button>' +
        '<button type="button" class="btn btn-primary" data-c="accept">Aceptar</button>' +
        '<button type="button" class="btn full" data-c="config" aria-expanded="false" aria-controls="cookie-prefs">Configurar</button>' +
      '</div>';
    document.body.appendChild(box);

    var prefs = box.querySelector('#cookie-prefs');
    var cfgBtn = box.querySelector('[data-c="config"]');
    var chk = box.querySelector('#cookie-analytics');
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-c]');
      if (!b) return;
      var a = b.getAttribute('data-c');
      if (a === 'reject') { saveConsent(false); hide(); }
      else if (a === 'accept') { saveConsent(analyticsConfigured); hide(); }
      else if (a === 'config') {
        if (prefs.hidden) {
          prefs.hidden = false; cfgBtn.setAttribute('aria-expanded', 'true');
          cfgBtn.textContent = 'Guardar mi elección'; cfgBtn.setAttribute('data-c', 'save');
          var c = readConsent(); chk.checked = !!(c && c.analytics);
          chk.focus();
        }
      } else if (a === 'save') { saveConsent(chk.checked); hide(); }
    });
    function hide() {
      box.hidden = true;
      prefs.hidden = true;
      cfgBtn.textContent = 'Configurar'; cfgBtn.setAttribute('data-c', 'config'); cfgBtn.setAttribute('aria-expanded', 'false');
      document.dispatchEvent(new CustomEvent('da:cookie-banner', { detail: { open: false } }));
    }
    return box;
  }

  function openBanner(showPrefs, focus) {
    var box = document.getElementById('cookie-banner') || buildBanner();
    box.hidden = false;
    document.dispatchEvent(new CustomEvent('da:cookie-banner', { detail: { open: true } }));
    if (showPrefs) box.querySelector('[data-c="config"]').click();
    else if (focus) box.querySelector('[data-c="accept"]').focus();
  }

  document.addEventListener('DOMContentLoaded', function () {
    fillConfig();
    var c = readConsent();
    if (c && c.analytics) loadAnalytics();
    if (!c && bannerNeeded) openBanner(false, false);
    document.querySelectorAll('[data-open-cookies]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); openBanner(true, true); });
    });
  });

  window.DA = { cfg: CFG, store: store, fillConfig: fillConfig, todo: todo };
})();
