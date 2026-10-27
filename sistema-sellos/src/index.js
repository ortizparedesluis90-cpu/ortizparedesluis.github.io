// Sistema de sellos: tarjeta de cliente frecuente digital + panel del negocio.
// Cloudflare Workers + D1. Ver LEEME.md para instalarlo.
import qrcode from 'qrcode-generator';
import ESQUEMA from '../migrations/0001_inicial.sql';
import * as P from './paginas.js';
import { leerDiseno, temaCss, catalogo, mediosDe, colores, ESTILOS } from './diseno.js';
import { walletActivo, enlaceGuardar, actualizar as actualizarWallet } from './wallet.js';
import { apiGestion, apiReserva, esDueno, reservasActivas, conservarExtras, ahoraLima, modoDe, RUBROS, PREMIO_INICIAL } from './gestion.js';
import { apiComercio, ventaPorToken } from './comercio.js';
import { TIPOS, leerPrograma, leerCatalogo, textoAServicios, textoAPremios, textoAHitos, ganar, estado, conTarjeta } from './programa.js';
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
  ['negocios', 'precio_visita', 'INTEGER NOT NULL DEFAULT 0'],
  ['negocios', 'costo_premio', 'INTEGER NOT NULL DEFAULT 0'],
  ['negocios', 'inversion_mes', 'INTEGER NOT NULL DEFAULT 0'],
  ['movimientos', 'monto', 'INTEGER'],
  ['negocios', 'tipo', "TEXT NOT NULL DEFAULT 'sellos'"],
  ['negocios', 'reglas', "TEXT NOT NULL DEFAULT '{}'"],
  ['negocios', 'servicios', "TEXT NOT NULL DEFAULT '[]'"],
  ['clientes', 'puntos', 'INTEGER NOT NULL DEFAULT 0'],
  ['clientes', 'saldo', 'INTEGER NOT NULL DEFAULT 0'],
  ['movimientos', 'servicio', 'TEXT'],
  ['movimientos', 'puntos', 'INTEGER'],
  ['movimientos', 'saldo', 'INTEGER'],
  ['movimientos', 'sellos', 'INTEGER'],
  ['negocios', 'pedir_servicio', 'INTEGER NOT NULL DEFAULT 1'],
  ['negocios', 'mostrar_numeros', 'INTEGER NOT NULL DEFAULT 0'],
  ['negocios', 'sello_regalo', 'INTEGER NOT NULL DEFAULT 0'],
  ['clientes', 'meta_t', 'INTEGER'],
  ['clientes', 'premio_t', 'TEXT'],
  ['clientes', 'hitos_t', 'TEXT'],
  ['clientes', 'hito', 'INTEGER NOT NULL DEFAULT 0'],
  ['clientes', 'cumple', 'TEXT'],
  ['negocios', 'productos', "TEXT NOT NULL DEFAULT '[]'"],
  ['negocios', 'regalo_cumple', "TEXT NOT NULL DEFAULT ''"],
  ['negocios', 'gestion', 'INTEGER NOT NULL DEFAULT 0'],
  ['negocios', 'ajustes', "TEXT NOT NULL DEFAULT '{}'"],
  ['negocios', 'clave_dueno', "TEXT NOT NULL DEFAULT ''"],
  ['negocios', 'clave_dueno_ver', 'INTEGER NOT NULL DEFAULT 1'],
  ['clientes', 'notas', "TEXT NOT NULL DEFAULT ''"],
  ['negocios', 'rubro', "TEXT NOT NULL DEFAULT ''"],
  ['personal', 'clave_hash', "TEXT NOT NULL DEFAULT ''"],
  ['personal', 'clave_ver', 'INTEGER NOT NULL DEFAULT 1'],
  ['ventas', 'costo', 'INTEGER NOT NULL DEFAULT 0'],
  ['ventas', 'token', 'TEXT'],
];
async function asegurarEsquema(env) {
  if (esquemaListo) return;
  // Se quitan los comentarios (también los del final de línea) antes de separar por «;».
  const sentencias = ESQUEMA.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
    .split(';').map((s) => s.trim()).filter(Boolean);
  await env.DB.batch(sentencias.map((s) => env.DB.prepare(s)));
  // Bases creadas con una versión anterior: agregamos las columnas nuevas.
  for (const [tabla, columna, def] of COLUMNAS_NUEVAS) {
    const col = await env.DB.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info('${tabla}') WHERE name = ?`).bind(columna).first();
    if (!col.n) await env.DB.prepare(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${def}`).run();
  }
  // Índices sobre columnas nuevas: van después de agregarlas.
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ventas_token ON ventas (token)').run();
  esquemaListo = true;
}

async function negocioPorSlug(env, slug) {
  const n = await env.DB.prepare('SELECT * FROM negocios WHERE slug = ? AND activo = 1').bind(slug).first();
  if (n) n.d = leerDiseno(n, n.diseno);
  return n;
}

const CAMPOS_CLIENTE = 'id, token, codigo, nombre, celular, recordatorios, sellos, puntos, saldo, visitas, premios, ultima_visita, creado, wallet, meta_t, premio_t, hitos_t, hito, cumple';

function clientePublico(c, n) {
  const t = conTarjeta(n, c);
  return { nombre: primerNombre(c.nombre), sellos: c.sellos, puntos: c.puntos, saldo: c.saldo, meta: t.meta, premioNombre: t.premio, promoAnterior: !!(c.meta_t || c.premio_t), visitas: c.visitas, premios: c.premios, ...estado(n, c) };
}

