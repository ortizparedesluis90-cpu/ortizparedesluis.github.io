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
import html as H
import json
import subprocess
import datetime
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
css += '''
/* Páginas legales dentro del archivo: se muestran con #terminos, #privacidad... (solo CSS) */
.page.doc{display:none}
.page.doc:target{display:block}
body:has(.page.doc:target) #page-home,body:has(.page.doc:target) .dock{display:none!important}
.doc .back-top{display:flex;justify-content:flex-end;padding:8px 0 16px;border-bottom:1px solid var(--line)}
'''

# ---------- configuración ----------
config_src = read('assets/js/config.js')
try:
    CFG_JSON = subprocess.run(
        ['node', '-e', 'global.window={};eval(require("fs").readFileSync(0,"utf8"));'
         'process.stdout.write(JSON.stringify({c:window.DA_CONFIG,d:window.DA_DEMO_PRICES||{}}))'],
        input=config_src, capture_output=True, text=True, check=True).stdout
except (OSError, subprocess.CalledProcessError) as e:
    sys.exit('Se necesita Node.js para leer config.js: %s' % e)
_data = json.loads(CFG_JSON)
CFG, DEMO_PRICES = _data['c'], _data['d']
PRODUCTS = [p for p in CFG.get('products', []) if p.get('id') and p.get('name')]

# En el archivo único cada foto va una sola vez, dentro de su tarjeta; config.js
# apunta a ella con '#foto-ID' y app.js toma la imagen de ahí.
config = config_src
for p in PRODUCTS:
    config = config.replace("image: '%s'" % p['image'], "image: '#foto-%s'" % p['id'])
common = read('assets/js/common.js').replace("legalBase + 'cookies.html'", "'#cookies'")
app = read('assets/js/app.js')
reclamos = read('assets/js/reclamos.js')

# ---------- contenido visible sin JavaScript ----------
def price_of(p):
    v = float(p.get('price') or 0)
    if not v and CFG.get('demo'):
        v = float(DEMO_PRICES.get(p['id']) or 0)
    return round(v, 2) if v > 0 else 0


ICON = lambda d: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="%s"/></svg>' % d


def card(p, i):
    """Mismo marcado que picture()/renderProducts() de app.js."""
    n = len(PRODUCTS)
    prev, nxt = PRODUCTS[(i - 1) % n], PRODUCTS[(i + 1) % n]
    e = lambda s: H.escape(str(s or ''), quote=True)
    src = data_uri(p['image']) if os.path.isfile(os.path.join(ROOT, p['image'])) else p['image']
    price = price_of(p)
    if p.get('available') is False:
        tag = '<span class="price na">No disponible para delivery</span>'
    elif price:
        tag = '<span class="price">S/ %.2f</span>' % price
    else:
        tag = '<span class="price na">Precio por confirmar</span>'
    return (
        '<li class="card" id="p-{id}"><figure class="pic" id="foto-{id}">'
        '<a class="pic-open" href="#foto-{id}"><img src="{src}" alt="{alt}" loading="lazy" decoding="async" width="540" height="795">'
        '<span class="sr-only">Ver foto en grande</span></a>'
        '<figcaption class="pic-bar"><span class="pic-cap">{name}<span class="pic-n">{k} de {n}</span></span>'
        '<a class="icon-btn" href="#foto-{pid}" aria-label="Foto anterior: {pname}">{ip}</a>'
        '<a class="icon-btn" href="#foto-{nid}" aria-label="Foto siguiente: {nname}">{inx}</a>'
        '<a class="icon-btn" href="#p-{id}" aria-label="Cerrar foto">{ix}</a></figcaption></figure>'
        '<div class="body"><h3>{name}</h3>{desc}<div class="foot" data-foot="{id}">{tag}</div></div></li>'
    ).format(id=e(p['id']), src=src, alt=e(p.get('alt') or p['name']), name=e(p['name']), k=i + 1, n=n,
             pid=e(prev['id']), pname=e(prev['name']), nid=e(nxt['id']), nname=e(nxt['name']),
             ip=ICON('M15 6l-6 6 6 6'), inx=ICON('M9 6l6 6-6 6'), ix=ICON('M6 6l12 12M18 6L6 18'),
             desc='<p>%s</p>' % e(p['desc']) if p.get('desc') else '', tag=tag)


