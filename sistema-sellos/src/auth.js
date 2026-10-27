// Claves, sesiones firmadas y límite de intentos.
import { cookies } from './util.js';

const enc = new TextEncoder();
const ITERACIONES = 100000; // máximo que permite PBKDF2 en Cloudflare Workers

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64url = (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

function iguales(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

async function pbkdf2(clave, sal, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(clave), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iter }, base, 256);
}

export async function hashClave(clave) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERACIONES}$${b64(sal)}$${b64(await pbkdf2(clave, sal, ITERACIONES))}`;
}

export async function verificarClave(clave, guardado) {
  const [tipo, iter, sal, hash] = String(guardado || '').split('$');
  if (tipo !== 'pbkdf2' || !hash) return false;
  const calculado = new Uint8Array(await pbkdf2(clave, deB64(sal), Number(iter)));
  return iguales(calculado, deB64(hash));
}

export function claveAdminValida(env) {
  return typeof env.ADMIN_PASSWORD === 'string' && env.ADMIN_PASSWORD.length >= 12;
}

export async function verificarClaveAdmin(env, clave) {
  if (!claveAdminValida(env)) return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(clave || ''))),
    crypto.subtle.digest('SHA-256', enc.encode(env.ADMIN_PASSWORD)),
  ]);
  return iguales(new Uint8Array(a), new Uint8Array(b));
}

// La llave que firma las sesiones sale de SESSION_SECRET (o, si no existe, de ADMIN_PASSWORD).
let llaveCache = { secreto: null, llave: null };
async function llave(env) {
  const secreto = env.SESSION_SECRET || env.ADMIN_PASSWORD;
  if (!secreto) throw new Error('Falta configurar ADMIN_PASSWORD');
  if (llaveCache.secreto !== secreto) {
    const bits = await pbkdf2(secreto, enc.encode('sistema-sellos/sesion'), ITERACIONES);
    llaveCache = { secreto, llave: await crypto.subtle.importKey('raw', bits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']) };
  }
  return llaveCache.llave;
}

const DURACION = 60 * 60 * 12; // 12 horas

/** datos: { r: 'admin' } o { r: 'staff', n: negocio_id, v: clave_ver, d?: versión de la clave del dueño, emp?: persona del equipo, empv?: versión de su clave }.
 *  «e» es el vencimiento: no lo uses para otra cosa. */
export async function crearSesion(env, datos) {
  const cuerpo = b64url(JSON.stringify({ ...datos, e: Math.floor(Date.now() / 1000) + DURACION }));
  const firma = await crypto.subtle.sign('HMAC', await llave(env), enc.encode(cuerpo));
  return `${cuerpo}.${b64url(String.fromCharCode(...new Uint8Array(firma)))}`;
}

export async function leerSesion(req, env) {
  const valor = cookies(req).sesion;
  if (!valor || !valor.includes('.')) return null;
  const [cuerpo, firma] = valor.split('.');
  try {
    const ok = await crypto.subtle.verify('HMAC', await llave(env), Uint8Array.from(deB64url(firma), (c) => c.charCodeAt(0)), enc.encode(cuerpo));
    if (!ok) return null;
    const datos = JSON.parse(deB64url(cuerpo));
    return datos.e > Date.now() / 1000 ? datos : null;
  } catch {
    return null;
  }
}

export const DURACION_SESION = DURACION;

/** Devuelve true si todavía no se pasó el límite de `max` intentos en `ventana` segundos. */
export async function limitar(env, clave, max, ventana) {
  const ahora = Math.floor(Date.now() / 1000);
  const fila = await env.DB.prepare(
    `INSERT INTO intentos (clave, n, desde) VALUES (?1, 1, ?2)
     ON CONFLICT (clave) DO UPDATE SET
       n = CASE WHEN desde < ?2 - ?3 THEN 1 ELSE n + 1 END,
       desde = CASE WHEN desde < ?2 - ?3 THEN ?2 ELSE desde END
     RETURNING n`
  ).bind(clave, ahora, ventana).first();
  return fila.n <= max;
}

/** Para claves: solo cuentan los intentos fallidos. */
export async function bloqueado(env, clave, max, ventana) {
  const fila = await env.DB.prepare('SELECT n, desde FROM intentos WHERE clave = ?').bind(clave).first();
  return !!fila && fila.desde >= Math.floor(Date.now() / 1000) - ventana && fila.n >= max;
}
export const registrarFallo = (env, clave, ventana) => limitar(env, clave, Infinity, ventana);
export const limpiarFallos = (env, clave) => env.DB.prepare('DELETE FROM intentos WHERE clave = ?').bind(clave).run();

export const ip = (req) => req.headers.get('CF-Connecting-IP') || 'local';
