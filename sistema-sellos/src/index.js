// Sistema de sellos: tarjeta de cliente frecuente digital + panel del negocio.
// Cloudflare Workers + D1. Ver LEEME.md para instalarlo.
import qrcode from 'qrcode-generator';
import ESQUEMA from '../migrations/0001_inicial.sql';
import * as P from './paginas.js';
import { leerDiseno, temaCss, catalogo, mediosDe, colores } from './diseno.js';
import { walletActivo, enlaceGuardar, actualizar as actualizarWallet } from './wallet.js';
import {
  AVISO_VERSION, EN_MARCO, html, json, error, texto, redirigir, cookies, cookie, cuerpo, nuevoToken, nuevoCodigo, aleatorio,
  normalizarCodigo, celularPeru, celularVisible, limpiarTexto, SLUG, RESERVADOS, primerNombre,
} from './util.js';
import {
  hashClave, verificarClave, verificarClaveAdmin, claveAdminValida, crearSesion, leerSesion, limitar, bloqueado, registrarFallo, limpiarFallos, ip, DURACION_SESION,
} from './auth.js';

// ---------- base de datos ----------
let esquemaListo = false;
const COLUMNAS_NUEVAS = [
  ['negocios', 'diseno', "TEXT NOT NULL DEFAULT '{}'"],
  ['negocios', 'plan', "TEXT NOT NULL DEFAULT ''"],
  ['negocios', 'vence', "TEXT NOT NULL DEFAULT ''"],
  ['negocios', 'suspendido', 'INTEGER NOT NULL DEFAULT 0'],
  ['clientes', 'wallet', 'INTEGER NOT NULL DEFAULT 0'],
];
async function asegurarEsquema(env) {
  if (esquemaListo) return;
  const sentencias = ESQUEMA.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    .split(';').map((s) => s.trim()).filter(Boolean);
  await env.DB.batch(sentencias.map((s) => env.DB.prepare(s)));
  // Bases creadas con una versión anterior: agregamos las columnas nuevas.
  for (const [tabla, columna, def] of COLUMNAS_NUEVAS) {
    const col = await env.DB.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info('${tabla}') WHERE name = ?`).bind(columna).first();
    if (!col.n) await env.DB.prepare(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${def}`).run();
  }
  esquemaListo = true;
}

async function negocioPorSlug(env, slug) {
  const n = await env.DB.prepare('SELECT * FROM negocios WHERE slug = ? AND activo = 1').bind(slug).first();
  if (n) n.d = leerDiseno(n, n.diseno);
  return n;
}

const CAMPOS_CLIENTE = 'id, token, codigo, nombre, celular, recordatorios, sellos, visitas, premios, ultima_visita, creado, wallet';

function clientePublico(c, n) {
  return { nombre: primerNombre(c.nombre), sellos: c.sellos, meta: n.meta, premio: n.premio, visitas: c.visitas, premios: c.premios };
}

function clientePanel(c, n, origen) {
  return {
    id: c.id, nombre: c.nombre, codigo: c.codigo, celular: celularVisible(c.celular), celularWa: c.celular,
    recordatorios: !!c.recordatorios, sellos: c.sellos, visitas: c.visitas, premios: c.premios,
    ultimaVisita: c.ultima_visita, creado: c.creado, meta: n.meta,
    enlace: `${origen}/${n.slug}/t/${c.token}`,
  };
}

// ---------- redes del negocio ----------
const REDES = ['whatsapp', 'instagram', 'tiktok', 'facebook', 'maps', 'web'];
function leerRedes(d) {
  const out = {};
  for (const k of REDES) {
    const v = String(d['red_' + k] ?? '').trim();
    if (!v) continue;
    if (k === 'whatsapp') {
      const c = celularPeru(v);
      if (!c) return { error: 'El WhatsApp del negocio debe ser un celular de 9 dígitos que empiece con 9.' };
      out[k] = c;
      continue;
    }
    let u;
    try { u = new URL(v); } catch { return { error: `Revisa el enlace de ${k}: debe empezar con https://` }; }
    if (u.protocol !== 'https:' || v.length > 300) return { error: `Revisa el enlace de ${k}: debe empezar con https://` };
    out[k] = u.href;
  }
  return { redes: JSON.stringify(out) };
}

// ---------- estadísticas ----------
const contarVista = (env, n, origen) => env.DB.prepare(
  `INSERT INTO vistas (negocio_id, dia, origen, n) VALUES (?, date('now', '-5 hours'), ?, 1)
   ON CONFLICT (negocio_id, dia, origen) DO UPDATE SET n = n + 1`
).bind(n.id, origen).run();

// ---------- QR ----------
function qrSvg(valor) {
  const qr = qrcode(0, 'M');
  qr.addData(valor);
  qr.make();
  const n = qr.getModuleCount();
  const m = 4; // margen
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x + m} ${y + m}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" shape-rendering="crispEdges" aria-hidden="true"><rect width="100%" height="100%" fill="#fff"/><path fill="#000" d="${d}"/></svg>`;
}

// ---------- vencimiento del plan ----------
const PLANES = { '': 'Sin definir', prueba: 'Prueba gratis', mensual: 'Mensual', anual: 'Anual', esencial: 'Bio Esencial', total: 'Bio Total', cortesia: 'Cortesía' };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const hoyLima = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
function sumarMeses(fecha, meses) {
  const [a, m, d] = fecha.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
  f.setUTCDate(Math.min(d, ultimo));
  return f.toISOString().slice(0, 10);
}
/** Días que faltan para el vencimiento (negativo si ya venció; null si no tiene fecha). */
const diasPara = (vence) => (FECHA.test(vence || '') ? Math.round((Date.parse(vence) - Date.parse(hoyLima())) / 86400000) : null);
const estadoPlan = (n) => ({ plan: n.plan || '', vence: n.vence || '', dias: diasPara(n.vence), suspendido: !!n.suspendido });