function clientePanel(c, n, origen) {
  const st = estado(n, c);
  return {
    id: c.id, nombre: c.nombre, codigo: c.codigo, celular: celularVisible(c.celular), celularWa: c.celular,
    recordatorios: !!c.recordatorios, sellos: c.sellos, puntos: c.puntos | 0, saldo: c.saldo | 0, visitas: c.visitas, premios: c.premios,
    ultimaVisita: c.ultima_visita, creado: c.creado, meta: conTarjeta(n, c).meta, premio: conTarjeta(n, c).premio, promoAnterior: !!(c.meta_t || c.premio_t), traspaso: !!c.traspaso,
    hitos: st.tipo === 'sellos' ? st.hitos : [], cumple: c.cumple || '', cumpleEn: diasACumple(c.cumple),
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
  // Solo mayúsculas, números y :/.-: modo alfanumérico, con menos cuadritos y más fácil de leer.
  qr.addData(valor, /^[0-9A-Z $%*+\-./:]+$/.test(valor) ? 'Alphanumeric' : 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const m = 4; // margen
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x + m} ${y + m}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" shape-rendering="crispEdges" aria-hidden="true"><rect width="100%" height="100%" fill="#fff"/><path fill="#000" d="${d}"/></svg>`;
}

/** Lo que lleva el QR de la tarjeta del cliente: un enlace corto en mayúsculas (/SLUG/K/CODIGO)
 *  que abre el panel del negocio con ese cliente. Las mayúsculas hacen el QR más simple. */
const qrCliente = (origen, n, c) => `${origen.toUpperCase()}/${n.slug.toUpperCase()}/K/${c.codigo}`;

// ---------- vencimiento del plan ----------
// anual, esencial y total quedan solo para negocios antiguos; el formulario ya no los ofrece.
const PLANES = { '': 'Sin definir', prueba: 'Mes gratis', mensual: 'Mensual', cortesia: 'Cortesía', anual: 'Anual', esencial: 'Bio Esencial', total: 'Bio Total' };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const hoyLima = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
function sumarMeses(fecha, meses) {
  const [a, m, d] = fecha.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
  f.setUTCDate(Math.min(d, ultimo));
  return f.toISOString().slice(0, 10);
}
// ---------- cumpleaños (se guarda «MM-DD», sin año) ----------
const CUMPLE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const bisiesto = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
/** «MM-DD» válido (acepta el 29 de febrero) o null. */
function leerCumple(mes, dia) {
  const m = Number(mes), d = Number(dia);
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1])) return null;
  return `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
/** Días que faltan para su próximo cumpleaños (0 = hoy), en hora de Lima. El 29 de febrero se celebra el 28 en años no bisiestos. */
function diasACumple(md) {
  if (!CUMPLE.test(md || '')) return null;
  const hoy = Date.parse(hoyLima()), a = Number(hoyLima().slice(0, 4)), [m, d] = md.split('-').map(Number);
  const fecha = (y) => Date.UTC(y, m - 1, m === 2 && d === 29 && !bisiesto(y) ? 28 : d);
  const f = fecha(a) >= hoy ? fecha(a) : fecha(a + 1);
  return Math.round((f - hoy) / 86400000);
}
/** Los «MM-DD» de los próximos días (hoy incluido), para buscar cumpleaños con un IN (...). */
function proximosCumples(dias) {
  const out = [], hoy = Date.parse(hoyLima());
  for (let k = 0; k < dias; k++) {
    const f = new Date(hoy + k * 86400000), md = f.toISOString().slice(5, 10);
    out.push(md);
    if (md === '02-28' && !bisiesto(f.getUTCFullYear())) out.push('02-29');
  }
  return out;
}

/** Días que faltan para el vencimiento (negativo si ya venció; null si no tiene fecha). */
const diasPara = (vence) => (FECHA.test(vence || '') ? Math.round((Date.parse(vence) - Date.parse(hoyLima())) / 86400000) : null);
const estadoPlan = (n) => ({ plan: n.plan || '', vence: n.vence || '', dias: diasPara(n.vence), suspendido: !!n.suspendido });

// ---------- dinero (se guarda en céntimos) ----------
/** «35», «35.50» o «35,5» → 3550. Vacío → null. Fuera de rango → NaN. */
function centimos(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const x = Math.round(Number(String(v).trim().replace(',', '.')) * 100);
  return Number.isFinite(x) && x >= 0 && x <= 10000000 ? x : NaN;
}

// ---------- sesiones ----------
async function puedeEntrar(req, env, n) {
  const s = await leerSesion(req, env);
  if (!s) return false;
  if (s.r === 'admin') return true;
  if (!(s.r === 'staff' && s.n === n.id && s.v === n.clave_ver)) return false;
  return s.emp ? !!(await empleadoDe(env, n, s)) : true;
}

/** La persona del equipo que entró con su celular y su clave (si sigue activa y con la misma clave). */
async function empleadoDe(env, n, s) {
  if (!s || !s.emp) return null;
  const p = await env.DB.prepare('SELECT id, nombre, clave_ver, activo, clave_hash FROM personal WHERE id = ? AND negocio_id = ?').bind(s.emp, n.id).first();
  return p && p.activo && p.clave_hash && p.clave_ver === s.empv ? { id: p.id, nombre: p.nombre } : null;
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
    formulario ? html(P.registro(n, { error: msg, valores: { nombre, celular: String(datos.celular || '').slice(0, 11), origen: datos.origen === 'qr' ? 'qr' : 'enlace', cumple_dia: datos.cumple_dia, cumple_mes: datos.cumple_mes } }), status) : error(msg, status);

  if (n.suspendido) return fallo('Este programa está en pausa por ahora. Vuelve a intentarlo más adelante.', 403);
  if (nombre.length < 2) return fallo('Escribe tu nombre.');
  if (!celular) return fallo('Revisa tu celular: deben ser 9 dígitos y empezar con 9.');
  if (!(datos.acepta === true || datos.acepta === '1')) return fallo('Para crear tu tarjeta debes aceptar el aviso de privacidad.');
  // Cumpleaños opcional: día y mes (sin año).
  const conCumple = String(datos.cumple_dia || '') !== '' || String(datos.cumple_mes || '') !== '';
  const cumple = conCumple ? leerCumple(datos.cumple_mes, datos.cumple_dia) : null;
  if (conCumple && !cumple) return fallo('Revisa tu cumpleaños: elige el día y el mes (o déjalo vacío).');
  if (!(await limitar(env, `reg:${n.id}:${ip(req)}`, 60, 3600))) return fallo('Demasiados registros desde esta conexión. Intenta más tarde.', 429);

  const existe = await env.DB.prepare('SELECT 1 FROM clientes WHERE negocio_id = ? AND celular = ?').bind(n.id, celular).first();
  // No revelamos la tarjeta de otra persona: solo avisamos que ya existe.
  if (existe) return fallo('Este celular ya tiene una tarjeta. Pide en caja que te la reenvíen por WhatsApp.', 409);

  const token = nuevoToken();
  const recordatorios = datos.recordatorios === true || datos.recordatorios === '1' ? 1 : 0;
  const origen = datos.origen === 'qr' ? 'qr' : 'enlace';
  const consentimiento = `${new Date().toISOString()} aviso ${AVISO_VERSION}${recordatorios ? ' + recordatorios' : ''}${cumple ? ' + cumpleaños' : ''}`;
  // «Primer sello de regalo» (si el negocio lo activó): la tarjeta empieza en 1. No cuenta como visita.
  const regalo = n.sello_regalo && leerPrograma(n).tipo === 'sellos' ? 1 : 0;
  for (let intento = 0; intento < 5; intento++) {
    try {
      await env.DB.batch([
        env.DB.prepare(
          'INSERT INTO clientes (negocio_id, token, codigo, nombre, celular, recordatorios, consentimiento, origen, sellos, cumple) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(n.id, token, nuevoCodigo(), nombre, celular, recordatorios, consentimiento, origen, regalo, cumple),
        env.DB.prepare(`INSERT INTO movimientos (negocio_id, cliente_id, tipo, servicio, sellos) SELECT ?, id, 'regalo', 'Sello de bienvenida', 1 FROM clientes WHERE token = ? AND ? = 1`)
          .bind(n.id, token, regalo),
      ]);
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

/** Al borrar a un cliente, sus ventas quedan en la caja del negocio (son contabilidad) pero sin su nombre,
 *  y sus citas pasadas pierden nombre y celular. Las futuras se quedan: es una reserva que todavía va a atender. */
function anonimizar(env, cid) {
  const hoy = ahoraLima().dia;
  return [
    env.DB.prepare(`UPDATE ventas SET cliente_id = NULL, nombre = '' WHERE cliente_id = ?`).bind(cid),
    env.DB.prepare(`UPDATE citas SET cliente_id = NULL, nombre = '', celular = '' WHERE cliente_id = ? AND dia < ?`).bind(cid, hoy),
    env.DB.prepare('UPDATE citas SET cliente_id = NULL WHERE cliente_id = ?').bind(cid),
  ];
}

/** Suma una visita a la tarjeta: 1 sello, o los puntos o el saldo que da el monto (céntimos).
 *  Devuelve null si se sumó, o el aviso si ya se registró una visita hace menos de espera_min minutos. */
async function sumarVisita(env, n, c, monto, servicio) {
  const pr = leerPrograma(n);
  const gana = ganar(pr, monto || 0);
  const espera = `-${Math.max(0, n.espera_min | 0)} minutes`;
  const [upd] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE clientes SET sellos = sellos + ?, puntos = puntos + ?, saldo = saldo + ?, visitas = visitas + 1, ultima_visita = datetime('now')
       WHERE id = ? AND negocio_id = ? AND (ultima_visita IS NULL OR ultima_visita <= datetime('now', ?))`
    ).bind(gana.sellos, gana.puntos, gana.saldo, c.id, n.id, espera),
    // puntos y saldo quedan NULL en programas de sellos: así «deshacer» sabe qué devolver.
    env.DB.prepare(`INSERT INTO movimientos (negocio_id, cliente_id, tipo, monto, servicio, puntos, saldo) SELECT ?, ?, 'sello', ?, ?, ?, ? WHERE changes() > 0`)
      .bind(n.id, c.id, monto, servicio, pr.tipo === 'puntos' ? gana.puntos : null, pr.tipo === 'cashback' ? gana.saldo : null),
  ]);
  if (upd.meta.changes) return null;
  const hace = Math.max(0, Math.round((Date.now() - Date.parse(String(c.ultima_visita).replace(' ', 'T') + 'Z')) / 60000));
  return `Ya se registró una visita hace ${hace} min. Entre dos visitas deben pasar ${n.espera_min} minutos.`;
}