def pick(path):
    v = CFG
    for k in path.split('.'):
        v = v.get(k) if isinstance(v, dict) else None
    return v


def fill_static(s):
    """Rellena data-cfg, correo, año y fecha como lo hace common.js."""
    def todo(label):
        return '<span class="todo">Por completar%s</span>' % (': ' + label if label else '')

    def cfg(m):
        attrs, path = m.group(1), m.group(2)
        lab = re.search(r'data-label="([^"]*)"', attrs)
        v = pick(path)
        inner = H.escape(str(v)) if v not in (None, '') else todo(lab.group(1) if lab else '')
        return '<span%s>%s</span>' % (attrs, inner)
    s = re.sub(r'<span((?:\s+[\w-]+="[^"]*")*?\s+data-cfg="([\w.]+)"(?:\s+[\w-]+="[^"]*")*)></span>', cfg, s)

    def mail(m):
        v = pick(m.group(1))
        if v:
            return '<a data-cfg-mail="%s" href="mailto:%s">%s</a>' % (m.group(1), H.escape(v), H.escape(v))
        return '<a data-cfg-mail="%s">%s</a>' % (m.group(1), todo('correo'))
    s = re.sub(r'<a data-cfg-mail="([\w.]+)"></a>', mail, s)
    s = s.replace('<span data-year></span>', '<span data-year>%d</span>' % datetime.date.today().year)
    up = CFG.get('policiesUpdated')
    if up:
        y, mth, d = up.split('-')
        s = s.replace('<span data-updated></span>', '<span data-updated>%s/%s/%s</span>' % (d, mth, y))
    return s


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
body = body.replace('<main class="wrap" id="main">', '<div class="page" id="page-home"><span id="inicio"></span>\n<main class="wrap" id="main">', 1)
body = body.replace('<ul class="products" id="products" aria-label="Productos"></ul>',
                    '<ul class="products" id="products" aria-label="Productos">%s</ul>' % ''.join(card(p, i) for i, p in enumerate(PRODUCTS)), 1)
if CFG.get('demo'):
    body = body.replace('<p class="demo-bar" id="demo-bar" hidden>', '<p class="demo-bar" id="demo-bar">', 1)
body = body.replace('</main>\n\n<nav class="dock" id="dock"', '</main>\n</div>\n\n<nav class="dock" id="dock"', 1)

# ---------- páginas legales dentro del mismo archivo ----------
sections = []
for p in LEGAL:
    html = read(p + '.html')
    inner = html[html.index('<main id="main">') + len('<main id="main">'):html.index('</main>')]
    nav = html[html.index('<footer class="doc-foot site-foot">'):html.index('</footer>') + len('</footer>')]
    sec = ('<div class="page doc" id="%s">\n'
           '<main aria-labelledby="t-%s">'
           '<div class="back-top"><a class="btn" href="#inicio"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Volver al inicio</a></div>\n%s</main>\n%s\n</div>\n') % (p, p, inner, nav)
    sec = sec.replace('<h1>', '<h1 id="t-%s" tabindex="-1">' % p, 1)
    sections.append(link_pages(sec))

router = r'''
(function () {
  /* Las páginas legales se muestran solo con CSS (:target). Aquí solo se ajustan título y foco. */
  var legal = %s;
  var home = document.title;
  function route() {
    var h = decodeURIComponent(location.hash.slice(1));
    if (legal.indexOf(h) >= 0) {
      var t = document.getElementById('t-' + h);
      if (t) { document.title = t.textContent + ' · Donde Andrés BBQ'; t.focus({ preventScroll: true }); }
      window.scrollTo(0, 0);
    } else document.title = home;
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('DOMContentLoaded', route);
})();
''' % json.dumps(LEGAL)

scripts = ''.join('<script>\n%s\n</script>\n' % safe_script(s) for s in (config, common, app, reclamos, router))
body = body.replace('</body>', '\n'.join(sections) + scripts + '</body>', 1)

out = fill_static(head + body)
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(out)
print('Creado: %s (%.0f KB)' % (OUT, len(out.encode()) / 1024))
