// Sistema de sellos: tarjeta de cliente frecuente digital + panel del negocio.
// Cloudflare Workers + D1. Ver LEEME.md para instalarlo.
import qrcode from 'qrcode-generator';
import ESQUEMA from '../migrations/0001_inicial.sql';
import * as P from './paginas.js';
import {
  AVISO_VERSION, html, json, error, texto, redirigir, cookies, cookie, cuerpo, nuevoToken, nuevoCodigo,
  normalizarCodigo, celularPeru, celularVisible, limpiarTexto, SLUG, RESERVADOS, COLOR, primerNombre,
} from './util.js';
import {
  hashClave, verificarClave, verificarClaveAdmin, claveAdminValida, crearSesion, leerSesion, limitar, bloqueado, registrarFallo, limpiarFallos, ip, DURACION_SESION,
} from './auth.js';

// ---------- base de datos ----------
let esquemaListo = false;
async function asegurarEsquema(env) {
  if (esquemaListo) return;
  const sentencias = ESQUEMA.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    .split(';').map((s) => s.trim()).filter(Boolean);
  await env.DB.batch(sentencias.map((s) => env.DB.prepare(s)));
  esquemaListo = true;
}

const negocioPorSlug = (env, slug) =>
  env.DB.prepare('SELECT * FROM negocios WHERE slug = ? AND activo = 1').bind(slug).first();

const CAMPOS_CLIENTE = 'id, token, codigo, nombre, celular, recordatorios, sellos, visitas, premios, ultima_visita, creado';

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

// ---------- colores ----------
function luminancia(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contraste = (a, b) => { const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** Color del negocio + colores de texto que siempre cumplen contraste AA. */
function temaCss(n) {
  const acento = COLOR.test(n.color) ? n.color : '#C9A45C';
  const fondo = n.tema === 'claro' ? '#FAF7F2' : '#121214';
  const texto = n.tema === 'claro' ? '#1D1B18' : '#F3F1EC';
  const sobre = contraste(acento, '#121214') >= contraste(acento, '#FFFFFF') ? '#121214' : '#FFFFFF';
  const acentoTexto = contraste(acento, fondo) >= 4.5 ? acento : texto;
  return `:root{--acento:${acento};--sobre-acento:${sobre};--acento-texto:${acentoTexto}}`;
}

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
async function apiPanel(req, env, n, partes, url) {
  const [accion, id, sub] = partes;
  const metodo = req.method;

  if (accion === 'yo' && metodo === 'GET') return json({ sesion: await puedeEntrar(req, env, n) });

  if (accion === 'login' && metodo === 'POST') {
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
      return json({ cliente: clientePanel(await leer(), n, url.origin) });
    }

    if (sub === 'canje' && metodo === 'POST') {
      const [upd] = await env.DB.batch([
        env.DB.prepare('UPDATE clientes SET sellos = sellos - ?, premios = premios + 1 WHERE id = ? AND negocio_id = ? AND sellos >= ?').bind(n.meta, cid, n.id, n.meta),
        env.DB.prepare(`INSERT INTO movimientos (negocio_id, cliente_id, tipo) SELECT ?, ?, 'canje' WHERE changes() > 0`).bind(n.id, cid),
      ]);
      if (!upd.meta.changes) return error(`Aún no completa los ${n.meta} sellos.`, 409);
      return json({ cliente: clientePanel(await leer(), n, url.origin) });
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
      return json({ cliente: clientePanel(await leer(), n, url.origin) });
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
      `SELECT n.id, n.slug, n.nombre, n.programa, n.meta, n.premio, n.espera_min, n.razon_social, n.ruc, n.direccion, n.correo, n.color, n.tema, n.redes,
         n.clave_hash != '' AS tiene_clave,
         (SELECT COUNT(*) FROM clientes c WHERE c.negocio_id = n.id) AS clientes,
         (SELECT COUNT(*) FROM movimientos m WHERE m.negocio_id = n.id AND m.tipo = 'sello' AND m.creado >= datetime('now', '-30 days')) AS visitas30,
         (SELECT COALESCE(SUM(v.n), 0) FROM vistas v WHERE v.negocio_id = n.id AND v.origen = 'qr' AND v.dia >= date('now', '-5 hours', '-29 days')) AS escaneos30,
         (SELECT COUNT(*) FROM clientes c WHERE c.negocio_id = n.id AND c.recordatorios = 1 AND c.sellos >= MAX(n.meta - 2, 1)) AS cerca
       FROM negocios n WHERE n.activo = 1 ORDER BY n.nombre`
    ).all();
    return json({ negocios: filas.results });
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
      color: COLOR.test(d.color || '') ? d.color : '#C9A45C', tema: d.tema === 'claro' ? 'claro' : 'oscuro',
    };
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
    if (existe) {
      await env.DB.prepare(
        `UPDATE negocios SET nombre=?, programa=?, premio=?, meta=?, espera_min=?, razon_social=?, ruc=?, direccion=?, correo=?, color=?, tema=?, redes=?, activo=1
         ${hash ? ', clave_hash=?, clave_ver=clave_ver+1' : ''} WHERE id = ?`
      ).bind(v.nombre, v.programa, v.premio, v.meta, v.espera_min, v.razon_social, v.ruc, v.direccion, v.correo, v.color, v.tema, v.redes, ...(hash ? [hash] : []), existe.id).run();
      return json({ ok: true, creado: false });
    }
    if (!hash) return error('Define una clave para el panel del nuevo negocio.');
    await env.DB.prepare(
      `INSERT INTO negocios (slug, nombre, programa, premio, meta, espera_min, razon_social, ruc, direccion, correo, color, tema, redes, clave_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(slug, v.nombre, v.programa, v.premio, v.meta, v.espera_min, v.razon_social, v.ruc, v.direccion, v.correo, v.color, v.tema, v.redes, hash).run();
    return json({ ok: true, creado: true }, 201);
  }
  return error('No encontrado.', 404);
}

// ---------- enrutador ----------
async function manejar(req, env) {
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
      return apiPanel(req, env, n, partes.slice(3), url);
    }
    return error('No encontrado.', 404);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD' && !(req.method === 'POST' && partes.length === 2 && partes[1] === 'registro')) {
    return error('Método no permitido.', 405);
  }

  if (partes.length === 0) return html(P.inicio());
  if (partes[0] === 'admin' && partes.length === 1) return html(P.admin());
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
      return texto(temaCss(n), 'text/css; charset=utf-8');
    case 't': {
      if (!partes[2]) break;
      const c = await env.DB.prepare(`SELECT ${CAMPOS_CLIENTE} FROM clientes WHERE token = ? AND negocio_id = ?`).bind(partes[2], n.id).first();
      if (!c) return html(P.noEncontrado(), 404);
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
  async fetch(req, env) {
    try {
      return await manejar(req, env);
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
  },
};
