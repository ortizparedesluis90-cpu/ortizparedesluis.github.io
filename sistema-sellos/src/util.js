// Utilidades comunes: respuestas, cabeceras de seguridad, validaciones.

export const AVISO_VERSION = 'v1';

const SEGURIDAD = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=()',
  'Strict-Transport-Security': 'max-age=31536000',
};

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "media-src 'self'",
  "frame-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Cabeceras para las vistas previas de /admin, que se muestran en un iframe del mismo sitio. */
export const EN_MARCO = {
  'Content-Security-Policy': CSP.replace("frame-ancestors 'none'", "frame-ancestors 'self'"),
  'X-Frame-Options': 'SAMEORIGIN',
};

export function html(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: {
      ...SEGURIDAD,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': CSP,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      ...extra,
    },
  });
}

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...SEGURIDAD, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

export const error = (mensaje, status = 400) => json({ error: mensaje }, status);

export function texto(body, tipo, extra = {}) {
  return new Response(body, { headers: { ...SEGURIDAD, 'Content-Type': tipo, 'Cache-Control': 'no-store', ...extra } });
}

export function redirigir(url, extra = {}) {
  return new Response(null, { status: 303, headers: { ...SEGURIDAD, Location: url, 'Cache-Control': 'no-store', ...extra } });
}

/** Escapa texto para HTML. */
export function e(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function cookies(req) {
  const out = {};
  for (const par of (req.headers.get('Cookie') || '').split(';')) {
    const i = par.indexOf('=');
    if (i > 0) out[par.slice(0, i).trim()] = par.slice(i + 1).trim();
  }
  return out;
}

export function cookie(nombre, valor, { path = '/', maxAge = 60 * 60 * 12, sameSite = 'Strict' } = {}) {
  return `${nombre}=${valor}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=${sameSite}`;
}

/** Lee el cuerpo JSON de un POST. Solo acepta JSON del mismo origen (protección CSRF). */
export async function cuerpo(req, max = 8000) {
  const origen = req.headers.get('Origin');
  if (origen && origen !== new URL(req.url).origin) throw new Error('origen');
  if (!(req.headers.get('Content-Type') || '').startsWith('application/json')) throw new Error('tipo');
  const t = await req.text();
  if (t.length > max) throw new Error('tamaño');
  return t ? JSON.parse(t) : {};
}

const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O, 1/I/L

/** Texto aleatorio con un alfabeto dado (sin sesgo de módulo). */
export function aleatorio(n, alfabeto = ALFABETO) {
  const out = [];
  const max = 256 - (256 % alfabeto.length);
  while (out.length < n) {
    for (const b of crypto.getRandomValues(new Uint8Array(n * 2))) {
      if (b < max && out.length < n) out.push(alfabeto[b % alfabeto.length]);
    }
  }
  return out.join('');
}

export const nuevoToken = () => aleatorio(26, 'abcdefghijkmnpqrstuvwxyz23456789'); // ~130 bits
export const nuevoCodigo = () => aleatorio(8);
export const normalizarCodigo = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

/** Celular peruano: 9 dígitos que empiezan con 9 → "51" + número. */
export function celularPeru(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('51')) d = d.slice(2);
  return /^9\d{8}$/.test(d) ? '51' + d : null;
}

export const celularVisible = (c) => (c && c.length === 11 ? `+51 ${c.slice(2, 5)} ${c.slice(5, 8)} ${c.slice(8)}` : c || '');

export function limpiarTexto(v, max) {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/;
export const RESERVADOS = new Set(['admin', 'api', 'static', 'm', 'favicon.ico', 'robots.txt', 'crear', 'entrar', 'terminos', 'precios', 'ayuda', 'soporte', 'demo', 'www', 'app', 'tappe']);
export const COLOR = /^#[0-9a-fA-F]{6}$/;

export function primerNombre(n) {
  return String(n || '').split(' ')[0];
}