// ---------- sesiones ----------
async function puedeEntrar(req, env, n) {
  const s = await leerSesion(req, env);
  if (!s) return false;
  if (s.r === 'admin') return true;
  return s.r === 'staff' && s.n === n.id && s.v === n.clave_ver;
}

const esAdmin = async (req, env) => (await leerSesion(req, env))?.r === 'admin';

// ---------- registro de clientes ----------
async function registrar(req, env, n) {
  const formulario = (req.headers.get('Content-Type') || '').startsWith('application/x-www-form-urlencoded');
  let datos;
  try {
    if (formulario) {
      const origen = req.headers.get('Origin');
      if (origen && origen !== new URL(req.url).origin) throw new Error('origen');
      datos = Object.fromEntries(await req.formData());
    } else datos = await cuerpo(req);
  } catch {
    return error('Solicitud no válida.');
  }
  const nombre = limpiarTexto(datos.nombre, 60);
  const celular = celularPeru(datos.celular);
  const fallo = (msg, status = 400) =>
    formulario ? html(P.registro(n, { error: msg, valores: { nombre, celular: String(datos.celular || '').slice(0, 11), origen: datos.origen === 'qr' ? 'qr' : 'enlace' } }), status) : error(msg, status);

  if (n.suspendido) return fallo('Este programa está en pausa por ahora. Vuelve a intentarlo más adelante.', 403);
  if (nombre.length < 2) return fallo('Escribe tu nombre.');
  if (!celular) return fallo('Revisa tu celular: deben ser 9 dígitos y empezar con 9.');
  if (!(datos.acepta === true || datos.acepta === '1')) return fallo('Para crear tu tarjeta debes aceptar el aviso de privacidad.');
  if (!(await limitar(env, `reg:${n.id}:${ip(req)}`, 60, 3600))) return fallo('Demasiados registros desde esta conexión. Intenta más tarde.', 429);

  const existe = await env.DB.prepare('SELECT 1 FROM clientes WHERE negocio_id = ? AND celular = ?').bind(n.id, celular).first();
  // No revelamos la tarjeta de otra persona: solo avisamos que ya existe.
  if (existe) return fallo('Este celular ya tiene una tarjeta. Pide en caja que te la reenvíen por WhatsApp.', 409);

  const token = nuevoToken();
  const recordatorios = datos.recordatorios === true || datos.recordatorios === '1' ? 1 : 0;
  const origen = datos.origen === 'qr' ? 'qr' : 'enlace';
  const consentimiento = `${new Date().toISOString()} aviso ${AVISO_VERSION}${recordatorios ? ' + recordatorios' : ''}`;
  for (let intento = 0; intento < 5; intento++) {
    try {
      await env.DB.prepare(
        'INSERT INTO clientes (negocio_id, token, codigo, nombre, celular, recordatorios, consentimiento, origen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(n.id, token, nuevoCodigo(), nombre, celular, recordatorios, consentimiento, origen).run();
      break;
    } catch (err) {
      if (!/UNIQUE/i.test(String(err))) throw err;
      if (/celular/.test(String(err))) return fallo('Este celular ya tiene una tarjeta. Pide en caja que te la reenvíen por WhatsApp.', 409);
      if (intento === 4) throw err; // código repetido 5 veces: prácticamente imposible
    }
  }
  const destino = `/${n.slug}/t/${token}`;
  const galleta = cookie(`t_${n.slug}`, token, { path: `/${n.slug}`, maxAge: 60 * 60 * 24 * 400, sameSite: 'Lax' });
  return formulario ? redirigir(destino, { 'Set-Cookie': galleta }) : json({ ok: true, url: destino }, 201, { 'Set-Cookie': galleta });
}

// ---------- API del panel ----------
async function apiPanel(req, env, n, partes, url, ctx) {
  const [accion, id, sub] = partes;
  const metodo = req.method;

  if (accion === 'yo' && metodo === 'GET') {
    const sesion = await puedeEntrar(req, env, n);
    // La fecha de vencimiento solo la ve quien ya entró al panel.
    return json({ sesion, ...(sesion ? estadoPlan(n) : { suspendido: !!n.suspendido, dias: null }) });
  }

  if (accion === 'login' && metodo === 'POST') {
    if (n.suspendido) return error('Este panel está suspendido. Comunícate con tu proveedor para reactivarlo.', 403);
    const llave = `login:${n.id}:${ip(req)}`;
    if (await bloqueado(env, llave, 8, 900)) return error('Demasiados intentos fallidos. Espera 15 minutos.', 429);
    let datos;
    try { datos = await cuerpo(req); } catch { return error('Solicitud no válida.'); }
    const clave = String(datos.clave || '');
    // Solo la clave del negocio: el administrador entra por /admin y su sesión abre todos los paneles.
    const ok = Boolean(n.clave_hash) && (await verificarClave(clave, n.clave_hash));
    if (!ok) { await registrarFallo(env, llave, 900); return error('Clave incorrecta.', 401); }
    await limpiarFallos(env, llave);
    const s = await crearSesion(env, { r: 'staff', n: n.id, v: n.clave_ver });
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('sesion', s, { maxAge: DURACION_SESION }) });
  }

  if (!(await puedeEntrar(req, env, n))) return error('Inicia sesión.', 401);
  if (n.suspendido && !(await esAdmin(req, env))) return error('Este panel está suspendido. Comunícate con tu proveedor para reactivarlo.', 403);
  let datos = {};
  if (metodo === 'POST') {
    try { datos = await cuerpo(req); } catch { return error('Solicitud no válida.'); }
  }

  if (accion === 'buscar' && metodo === 'GET') {
    const q = String(url.searchParams.get('q') || '').trim().slice(0, 60);
    if (!q) return json({ clientes: [] });
    const codigo = normalizarCodigo(q);
    const digitos = q.replace(/\D/g, '');
    let filas;
    if (digitos.length >= 4 && digitos.length === q.replace(/[\s+-]/g, '').length) {
      filas = await env.DB.prepare(`SELECT ${CAMPOS_CLIENTE} FROM clientes WHERE negocio_id = ? AND (celular LIKE ? OR codigo = ?)
         ORDER BY codigo = ? DESC, ultima_visita DESC LIMIT 20`)
        .bind(n.id, `%${digitos.slice(-9)}%`, codigo, codigo).all();
    } else {
      // Código del QR (exacto) o parte del nombre
      const patron = `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
      filas = await env.DB.prepare(
        `SELECT ${CAMPOS_CLIENTE} FROM clientes WHERE negocio_id = ? AND (codigo = ? OR nombre LIKE ? ESCAPE '\\')
         ORDER BY codigo = ? DESC, ultima_visita DESC LIMIT 20`
      ).bind(n.id, codigo, patron, codigo).all();
    }
    return json({ clientes: filas.results.map((c) => clientePanel(c, n, url.origin)) });
  }

  if (accion === 'clientes' && metodo === 'GET') {
    const desde = Math.max(0, Number(url.searchParams.get('desde')) | 0);
    const [lista, total] = await env.DB.batch([
      env.DB.prepare(`SELECT ${CAMPOS_CLIENTE}, origen FROM clientes WHERE negocio_id = ? ORDER BY creado DESC, id DESC LIMIT 25 OFFSET ?`).bind(n.id, desde),
      env.DB.prepare('SELECT COUNT(*) AS n FROM clientes WHERE negocio_id = ?').bind(n.id),
    ]);
    return json({
      total: total.results[0].n,
      clientes: lista.results.map((c) => ({ ...clientePanel(c, n, url.origin), origen: c.origen })),
    });
  }

  if (accion === 'cerca' && metodo === 'GET') {
    const filas = await env.DB.prepare(
      `SELECT ${CAMPOS_CLIENTE} FROM clientes WHERE negocio_id = ? AND recordatorios = 1 AND sellos >= ?
       ORDER BY sellos DESC, ultima_visita ASC LIMIT 100`
    ).bind(n.id, Math.max(1, n.meta - 2)).all();
    return json({ clientes: filas.results.map((c) => clientePanel(c, n, url.origin)) });
  }

  if (accion === 'resumen' && metodo === 'GET') {
    const [tot, hoy, mes, vis, nuevas, activos] = await env.DB.batch([
      env.DB.prepare('SELECT COUNT(*) AS clientes, COALESCE(SUM(premios),0) AS premios, COALESCE(SUM(recordatorios),0) AS con_recordatorios FROM clientes WHERE negocio_id = ?').bind(n.id),
      env.DB.prepare(`SELECT COUNT(*) AS v FROM movimientos WHERE negocio_id = ? AND tipo = 'sello' AND creado >= datetime('now', '-5 hours', 'start of day', '+5 hours')`).bind(n.id),
      env.DB.prepare(`SELECT COUNT(*) AS v FROM movimientos WHERE negocio_id = ? AND tipo = 'sello' AND creado >= datetime('now', '-30 days')`).bind(n.id),
      env.DB.prepare(
        `SELECT COALESCE(SUM(CASE WHEN origen = 'qr' THEN n END), 0) AS qr30,
                COALESCE(SUM(CASE WHEN origen = 'qr' AND dia = date('now', '-5 hours') THEN n END), 0) AS qr_hoy,
                COALESCE(SUM(n), 0) AS total30
         FROM vistas WHERE negocio_id = ? AND dia >= date('now', '-5 hours', '-29 days')`
      ).bind(n.id),
      env.DB.prepare(`SELECT COUNT(*) AS nuevas, COALESCE(SUM(origen = 'qr'), 0) AS nuevas_qr FROM clientes WHERE negocio_id = ? AND creado >= datetime('now', '-30 days')`).bind(n.id),
      env.DB.prepare(`SELECT COUNT(*) AS v FROM clientes WHERE negocio_id = ? AND ultima_visita >= datetime('now', '-30 days')`).bind(n.id),
    ]);
    const t = tot.results[0], v = vis.results[0], nu = nuevas.results[0];
    return json({
      clientes: t.clientes, premios: t.premios, conRecordatorios: t.con_recordatorios,
      visitasHoy: hoy.results[0].v, visitas30: mes.results[0].v, activos30: activos.results[0].v,
      escaneosQrHoy: v.qr_hoy, escaneosQr30: v.qr30, aperturas30: v.total30,
      tarjetasNuevas30: nu.nuevas, tarjetasDesdeQr30: nu.nuevas_qr,
    });
  }

  if (accion === 'cliente' && id && /^\d+$/.test(id)) {
    const cid = Number(id);
    const leer = () => env.DB.prepare(`SELECT ${CAMPOS_CLIENTE} FROM clientes WHERE id = ? AND negocio_id = ?`).bind(cid, n.id).first();
    const c = await leer();
    if (!c) return error('Cliente no encontrado.', 404);

    if (!sub && metodo === 'GET') return json({ cliente: clientePanel(c, n, url.origin) });
    // Tras cambiar los sellos, el pase de Google Wallet (si lo guardó) se actualiza en segundo plano.
    const listo = async () => {
      const nuevo = await leer();
      if (nuevo && nuevo.wallet && walletActivo(env) && ctx) ctx.waitUntil(actualizarWallet(env, n, nuevo, url.origin));
      return json({ cliente: clientePanel(nuevo, n, url.origin) });
    };

    if (sub === 'sello' && metodo === 'POST') {
      const espera = `-${Math.max(0, n.espera_min | 0)} minutes`;
      const [upd] = await env.DB.batch([
        env.DB.prepare(
          `UPDATE clientes SET sellos = sellos + 1, visitas = visitas + 1, ultima_visita = datetime('now')
           WHERE id = ? AND negocio_id = ? AND (ultima_visita IS NULL OR ultima_visita <= datetime('now', ?))`
        ).bind(cid, n.id, espera),
        env.DB.prepare(`INSERT INTO movimientos (negocio_id, cliente_id, tipo) SELECT ?, ?, 'sello' WHERE changes() > 0`).bind(n.id, cid),
      ]);
      if (!upd.meta.changes) {
        const hace = Math.max(0, Math.round((Date.now() - Date.parse(String(c.ultima_visita).replace(' ', 'T') + 'Z')) / 60000));
        return error(`Ya se le sumó un sello hace ${hace} min. Entre dos sellos deben pasar ${n.espera_min} minutos.`, 409);
      }
      return listo();
    }

    if (sub === 'canje' && metodo === 'POST') {
      const [upd] = await env.DB.batch([
        env.DB.prepare('UPDATE clientes SET sellos = sellos - ?, premios = premios + 1 WHERE id = ? AND negocio_id = ? AND sellos >= ?').bind(n.meta, cid, n.id, n.meta),
        env.DB.prepare(`INSERT INTO movimientos (negocio_id, cliente_id, tipo) SELECT ?, ?, 'canje' WHERE changes() > 0`).bind(n.id, cid),
      ]);
      if (!upd.meta.changes) return error(`Aún no completa los ${n.meta} sellos.`, 409);
      return listo();
    }

    if (sub === 'deshacer' && metodo === 'POST') {
      const ultimo = await env.DB.prepare(
        `SELECT id FROM movimientos WHERE cliente_id = ? AND negocio_id = ? AND tipo = 'sello' AND creado >= datetime('now', '-30 minutes')
         AND NOT EXISTS (SELECT 1 FROM movimientos m2 WHERE m2.cliente_id = ? AND m2.tipo = 'canje' AND m2.id > movimientos.id)
         ORDER BY id DESC LIMIT 1`
      ).bind(cid, n.id, cid).first();
      if (!ultimo) return error('Solo se puede deshacer un sello de los últimos 30 minutos (y antes de un canje).', 409);
      const [, upd] = await env.DB.batch([
        env.DB.prepare('DELETE FROM movimientos WHERE id = ?').bind(ultimo.id),
        env.DB.prepare(
          `UPDATE clientes SET sellos = MAX(sellos - 1, 0), visitas = MAX(visitas - 1, 0),
           ultima_visita = (SELECT MAX(creado) FROM movimientos WHERE cliente_id = ? AND tipo = 'sello')
           WHERE id = ? AND negocio_id = ? AND changes() > 0`
        ).bind(cid, cid, n.id),
      ]);
      if (!upd.meta.changes) return error('Ese sello ya se deshizo.', 409);
      return listo();
    }

    if (sub === 'recordatorios' && metodo === 'POST') {
      await env.DB.prepare('UPDATE clientes SET recordatorios = ? WHERE id = ? AND negocio_id = ?').bind(datos.activo ? 1 : 0, cid, n.id).run();
      return json({ cliente: clientePanel(await leer(), n, url.origin) });
    }

    if (sub === 'eliminar' && metodo === 'POST') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM movimientos WHERE cliente_id = ? AND negocio_id = ?').bind(cid, n.id),
        env.DB.prepare('DELETE FROM clientes WHERE id = ? AND negocio_id = ?').bind(cid, n.id),
      ]);
      return json({ ok: true });
    }
  }

  if (accion === 'clientes.csv' && metodo === 'GET') {
    const filas = await env.DB.prepare(
      'SELECT nombre, celular, codigo, sellos, visitas, premios, recordatorios, ultima_visita, creado, consentimiento FROM clientes WHERE negocio_id = ? ORDER BY creado'
    ).bind(n.id).all();
    const celda = (v) => {
      let s = String(v ?? '');
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita fórmulas al abrir en Excel
      return `"${s.replace(/"/g, '""')}"`;
    };
    const cab = ['nombre', 'celular', 'codigo', 'sellos', 'visitas', 'premios', 'acepta_recordatorios', 'ultima_visita_utc', 'creado_utc', 'consentimiento'];
    const lineas = [cab.join(','), ...filas.results.map((f) => [f.nombre, f.celular, f.codigo, f.sellos, f.visitas, f.premios, f.recordatorios ? 'si' : 'no', f.ultima_visita, f.creado, f.consentimiento].map(celda).join(','))];
    return texto('﻿' + lineas.join('\r\n'), 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="clientes-${n.slug}.csv"` });
  }

  return error('No encontrado.', 404);
}

// ---------- API de administración ----------
async function apiAdmin(req, env, partes, url) {
  const [accion] = partes;
  if (accion === 'sesion' && req.method === 'GET') return json({ sesion: await esAdmin(req, env) });
  if (accion === 'login' && req.method === 'POST') {
    if (!claveAdminValida(env)) return error('Falta configurar ADMIN_PASSWORD (mínimo 12 caracteres) en el Worker.', 503);
    const llave = `admin:${ip(req)}`;
    if (await bloqueado(env, llave, 6, 900)) return error('Demasiados intentos fallidos. Espera 15 minutos.', 429);
    let datos;
    try { datos = await cuerpo(req); } catch { return error('Solicitud no válida.'); }
    if (!(await verificarClaveAdmin(env, datos.clave))) { await registrarFallo(env, llave, 900); return error('Clave incorrecta.', 401); }
    await limpiarFallos(env, llave);
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('sesion', await crearSesion(env, { r: 'admin' }), { maxAge: DURACION_SESION }) });
  }
  if (!(await esAdmin(req, env))) return error('Inicia sesión.', 401);

  if (accion === 'negocios' && req.method === 'GET') {
    const filas = await env.DB.prepare(
      `SELECT n.id, n.slug, n.nombre, n.programa, n.meta, n.premio, n.espera_min, n.razon_social, n.ruc, n.direccion, n.correo, n.color, n.tema, n.redes, n.diseno, n.plan, n.vence, n.suspendido,
         n.clave_hash != '' AS tiene_clave,
         (SELECT COUNT(*) FROM clientes c WHERE c.negocio_id = n.id) AS clientes,
         (SELECT COUNT(*) FROM movimientos m WHERE m.negocio_id = n.id AND m.tipo = 'sello' AND m.creado >= datetime('now', '-30 days')) AS visitas30,
         (SELECT COALESCE(SUM(v.n), 0) FROM vistas v WHERE v.negocio_id = n.id AND v.origen = 'qr' AND v.dia >= date('now', '-5 hours', '-29 days')) AS escaneos30,
         (SELECT COUNT(*) FROM clientes c WHERE c.negocio_id = n.id AND c.recordatorios = 1 AND c.sellos >= MAX(n.meta - 2, 1)) AS cerca
       FROM negocios n WHERE n.activo = 1 ORDER BY n.nombre`
    ).all();
    return json({ negocios: filas.results.map((n) => ({ ...n, diseno: leerDiseno(n, n.diseno), ...estadoPlan(n) })), hoy: hoyLima(), planes: PLANES });
  }

  if (accion === 'catalogo' && req.method === 'GET') return json({ ...catalogo(), medios: !!env.MEDIOS });

  if (accion === 'medios' && req.method === 'POST') return subirMedio(req, env, url);

  if (accion === 'estado' && req.method === 'POST') {
    let d;
    try { d = await cuerpo(req); } catch { return error('Solicitud no válida.'); }
    const n = await negocioPorSlug(env, String(d.slug || ''));
    if (!n) return error('Negocio no encontrado.', 404);
    if (d.accion === 'suspender') await env.DB.prepare('UPDATE negocios SET suspendido = 1 WHERE id = ?').bind(n.id).run();
    else if (d.accion === 'reactivar') await env.DB.prepare('UPDATE negocios SET suspendido = 0 WHERE id = ?').bind(n.id).run();
    else if (d.accion === 'renovar' && [1, 3, 6, 12].includes(Number(d.meses))) {
      // Se suma desde el vencimiento si aún no llega; si ya venció, desde hoy.
      const desde = FECHA.test(n.vence) && n.vence > hoyLima() ? n.vence : hoyLima();
      await env.DB.prepare('UPDATE negocios SET vence = ?, suspendido = 0 WHERE id = ?').bind(sumarMeses(desde, Number(d.meses)), n.id).run();
    } else return error('Acción no válida.');
    return json({ ok: true, ...estadoPlan(await negocioPorSlug(env, n.slug)) });
  }

  if (accion === 'negocios' && req.method === 'POST') {
    let d;
    try { d = await cuerpo(req); } catch { return error('Solicitud no válida.'); }
    const slug = String(d.slug || '').trim().toLowerCase();
    if (!SLUG.test(slug) || RESERVADOS.has(slug)) return error('Identificador no válido: usa minúsculas, números y guiones (por ejemplo «filo»).');
    const v = {
      nombre: limpiarTexto(d.nombre, 60), programa: limpiarTexto(d.programa, 40), premio: limpiarTexto(d.premio, 60),
      meta: Math.round(Number(d.meta)), espera_min: Math.round(Number(d.espera_min ?? 180)),
      razon_social: limpiarTexto(d.razon_social, 100), ruc: String(d.ruc || '').replace(/\D/g, ''),
      direccion: limpiarTexto(d.direccion, 140), correo: limpiarTexto(d.correo, 100),
    };
    v.plan = Object.prototype.hasOwnProperty.call(PLANES, d.plan) ? d.plan : '';
    v.vence = FECHA.test(d.vence || '') ? d.vence : '';
    const diseno = leerDiseno(null, d.diseno);
    // color y tema se mantienen por compatibilidad con versiones anteriores
    v.color = diseno.acento; v.tema = colores(diseno).claro ? 'claro' : 'oscuro';
    if (!v.nombre || !v.programa || !v.premio) return error('Completa nombre, programa y premio.');
    if (!(v.meta >= 3 && v.meta <= 20)) return error('Los sellos para el premio deben estar entre 3 y 20.');
    if (!(v.espera_min >= 0 && v.espera_min <= 10080)) return error('Los minutos entre sellos deben estar entre 0 y 10080.');
    if (v.ruc && v.ruc.length !== 11) return error('El RUC debe tener 11 dígitos.');
    if (v.correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.correo)) return error('Revisa el correo.');
    const r = leerRedes(d);
    if (r.error) return error(r.error);
    v.redes = r.redes;
    const clave = String(d.clave || '');
    if (clave && clave.length < 8) return error('La clave del panel debe tener al menos 8 caracteres.');
    const hash = clave ? await hashClave(clave) : null;

    const existe = await env.DB.prepare('SELECT id FROM negocios WHERE slug = ?').bind(slug).first();
    if (existe && d.editar !== slug) return error(`Ya existe un negocio con el identificador «${slug}». Usa otro o toca «Editar» en ese negocio.`, 409);
    // Solo se aceptan fotos y videos subidos para este mismo negocio.
    const ids = mediosDe(diseno);
    if (ids.length) {
      const propios = existe ? (await env.DB.prepare(`SELECT id FROM medios WHERE negocio_id = ? AND id IN (${ids.map(() => '?').join(',')})`).bind(existe.id, ...ids).all()).results.map((r) => r.id) : [];
      for (const k of ['logo', 'portada', 'imagen', 'video']) if (diseno[k] && !propios.includes(diseno[k])) diseno[k] = '';
    }
    v.diseno = JSON.stringify(diseno);
    if (existe) {
      await env.DB.prepare(
        `UPDATE negocios SET nombre=?, programa=?, premio=?, meta=?, espera_min=?, razon_social=?, ruc=?, direccion=?, correo=?, color=?, tema=?, redes=?, diseno=?, plan=?, vence=?, activo=1
         ${hash ? ', clave_hash=?, clave_ver=clave_ver+1' : ''} WHERE id = ?`
      ).bind(v.nombre, v.programa, v.premio, v.meta, v.espera_min, v.razon_social, v.ruc, v.direccion, v.correo, v.color, v.tema, v.redes, v.diseno, v.plan, v.vence, ...(hash ? [hash] : []), existe.id).run();
      return json({ ok: true, creado: false });
    }
    if (!hash) return error('Define una clave para el panel del nuevo negocio.');
    // Negocio nuevo sin fecha: un mes desde hoy (el primer mes gratis).
    if (!v.vence) v.vence = sumarMeses(hoyLima(), 1);
    if (!v.plan) v.plan = 'prueba';
    await env.DB.prepare(
      `INSERT INTO negocios (slug, nombre, programa, premio, meta, espera_min, razon_social, ruc, direccion, correo, color, tema, redes, diseno, plan, vence, clave_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(slug, v.nombre, v.programa, v.premio, v.meta, v.espera_min, v.razon_social, v.ruc, v.direccion, v.correo, v.color, v.tema, v.redes, v.diseno, v.plan, v.vence, hash).run();
    return json({ ok: true, creado: true }, 201);
  }
  return error('No encontrado.', 404);
}

