#!/usr/bin/env python3
"""Genera una versión de UN SOLO ARCHIVO .html del sitio (con estilos, fuentes,
fotos, tienda y páginas legales dentro), para abrirla con doble clic o
compartirla. Las páginas legales se muestran dentro del mismo archivo
(#terminos, #privacidad, #reembolsos, #cookies, #libro-reclamaciones).

Uso:  python3 herramientas/crear-archivo-unico.py [salida.html]
Por defecto crea  donde-andres-bbq-archivo-unico.html  junto a esta carpeta.

Vuelve a ejecutarlo cada vez que cambies config.js, los estilos o las páginas.
"""
import base64
import mimetypes
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'donde-andres-bbq-archivo-unico.html')
LEGAL = ['terminos', 'privacidad', 'reembolsos', 'cookies', 'libro-reclamaciones']


def read(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return f.read()


def data_uri(rel):
    mime = mimetypes.guess_type(rel)[0] or ('font/woff2' if rel.endswith('.woff2') else 'application/octet-stream')
    with open(os.path.join(ROOT, rel), 'rb') as f:
        return 'data:%s;base64,%s' % (mime, base64.b64encode(f.read()).decode())


def link_pages(html):
    """privacidad.html -> #privacidad"""
    for p in LEGAL:
        html = html.replace('href="%s.html"' % p, 'href="#%s"' % p)
    return html


def safe_script(js):
    return js.replace('</script', '<\\/script')


# ---------- estilos: fuentes incrustadas ----------
css = read('assets/css/site.css')
css = re.sub(r'url\(\.\./fonts/([\w.-]+)\)', lambda m: 'url(%s)' % data_uri('assets/fonts/' + m.group(1)), css)
css += '\n.page[hidden]{display:none!important}\n.doc .back-top{display:flex;justify-content:flex-end;padding:8px 0 16px;border-bottom:1px solid var(--line)}\n'

# ---------- configuración: fotos incrustadas ----------
config = read('assets/js/config.js')
config = re.sub(r"'(assets/img/[\w./-]+\.(?:jpg|jpeg|png|webp))'",
                lambda m: "'%s'" % data_uri(m.group(1)) if os.path.isfile(os.path.join(ROOT, m.group(1))) else m.group(0),
                config)
common = read('assets/js/common.js').replace("legalBase + 'cookies.html'", "'#cookies'")
app = read('assets/js/app.js')
reclamos = read('assets/js/reclamos.js')

# ---------- página principal ----------
index = read('index.html')
logo = data_uri('assets/img/logo.png')
head_end = index.index('</head>')
head = index[:head_end]
head = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>\n', '', head)
head = re.sub(r'<link rel="preload"[^>]*>\n', '', head)
head = re.sub(r'<script src="[^"]+" defer></script>\n', '', head)
head = head.replace('<link rel="stylesheet" href="assets/css/site.css">', '<style>\n%s\n</style>' % css)
head = head.replace('href="assets/img/logo.png"', 'href="%s"' % logo)

body = index[head_end:]
body = body.replace('src="assets/img/logo.png"', 'src="%s"' % logo)
body = link_pages(body)
body = body.replace('<main class="wrap" id="main">', '<div class="page" id="page-home">\n<main class="wrap" id="main">', 1)
body = body.replace('</main>\n\n<nav class="dock" id="dock"', '</main>\n</div>\n\n<nav class="dock" id="dock"', 1)

# ---------- páginas legales dentro del mismo archivo ----------
sections = []
for p in LEGAL:
    html = read(p + '.html')
    inner = html[html.index('<main id="main">') + len('<main id="main">'):html.index('</main>')]
    nav = html[html.index('<footer class="doc-foot site-foot">'):html.index('</footer>') + len('</footer>')]
    sec = ('<div class="page doc" id="page-%s" hidden>\n'
           '<main aria-labelledby="t-%s">'
           '<div class="back-top"><a class="btn" href="#inicio"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Volver al inicio</a></div>\n%s</main>\n%s\n</div>\n') % (p, p, inner, nav)
    sec = sec.replace('<h1>', '<h1 id="t-%s" tabindex="-1">' % p, 1)
    sections.append(link_pages(sec))

router = r'''
(function () {
  var legal = %s;
  function route() {
    var h = decodeURIComponent(location.hash.slice(1));
    var page = legal.indexOf(h) >= 0 ? h : 'home';
    document.querySelectorAll('.page').forEach(function (p) { p.hidden = p.id !== 'page-' + page; });
    var dock = document.getElementById('dock');
    if (dock) dock.style.display = page === 'home' ? '' : 'none';
    if (page !== 'home') {
      window.scrollTo(0, 0);
      var t = document.getElementById('t-' + page); if (t) t.focus({ preventScroll: true });
      document.title = t ? t.textContent + ' · Donde Andrés BBQ' : document.title;
    } else {
      document.title = 'Donde Andrés BBQ · Reservas, delivery y ubicación';
      if (h === 'inicio') window.scrollTo(0, 0);
      else if (h) { var el = document.getElementById(h); if (el) el.scrollIntoView(); }
    }
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('DOMContentLoaded', route);
})();
''' % repr(LEGAL).replace("'", '"')

scripts = ''.join('<script>\n%s\n</script>\n' % safe_script(s) for s in (config, common, app, reclamos, router))
body = body.replace('</body>', '\n'.join(sections) + scripts + '</body>', 1)

out = head + body
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(out)
print('Creado: %s (%.0f KB)' % (OUT, len(out.encode()) / 1024))