// ---------- API del panel ----------
async function apiPanel(req, env, n, partes, url, ctx) {
  const [accion, id, sub] = partes;
  const metodo = req.method;

  if (accion === 'yo' && metodo === 'GET') {
    const sesion = await puedeEntrar(req, env, n);
    // La fecha de vencimiento solo la ve quien ya entró al panel.
    return json({ sesion, gestion: !!n.gestion, ...(sesion ? estadoPlan(n) : { suspendido: !!n.suspendido, dias: null }) });
  }

  if (accion === 'login' && metodo === 'POST') {
    if (n.suspendido) return error('Este panel está suspendido. Comunícate con tu proveedor para reactivarlo.', 403);
    const llave = `login:${n.id}:${ip(req)}`;
    if (await bloqueado(env, llave, 8, 900)) return error('Demasiados intentos fallidos. Espera 15 minutos.', 429);
    let datos;
    try { datos = await cuerpo(req); } catch { return error('Solicitud no válida.'); }
    const clave = String(datos.clave || '');
    // Alguien del equipo: entra con su celular y su propia clave (como caja), y sus ventas salen a su nombre.
    if (String(datos.celular || '').trim()) {
      const cel = celularPeru(datos.celular);
      const p = cel ? await env.DB.prepare(`SELECT id, clave_hash, clave_ver FROM personal WHERE negocio_id = ? AND celular = ? AND activo = 1 AND clave_hash != ''`).bind(n.id, cel).first() : null;
      if (!p || !(await verificarClave(clave, p.clave_hash))) { await registrarFallo(env, llave, 900); return error('Celular o clave incorrectos.', 401); }
      await limpiarFallos(env, llave);
      const se = await crearSesion(env, { r: 'staff', n: n.id, v: n.clave_ver, emp: p.id, empv: p.clave_ver });
      return json({ ok: true }, 200, { 'Set-Cookie': cookie('sesion', se, { maxAge: DURACION_SESION }) });
    }
    // Solo la clave del negocio: el administrador entra por /admin y su sesión abre todos los paneles.
    // La clave del dueño (si la tiene) también abre el panel, y además la gestión completa (finanzas, gastos, equipo).
    const dueno = Boolean(n.clave_dueno) && (await verificarClave(clave, n.clave_dueno));
    const ok = dueno || (Boolean(n.clave_hash) && (await verificarClave(clave, n.clave_hash)));
    if (!ok) { await registrarFallo(env, llave, 900); return error('Clave incorrecta.', 401); }
    await limpiarFallos(env, llave);
    const s = await crearSesion(env, { r: 'staff', n: n.id, v: n.clave_ver, ...(dueno ? { d: n.clave_dueno_ver } : {}) });
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('sesion', s, { maxAge: DURACION_SESION }) });
  }

  if (!(await puedeEntrar(req, env, n))) return error('Inicia sesión.', 401);
  if (n.suspendido && !(await esAdmin(req, env))) return error('Este panel está suspendido. Comunícate con tu proveedor para reactivarlo.', 403);
  let datos = {};
  if (metodo === 'POST') {
    // La gestión guarda el catálogo completo de una vez: admite un cuerpo más grande.
    try { datos = await cuerpo(req, accion === 'g' ? 32000 : 8000); } catch { return error('Solicitud no válida.'); }
  }

  // Gestión del negocio: agenda, caja, gastos, finanzas, equipo y catálogo (src/gestion.js).
  if (accion === 'g') {
    const sesion = await leerSesion(req, env);
    if (!n.gestion && sesion.r !== 'admin') return error('La gestión del negocio no está activa. Pídele a tu proveedor que la active.', 403);
    const h = {
      sesion, dueno: esDueno(sesion, n), empleado: await empleadoDe(env, n, sesion), CAMPOS_CLIENTE, soporte: env.SOPORTE_WHATSAPP || '',
      guardarTarjeta: (d) => guardarTarjeta(env, n, d),
      clientePanel: (c) => clientePanel(c, n, url.origin),
      visita: async (c, monto, servicio) => {
        const aviso = await sumarVisita(env, n, c, monto, servicio);
        if (!aviso && c.wallet && walletActivo(env) && ctx) {
          const nuevo = await env.DB.prepare(`SELECT ${CAMPOS_CLIENTE} FROM clientes WHERE id = ?`).bind(c.id).first();
          ctx.waitUntil(actualizarWallet(env, n, nuevo, url.origin));
        }
        return aviso;
      },
    };
    // Los comercios (bodegas, tiendas...) tienen su inventario, sus ventas con costo y sus deudas; lo demás es común.
    if (modoDe(n) === 'comercio') {
      const r = await apiComercio(req, env, n, partes.slice(1), url, h, datos);
      if (r) return r;
    }
    return apiGestion(req, env, n, partes.slice(1), url, h, datos);
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
    const limite = Math.min(25, Math.max(1, Number(url.searchParams.get('limite')) | 0 || 25));
    const [lista, total] = await env.DB.batch([
      env.DB.prepare(`SELECT ${CAMPOS_CLIENTE}, origen FROM clientes WHERE negocio_id = ? ORDER BY creado DESC, id DESC LIMIT ? OFFSET ?`).bind(n.id, limite, desde),
      env.DB.prepare('SELECT COUNT(*) AS n FROM clientes WHERE negocio_id = ?').bind(n.id),
    ]);
    return json({
      total: total.results[0].n,
      clientes: lista.results.map((c) => ({ ...clientePanel(c, n, url.origin), origen: c.origen })),
    });
  }

  if (accion === 'cerca' && metodo === 'GET') {
    // Sellos: les faltan 2 o menos. Puntos: tienen el 80 % del premio más barato. Cashback: tienen saldo para usar.
    const pr = leerPrograma(n);
    const [col, umbral] = pr.tipo === 'puntos' ? ['puntos', Math.max(1, Math.floor((pr.premios[0]?.p || 1) * 0.8))]
      : pr.tipo === 'cashback' ? ['saldo', Math.max(1, pr.minimo)] : ['sellos', n.meta];
    // En sellos, cada tarjeta se compara con su propia meta (puede conservar una promoción anterior),
    // y también salen los que ya tienen listo un premio del camino.
    const condicion = col === 'sellos' ? 'sellos >= MAX(COALESCE(meta_t, ?) - 2, 1) OR (sellos > hito AND sellos >= ?)' : `${col} >= ? AND ? > 0`;
    const filas = await env.DB.prepare(
      `SELECT ${CAMPOS_CLIENTE} FROM clientes WHERE negocio_id = ? AND recordatorios = 1 AND (${condicion})
       ORDER BY ${col} DESC, ultima_visita ASC LIMIT 100`
    ).bind(n.id, umbral, pr.hitos[0]?.s || 999).all();
    const cerca = filas.results.filter((c) => col !== 'sellos' || c.sellos >= Math.max(conTarjeta(n, c).meta - 2, 1) || estado(n, c).hitos.some((h) => h.listo));
    // Y los que venían seguido y dejaron de venir: un mensaje a tiempo los recupera.
    const idos = await env.DB.prepare(
      `SELECT ${CAMPOS_CLIENTE} FROM clientes WHERE negocio_id = ? AND recordatorios = 1 AND visitas >= 2 AND ultima_visita < datetime('now', ?)
       ORDER BY visitas DESC, ultima_visita DESC LIMIT 30`
    ).bind(n.id, `-${DIAS_RIESGO} days`).all();
    // Cumpleaños de hoy y de los próximos 6 días (dio su cumpleaños para que lo saluden).
    const dias = proximosCumples(7);
    const cumples = await env.DB.prepare(`SELECT ${CAMPOS_CLIENTE} FROM clientes WHERE negocio_id = ? AND cumple IN (${dias.map(() => '?').join(', ')}) LIMIT 60`).bind(n.id, ...dias).all();
    return json({
      clientes: cerca.map((c) => clientePanel(c, n, url.origin)), extranamos: idos.results.map((c) => clientePanel(c, n, url.origin)), diasRiesgo: DIAS_RIESGO,
      cumples: cumples.results.map((c) => clientePanel(c, n, url.origin)).sort((a, b) => a.cumpleEn - b.cumpleEn), regaloCumple: n.regalo_cumple || '',
    });
  }

  if (accion === 'resumen' && metodo === 'GET') return json(await resumen(env, n, url.origin));

  if (accion === 'cliente' && id && /^\d+$/.test(id)) {
    const cid = Number(id);
    const leer = () => env.DB.prepare(
      `SELECT ${CAMPOS_CLIENTE}, EXISTS (SELECT 1 FROM movimientos m WHERE m.cliente_id = clientes.id AND m.tipo = 'traspaso') AS traspaso
       FROM clientes WHERE id = ? AND negocio_id = ?`
    ).bind(cid, n.id).first();
    const c = await leer();
    if (!c) return error('Cliente no encontrado.', 404);

    if (!sub && metodo === 'GET') return json({ cliente: clientePanel(c, n, url.origin) });
    // Historial del cliente: sus últimas visitas y canjes, y los servicios que más se hace.
    if (sub === 'historial' && metodo === 'GET') {
      const [ultimos, todos] = await env.DB.batch([
        env.DB.prepare('SELECT tipo, monto, servicio, puntos, saldo, sellos, creado FROM movimientos WHERE cliente_id = ? AND negocio_id = ? ORDER BY id DESC LIMIT 10').bind(cid, n.id),
        env.DB.prepare(`SELECT servicio FROM movimientos WHERE cliente_id = ? AND negocio_id = ? AND tipo = 'sello' AND servicio IS NOT NULL ORDER BY id DESC LIMIT 300`).bind(cid, n.id),
      ]);
      const cuenta = new Map();
      for (const f of todos.results) for (const x of String(f.servicio).split(' + ')) if (x) cuenta.set(x, (cuenta.get(x) || 0) + 1);
      const favoritos = [...cuenta].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([nombre, veces]) => ({ n: nombre, veces }));
      return json({ movimientos: ultimos.results, favoritos });
    }
    // Tras cambiar los sellos, el pase de Google Wallet (si lo guardó) se actualiza en segundo plano.
    const listo = async () => {
      const nuevo = await leer();
      if (nuevo && nuevo.wallet && walletActivo(env) && ctx) ctx.waitUntil(actualizarWallet(env, n, nuevo, url.origin));
      return json({ cliente: clientePanel(nuevo, n, url.origin) });
    };

    if (sub === 'sello' && metodo === 'POST') {
      let monto = centimos(datos.monto);
      if (Number.isNaN(monto)) return error('El monto cobrado no es válido.');
      const pr = leerPrograma(n);
      if (pr.tipo !== 'sellos' && !monto) return error(`Escribe el monto de la compra: con eso se calculan ${pr.tipo === 'puntos' ? 'sus puntos' : 'su saldo'}.`);
      // Servicios y productos elegidos (solo los del catálogo), para «Servicios más vendidos».
      const catalogo = leerCatalogo(n), nombres = new Set(catalogo.map((x) => x.n));
      const lista = (Array.isArray(datos.servicios) ? datos.servicios : []).map(String).filter((x) => nombres.has(x)).slice(0, 10);
      const servicio = lista.join(' + ') || null;
      // Si eligió servicios y no escribió el monto, el monto es la suma de sus precios.
      if (!monto && lista.length) monto = lista.reduce((t, x) => t + (catalogo.find((sv) => sv.n === x)?.p || 0), 0) || null;
      // «Pedir el servicio en cada visita» (por defecto): sin servicio ni monto no se registra.
      if (n.pedir_servicio && !monto && !servicio) return error(catalogo.length ? 'Elige el servicio o producto (o escribe el monto cobrado).' : 'Escribe el monto cobrado en esta visita.');
      const espera = await sumarVisita(env, n, c, monto, servicio);
      if (espera) return error(espera, 409);
      return listo();
    }

    if (sub === 'canje' && metodo === 'POST') {
      const pr = leerPrograma(n);
      if (pr.tipo === 'puntos') {
        const premio = pr.premios[Math.round(Number(datos.premio))];
        if (!premio) return error('Elige un premio.');
        const [upd] = await env.DB.batch([
          env.DB.prepare('UPDATE clientes SET puntos = puntos - ?, premios = premios + 1 WHERE id = ? AND negocio_id = ? AND puntos >= ?').bind(premio.p, cid, n.id, premio.p),
          env.DB.prepare(`INSERT INTO movimientos (negocio_id, cliente_id, tipo, servicio, puntos) SELECT ?, ?, 'canje', ?, ? WHERE changes() > 0`).bind(n.id, cid, premio.n, -premio.p),
        ]);
        if (!upd.meta.changes) return error(`Le faltan puntos: «${premio.n}» cuesta ${premio.p}.`, 409);
        return listo();
      }
      if (pr.tipo === 'cashback') {
        const usar = datos.monto === undefined || datos.monto === '' ? (c.saldo | 0) : centimos(datos.monto);
        if (Number.isNaN(usar) || !(usar > 0)) return error('Escribe cuánto saldo usar.');
        if ((c.saldo | 0) < pr.minimo) return error(`El saldo se usa desde S/ ${(pr.minimo / 100).toFixed(2)}.`, 409);
        const [upd] = await env.DB.batch([
          env.DB.prepare('UPDATE clientes SET saldo = saldo - ?, premios = premios + 1 WHERE id = ? AND negocio_id = ? AND saldo >= ?').bind(usar, cid, n.id, usar),
          env.DB.prepare(`INSERT INTO movimientos (negocio_id, cliente_id, tipo, monto, saldo) SELECT ?, ?, 'canje', ?, ? WHERE changes() > 0`).bind(n.id, cid, usar, -usar),
        ]);
        if (!upd.meta.changes) return error('No tiene ese saldo.', 409);
        return listo();
      }
      // Un premio del camino (por ejemplo, 20 % a los 2 sellos): no descuenta sellos, la tarjeta sigue.
      if (datos.hito !== undefined && datos.hito !== null && datos.hito !== '') {
        const h = estado(n, c).hitos.find((x) => !x.final && x.s === Number(datos.hito));
        if (!h) return error('Ese premio no está en su tarjeta.');
        const [upd] = await env.DB.batch([
          env.DB.prepare('UPDATE clientes SET hito = ?, premios = premios + 1 WHERE id = ? AND negocio_id = ? AND sellos >= ? AND hito < ?').bind(h.s, cid, n.id, h.s, h.s),
          env.DB.prepare(`INSERT INTO movimientos (negocio_id, cliente_id, tipo, servicio) SELECT ?, ?, 'canje', ? WHERE changes() > 0`).bind(n.id, cid, h.n),
        ]);
        if (!upd.meta.changes) return error(h.canjeado ? `Ya canjeó «${h.n}» en esta tarjeta.` : `Aún no tiene los ${h.s} sellos para «${h.n}».`, 409);
        return listo();
      }
      // Se canjea con la promoción de su tarjeta; la tarjeta siguiente ya usa la promoción actual del negocio.
      const t = conTarjeta(n, c);
      const [upd] = await env.DB.batch([
        env.DB.prepare('UPDATE clientes SET sellos = sellos - ?, premios = premios + 1, hito = 0, meta_t = NULL, premio_t = NULL, hitos_t = NULL WHERE id = ? AND negocio_id = ? AND sellos >= ?').bind(t.meta, cid, n.id, t.meta),
        env.DB.prepare(`INSERT INTO movimientos (negocio_id, cliente_id, tipo, servicio) SELECT ?, ?, 'canje', ? WHERE changes() > 0`).bind(n.id, cid, t.premio),
      ]);
      if (!upd.meta.changes) return error(`Aún no completa los ${t.meta} sellos.`, 409);
      return listo();
    }

    // Sellos de la tarjeta de papel que el cliente tenía antes: una sola vez por cliente, solo en
    // programas de sellos. No es una visita: no suma visitas ni cuenta en «Tus números».
    if (sub === 'traspaso' && metodo === 'POST') {
      if (leerPrograma(n).tipo !== 'sellos') return error('Solo las tarjetas de sellos pueden pasar sellos de papel.');
      const cantidad = Number(datos.sellos);
      const meta = conTarjeta(n, c).meta;
      if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > meta) return error(`Escribe cuántos sellos tenía en papel: de 1 a ${meta}.`);
      const [upd] = await env.DB.batch([
        env.DB.prepare(
          `UPDATE clientes SET sellos = sellos + ? WHERE id = ? AND negocio_id = ?
           AND NOT EXISTS (SELECT 1 FROM movimientos WHERE cliente_id = ? AND tipo = 'traspaso')`
        ).bind(cantidad, cid, n.id, cid),
        env.DB.prepare(`INSERT INTO movimientos (negocio_id, cliente_id, tipo, servicio, sellos) SELECT ?, ?, 'traspaso', 'Tarjeta de papel', ? WHERE changes() > 0`)
          .bind(n.id, cid, cantidad),
      ]);
      if (!upd.meta.changes) return error('A este cliente ya se le pasaron sus sellos de papel.', 409);
      return listo();
    }

    if (sub === 'deshacer' && metodo === 'POST') {
      // Deshace la última visita o el último traspaso de papel de los últimos 30 minutos, si no hubo un canje después.
      const ultimo = await env.DB.prepare(
        `SELECT id, tipo, puntos, saldo, sellos FROM movimientos WHERE cliente_id = ? AND negocio_id = ? AND tipo IN ('sello', 'traspaso') AND creado >= datetime('now', '-30 minutes')
         AND NOT EXISTS (SELECT 1 FROM movimientos m2 WHERE m2.cliente_id = ? AND m2.tipo = 'canje' AND m2.id > movimientos.id)
         ORDER BY id DESC LIMIT 1`
      ).bind(cid, n.id, cid).first();
      if (!ultimo) return error('Solo se puede deshacer una visita de los últimos 30 minutos (y antes de un canje).', 409);
      if (ultimo.tipo === 'traspaso') {
        const [, upd] = await env.DB.batch([
          env.DB.prepare('DELETE FROM movimientos WHERE id = ?').bind(ultimo.id),
          env.DB.prepare('UPDATE clientes SET sellos = MAX(sellos - ?, 0) WHERE id = ? AND negocio_id = ? AND changes() > 0').bind(ultimo.sellos | 0, cid, n.id),
        ]);
        if (!upd.meta.changes) return error('Eso ya se deshizo.', 409);
        return listo();
      }
      const dSellos = ultimo.puntos === null && ultimo.saldo === null ? 1 : 0;
      const [, upd] = await env.DB.batch([
        env.DB.prepare('DELETE FROM movimientos WHERE id = ?').bind(ultimo.id),
        env.DB.prepare(
          `UPDATE clientes SET sellos = MAX(sellos - ?, 0), puntos = MAX(puntos - ?, 0), saldo = MAX(saldo - ?, 0), visitas = MAX(visitas - 1, 0),
           ultima_visita = (SELECT MAX(creado) FROM movimientos WHERE cliente_id = ? AND tipo = 'sello')
           WHERE id = ? AND negocio_id = ? AND changes() > 0`
        ).bind(dSellos, ultimo.puntos || 0, ultimo.saldo || 0, cid, cid, n.id),
      ]);
      if (!upd.meta.changes) return error('Esa visita ya se deshizo.', 409);
      return listo();
    }

    // El cajero anota (o corrige) el cumpleaños que le dice el cliente. Vacío = lo borra.
    if (sub === 'cumple' && metodo === 'POST') {
      const vacio = !datos.mes && !datos.dia;
      const md = vacio ? null : leerCumple(datos.mes, datos.dia);
      if (!vacio && !md) return error('Elige el día y el mes de su cumpleaños.');
      await env.DB.prepare('UPDATE clientes SET cumple = ? WHERE id = ? AND negocio_id = ?').bind(md, cid, n.id).run();
      return json({ cliente: clientePanel(await leer(), n, url.origin) });
    }

    if (sub === 'recordatorios' && metodo === 'POST') {
      await env.DB.prepare('UPDATE clientes SET recordatorios = ? WHERE id = ? AND negocio_id = ?').bind(datos.activo ? 1 : 0, cid, n.id).run();
      return json({ cliente: clientePanel(await leer(), n, url.origin) });
    }

    if (sub === 'eliminar' && metodo === 'POST') {
      await env.DB.batch([
        ...anonimizar(env, cid),
        env.DB.prepare('DELETE FROM movimientos WHERE cliente_id = ? AND negocio_id = ?').bind(cid, n.id),
        env.DB.prepare('DELETE FROM clientes WHERE id = ? AND negocio_id = ?').bind(cid, n.id),
      ]);
      return json({ ok: true });
    }
  }

  if (accion === 'numeros' && metodo === 'GET') {
    // «Tus números» completos solo si el administrador los activó para este negocio.
    if (!n.mostrar_numeros) return error('No disponible.', 404);
    return json(await numeros(env, n, url.origin));
  }

  if (accion === 'clientes.csv' && metodo === 'GET') {
    const filas = await env.DB.prepare(
      'SELECT nombre, celular, codigo, sellos, puntos, saldo, visitas, premios, recordatorios, cumple, ultima_visita, creado, consentimiento FROM clientes WHERE negocio_id = ? ORDER BY creado'
    ).bind(n.id).all();
    const celda = (v) => {
      let s = String(v ?? '');
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita fórmulas al abrir en Excel
      return `"${s.replace(/"/g, '""')}"`;
    };
    const cab = ['nombre', 'celular', 'codigo', 'sellos', 'puntos', 'saldo_soles', 'visitas', 'premios', 'acepta_recordatorios', 'cumpleanos_dd_mm', 'ultima_visita_utc', 'creado_utc', 'consentimiento'];
    const lineas = [cab.join(','), ...filas.results.map((f) => [f.nombre, f.celular, f.codigo, f.sellos, f.puntos, (f.saldo / 100).toFixed(2), f.visitas, f.premios, f.recordatorios ? 'si' : 'no', f.cumple ? f.cumple.split('-').reverse().join('/') : '', f.ultima_visita, f.creado, f.consentimiento].map(celda).join(','))];
    return texto('﻿' + lineas.join('\r\n'), 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="clientes-${n.slug}.csv"` });
  }

  return error('No encontrado.', 404);
}

// ---------- números del negocio: visitas, ingresos y retorno del programa ----------
/** Servicios más vendidos (90 días). Una visita con varios servicios reparte lo cobrado según sus precios. */
function masVendidos(filas, catalogo) {
  const precio = new Map(catalogo.map((s) => [s.n, s.p])), total = new Map();
  for (const f of filas) {
    const nombres = f.servicio.split(' + ');
    const base = nombres.reduce((a, x) => a + (precio.get(x) || 0), 0);
    // Visitas sin monto anotado: al precio del catálogo.
    const cobrado = f.cobrado + (f.veces - f.con_monto) * base;
    for (const x of nombres) {
      const t = total.get(x) || { n: x, veces: 0, ingresos: 0 };
      t.veces += f.veces; t.ingresos += base ? Math.round(cobrado * (precio.get(x) || 0) / base) : Math.round(cobrado / nombres.length);
      total.set(x, t);
    }
  }
  return [...total.values()].sort((a, b) => b.veces - a.veces || b.ingresos - a.ingresos).slice(0, 10);
}

// Las fechas se guardan en UTC; Lima es UTC-5 todo el año.
const DIA_LIMA = "strftime('%Y-%m-%d', creado, '-5 hours')";
const MES_LIMA = "strftime('%Y-%m', creado, '-5 hours')";
const INICIO_MES_LIMA = "datetime('now', '-5 hours', 'start of month', '+5 hours')"; // día 1, 00:00 en Lima
const DIAS_RIESGO = 45;

/** Lo del día a día para el panel del negocio: el mes en curso, sus mejores clientes y el alcance
 *  del cartel. Los números completos (montos, gráficos, días y horas) están en /admin. */
async function resumen(env, n, origen) {
  const [tot, hoy, mes, vis, nuevas, activos, esteMes, top] = await env.DB.batch([
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
    // El mes en curso (hora de Lima): visitas, premios y clientes nuevos.
    env.DB.prepare(
      `SELECT COALESCE(SUM(tipo = 'sello'), 0) AS visitas, COALESCE(SUM(tipo = 'canje'), 0) AS premios,
              (SELECT COUNT(*) FROM clientes WHERE negocio_id = ?1 AND creado >= ${INICIO_MES_LIMA}) AS nuevos
       FROM movimientos WHERE negocio_id = ?1 AND creado >= ${INICIO_MES_LIMA}`
    ).bind(n.id),
    // Los que más vinieron en los últimos 90 días.
    env.DB.prepare(
      `SELECT ${CAMPOS_CLIENTE.split(', ').map((x) => 'c.' + x).join(', ')}, COUNT(*) AS v90
       FROM movimientos m JOIN clientes c ON c.id = m.cliente_id
       WHERE m.negocio_id = ? AND m.tipo = 'sello' AND m.creado >= datetime('now', '-90 days')
       GROUP BY c.id ORDER BY v90 DESC, c.ultima_visita DESC LIMIT 5`
    ).bind(n.id),
  ]);
  const t = tot.results[0], v = vis.results[0], nu = nuevas.results[0], em = esteMes.results[0];
  return {
    clientes: t.clientes, premios: t.premios, conRecordatorios: t.con_recordatorios,
    visitasHoy: hoy.results[0].v, visitas30: mes.results[0].v, activos30: activos.results[0].v,
    escaneosQrHoy: v.qr_hoy, escaneosQr30: v.qr30, aperturas30: v.total30,
    tarjetasNuevas30: nu.nuevas, tarjetasDesdeQr30: nu.nuevas_qr,
    mes: { visitas: em.visitas, premios: em.premios, nuevos: em.nuevos },
    top: top.results.map((x) => ({ ...clientePanel(x, n, origen), visitas90: x.v90 })),
  };
}

async function numeros(env, n, origen) {
  const hoy = hoyLima();
  const meses = Array.from({ length: 6 }, (_, i) => sumarMeses(`${hoy.slice(0, 7)}-01`, i - 5).slice(0, 7));
  const desde = `${meses[0]}-01 05:00:00`; // 1.º del primer mes, 00:00 en Lima
  const [visitas, canjes, nuevos, top, horas, fieles, riesgo, vendidos] = await env.DB.batch([
    // k = número de visita de ese cliente: la 1.ª es su primera vez; desde la 2.ª, un cliente que regresó.
    env.DB.prepare(
      `WITH s AS (SELECT cliente_id, creado, monto, ROW_NUMBER() OVER (PARTITION BY cliente_id ORDER BY creado, id) AS k
                  FROM movimientos WHERE negocio_id = ? AND tipo = 'sello')
       SELECT ${DIA_LIMA} AS dia, cliente_id, k, monto FROM s WHERE creado >= ?`
    ).bind(n.id, desde),
    env.DB.prepare(`SELECT ${DIA_LIMA} AS dia, COUNT(*) AS n, COALESCE(SUM(-saldo), 0) AS usado FROM movimientos WHERE negocio_id = ? AND tipo = 'canje' AND creado >= ? GROUP BY dia`).bind(n.id, desde),
    env.DB.prepare(`SELECT ${DIA_LIMA} AS dia, COUNT(*) AS n FROM clientes WHERE negocio_id = ? AND creado >= ? GROUP BY dia`).bind(n.id, desde),
    env.DB.prepare(
      `SELECT ${CAMPOS_CLIENTE.split(', ').map((c) => 'c.' + c).join(', ')}, COUNT(*) AS v90, COALESCE(SUM(m.monto), 0) AS cobrado, COUNT(m.monto) AS con_monto
       FROM movimientos m JOIN clientes c ON c.id = m.cliente_id
       WHERE m.negocio_id = ? AND m.tipo = 'sello' AND m.creado >= datetime('now', '-90 days')
       GROUP BY c.id ORDER BY v90 DESC, c.ultima_visita DESC LIMIT 10`
    ).bind(n.id),
    env.DB.prepare(
      `SELECT CAST(strftime('%w', creado, '-5 hours') AS INTEGER) AS dia, CAST(strftime('%H', creado, '-5 hours') AS INTEGER) AS hora, COUNT(*) AS v
       FROM movimientos WHERE negocio_id = ? AND tipo = 'sello' AND creado >= datetime('now', '-90 days') GROUP BY dia, hora`
    ).bind(n.id),
    env.DB.prepare(
      `SELECT COUNT(*) AS clientes, COALESCE(SUM(visitas >= 2), 0) AS repiten,
              COALESCE(SUM(visitas >= 2 AND ultima_visita < datetime('now', ?)), 0) AS riesgo,
              (SELECT AVG(d) FROM (SELECT (julianday(MAX(creado)) - julianday(MIN(creado))) / (COUNT(*) - 1) AS d
                 FROM movimientos WHERE negocio_id = ? AND tipo = 'sello' GROUP BY cliente_id HAVING COUNT(*) >= 2)) AS cada_dias
       FROM clientes WHERE negocio_id = ? AND visitas >= 1`
    ).bind(`-${DIAS_RIESGO} days`, n.id, n.id),
    env.DB.prepare(
      `SELECT ${CAMPOS_CLIENTE} FROM clientes WHERE negocio_id = ? AND visitas >= 2 AND ultima_visita < datetime('now', ?)
       ORDER BY visitas DESC, ultima_visita DESC LIMIT 30`
    ).bind(n.id, `-${DIAS_RIESGO} days`),
    env.DB.prepare(
      `SELECT servicio, COUNT(*) AS veces, COALESCE(SUM(monto), 0) AS cobrado, COUNT(monto) AS con_monto FROM movimientos
       WHERE negocio_id = ? AND tipo = 'sello' AND servicio IS NOT NULL AND creado >= datetime('now', '-90 days') GROUP BY servicio`
    ).bind(n.id),
  ]);

  const precio = n.precio_visita | 0, costoPremio = (n.costo_premio | 0) || precio, inversion = n.inversion_mes | 0, pr = leerPrograma(n);
  const inicio = String(n.creado || '').slice(0, 7);
  // Suma las visitas de un mes, opcionalmente solo hasta cierto día (para comparar el mes en curso
  // con el mes anterior a la misma fecha). Las visitas sin monto anotado se cuentan al precio promedio.
  const resumir = (mes, hastaDia = 31) => {
    const dentro = (d) => d.slice(0, 7) === mes && Number(d.slice(8)) <= hastaDia;
    const x = { mes, visitas: 0, regreso: 0, ingresos: 0, ingresosRegreso: 0, canjes: 0, usado: 0, nuevos: 0 };
    const vinieron = new Set(), volvieron = new Set();
    for (const v of visitas.results) {
      if (!dentro(v.dia)) continue;
      const plata = v.monto ?? precio;
      x.visitas++; x.ingresos += plata; vinieron.add(v.cliente_id);
      if (v.k > 1) { x.regreso++; x.ingresosRegreso += plata; volvieron.add(v.cliente_id); }
    }
    for (const c of canjes.results) if (dentro(c.dia)) { x.canjes += c.n; x.usado += c.usado; }
    for (const c of nuevos.results) if (dentro(c.dia)) x.nuevos += c.n;
    x.clientes = vinieron.size; x.volvieron = volvieron.size;
    // En cashback el costo real es el saldo que usaron; en sellos y puntos, el costo de cada premio.
    x.premios = pr.tipo === 'cashback' ? x.usado : x.canjes * costoPremio;
    // En su mes gratis (plan «prueba») el negocio todavía no paga.
    x.inversion = mes < inicio || (n.plan === 'prueba' && mes === hoy.slice(0, 7)) ? 0 : inversion;
    x.ganancia = x.ingresosRegreso - x.premios - x.inversion;
    return x;
  };
  const lista = meses.map((mes) => resumir(mes));
  const f = fieles.results[0];
  return {
    ajustes: { precio, costoPremio: n.costo_premio | 0, inversion },
    tipo: pr.tipo, servicios: leerCatalogo(n), vendidos: masVendidos(vendidos.results, leerCatalogo(n)),
    meses: lista,
    // El mes en curso se compara con el anterior hasta el mismo día.
    anteriorAlDia: { hasta: Number(hoy.slice(8)), ...resumir(meses[4], Number(hoy.slice(8))) },
    top: top.results.map((t) => ({ ...clientePanel(t, n, origen), visitas90: t.v90, gasto90: t.cobrado + (t.v90 - t.con_monto) * precio })),
    horas: horas.results,
    fidelidad: { clientes: f.clientes, repiten: f.repiten, cadaDias: f.cada_dias == null ? null : Math.round(f.cada_dias) },
    riesgo: { dias: DIAS_RIESGO, total: f.riesgo, clientes: riesgo.results.map((r) => clientePanel(r, n, origen)) },
  };
}

/** Para /admin: cuánto le rinde el programa a cada negocio este mes, comparado con el mes
 *  anterior a la misma fecha. Mismas reglas que numeros(), en una sola pasada para todos. */
async function rendimiento(env) {
  const hoy = hoyLima(), mes = hoy.slice(0, 7), anterior = sumarMeses(`${mes}-01`, -1).slice(0, 7), dia = Number(hoy.slice(8));
  const desde = `${anterior}-01 05:00:00`;
  const [visitas, canjes, clientes] = await env.DB.batch([
    env.DB.prepare(
      `WITH s AS (SELECT negocio_id, cliente_id, creado, monto, ROW_NUMBER() OVER (PARTITION BY cliente_id ORDER BY creado, id) AS k
                  FROM movimientos WHERE tipo = 'sello')
       SELECT s.negocio_id AS id, ${MES_LIMA.replace('creado', 's.creado')} AS mes, CAST(strftime('%d', s.creado, '-5 hours') AS INTEGER) <= ? AS al_dia,
              COUNT(*) AS visitas, COALESCE(SUM(s.k > 1), 0) AS regreso, COUNT(DISTINCT CASE WHEN s.k > 1 THEN s.cliente_id END) AS volvieron,
              SUM(COALESCE(s.monto, n.precio_visita)) AS ingresos, COALESCE(SUM(CASE WHEN s.k > 1 THEN COALESCE(s.monto, n.precio_visita) END), 0) AS ingresos_regreso
       FROM s JOIN negocios n ON n.id = s.negocio_id WHERE s.creado >= ? GROUP BY id, mes, al_dia`
    ).bind(dia, desde),
    env.DB.prepare(
      `SELECT negocio_id AS id, ${MES_LIMA} AS mes, CAST(strftime('%d', creado, '-5 hours') AS INTEGER) <= ? AS al_dia, COUNT(*) AS canjes, COALESCE(SUM(-saldo), 0) AS usado
       FROM movimientos WHERE tipo = 'canje' AND creado >= ? GROUP BY id, mes, al_dia`
    ).bind(dia, desde),
    env.DB.prepare(
      `SELECT negocio_id AS id, COUNT(*) AS clientes, COALESCE(SUM(visitas >= 2 AND ultima_visita < datetime('now', ?)), 0) AS riesgo
       FROM clientes GROUP BY negocio_id`
    ).bind(`-${DIAS_RIESGO} days`),
  ]);
  const negocios = (await env.DB.prepare('SELECT id, slug, nombre, plan, tipo, precio_visita, costo_premio, inversion_mes, creado FROM negocios WHERE activo = 1 ORDER BY nombre').all()).results;
  const vacio = () => ({ visitas: 0, regreso: 0, volvieron: 0, ingresos: 0, ingresosRegreso: 0, canjes: 0, usado: 0 });
  const datos = new Map(negocios.map((n) => [n.id, { actual: vacio(), anteriorAlDia: vacio() }]));
  // Cada fila del mes en curso suma al actual; las del mes anterior hasta el mismo día, a la comparación.
  const destino = (f) => {
    const d = datos.get(f.id);
    if (!d) return null;
    if (f.mes === mes) return d.actual;
    return f.mes === anterior && f.al_dia ? d.anteriorAlDia : null;
  };
  for (const f of visitas.results) {
    const x = destino(f);
    if (!x) continue;
    x.visitas += f.visitas; x.regreso += f.regreso; x.volvieron += f.volvieron; x.ingresos += f.ingresos; x.ingresosRegreso += f.ingresos_regreso;
  }
  for (const f of canjes.results) { const x = destino(f); if (x) { x.canjes += f.canjes; x.usado += f.usado; } }
  const cl = new Map(clientes.results.map((c) => [c.id, c]));
  return {
    mes, anterior, dia, diasRiesgo: DIAS_RIESGO,
    negocios: negocios.map((n) => {
      const d = datos.get(n.id), costoPremio = n.costo_premio || n.precio_visita;
      for (const x of [d.actual, d.anteriorAlDia]) {
        x.premios = n.tipo === 'cashback' ? x.usado : x.canjes * costoPremio;
        x.inversion = n.plan === 'prueba' && x === d.actual ? 0 : n.inversion_mes;
        x.ganancia = x.ingresosRegreso - x.premios - x.inversion;
      }
      if (String(n.creado).slice(0, 7) > anterior) d.anteriorAlDia = null; // aún no existía el mes pasado
      return { slug: n.slug, nombre: n.nombre, conMontos: n.precio_visita > 0, inversion: n.inversion_mes,
        clientes: cl.get(n.id)?.clientes || 0, riesgo: cl.get(n.id)?.riesgo || 0, ...d };
    }),
  };
}

/** Tipo de programa, reglas y servicios del formulario de /admin. En puntos y cashback, el campo
 *  «premio» se completa solo (lo usan el cartel, Google Wallet y los mensajes). */
function programaDe(d, v) {
  const sv = textoAServicios(d.servicios_texto);
  if (sv.error) return sv;
  const pd = textoAServicios(d.productos_texto, 'Productos');
  if (pd.error) return pd;
  const r = reglasDe(d, v);
  if (r.error) return r;
  return { ...r, servicios: JSON.stringify(sv.lista), productos: JSON.stringify(pd.lista) };
}

/** Tipo de programa y sus reglas (sellos, puntos o cashback). En puntos y cashback también fija v.premio. */
function reglasDe(d, v) {
  const tipo = Object.prototype.hasOwnProperty.call(TIPOS, d.tipo) ? d.tipo : 'sellos';
  const reglas = {};
  if (tipo === 'puntos') {
    const pm = textoAPremios(d.premios_texto);
    if (pm.error) return pm;
    if (!pm.lista.length) return { error: 'Escribe al menos un premio para canjear puntos, por ejemplo «100 = Café gratis».' };
    reglas.porSol = Number(String(d.por_sol || '1').replace(',', '.'));
    if (!(reglas.porSol >= 0.1 && reglas.porSol <= 100)) return { error: 'Los puntos por cada S/ 1 deben estar entre 0.1 y 100.' };
    reglas.premios = pm.lista;
    v.premio = pm.lista[0].n.slice(0, 60);
  } else if (tipo === 'cashback') {
    reglas.pct = Number(String(d.pct || '').replace(',', '.'));
    if (!(reglas.pct >= 0.5 && reglas.pct <= 50)) return { error: 'El porcentaje de vuelta debe estar entre 0.5 y 50.' };
    const minimo = centimos(d.minimo);
    if (Number.isNaN(minimo)) return { error: 'Revisa el saldo mínimo para usar: solo números, por ejemplo 5.' };
    reglas.minimo = minimo || 0;
    v.premio = `${reglas.pct} % de vuelta en cada compra`.slice(0, 60);
  } else if (String(d.hitos_texto || '').trim()) {
    // Sellos con premios en el camino (antes de la meta).
    const hs = textoAHitos(d.hitos_texto, Math.round(Number(v.meta)) || 10);
    if (hs.error) return hs;
    reglas.hitos = hs.lista;
  }
  return { tipo, reglas: JSON.stringify(reglas) };
}

/** Cada tarjeta respeta su promoción: si cambian los sellos, el premio o los premios en el camino, las tarjetas que ya
 *  tienen sellos se quedan con la promoción con la que empezaron hasta canjearla. Las que vuelven a coincidir, se liberan.
 *  Devuelve cuántas tarjetas conservan una promoción anterior. */
async function congelarPromos(env, id, antes, v) {
  const hitosAntes = JSON.stringify(leerPrograma(antes).hitos), hitosNuevos = JSON.stringify(leerPrograma(v).hitos);
  if (!(antes.tipo === 'sellos' && v.tipo === 'sellos' && (antes.meta !== v.meta || antes.premio !== v.premio || hitosAntes !== hitosNuevos))) return 0;
  const [, , cuenta] = await env.DB.batch([
    env.DB.prepare('UPDATE clientes SET meta_t = ?, premio_t = ?, hitos_t = ? WHERE negocio_id = ? AND sellos > 0 AND meta_t IS NULL AND premio_t IS NULL').bind(antes.meta, antes.premio, hitosAntes, id),
    env.DB.prepare(`UPDATE clientes SET meta_t = NULL, premio_t = NULL, hitos_t = NULL WHERE negocio_id = ? AND meta_t = ? AND premio_t = ? AND COALESCE(hitos_t, '[]') = ?`).bind(id, v.meta, v.premio, hitosNuevos),
    env.DB.prepare('SELECT COUNT(*) AS n FROM clientes WHERE negocio_id = ? AND (meta_t IS NOT NULL OR premio_t IS NOT NULL)').bind(id),
  ]);
  return cuenta.results[0].n;
}

/** «Tu tarjeta» en la gestión: el dueño cambia el programa, el premio y el estilo sin pasar por /admin. */
async function guardarTarjeta(env, n, d) {
  const v = { programa: limpiarTexto(d.programa, 40), premio: limpiarTexto(d.premio, 60), meta: Math.round(Number(d.meta)) || n.meta };
  if (!v.programa) return { error: 'Ponle un nombre a tu programa, por ejemplo «Club ' + n.nombre.slice(0, 30) + '».' };
  const r = reglasDe(d, v);
  if (r.error) return r;
  v.tipo = r.tipo; v.reglas = r.reglas;
  if (v.tipo === 'sellos' && !v.premio) return { error: 'Escribe el premio al completar la tarjeta.' };
  if (!(v.meta >= 3 && v.meta <= 20)) return { error: 'Los sellos para el premio deben estar entre 3 y 20.' };
  const regalo = limpiarTexto(d.regalo_cumple, 60);
  // Estilo: uno de los estilos listos (con su paleta), y si quiere, su propio color de acento. Se conservan logo y fotos.
  const actual = leerDiseno(n, n.diseno);
  let diseno = actual;
  if (d.estilo && ESTILOS[d.estilo]) diseno = leerDiseno(null, { ...ESTILOS[d.estilo].d, estilo: d.estilo, logo: actual.logo, portada: actual.portada, imagen: actual.imagen, video: actual.video });
  if (/^#[0-9a-fA-F]{6}$/.test(d.acento || '')) diseno = { ...diseno, acento: d.acento.toUpperCase(), paleta: 'propia' };
  const color = diseno.acento, tema = colores(diseno).claro ? 'claro' : 'oscuro';
  const conservan = await congelarPromos(env, n.id, n, v);
  await env.DB.prepare('UPDATE negocios SET programa = ?, premio = ?, meta = ?, tipo = ?, reglas = ?, regalo_cumple = ?, diseno = ?, color = ?, tema = ?, sello_regalo = ? WHERE id = ?')
    .bind(v.programa, v.premio, v.meta, v.tipo, v.reglas, regalo, JSON.stringify(diseno), color, tema, d.sello_regalo ? 1 : 0, n.id).run();
  return { ok: true, conservan };
}

// ---------- cuentas creadas por el propio negocio (/crear y /entrar) ----------
const CORREO = /^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/;
/** «Bodega Don Pepe» → «bodega-don-pepe». */
function slugDe(nombre) {
  return String(nombre).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24).replace(/-+$/, '') || 'negocio';
}
async function apiCuenta(req, env, accion) {
  let d;
  try { d = await cuerpo(req); } catch { return error('Solicitud no válida.'); }
  const correo = String(d.correo || '').trim().toLowerCase().slice(0, 100);
  const clave = String(d.clave || '');

  if (accion === 'entrar') {
    const llave = `entrar:${ip(req)}`;
    if (await bloqueado(env, llave, 8, 900)) return error('Demasiados intentos fallidos. Espera 15 minutos.', 429);
    const c = await env.DB.prepare('SELECT n.id, n.slug, n.clave_ver, n.clave_dueno, n.clave_dueno_ver FROM cuentas c JOIN negocios n ON n.id = c.negocio_id AND n.activo = 1 WHERE c.correo = ?').bind(correo).first();
    if (!c || !c.clave_dueno || !(await verificarClave(clave, c.clave_dueno))) { await registrarFallo(env, llave, 900); return error('Correo o clave incorrectos.', 401); }
    await limpiarFallos(env, llave);
    const s = await crearSesion(env, { r: 'staff', n: c.id, v: c.clave_ver, d: c.clave_dueno_ver });
    return json({ ok: true, url: `/${c.slug}/gestion` }, 200, { 'Set-Cookie': cookie('sesion', s, { maxAge: DURACION_SESION }) });
  }

  if (accion === 'crear') {
    const negocio = limpiarTexto(d.negocio, 60), nombre = limpiarTexto(d.nombre, 60), celular = celularPeru(d.celular);
    const rubro = Object.prototype.hasOwnProperty.call(RUBROS, d.rubro) ? d.rubro : null;
    if (negocio.length < 2) return error('Escribe el nombre de tu negocio.');
    if (!rubro) return error('Elige el tipo de negocio.');
    if (nombre.length < 2) return error('Escribe tu nombre.');
    if (!celular) return error('Revisa tu celular: 9 dígitos que empiezan con 9.');
    if (!CORREO.test(correo)) return error('Revisa tu correo.');
    if (clave.length < 8) return error('Tu clave debe tener al menos 8 caracteres.');
    if (!(d.acepta === true || d.acepta === '1')) return error('Para crear tu cuenta debes aceptar los términos y el aviso de privacidad.');
    if (!(await limitar(env, `crear:${ip(req)}`, 5, 3600))) return error('Demasiadas cuentas creadas desde esta conexión. Intenta más tarde.', 429);
    if (await env.DB.prepare('SELECT 1 FROM cuentas WHERE correo = ?').bind(correo).first()) return error('Ya hay una cuenta con ese correo. Entra con tu clave.', 409);
    // Dirección del negocio: el nombre en minúsculas y con guiones; si ya existe, se le agrega un número.
    const base = slugDe(negocio);
    let slug = null;
    for (let i = 1; i <= 50 && !slug; i++) {
      const s = i === 1 ? base : `${base.slice(0, 21)}-${i}`;
      if (SLUG.test(s) && !RESERVADOS.has(s) && !(await env.DB.prepare('SELECT 1 FROM negocios WHERE slug = ?').bind(s).first())) slug = s;
    }
    if (!slug) slug = `${base.slice(0, 16)}-${aleatorio(6, 'abcdefghijkmnpqrstuvwxyz23456789')}`;
    const diseno = leerDiseno(null, { ...ESTILOS.moderno.d, estilo: 'moderno' });
    const fila = await env.DB.prepare(
      `INSERT INTO negocios (slug, nombre, programa, premio, meta, espera_min, correo, color, tema, redes, diseno, plan, vence, clave_hash, clave_dueno, tipo, reglas, gestion, rubro)
       VALUES (?, ?, ?, ?, 8, 60, ?, ?, ?, ?, ?, 'prueba', ?, '', ?, 'sellos', '{}', 1, ?) RETURNING id, clave_ver, clave_dueno_ver`
    ).bind(slug, negocio, `Club ${negocio}`.slice(0, 40), PREMIO_INICIAL, correo, diseno.acento, colores(diseno).claro ? 'claro' : 'oscuro',
      JSON.stringify({ whatsapp: celular }), JSON.stringify(diseno), sumarMeses(hoyLima(), 1), await hashClave(clave), rubro).first();
    try {
      await env.DB.prepare('INSERT INTO cuentas (correo, nombre, celular, negocio_id) VALUES (?, ?, ?, ?)').bind(correo, nombre, celular, fila.id).run();
    } catch (err) {
      await env.DB.prepare('DELETE FROM negocios WHERE id = ?').bind(fila.id).run();
      if (/UNIQUE/i.test(String(err))) return error('Ya hay una cuenta con ese correo. Entra con tu clave.', 409);
      throw err;
    }
    const s = await crearSesion(env, { r: 'staff', n: fila.id, v: fila.clave_ver, d: fila.clave_dueno_ver });
    return json({ ok: true, url: `/${slug}/gestion` }, 201, { 'Set-Cookie': cookie('sesion', s, { maxAge: DURACION_SESION }) });
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
         n.clave_hash != '' AS tiene_clave, n.inversion_mes AS cuota, n.precio_visita AS precio, n.tipo, n.reglas, n.servicios, n.pedir_servicio, n.costo_premio, n.mostrar_numeros, n.sello_regalo, n.productos, n.regalo_cumple, n.gestion, n.rubro,
         (SELECT COUNT(*) FROM clientes c WHERE c.negocio_id = n.id) AS clientes,
         (SELECT COUNT(*) FROM movimientos m WHERE m.negocio_id = n.id AND m.tipo = 'sello' AND m.creado >= datetime('now', '-30 days')) AS visitas30,
         (SELECT COALESCE(SUM(v.n), 0) FROM vistas v WHERE v.negocio_id = n.id AND v.origen = 'qr' AND v.dia >= date('now', '-5 hours', '-29 days')) AS escaneos30,
         (SELECT COUNT(*) FROM clientes c WHERE c.negocio_id = n.id AND c.recordatorios = 1 AND CASE n.tipo
            WHEN 'puntos' THEN c.puntos >= MAX(CAST(COALESCE(json_extract(n.reglas, '$.premios[0].p'), 1) * 0.8 AS INTEGER), 1)
            WHEN 'cashback' THEN c.saldo >= MAX(COALESCE(json_extract(n.reglas, '$.minimo'), 1), 1)
            ELSE c.sellos >= MAX(COALESCE(c.meta_t, n.meta) - 2, 1) END) AS cerca
       FROM negocios n WHERE n.activo = 1 ORDER BY n.nombre`
    ).all();
    return json({ negocios: filas.results.map((n) => ({ ...n, diseno: leerDiseno(n, n.diseno), ...estadoPlan(n) })), hoy: hoyLima(), planes: PLANES });
  }

  if (accion === 'catalogo' && req.method === 'GET') return json({ ...catalogo(), medios: !!env.MEDIOS });
  if (accion === 'rendimiento' && req.method === 'GET') return json(await rendimiento(env));
  // Todos los números de un negocio (lo que antes veía en su panel), para su reporte del mes.
  if (accion === 'numeros' && req.method === 'GET') {
    const n = await negocioPorSlug(env, String(url.searchParams.get('n') || ''));
    if (!n) return error('Negocio no encontrado.', 404);
    const [num, res] = await Promise.all([numeros(env, n, url.origin), resumen(env, n, url.origin)]);
    let wa = '';
    try { wa = JSON.parse(n.redes || '{}').whatsapp || ''; } catch { wa = ''; }
    return json({
      negocio: { slug: n.slug, nombre: n.nombre, programa: n.programa, premio: n.premio, meta: n.meta, logo: n.d.logo || '', acento: n.d.acento, fondo: n.d.fondoColor, whatsapp: wa },
      ...num, alcance: res,
    });
  }

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
    // Cuota mensual que paga el negocio: es su «inversión» en «Tus números». Vacía al editar = no cambia.
    const prog = programaDe(d, v);
    if (prog.error) return error(prog.error);
    const cuota = centimos(d.cuota);
    if (Number.isNaN(cuota)) return error('Revisa la cuota mensual: solo números, por ejemplo 69.');
    const precio = centimos(d.precio);
    if (Number.isNaN(precio)) return error('Revisa el precio por servicio: solo números, por ejemplo 35.');
    const costoPremio = centimos(d.costo_premio);
    if (Number.isNaN(costoPremio)) return error('Revisa lo que cuesta dar el premio: solo números, por ejemplo 30.');
    const diseno = leerDiseno(null, d.diseno);
    // color y tema se mantienen por compatibilidad con versiones anteriores
    v.color = diseno.acento; v.tema = colores(diseno).claro ? 'claro' : 'oscuro';
    if (!v.nombre || !v.programa || !v.premio) return error('Completa nombre, programa y premio.');
    if (!(v.meta >= 3 && v.meta <= 20)) return error('Los sellos para el premio deben estar entre 3 y 20.');
    v.tipo = prog.tipo; v.reglas = prog.reglas; v.servicios = prog.servicios; v.productos = prog.productos;
    v.regalo_cumple = limpiarTexto(d.regalo_cumple, 60);
    if (!(v.espera_min >= 0 && v.espera_min <= 10080)) return error('Los minutos entre sellos deben estar entre 0 y 10080.');
    if (v.ruc && v.ruc.length !== 11) return error('El RUC debe tener 11 dígitos.');
    if (v.correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.correo)) return error('Revisa el correo.');
    const r = leerRedes(d);
    if (r.error) return error(r.error);
    v.redes = r.redes;
    const clave = String(d.clave || '');
    if (clave && clave.length < 8) return error('La clave del panel debe tener al menos 8 caracteres.');
    const hash = clave ? await hashClave(clave) : null;
    const claveDueno = String(d.clave_dueno || '');
    if (claveDueno && claveDueno.length < 8) return error('La clave del dueño debe tener al menos 8 caracteres.');
    if (claveDueno && claveDueno === clave) return error('La clave del dueño debe ser distinta a la del panel.');
    const hashDueno = claveDueno ? await hashClave(claveDueno) : null;
    const gestion = d.gestion === undefined ? null : (d.gestion === '1' ? 1 : 0);
    const rubro = d.rubro === undefined ? null : Object.prototype.hasOwnProperty.call(RUBROS, d.rubro) ? d.rubro : '';

    const existe = await env.DB.prepare('SELECT id FROM negocios WHERE slug = ?').bind(slug).first();
    if (existe && d.editar !== slug) return error(`Ya existe un negocio con el identificador «${slug}». Usa otro o toca «Editar» en ese negocio.`, 409);
    // Solo se aceptan fotos y videos subidos para este mismo negocio.
    const ids = mediosDe(diseno);
    if (ids.length) {
      const propios = existe ? (await env.DB.prepare(`SELECT id FROM medios WHERE negocio_id = ? AND id IN (${ids.map(() => '?').join(',')})`).bind(existe.id, ...ids).all()).results.map((r) => r.id) : [];
      for (const k of ['logo', 'portada', 'imagen', 'video']) if (diseno[k] && !propios.includes(diseno[k])) diseno[k] = '';
    }
    v.diseno = JSON.stringify(diseno);
    // Casilla «Pedir el servicio en cada visita»: '1' marcada, '' desmarcada (si no llega, se deja como estaba).
    const pedir = d.pedir_servicio === undefined ? null : (d.pedir_servicio === '1' ? 1 : 0);
    // «Mostrar números completos al dueño»: apagado por defecto (el reporte se lo mandas tú).
    const mostrar = d.mostrar_numeros === undefined ? null : (d.mostrar_numeros === '1' ? 1 : 0);
    const regalo = d.sello_regalo === undefined ? null : (d.sello_regalo === '1' ? 1 : 0);
    let conservan = 0;
    if (existe) {
      // Cada tarjeta respeta su promoción: si cambian los sellos o el premio, las tarjetas que ya tienen sellos
      // se quedan con la promoción con la que empezaron hasta canjearla. Las que vuelven a coincidir, se liberan.
      // También los premios en el camino: se guardan con la promoción de la tarjeta.
      const antes = await env.DB.prepare('SELECT tipo, meta, premio, reglas, servicios, productos, clave_hash FROM negocios WHERE id = ?').bind(existe.id).first();
      // La duración de los servicios y el stock de los productos los maneja la gestión: no se pierden al guardar aquí.
      v.servicios = conservarExtras(v.servicios, antes.servicios);
      v.productos = conservarExtras(v.productos, antes.productos);
      if (hashDueno && !hash && (await verificarClave(claveDueno, antes.clave_hash))) return error('La clave del dueño debe ser distinta a la del panel.');
      conservan = await congelarPromos(env, existe.id, antes, v);
      await env.DB.prepare(
        `UPDATE negocios SET nombre=?, programa=?, premio=?, meta=?, espera_min=?, razon_social=?, ruc=?, direccion=?, correo=?, color=?, tema=?, redes=?, diseno=?, plan=?, vence=?, activo=1, inversion_mes=COALESCE(?, inversion_mes), precio_visita=COALESCE(?, precio_visita), tipo=?, reglas=?, servicios=?, productos=?, regalo_cumple=?, pedir_servicio=COALESCE(?, pedir_servicio),
         costo_premio=COALESCE(?, costo_premio), mostrar_numeros=COALESCE(?, mostrar_numeros), sello_regalo=COALESCE(?, sello_regalo)
         , gestion=COALESCE(?, gestion), rubro=COALESCE(?, rubro)${hash ? ', clave_hash=?, clave_ver=clave_ver+1' : ''}${hashDueno ? ', clave_dueno=?, clave_dueno_ver=clave_dueno_ver+1' : ''} WHERE id = ?`
      ).bind(v.nombre, v.programa, v.premio, v.meta, v.espera_min, v.razon_social, v.ruc, v.direccion, v.correo, v.color, v.tema, v.redes, v.diseno, v.plan, v.vence, cuota, precio, v.tipo, v.reglas, v.servicios, v.productos, v.regalo_cumple, pedir, d.costo_premio === undefined ? null : costoPremio || 0, mostrar, regalo, gestion, rubro, ...(hash ? [hash] : []), ...(hashDueno ? [hashDueno] : []), existe.id).run();
      return json({ ok: true, creado: false, conservan });
    }
    if (!hash) return error('Define una clave para el panel del nuevo negocio.');
    // Negocio nuevo sin fecha: un mes desde hoy (el primer mes gratis).
    if (!v.vence) v.vence = sumarMeses(hoyLima(), 1);
    if (!v.plan) v.plan = 'prueba';
    await env.DB.prepare(
      `INSERT INTO negocios (slug, nombre, programa, premio, meta, espera_min, razon_social, ruc, direccion, correo, color, tema, redes, diseno, plan, vence, clave_hash, inversion_mes, precio_visita, tipo, reglas, servicios, productos, regalo_cumple, pedir_servicio, costo_premio, mostrar_numeros, sello_regalo, gestion, clave_dueno, rubro)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(slug, v.nombre, v.programa, v.premio, v.meta, v.espera_min, v.razon_social, v.ruc, v.direccion, v.correo, v.color, v.tema, v.redes, v.diseno, v.plan, v.vence, hash, cuota || 0, precio || 0, v.tipo, v.reglas, v.servicios, v.productos, v.regalo_cumple, pedir === null ? 1 : pedir, costoPremio || 0, mostrar || 0, regalo || 0, gestion || 0, hashDueno || '', rubro || '').run();
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
    premio: limpiarTexto(d.premio, 60) || 'Premio', meta, redes: '{}', razon_social: '', vista: true, tipo: 'sellos', reglas: '{}', sello_regalo: d.sello_regalo ? 1 : 0, regalo_cumple: limpiarTexto(d.regalo_cumple, 60),
    d: leerDiseno(null, d.diseno), temaUrl: `/admin/vista/tema.css?d=${encodeURIComponent(crudo)}`,
  };
  try { n.redes = leerRedes(d).redes || '{}'; } catch { n.redes = '{}'; }
  { const pg = programaDe(d, n); if (!pg.error) { n.tipo = pg.tipo; n.reglas = pg.reglas; } }
  if (pagina === 'tema.css') return texto(temaCss(n, n.d), 'text/css; charset=utf-8');
  if (pagina === 'registro') return html(P.registro(n), 200, EN_MARCO);
  if (pagina === 'tarjeta') {
    const pr = leerPrograma(n);
    const c = { token: 'vista', codigo: 'ABCD2345', nombre: 'Cliente', celular: '51900000000', sellos: Math.max(1, meta - 3), visitas: meta - 3, premios: 1, hito: 0,
      puntos: Math.round((pr.premios[0]?.p || 100) * 0.7), saldo: 1250 };
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
  // QR de la tarjeta (/SLUG/K/CODIGO, en mayúsculas): abre el panel del negocio con ese cliente.
  if (partes.length === 3 && /^k$/i.test(partes[1]) && SLUG.test(partes[0].toLowerCase()) && req.method === 'GET') {
    return redirigir(`/${partes[0].toLowerCase()}/panel#c=${normalizarCodigo(partes[2])}`);
  }
  // QR del cartel (/SLUG/Q, en mayúsculas): abre la página de registro contando la visita como «qr».
  if (partes.length === 2 && /^q$/i.test(partes[1]) && SLUG.test(partes[0].toLowerCase()) && req.method === 'GET') {
    return redirigir(`/${partes[0].toLowerCase()}?o=qr`);
  }
  await asegurarEsquema(env);

  if (partes[0] === 'api') {
    if (partes[1] === 'salir' && req.method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': cookie('sesion', '', { maxAge: 0 }) });
    if (partes[1] === 'admin') return apiAdmin(req, env, partes.slice(2), url);
    if (partes[1] === 'cuenta' && req.method === 'POST') return apiCuenta(req, env, partes[2]);
    if (partes[1] === 'n' && partes[2]) {
      const n = await negocioPorSlug(env, partes[2]);
      if (!n) return error('Negocio no encontrado.', 404);
      if (partes[3] === 'registro' && req.method === 'POST') return registrar(req, env, n);
      if (partes[3] === 'reserva') {
        let datos = {};
        if (req.method === 'POST') { try { datos = await cuerpo(req); } catch { return error('Solicitud no válida.'); } }
        return apiReserva(req, env, n, partes.slice(4), url, datos);
      }
      if (partes[3] === 't' && partes[4]) {
        const c = await env.DB.prepare(`SELECT ${CAMPOS_CLIENTE} FROM clientes WHERE token = ? AND negocio_id = ?`).bind(partes[4], n.id).first();
        if (!c) return error('Tarjeta no encontrada.', 404);
        if (!partes[5] && req.method === 'GET') return json(clientePublico(c, n));
        if (partes[5] === 'eliminar' && req.method === 'POST') {
          try { await cuerpo(req); } catch { return error('Solicitud no válida.'); }
          await env.DB.batch([
            ...anonimizar(env, c.id),
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

  if (partes.length === 0) return html(P.inicio(env));
  if (partes.length === 1 && partes[0] === 'crear') return html(P.crearCuenta(RUBROS, env));
  if (partes.length === 1 && partes[0] === 'entrar') return html(P.entrar(env));
  if (partes.length === 1 && partes[0] === 'terminos') return html(P.terminos(env));
  if (partes[0] === 'admin' && partes.length === 1) return html(P.admin());
  if (partes[0] === 'admin' && partes[1] === 'reporte' && partes.length === 2) return html(P.reporte());
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
    case 'gestion':
      return html(P.gestion(n, { modo: modoDe(n), soporte: env.SOPORTE_WHATSAPP || '' }));
    case 'v': {
      // Comprobante de una venta (nota de venta), con su enlace privado: para imprimir, guardar en PDF o mandar por WhatsApp.
      const v = await ventaPorToken(env, n, partes[2]);
      return v ? html(P.comprobante(n, v)) : html(P.noEncontrado(), 404);
    }
    case 'reservar':
      return reservasActivas(n) ? html(P.reservar(n)) : html(P.noEncontrado(), 404);
    case 'cartel': {
      // El QR del cartel va en mayúsculas (/SLUG/Q, menos cuadritos y más fácil de leer de lejos)
      // y redirige a /slug?o=qr para contar cuántas personas lo escanean.
      const enlace = `${url.origin}/${n.slug}`;
      return html(P.cartel(n, qrSvg(`${url.origin.toUpperCase()}/${n.slug.toUpperCase()}/Q`), enlace));
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
      n.reserva = reservasActivas(n);
      const enlace = `${url.origin}/${n.slug}/t/${c.token}`;
      // El código va después de # para que no viaje al servidor ni quede en registros.
      return html(P.tarjeta(n, c, qrSvg(qrCliente(url.origin, n, c)), enlace), 200, {
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
    // Quien compró o tuvo una cita en la gestión en esos 24 meses no se borra, aunque no haya sumado sellos.
    const viejo = `COALESCE(ultima_visita, creado) < datetime('now', '-24 months')
      AND NOT EXISTS (SELECT 1 FROM ventas v WHERE v.cliente_id = clientes.id AND v.creado >= datetime('now', '-24 months'))
      AND NOT EXISTS (SELECT 1 FROM citas ci WHERE ci.cliente_id = clientes.id AND ci.creado >= datetime('now', '-24 months'))`;
    await env.DB.batch([
      env.DB.prepare(`UPDATE ventas SET cliente_id = NULL, nombre = '' WHERE cliente_id IN (SELECT id FROM clientes WHERE ${viejo})`),
      env.DB.prepare(`UPDATE citas SET cliente_id = NULL, nombre = '', celular = '' WHERE cliente_id IN (SELECT id FROM clientes WHERE ${viejo})`),
      env.DB.prepare(`DELETE FROM movimientos WHERE cliente_id IN (SELECT id FROM clientes WHERE ${viejo})`),
      env.DB.prepare(`DELETE FROM clientes WHERE ${viejo}`),
      env.DB.prepare(`DELETE FROM citas WHERE dia < date('now', '-5 hours', '-24 months')`),
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