// ---------- fotos y videos (Cloudflare KV) ----------
const TIPOS_MEDIO = { logo: 'imagen', portada: 'imagen', imagen: 'imagen', video: 'video' };
const LIMITE = { imagen: 2 * 1024 * 1024, video: 15 * 1024 * 1024 };
/** Reconoce el formato por sus primeros bytes, no por lo que diga el navegador. */
function formato(b) {
  const txt = (i, n) => String.fromCharCode(...b.slice(i, i + n));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ['imagen', 'image/jpeg'];
  if (txt(1, 3) === 'PNG') return ['imagen', 'image/png'];
  if (txt(0, 4) === 'RIFF' && txt(8, 4) === 'WEBP') return ['imagen', 'image/webp'];
  if (txt(4, 4) === 'ftyp') return ['video', 'video/mp4'];
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return ['video', 'video/webm'];
  return [null, null];
}

async function subirMedio(req, env, url) {
  if (!env.MEDIOS) return error('Para subir fotos y videos, primero activa el almacenamiento (KV). Mira la guía en el panel.', 503);
  const origen = req.headers.get('Origin');
  if (!origen || origen !== url.origin) return error('Solicitud no válida.');
  const tipo = url.searchParams.get('tipo');
  if (!TIPOS_MEDIO[tipo]) return error('Tipo de archivo no válido.');
  const n = await negocioPorSlug(env, String(url.searchParams.get('n') || ''));
  if (!n) return error('Guarda el negocio antes de subir fotos.', 404);
  const largo = Number(req.headers.get('Content-Length') || 0);
  if (largo > LIMITE[TIPOS_MEDIO[tipo]]) return error(TIPOS_MEDIO[tipo] === 'video' ? 'El video debe pesar menos de 15 MB.' : 'La imagen debe pesar menos de 2 MB.', 413);
  const datos = new Uint8Array(await req.arrayBuffer());
  if (!datos.length || datos.length > LIMITE[TIPOS_MEDIO[tipo]]) return error('Archivo vacío o demasiado grande.', 413);
  const [clase, mime] = formato(datos);
  if (clase !== TIPOS_MEDIO[tipo]) return error(TIPOS_MEDIO[tipo] === 'video' ? 'Sube un video MP4 o WebM.' : 'Sube una imagen JPG, PNG o WebP.');
  const id = 'm' + aleatorio(16, 'abcdefghijkmnpqrstuvwxyz23456789');
  await env.MEDIOS.put(`m/${id}`, datos, { metadata: { mime } });
  await env.DB.prepare('INSERT INTO medios (id, negocio_id, tipo, mime, tam) VALUES (?, ?, ?, ?, ?)').bind(id, n.id, tipo, mime, datos.length).run();
  return json({ ok: true, id }, 201);
}

