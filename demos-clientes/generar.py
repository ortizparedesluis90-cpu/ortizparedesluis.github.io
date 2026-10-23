#!/usr/bin/env python3
"""Genera los demos de linktree con tarjeta de fidelidad: barbería, spa y salón de belleza premium.
Uso: python3 -I generar.py <carpeta_salida>"""
import base64, html, json, os, random, sys
from urllib.parse import quote

D = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
# Sistema de sellos real (carpeta sistema-sellos del repositorio). Si se define, el demo enlaza la
# tarjeta real del negocio: SELLOS_URL=https://sistema-sellos.tu-subdominio.workers.dev
SELLOS_URL = os.environ.get('SELLOS_URL', '').rstrip('/')
SOLO = os.environ.get('SOLO', '')  # generar solo un tema: barberia | spa | belleza
TPL = open(os.path.join(D, 'plantilla.html'), encoding='utf-8').read()
ICONS = json.load(open(os.path.join(D, 'iconos.json')))  # SVG de WhatsApp, TikTok, Maps y Google
e = lambda s: html.escape(str(s), quote=True)


def font(path):
    return 'data:font/woff2;base64,' + base64.b64encode(open(os.path.join(D, 'fonts', path), 'rb').read()).decode()


def wa(msg):
    # Demo: wa.me sin número abre el selector de chats con el mensaje listo; no escribe a nadie real.
    return 'https://wa.me/?text=' + quote(msg)


def svg(paths, cls=''):
    return '<svg viewBox="0 0 24 24" aria-hidden="true"%s>%s</svg>' % (' class="%s"' % cls if cls else '', paths)


I = {
    'scissors': '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>',
    'razor': '<path d="M4 20l9-9M13 11l3-7 4 4-7 3z"/><path d="M4 20h5"/>',
    'comb': '<path d="M5 3v18M5 7h4M5 11h3M5 15h4M5 19h3"/><path d="M14 3c3 3 3 15 0 18"/>',
    'video': '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M10 10l5 2.5-5 2.5z"/>',
    'leaf': '<path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15"/><path d="M5 19l7-7"/>',
    'lotus': '<path d="M12 20c-4 0-8-3-9-7 3 0 6 1 9 4 3-3 6-4 9-4-1 4-5 7-9 7z"/><path d="M12 17c-2-3-2-7 0-11 2 4 2 8 0 11z"/>',
    'drop': '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/>',
    'stones': '<ellipse cx="12" cy="18" rx="8" ry="2.5"/><ellipse cx="12" cy="13" rx="6" ry="2.2"/><ellipse cx="12" cy="8.5" rx="4" ry="1.8"/>',
    'sparkle': '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    'nail': '<path d="M9 21v-9a3 3 0 0 1 6 0v9"/><path d="M9 14h6"/><path d="M10.5 9.5c0-2 .5-4 1.5-6 1 2 1.5 4 1.5 6"/>',
    'brush': '<path d="M14 4l6 6-8.5 8.5a3 3 0 0 1-4.2 0l-1.8-1.8a3 3 0 0 1 0-4.2z"/><path d="M4 20l3-3"/>',
    'eye': '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/><path d="M7 5l1 2M12 4v2M17 5l-1 2"/>',
    'gift': '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M12 8v13M18.5 12v9h-13v-9"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    'check': '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
}
LOGOS = {
    'pole': '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="17" y="4" width="14" height="40" rx="7" fill="#F2EEE6"/><clipPath id="pole"><rect x="17" y="4" width="14" height="40" rx="7"/></clipPath><g clip-path="url(#pole)"><path d="M10 10l28-12v6L10 16zM10 22l28-12v6L10 28zM10 34l28-12v6L10 40zM10 46l28-12v6L10 52z" fill="#C8423B"/><path d="M10 16l28-12v3L10 19zM10 28l28-12v3L10 31zM10 40l28-12v3L10 43z" fill="#2F5DA8"/></g><rect x="14" y="2" width="20" height="5" rx="2.5" fill="#D9B45F"/><rect x="14" y="41" width="20" height="5" rx="2.5" fill="#D9B45F"/></svg>',
    'lotus': '<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="#56705E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M24 38c-8 0-16-5-18-13 6 0 12 2 18 8 6-6 12-8 18-8-2 8-10 13-18 13z" fill="rgba(86,112,94,.12)"/><path d="M24 33c-4-6-4-14 0-22 4 8 4 16 0 22z" fill="rgba(86,112,94,.18)"/><path d="M24 33c-6-3-10-9-10-16 5 2 8 6 10 10M24 33c6-3 10-9 10-16-5 2-8 6-10 10"/></svg>',
    'gem': '<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="#F0C6B7" stroke-width="1.6" stroke-linejoin="round"><path d="M10 18l6-8h16l6 8-14 20z" fill="rgba(240,198,183,.14)"/><path d="M10 18h28M16 10l8 28 8-28M20 18l4-8 4 8"/><path d="M40 6l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="#F0C6B7" stroke="none"/></svg>',
}