async function servirMedio(req, env, id) {
  if (!env.MEDIOS || !/^m[a-z0-9]{16}$/.test(id)) return new Response('No encontrado', { status: 404 });
  const { value, metadata } = await env.MEDIOS.getWithMetadata(`m/${id}`, 'arrayBuffer');
  if (!value) return new Response('No encontrado', { status: 404 });
  const base = {
    'Content-Type': metadata?.mime || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable',
    'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
  };
  // Los videos en iPhone se piden por partes (Range).
  const rango = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('Range') || '');
  if (rango) {
    const total = value.byteLength;
    let ini = rango[1] === '' ? total - Number(rango[2]) : Number(rango[1]);
    let fin = rango[1] === '' || rango[2] === '' ? total - 1 : Math.min(Number(rango[2]), total - 1);
    if (!(ini >= 0 && ini <= fin)) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
    return new Response(value.slice(ini, fin + 1), { status: 206, headers: { ...base, 'Content-Range': `bytes ${ini}-${fin}/${total}`, 'Content-Length': String(fin - ini + 1) } });
  }
  return new Response(value, { headers: { ...base, 'Content-Length': String(value.byteLength) } });
}

// ---------- vistas previas para /admin ----------
async function vistaPrevia(req, env, pagina, url) {
  if (!(await esAdmin(req, env))) return html(P.noEncontrado(), 404);
  let d = {};
  const crudo = String(url.searchParams.get('d') || '');
  if (crudo.length < 6000) { try { d = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(crudo.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))); } catch { d = {}; } }
  const meta = Math.min(20, Math.max(3, Math.round(Number(d.meta)) || 10));
  const n = {
    slug: 'vista', nombre: limpiarTexto(d.nombre, 60) || 'Tu negocio', programa: limpiarTexto(d.programa, 40) || 'Club de clientes',
    premio: limpiarTexto(d.premio, 60) || 'Premio', meta, redes: '{}', razon_social: '', vista: true,
    d: leerDiseno(null, d.diseno), temaUrl: `/admin/vista/tema.css?d=${encodeURIComponent(crudo)}`,
  };
  try { n.redes = leerRedes(d).redes || '{}'; } catch { n.redes = '{}'; }
  if (pagina === 'tema.css') return texto(temaCss(n, n.d), 'text/css; charset=utf-8');
  if (pagina === 'registro') return html(P.registro(n), 200, EN_MARCO);
  if (pagina === 'tarjeta') {
    const c = { token: 'vista', codigo: 'ABCD2345', nombre: 'Cliente', celular: '51900000000', sellos: Math.max(1, meta - 3), visitas: meta - 3, premios: 1 };
    return html(P.tarjeta(n, c, qrSvg(`${url.origin}/vista`), url.origin), 200, EN_MARCO);
  }
  return html(P.noEncontrado(), 404);
}

// ---------- enrutador ----------
async function manejar(req, env, ctx) {
  const url = new URL(req.url);
  let partes;
  try { partes = url.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p)); }
  catch { return html(P.noEncontrado(), 404); }
  await asegurarEsquema(env);

  if (partes[0] === 'api') {
    if (partes[1] === 'salir' && req.method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': cookie('sesion', '', { maxAge: 0 }) });
    if (partes[1] === 'admin') return apiAdmin(req, env, partes.slice(2), url);
    if (partes[1] === 'n' && partes[2]) {
      const n = await negocioPorSlug(env, partes[2]);
      if (!n) return error('Negocio no encontrado.', 404);
      if (partes[3] === 'registro' && req.method === 'POST') return registrar(req, env, n);
      if (partes[3] === 't' && partes[4]) {
        const c = await env.DB.prepare(`SELECT ${CAMPOS_CLIENTE} FROM clientes WHERE token = ? AND negocio_id = ?`).bind(partes[4], n.id).first();
        if (!c) return error('Tarjeta no encontrada.', 404);
        if (!partes[5] && req.method === 'GET') return json(clientePublico(c, n));
        if (partes[5] === 'eliminar' && req.method === 'POST') {
          try { await cuerpo(req); } catch { return error('Solicitud no válida.'); }
          await env.DB.batch([
            env.DB.prepare('DELETE FROM movimientos WHERE cliente_id = ?').bind(c.id),
            env.DB.prepare('DELETE FROM clientes WHERE id = ?').bind(c.id),
          ]);
          return json({ ok: true }, 200, { 'Set-Cookie': cookie(`t_${n.slug}`, '', { path: `/${n.slug}`, maxAge: 0 }) });
        }
        return error('No encontrado.', 404);
      }
      return apiPanel(req, env, n, partes.slice(3), url, ctx);
    }
    return error('No encontrado.', 404);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD' && !(req.method === 'POST' && partes.length === 2 && partes[1] === 'registro')) {
    return error('Método no permitido.', 405);
  }

  if (partes.length === 0) return html(P.inicio());
  if (partes[0] === 'admin' && partes.length === 1) return html(P.admin());
  if (partes[0] === 'admin' && partes[1] === 'vista' && partes.length === 3) return vistaPrevia(req, env, partes[2], url);
  if (partes[0] === 'm' && partes.length === 2) return servirMedio(req, env, partes[1]);
  if (partes[0] === 'robots.txt') return texto('User-agent: *\nDisallow: /\n', 'text/plain; charset=utf-8');
  if (!SLUG.test(partes[0]) || RESERVADOS.has(partes[0])) return html(P.noEncontrado(), 404);

  const n = await negocioPorSlug(env, partes[0]);
  if (!n) return html(P.noEncontrado(), 404);

  if (partes.length === 1) {
    const origen = url.searchParams.get('o') === 'qr' ? 'qr' : 'enlace';
    const galletas = cookies(req);
    // Contador anónimo de visitas: cada celular cuenta una vez cada 12 horas.
    const extra = {};
    if (req.method === 'GET' && !galletas[`v_${n.slug}`]) {
      await contarVista(env, n, origen);
      extra['Set-Cookie'] = cookie(`v_${n.slug}`, '1', { path: `/${n.slug}`, maxAge: 60 * 60 * 12, sameSite: 'Lax' });
    }
    // Si ya tiene tarjeta en este celular, la abrimos directamente.
    const token = galletas[`t_${n.slug}`];
    if (token && /^[a-z2-9]{26}$/.test(token)) {
      const c = await env.DB.prepare('SELECT 1 FROM clientes WHERE token = ? AND negocio_id = ?').bind(token, n.id).first();
      if (c) return redirigir(`/${n.slug}/t/${token}`, extra);
    }
    return html(P.registro(n, { valores: { origen } }), 200, extra);
  }
  switch (partes[1]) {
    case 'registro':
      return req.method === 'POST' ? registrar(req, env, n) : redirigir(`/${n.slug}`);
    case 'privacidad':
      return html(P.privacidad(n, env));
    case 'panel':
      return html(P.panel(n));
    case 'cartel': {
      // El QR del cartel lleva ?o=qr para contar cuántas personas lo escanean.
      const enlace = `${url.origin}/${n.slug}`;
      return html(P.cartel(n, qrSvg(`${enlace}?o=qr`), enlace));
    }
    case 'tema.css':
      return texto(temaCss(n, n.d), 'text/css; charset=utf-8');
    case 't': {
      if (!partes[2]) break;
      const c = await env.DB.prepare(`SELECT ${CAMPOS_CLIENTE} FROM clientes WHERE token = ? AND negocio_id = ?`).bind(partes[2], n.id).first();
      if (!c) return html(P.noEncontrado(), 404);
      if (partes[3] === 'wallet') {
        if (!walletActivo(env)) return html(P.noEncontrado(), 404);
        // Google exige un logo PNG o JPG público; si el del negocio es otro formato usamos el genérico.
        const m = n.d.logo ? await env.DB.prepare('SELECT mime FROM medios WHERE id = ?').bind(n.d.logo).first() : null;
        const logo = m && /png|jpeg/.test(m.mime) ? `${url.origin}/m/${n.d.logo}` : `${url.origin}/static/wallet-logo.png`;
        await env.DB.prepare('UPDATE clientes SET wallet = 1 WHERE id = ?').bind(c.id).run();
        return redirigir(await enlaceGuardar(env, n, c, url.origin, logo));
      }
      n.wallet = walletActivo(env) && !/iPhone|iPad|iPod/.test(req.headers.get('User-Agent') || '');
      const enlace = `${url.origin}/${n.slug}/t/${c.token}`;
      // El código va después de # para que no viaje al servidor ni quede en registros.
      return html(P.tarjeta(n, c, qrSvg(`${url.origin}/${n.slug}/panel#c=${c.codigo}`), enlace), 200, {
        'Set-Cookie': cookie(`t_${n.slug}`, c.token, { path: `/${n.slug}`, maxAge: 60 * 60 * 24 * 400, sameSite: 'Lax' }),
      });
    }
  }
  return html(P.noEncontrado(), 404);
}