THEMES = {
'barberia': dict(
    file='demo-barberia.html', name='Filo Barber Studio', short='Filo', kind='Barber Studio', logo='pole',
    tagline='Cortes, fades y barba con navaja. Agenda tu cita en segundos.',
    meta='Demo de linktree para barberías con tarjeta de fidelidad: reservas por WhatsApp, servicios, equipo y horario.',
    district='Miraflores, Lima', address='Av. Ejemplo 123, Miraflores', handle='@tubarberia', theme_color='#0E0E10',
    cta='Reservar cita', svc_icon='scissors', gallery_title='Trabajos',
    fonts=[('Bebas Neue', 'bebas.woff2', '400'), ('DM Sans', 'dmsans-var.woff2', '100 1000')],
    vars='''--display:'Bebas Neue','Oswald','Arial Narrow',Impact,sans-serif;--body:'DM Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color-scheme:dark;
--bg:#0E0E10;--surface:rgba(23,23,26,.88);--surface-solid:#17171A;--surface-hover:rgba(34,34,38,.96);
--line:rgba(242,238,230,.10);--line-2:rgba(242,238,230,.22);
--text:#F2EEE6;--text-strong:#F2EEE6;--text-on-bg:#E6E0D5;--muted:#BDB6AA;
--accent:#D9B45F;--accent-hi:#E8C877;--accent-ink:#16120A;--accent-ink-2:#3D3016;--accent-text:#E8C877;--accent-link:#E8C877;--accent-line:rgba(217,180,95,.5);--accent-soft:rgba(217,180,95,.14);--focus:#E8C877;
--pill-bg:rgba(14,14,16,.6);--tshadow:0 1px 8px rgba(0,0,0,.6);
--cta-bg:linear-gradient(180deg,#E8C877,#D9B45F 60%,#C9A04A);--cta-shadow:0 1px 0 rgba(255,255,255,.4) inset,0 14px 34px -12px rgba(217,180,95,.6);
--ok:#53C97A;--ok-soft:rgba(83,201,122,.16);--ok-text:#9BE3B0;--bad:#E0705F;--bad-text:#F0B4A8;--hot-bg:rgba(200,66,59,.2);--hot-text:#F2A79F;
--overlay-bg:#0B0B0D;--dock-fade:linear-gradient(180deg,rgba(14,14,16,0),rgba(14,14,16,.94) 38%);--av-bg:linear-gradient(145deg,#E8C877,#B88E3C);
--card-bg:linear-gradient(135deg,#26262B 0%,#141416 65%);--card-text:#F2EEE6;--card-dash:rgba(232,200,119,.55);--card-slot:rgba(255,255,255,.06);--card-stamp:linear-gradient(145deg,#E8C877,#C9A04A);--card-stamp-ink:#16120A;--card-shine:radial-gradient(120% 80% at 100% 0%,rgba(232,200,119,.22),transparent 60%);
--name-w:400;--name-size:84px;--name-ls:.06em;--name-tt:uppercase;--name-style:normal;--kind-font:var(--body);--kind-size:13px;--kind-ls:.42em;
--lbl-w:400;--lbl-size:22px;--lbl-ls:.04em;--lbl-tt:uppercase;--eb-w:400;--eb-size:20px;--eb-ls:.16em;--eb-tt:uppercase;--price-w:400;--price-size:26px;''',
    bg='''.bg::before{content:"";position:absolute;inset:-50%;opacity:.13;filter:blur(2px);
  background:repeating-linear-gradient(135deg,#C8423B 0 34px,#F2EEE6 34px 68px,#2F5DA8 68px 102px,#F2EEE6 102px 136px);animation:pole 40s linear infinite}
.bg::after{content:"";position:absolute;inset:0;background:radial-gradient(70% 45% at 50% 0%,rgba(217,180,95,.20),transparent 70%),radial-gradient(120% 80% at 50% 50%,rgba(14,14,16,.35),rgba(14,14,16,.92) 70%),linear-gradient(180deg,rgba(14,14,16,.55),rgba(14,14,16,.80))}
@keyframes pole{from{transform:translate3d(0,0,0)}to{transform:translate3d(192.33px,0,0)}}''',
    services=[(None, [
        ('Corte clásico', 'Tijera y máquina, con lavado', 35, '40 min', False),
        ('Fade / degradado', 'Low, mid o high fade', 40, '45 min', True),
        ('Corte + barba', 'El combo completo', 55, '60 min', True),
        ('Perfilado de barba', 'Navaja y toalla caliente', 25, '25 min', False),
        ('Afeitado clásico', 'Con toalla caliente y aceites', 35, '30 min', False),
        ('Corte niño', 'Hasta 12 años', 30, '30 min', False),
        ('Diseño o líneas', 'Adicional a cualquier corte', 10, '10 min', False)])],
    team=[('Diego', 'Fades y diseños'), ('Marco', 'Clásicos y tijera'), ('Joel', 'Barba y afeitado')],
    team_word='con', person_field='Barbero',
    gallery=[('scissors', 'Fade'), ('razor', 'Barba'), ('comb', 'Clásico'), ('sparkle', 'Diseños'), ('video', 'Video')],
    hours={0: ('10:00', '16:00'), 1: ('10:00', '21:00'), 2: ('10:00', '21:00'), 3: ('10:00', '21:00'), 4: ('10:00', '21:00'), 5: ('10:00', '22:00'), 6: ('09:00', '22:00')},
    loyalty=dict(slug='filo', name='Club Filo', pitch='Suma sellos y gana cortes gratis', prog='Club Filo', member='Cliente demo', mid='FILO-0427',
        hint='Cada visita suma un sello. Al completar 10, tu corte es gratis.', mode='stamps', goal=10, start=6, step=1, icon='scissors', cols=5,
        status='{n} de {goal} sellos · te faltan {left} para tu corte gratis', done='¡Tarjeta completa! Tu próximo corte es gratis.',
        reward='¡Premio desbloqueado! Muestra tu tarjeta en caja y tu corte es gratis.', sim='Sumar visita (demo)',
        steps=['Pide tu tarjeta en caja o por WhatsApp: solo necesitas tu nombre y celular.', 'En cada visita muestra tu código y sumamos un sello.', 'Al completar la tarjeta, canjea tu premio.'],
        rewards=[('5 sellos', 'Perfilado de barba gratis'), ('10 sellos', 'Corte gratis'), ('Cumpleaños', '20 % de descuento en tu mes')])),

'spa': dict(
    file='demo-spa.html', name='Alma Spa & Wellness', short='Alma', kind='Spa & Wellness', logo='lotus',
    tagline='Masajes, faciales y rituales para desconectarte de verdad. Reserva tu momento.',
    meta='Demo de linktree para spas con tarjeta de puntos: reservas por WhatsApp, tratamientos, terapeutas y horario.',
    district='San Isidro, Lima', address='Calle Ejemplo 456, San Isidro', handle='@tuspa', theme_color='#F4EFE7',
    cta='Reservar mi momento', svc_icon='leaf', gallery_title='Nuestro espacio',
    fonts=[('Cormorant Garamond', 'cormorant-var.woff2', '300 700'), ('Jost', 'jost-var.woff2', '300 600')],
    vars='''--display:'Cormorant Garamond',Georgia,'Times New Roman',serif;--body:'Jost',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color-scheme:light;
--bg:#F4EFE7;--surface:rgba(255,253,249,.93);--surface-solid:#FFFDF9;--surface-hover:#FFFFFF;
--line:rgba(42,46,40,.10);--line-2:rgba(42,46,40,.20);
--text:#2B2E29;--text-strong:#23261F;--text-on-bg:#343730;--muted:#5C6057;
--accent:#56705E;--accent-hi:#4A6352;--accent-ink:#FFFFFF;--accent-ink-2:#E4ECE5;--accent-text:#4A6352;--accent-link:#4A6352;--accent-line:rgba(86,112,94,.45);--accent-soft:rgba(86,112,94,.12);--focus:#3E5546;
--pill-bg:rgba(255,253,249,.78);--tshadow:none;
--cta-bg:linear-gradient(180deg,#56705E,#4A6352);--cta-shadow:0 14px 30px -14px rgba(60,80,66,.55);
--ok:#3E8E5A;--ok-soft:rgba(62,142,90,.14);--ok-text:#2C6B42;--bad:#B5584A;--bad-text:#8E3F33;--hot-bg:rgba(184,140,90,.18);--hot-text:#6E4A20;
--overlay-bg:#F4EFE7;--dock-fade:linear-gradient(180deg,rgba(244,239,231,0),rgba(244,239,231,.95) 38%);--av-bg:linear-gradient(145deg,#6F8B77,#4A6352);
--card-bg:linear-gradient(135deg,#5B7663 0%,#3E5546 70%);--card-text:#F7F4EE;--card-dash:rgba(247,244,238,.55);--card-slot:rgba(255,255,255,.16);--card-stamp:linear-gradient(90deg,#F3E6CC,#D9C29A);--card-stamp-ink:#3E5546;--card-shine:radial-gradient(120% 80% at 100% 0%,rgba(243,230,204,.25),transparent 60%);
--name-w:600;--name-size:80px;--name-ls:.01em;--name-tt:none;--name-style:normal;--kind-font:var(--body);--kind-size:13px;--kind-ls:.38em;
--lbl-w:600;--lbl-size:24px;--lbl-ls:.01em;--lbl-tt:none;--eb-w:600;--eb-size:27px;--eb-ls:.01em;--eb-tt:none;--price-w:600;--price-size:28px;''',
    bg='''.bg::before{content:"";position:absolute;inset:-20%;
  background:radial-gradient(40% 35% at 20% 25%,rgba(143,168,150,.45),transparent 70%),radial-gradient(45% 40% at 85% 40%,rgba(217,194,154,.45),transparent 70%),radial-gradient(40% 35% at 40% 85%,rgba(143,168,150,.35),transparent 70%);
  filter:blur(30px);animation:drift 26s ease-in-out infinite alternate}
.bg::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(244,239,231,.25),rgba(244,239,231,.55))}
@keyframes drift{0%{transform:translate3d(-4%,-2%,0) scale(1)}50%{transform:translate3d(3%,3%,0) scale(1.08)}100%{transform:translate3d(-2%,4%,0) scale(1.02)}}''',
    services=[
        ('Masajes', [('Masaje relajante', 'Aceites esenciales y música suave', 120, '60 min', True),
                     ('Descontracturante', 'Presión profunda en espalda y cuello', 140, '60 min', False),
                     ('Piedras calientes', 'Basalto volcánico y aromaterapia', 160, '75 min', False)]),
        ('Faciales', [('Limpieza profunda', 'Extracción, mascarilla e hidratación', 110, '60 min', False),
                      ('Facial hidratante', 'Con ácido hialurónico', 130, '50 min', False)]),
        ('Rituales', [('Ritual para dos', 'Masaje en pareja + infusión', 320, '90 min', True),
                      ('Día de spa', 'Masaje, facial y circuito de relajación', 380, '3 h', False)])],
    team=[('Lucía', 'Masajes terapéuticos'), ('Andrea', 'Faciales y piel'), ('Sofía', 'Rituales y aromaterapia')],
    team_word='con', person_field='Terapeuta',
    gallery=[('lotus', 'Cabinas'), ('stones', 'Masajes'), ('drop', 'Faciales'), ('leaf', 'Rituales'), ('video', 'Video')],
    hours={0: ('10:00', '18:00'), 1: ('09:00', '21:00'), 2: ('09:00', '21:00'), 3: ('09:00', '21:00'), 4: ('09:00', '21:00'), 5: ('09:00', '21:00'), 6: ('09:00', '21:00')},
    loyalty=dict(slug='alma', name='Alma Rewards', pitch='Acumula puntos y sube de nivel', prog='Alma Rewards', member='Cliente demo', mid='ALMA-1185',
        hint='Ganas 1 punto por cada S/ 1. Con 300 puntos, tu masaje de 30 minutos es gratis.', mode='points', goal=300, start=180, step=60,
        levels=[[0, 'Esencia'], [150, 'Plata'], [300, 'Oro']],
        status='{n} de {goal} puntos · te faltan {left} para tu masaje gratis', done='¡300 puntos! Tu masaje de 30 minutos es gratis.',
        reward='¡Premio desbloqueado! Ya eres nivel Oro y tienes un masaje de 30 minutos de regalo.', sim='Sumar tratamiento (+60 puntos, demo)',
        steps=['Activa tu tarjeta en recepción o por WhatsApp con tu nombre y celular.', 'Cada tratamiento suma puntos: 1 punto por cada S/ 1.', 'Sube de nivel y canjea tus puntos por tratamientos.'],
        rewards=[('Plata', 'Desde 150 puntos: 10 % en faciales'), ('300 pts', 'Masaje relajante de 30 minutos gratis'), ('Cumpleaños', 'Ritual de aromaterapia de regalo')])),

'belleza': dict(
    file='demo-salon-belleza.html', name='Belle Beauty Studio', short='Belle', kind='Beauty Studio', logo='gem',
    tagline='Color, uñas, pestañas y cejas con acabado de lujo. Tu cita, a un mensaje.',
    meta='Demo de linktree para salones de belleza premium con tarjeta de fidelidad: reservas por WhatsApp, servicios, especialistas y horario.',
    district='Santiago de Surco, Lima', address='Av. Ejemplo 789, Santiago de Surco', handle='@tusalon', theme_color='#140C11',
    cta='Reservar cita', svc_icon='sparkle', gallery_title='Nuestros trabajos',
    fonts=[('Playfair Display', 'playfair-var.woff2', '400 900'), ('Manrope', 'manrope-var.woff2', '200 800')],
    vars='''--display:'Playfair Display',Georgia,'Times New Roman',serif;--body:'Manrope',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color-scheme:dark;
--bg:#140C11;--surface:rgba(32,20,28,.88);--surface-solid:#20141C;--surface-hover:rgba(44,28,38,.96);
--line:rgba(246,228,232,.10);--line-2:rgba(246,228,232,.22);
--text:#F7ECEE;--text-strong:#FFF4F5;--text-on-bg:#EFDFE3;--muted:#C9B4BA;
--accent:#E6B4A3;--accent-hi:#F0C6B7;--accent-ink:#2A1219;--accent-ink-2:#5A2E36;--accent-text:#F0C6B7;--accent-link:#F0C6B7;--accent-line:rgba(230,180,163,.5);--accent-soft:rgba(230,180,163,.14);--focus:#F0C6B7;
--pill-bg:rgba(20,12,17,.6);--tshadow:0 1px 8px rgba(0,0,0,.6);
--cta-bg:linear-gradient(135deg,#F3CFC1,#E6B4A3 50%,#D9A390);--cta-shadow:0 1px 0 rgba(255,255,255,.45) inset,0 14px 34px -12px rgba(230,180,163,.55);
--ok:#6FD39A;--ok-soft:rgba(111,211,154,.16);--ok-text:#A7E9C2;--bad:#F08A8A;--bad-text:#F6B7B7;--hot-bg:rgba(240,198,183,.16);--hot-text:#F6CFC2;
--overlay-bg:#110A0E;--dock-fade:linear-gradient(180deg,rgba(20,12,17,0),rgba(20,12,17,.94) 38%);--av-bg:linear-gradient(145deg,#F3CFC1,#C98C7A);
--card-bg:linear-gradient(135deg,#3C2131 0%,#1E1219 70%);--card-text:#FFF4F5;--card-dash:rgba(240,198,183,.55);--card-slot:rgba(255,255,255,.07);--card-stamp:linear-gradient(145deg,#F3CFC1,#D49A88);--card-stamp-ink:#2A1219;--card-shine:radial-gradient(120% 80% at 100% 0%,rgba(240,198,183,.22),transparent 60%);
--name-w:600;--name-size:72px;--name-ls:.01em;--name-tt:none;--name-style:normal;--kind-font:var(--body);--kind-size:13px;--kind-ls:.38em;
--lbl-w:600;--lbl-size:21px;--lbl-ls:.01em;--lbl-tt:none;--eb-w:600;--eb-size:24px;--eb-ls:.01em;--eb-tt:none;--price-w:600;--price-size:24px;''',
    bg='''.bg::before{content:"";position:absolute;inset:-25%;
  background:radial-gradient(35% 30% at 25% 20%,rgba(201,140,122,.30),transparent 70%),radial-gradient(40% 35% at 80% 55%,rgba(120,50,85,.40),transparent 70%),radial-gradient(35% 30% at 30% 85%,rgba(230,180,163,.18),transparent 70%);
  filter:blur(24px);animation:drift 30s ease-in-out infinite alternate}
.bg::after{content:"";position:absolute;inset:0;opacity:.55;
  background-image:radial-gradient(1.4px 1.4px at 12% 18%,#F6D7CB 50%,transparent 51%),radial-gradient(1.2px 1.2px at 72% 12%,#F6D7CB 50%,transparent 51%),radial-gradient(1.6px 1.6px at 88% 66%,#F6D7CB 50%,transparent 51%),radial-gradient(1.2px 1.2px at 30% 72%,#F6D7CB 50%,transparent 51%),radial-gradient(1.4px 1.4px at 55% 42%,#F6D7CB 50%,transparent 51%),radial-gradient(1px 1px at 8% 90%,#F6D7CB 50%,transparent 51%);
  animation:twinkle 6s ease-in-out infinite alternate}
@keyframes drift{0%{transform:translate3d(-3%,-2%,0) rotate(0)}100%{transform:translate3d(3%,3%,0) rotate(8deg)}}
@keyframes twinkle{0%{opacity:.25}100%{opacity:.6}}''',
    services=[
        ('Uñas', [('Manicure spa', 'Exfoliación, cutículas y esmaltado', 45, '45 min', False),
                  ('Uñas acrílicas', 'Esculpidas con diseño a elección', 110, '90 min', True),
                  ('Gel semipermanente', 'Hasta 3 semanas de brillo', 65, '60 min', False)]),
        ('Cabello', [('Corte y brushing', 'Asesoría de estilo incluida', 90, '60 min', False),
                     ('Balayage', 'Iluminación a mano alzada', 'desde 380', '3 h', True),
                     ('Keratina', 'Alisado y nutrición profunda', 260, '2 h 30', False)]),
        ('Mirada', [('Lifting de pestañas', 'Con tinte y nutrición', 120, '60 min', False),
                    ('Diseño de cejas', 'Visagismo y perfilado', 45, '30 min', False)])],
    team=[('Valeria', 'Color y balayage'), ('Camila', 'Uñas y nail art'), ('Daniela', 'Pestañas y cejas')],
    team_word='con', person_field='Especialista',
    gallery=[('nail', 'Uñas'), ('brush', 'Color'), ('eye', 'Pestañas'), ('sparkle', 'Antes y después'), ('video', 'Video')],
    hours={0: ('10:00', '15:00'), 1: None, 2: ('10:00', '20:00'), 3: ('10:00', '20:00'), 4: ('10:00', '20:00'), 5: ('10:00', '20:00'), 6: ('09:00', '20:00')},
    loyalty=dict(slug='belle', name='Belle Club', pitch='Sellos, regalos y beneficios VIP', prog='Belle Club', member='Cliente demo', mid='BELLE-0912',
        hint='Cada servicio suma un sello. Con 8 sellos, tu manicure spa es gratis.', mode='stamps', goal=8, start=5, step=1, icon='sparkle', cols=4,
        status='{n} de {goal} sellos · te faltan {left} para tu manicure gratis', done='¡Tarjeta completa! Tu manicure spa es gratis.',
        reward='¡Premio desbloqueado! Tu próxima manicure spa es de regalo y pasas a ser VIP.', sim='Sumar visita (demo)',
        steps=['Pide tu tarjeta en recepción o por WhatsApp con tu nombre y celular.', 'Cada servicio suma un sello en tu tarjeta digital.', 'Completa tu tarjeta y elige tu regalo.'],
        rewards=[('4 sellos', 'Diseño de uñas de regalo'), ('8 sellos', 'Manicure spa gratis'), ('VIP', 'Prioridad en agenda y 15 % en tu cumpleaños')])),
}

DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']


def qr_svg(seed):
    """Código decorativo con forma de QR (no codifica nada; es de ejemplo)."""
    rnd, n, cells = random.Random(seed), 21, []
    def finder(x, y):
        return '<path d="M%d %dh7v7h-7z M%d %dh5v5h-5z" fill="#111" fill-rule="evenodd"/><rect x="%d" y="%d" width="3" height="3" fill="#111"/>' % (x, y, x + 1, y + 1, x + 2, y + 2)
    for y in range(n):
        for x in range(n):
            if (x < 8 and y < 8) or (x > 12 and y < 8) or (x < 8 and y > 12):
                continue
            if rnd.random() < .46:
                cells.append('M%d %dh1v1h-1z' % (x, y))
    return ('<svg viewBox="0 0 21 21" aria-hidden="true" shape-rendering="crispEdges">%s%s%s<path d="%s" fill="#111"/></svg>'
            % (finder(0, 0), finder(14, 0), finder(0, 14), ''.join(cells)))


def build(key, T):
    L = T['loyalty']
    def card(full):
        attrs = ' id="lc-full"' if full else ''
        h = ['<div class="lcard" data-lc%s>' % attrs,
             '<div class="lc-top"><span class="lc-brand">%s</span><span class="lc-prog">%s</span></div>' % (e(T['short']), e(L['prog']))]
        if full:
            h.append('<p class="lc-name">%s</p><p class="lc-id">%s</p>' % (e(L['member']), e(L['mid'])))
        if L['mode'] == 'stamps':
            lis = []
            for i in range(L['goal']):
                last = i == L['goal'] - 1
                lis.append('<li class="%s"%s>%s</li>' % (' '.join(c for c in ['on' if i < L['start'] else '', 'gift' if last else ''] if c),
                                                         '', svg(I['gift'] if last else I[L['icon']])))
            h.append('<ol class="stamps" style="grid-template-columns:repeat(%d,1fr)" aria-label="%d de %d sellos">%s</ol>'
                     % (L['cols'], L['start'], L['goal'], ''.join(lis)))
        else:
            lv = [x[1] for x in L['levels'] if L['start'] >= x[0]][-1]
            pct = round(L['start'] / L['goal'] * 100)
            h.append('<div class="pts"><span class="pts-n">%d</span><span>puntos</span><span class="level">Nivel %s</span></div>'
                     '<div class="bar" role="progressbar" aria-label="Progreso hacia el premio" aria-valuemin="0" aria-valuemax="%d" aria-valuenow="%d"><span style="width:%d%%"></span></div>'
                     % (L['start'], e(lv), L['goal'], L['start'], pct))
        status = L['status'].replace('{n}', str(L['start'])).replace('{goal}', str(L['goal'])).replace('{left}', str(L['goal'] - L['start']))
        h.append('<p class="lc-status">%s</p></div>' % e(status))
        return ''.join(h)

    svc_html = []
    for cat, items in T['services']:
        if cat:
            svc_html.append('<h3 class="cat">%s</h3>' % e(cat))
        lis = []
        for n, d, p, m, hot in items:
            price = 'S/ %s' % p
            msg = 'Hola, quiero reservar: %s (%s).\n\nNombre: \n%s (opcional): \nDía y hora: ' % (n, price, T['person_field'])
            lis.append('<li><a class="svc" href="%s" target="_blank" rel="noopener"><span class="n">%s%s</span><span class="d">%s</span>'
                       '<span class="p">%s<small>%s</small></span><span class="sr-only">(reservar por WhatsApp)</span></a></li>'
                       % (e(wa(msg)), e(n), '<span class="tag-hot">Top</span>' if hot else '', e(d), e(price), e(m)))
        svc_html.append('<ul class="menu">%s</ul>' % ''.join(lis))

    team = ''.join(
        '<a class="member" href="%s" target="_blank" rel="noopener"><span class="av" aria-hidden="true">%s</span><span class="mn">%s</span>'
        '<span class="ms">%s</span><span class="mk">Reservar<span class="sr-only"> con %s por WhatsApp</span></span></a>'
        % (e(wa('Hola, quiero reservar con %s:\n\nNombre: \nServicio: \nDía y hora: ' % n)), n[0], e(n), e(s), e(n)) for n, s in T['team'])
    gallery = ''.join('<figure class="shot">%s<figcaption>%s<small>%s</small></figcaption></figure>'
                      % (svg(I[ic]), e(lbl), 'Video del negocio' if ic == 'video' else 'Foto del negocio') for ic, lbl in T['gallery'])
    hours = ''.join('<tr data-day="%d"><th scope="row">%s</th><td>%s</td></tr>'
                    % (d, DAYS[d], '%s – %s' % T['hours'][d] if T['hours'][d] else 'Cerrado') for d in [1, 2, 3, 4, 5, 6, 0])
    reserva = 'Hola, quiero reservar una cita:\n\nNombre: \nServicio: \n%s (opcional): \nDía y hora: ' % T['person_field']
    loy_js = {k: L[k] for k in ('mode', 'goal', 'start', 'step')}
    loy_js.update(statusText=L['status'], doneText=L['done'], rewardText=L['reward'], levels=L.get('levels'))

    fonts_css = '\n'.join("@font-face{font-family:'%s';font-style:normal;font-weight:%s;font-display:swap;src:url(%s) format('woff2')}"
                          % (f, w, font(p)) for f, p, w in T['fonts'])
    wa_icon = ICONS['wa']['svg']
    rep = {
        'NAME': e(T['name']), 'SHORT': e(T['short']), 'KIND': e(T['kind']), 'TAGLINE': e(T['tagline']), 'META_DESC': e(T['meta']),
        'THEME_COLOR': T['theme_color'], 'FONTS_CSS': fonts_css, 'VARS': T['vars'], 'BG_CSS': T['bg'], 'LOGO_SVG': LOGOS[T['logo']],
        'DISTRICT': e(T['district']), 'ADDRESS': e(T['address']), 'HANDLE': e(T['handle']), 'CTA_LABEL': e(T['cta']),
        'WA_RESERVA': e(wa(reserva)), 'WA_ICON': wa_icon,
        'WA_PLAIN': wa_icon.replace('fill="#fff"', 'fill="currentColor"').replace('translate(3.6 3.6) scale(.7)', 'translate(0 0) scale(1)'),
        'TT_ICON': ICONS['tt']['svg'], 'MAPS_ICON': ICONS['maps']['svg'], 'G_ICON': ICONS['rev']['svg'],
        'SVC_ICON': svg(I[T['svc_icon']]), 'SERVICES': '\n'.join(svc_html), 'TEAM': team, 'GALLERY': gallery,
        'GALLERY_TITLE': e(T['gallery_title']), 'HOURS': hours,
        'HOURS_JSON': json.dumps({str(k): (list(v) if v else None) for k, v in T['hours'].items()}),
        'LOYALTY_NAME': e(L['name']), 'LOYALTY_PITCH': e(L['pitch']), 'LOYALTY_HINT': e(L['hint']),
        'CARD_PREVIEW': card(False), 'CARD_FULL': card(True), 'QR_SVG': qr_svg(key), 'SIM_LABEL': e(L['sim']),
        'STEPS': ''.join('<li>%s</li>' % e(s) for s in L['steps']),
        'REWARDS': ''.join('<li><b>%s</b><span>%s</span></li>' % (e(a), e(b)) for a, b in L['rewards']),
        'LOYALTY_JSON': json.dumps(loy_js, ensure_ascii=False).replace('</', '<\\/'),
        'REAL_CARD': ('<a class="btn btn-primary" href="%s/%s" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true">'
                      '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM16 16h2v2h-2z"/></svg>'
                      'Crear o abrir mi tarjeta real</a>' % (e(SELLOS_URL), e(L['slug']))) if SELLOS_URL else '',
        'DEMO_BTN_CLASS': '' if SELLOS_URL else ' btn-primary',
    }
    t = TPL
    for k, v in rep.items():
        assert '{{%s}}' % k in t, k
        t = t.replace('{{%s}}' % k, v)
    assert '{{' not in t, t[t.index('{{'):t.index('{{') + 40]
    path = os.path.join(OUT, T['file'].replace('.html', '-conectado.html') if SELLOS_URL else T['file'])
    open(path, 'w', encoding='utf-8').write(t)
    print('Creado %s (%.0f KB)' % (os.path.basename(path), len(t.encode()) / 1024))


os.makedirs(OUT, exist_ok=True)
for k, T in THEMES.items():
    if not SOLO or SOLO == k:
        build(k, T)