export default {
  async fetch(req, env, ctx) {
    try {
      return await manejar(req, env, ctx);
    } catch (err) {
      console.error(err && err.stack ? err.stack : err);
      return error('Ocurrió un error. Intenta de nuevo.', 500);
    }
  },

  // Tarea diaria: borra tarjetas con 24 meses sin visitas (plazo del aviso de privacidad)
  // y limpia el registro de intentos.
  async scheduled(_evento, env) {
    await asegurarEsquema(env);
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM movimientos WHERE cliente_id IN (SELECT id FROM clientes WHERE COALESCE(ultima_visita, creado) < datetime('now', '-24 months'))`),
      env.DB.prepare(`DELETE FROM clientes WHERE COALESCE(ultima_visita, creado) < datetime('now', '-24 months')`),
      env.DB.prepare('DELETE FROM intentos WHERE desde < ?').bind(Math.floor(Date.now() / 1000) - 86400),
      env.DB.prepare(`DELETE FROM vistas WHERE dia < date('now', '-400 days')`),
    ]);
    // Fotos y videos que ya no usa ningún diseño (con un día de margen para los recién subidos).
    const viejos = (await env.DB.prepare(
      `SELECT m.id FROM medios m WHERE m.creado < datetime('now', '-1 day')
       AND NOT EXISTS (SELECT 1 FROM negocios n WHERE n.id = m.negocio_id AND instr(n.diseno, m.id) > 0)`
    ).all()).results;
    for (const { id } of viejos) {
      if (env.MEDIOS) await env.MEDIOS.delete(`m/${id}`);
      await env.DB.prepare('DELETE FROM medios WHERE id = ?').bind(id).run();
    }
  },
};
