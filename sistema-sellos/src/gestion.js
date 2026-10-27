// Gestión del negocio: agenda de citas, reservas en línea, caja, gastos, finanzas, equipo y catálogo.
// Para barberías, salones, spas, centros de uñas y de estética. Se activa por negocio en /admin (negocios.gestion).
// Montos en céntimos. Días (AAAA-MM-DD) y horas (HH:MM) en hora de Lima (UTC−5, sin horario de verano).
//
// Dos roles con la misma página (/slug/gestion):
//   dueño: todo. Entra con la clave del dueño (o con la del panel si el negocio aún no tiene clave del dueño).
//   caja:  agenda, cobrar, clientes y gastos del día. Entra con la clave del panel de tarjetas.
import { json, error, texto, limpiarTexto, celularPeru, celularVisible, nuevoToken, nuevoCodigo, AVISO_VERSION, COLOR, cookie } from './util.js';
import { hashClave, verificarClave, crearSesion, limitar, ip, DURACION_SESION } from './auth.js';
import { leerServicios } from './programa.js';

export const METODOS = ['Efectivo', 'Yape', 'Plin', 'Tarjeta', 'Transferencia'];
export const CATEGORIAS = ['Alquiler', 'Luz, agua e internet', 'Productos e insumos', 'Sueldos', 'Comisiones', 'Publicidad', 'Mantenimiento', 'Impuestos', 'Otros'];
const ESTADOS = ['pendiente', 'confirmada', 'atendida', 'no_vino', 'cancelada'];
// Estados que ocupan un horario de la agenda.
const OCUPAN = "('pendiente', 'confirmada', 'atendida', 'bloqueo')";
const MIN_SQL = '(CAST(substr(hora, 1, 2) AS INTEGER) * 60 + CAST(substr(hora, 4, 2) AS INTEGER))';
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

const leerJson = (t, def) => { try { const v = JSON.parse(t || ''); return v ?? def; } catch { return def; } };
const entero = (v, min, max, def) => { const x = Math.round(Number(v)); return v !== '' && v !== null && Number.isFinite(x) && x >= min && x <= max ? x : def; };
function centimos(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const x = Math.round(Number(String(v).trim().replace(',', '.')) * 100);
  return Number.isFinite(x) && x >= 0 && x <= 10000000 ? x : NaN;
}

// ---------- fechas en hora de Lima ----------
export function ahoraLima() {
  const d = new Date(Date.now() - 5 * 3600000).toISOString();
  return { dia: d.slice(0, 10), hora: d.slice(11, 16) };
}
const aMin = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const aHora = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const sumarDias = (dia, n) => new Date(Date.parse(dia) + n * 86400000).toISOString().slice(0, 10);
const diaSemana = (dia) => new Date(Date.parse(dia)).getUTCDay();
const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
function limitesMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  return { desde: `${mes}-01`, hasta: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10), anterior: new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7) };
}
const diaValido = (d) => DIA.test(d || '') && !Number.isNaN(Date.parse(d)) && new Date(Date.parse(d)).toISOString().slice(0, 10) === d;

// ---------- ajustes ----------
/** Ajustes de la gestión del negocio, siempre válidos. horario[0] = domingo … horario[6] = sábado; null = cerrado. */
export function leerAjustes(n) {
  const a = leerJson(n.ajustes, {});
  const horario = Array.from({ length: 7 }, (_, i) => {
    const h = Array.isArray(a.horario) ? a.horario[i] : undefined;
    if (h === null) return null;
    if (Array.isArray(h) && HORA.test(h[0]) && HORA.test(h[1]) && h[0] < h[1]) return [h[0], h[1]];
    return i === 0 ? null : ['09:00', '20:00'];
  });
  const metodos = Array.isArray(a.metodos) ? METODOS.filter((m) => a.metodos.includes(m)) : [];
  return {
    horario,
    intervalo: [10, 15, 20, 30, 45, 60].includes(a.intervalo) ? a.intervalo : 30,
    reservas: !!a.reservas,
    anticipacion: entero(a.anticipacion, 0, 2880, 60),
    diasReserva: entero(a.diasReserva, 1, 60, 14),
    notaReserva: limpiarTexto(a.notaReserva, 200),
    meta: entero(a.meta, 0, 1e9, 0),
    metodos: metodos.length ? metodos : METODOS,
  };
}

// ---------- equipo ----------
function persona(p) {
  return {
    id: p.id, nombre: p.nombre, cargo: p.cargo, celular: celularVisible(p.celular), celularWa: p.celular, color: p.color,
    comision: p.comision, comisionProd: p.comision_prod, servicios: leerJson(p.servicios, []), agenda: !!p.agenda, activo: !!p.activo,
  };
}
async function equipo(env, n, todos = false) {
  const filas = await env.DB.prepare(`SELECT * FROM personal WHERE negocio_id = ? ${todos ? '' : 'AND activo = 1'} ORDER BY activo DESC, nombre`).bind(n.id).all();
  return filas.results.map(persona);
}

// ---------- citas ----------
function citaJson(c, nombres) {
  return {
    id: c.id, dia: c.dia, hora: c.hora, dur: c.dur, fin: aHora(Math.min(aMin(c.hora) + c.dur, 1439)), personalId: c.personal_id,
    personal: c.personal_id ? nombres.get(c.personal_id) || '' : '', clienteId: c.cliente_id, nombre: c.nombre,
    celular: celularVisible(c.celular), celularWa: c.celular, servicio: c.servicio, precio: c.precio, estado: c.estado,
    origen: c.origen, nota: c.nota, ventaId: c.venta_id,
  };
}
const mapaNombres = async (env, n) => new Map((await env.DB.prepare('SELECT id, nombre FROM personal WHERE negocio_id = ?').bind(n.id).all()).results.map((p) => [p.id, p.nombre]));

/** La cita (o bloqueo) que choca con ese horario, si hay. Sin equipo cargado (personal null) cualquier cita choca. */
async function choque(env, n, { dia, hora, dur, personal, id }) {
  const ini = aMin(hora), fin = ini + dur;
  const filas = (await env.DB.prepare(`SELECT id, hora, dur, nombre, servicio, estado, personal_id FROM citas WHERE negocio_id = ? AND dia = ? AND estado IN ${OCUPAN} AND id != ?`)
    .bind(n.id, dia, id || 0).all()).results;
  return filas.find((c) => (personal === null || c.personal_id === personal || c.personal_id === null)
    && aMin(c.hora) < fin && ini < aMin(c.hora) + c.dur) || null;
}

/** Horas libres de un día para un servicio: [{hora, personal: [ids libres]}]. */
async function horasLibres(env, n, aj, { dia, dur, servicio, personalId }) {
  const h = aj.horario[diaSemana(dia)];
  if (!h) return [];
  const conAgenda = (await equipo(env, n)).filter((p) => p.agenda);
  let recursos;
  if (!conAgenda.length) recursos = [null];
  else recursos = conAgenda.filter((p) => (!p.servicios.length || p.servicios.includes(servicio)) && (!personalId || p.id === personalId)).map((p) => p.id);
  if (!recursos.length) return [];
  const citas = (await env.DB.prepare(`SELECT hora, dur, personal_id FROM citas WHERE negocio_id = ? AND dia = ? AND estado IN ${OCUPAN}`).bind(n.id, dia).all()).results;
  const ahora = ahoraLima();
  const desdeAhora = diasEntre(ahora.dia, dia) * 1440; // minutos entre hoy a medianoche y ese día a medianoche
  const out = [];
  for (let t = aMin(h[0]); t + dur <= aMin(h[1]); t += aj.intervalo) {
    if (desdeAhora + t < aMin(ahora.hora) + aj.anticipacion) continue;
    const libres = recursos.filter((r) => !citas.some((c) => (r === null || c.personal_id === r || c.personal_id === null)
      && aMin(c.hora) < t + dur && t < aMin(c.hora) + c.dur));
    if (libres.length) out.push({ hora: aHora(t), personal: libres });
  }
  return out;
}

// ---------- clientes ----------
/** Busca al cliente por celular o lo crea (lo registra el negocio, con el aviso de privacidad que el cliente aceptó en persona). */
async function clientePorCelular(env, n, nombre, celular, recordatorios) {
  const existe = await env.DB.prepare('SELECT id FROM clientes WHERE negocio_id = ? AND celular = ?').bind(n.id, celular).first();
  if (existe) return existe.id;
  const consentimiento = `${new Date().toISOString()} aviso ${AVISO_VERSION} registrado por el negocio${recordatorios ? ' + recordatorios' : ''}`;
  for (let intento = 0; intento < 5; intento++) {
    try {
      const fila = await env.DB.prepare(
        `INSERT INTO clientes (negocio_id, token, codigo, nombre, celular, recordatorios, consentimiento, origen) VALUES (?, ?, ?, ?, ?, ?, ?, 'caja') RETURNING id`
      ).bind(n.id, nuevoToken(), nuevoCodigo(), nombre, celular, recordatorios ? 1 : 0, consentimiento).first();
      return fila.id;
    } catch (err) {
      if (!/UNIQUE/i.test(String(err))) throw err;
      if (/celular/.test(String(err))) return (await env.DB.prepare('SELECT id FROM clientes WHERE negocio_id = ? AND celular = ?').bind(n.id, celular).first()).id;
      if (intento === 4) throw err;
    }
  }
  return null;
}

/** Cliente de la cita o la venta: el que ya existe (cliente_id), uno nuevo (nombre + celular) o solo un nombre. */
async function clienteDe(env, n, d) {
  if (d.cliente_id) {
    const c = await env.DB.prepare('SELECT id, nombre, celular FROM clientes WHERE id = ? AND negocio_id = ?').bind(Number(d.cliente_id) || 0, n.id).first();
    if (!c) return { error: 'Ese cliente ya no existe. Búscalo de nuevo.' };
    return { id: c.id, nombre: c.nombre, celular: c.celular };
  }
  const nombre = limpiarTexto(d.nombre, 60);
  const crudo = String(d.celular || '').trim();
  const celular = crudo ? celularPeru(crudo) : null;
  if (crudo && !celular) return { error: 'Revisa el celular: 9 dígitos que empiezan con 9.' };
  if (celular && nombre.length < 2) return { error: 'Escribe el nombre del cliente.' };
  // Con celular y «crear su tarjeta», queda registrado como cliente (con su tarjeta de fidelización).
  if (celular && d.tarjeta) return { id: await clientePorCelular(env, n, nombre, celular, !!d.recordatorios), nombre, celular };
  if (celular) {
    const c = await env.DB.prepare('SELECT id, nombre FROM clientes WHERE negocio_id = ? AND celular = ?').bind(n.id, celular).first();
    if (c) return { id: c.id, nombre: c.nombre, celular };
  }
  return { id: null, nombre, celular: celular || '' };
}

// ---------- catálogo ----------
function catalogoDe(n) {
  return { servicios: leerServicios(n), productos: leerServicios(n, 'productos') };
}
function leerItemsCatalogo(lista, tipo) {
  if (!Array.isArray(lista)) return { lista: [] };
  if (lista.length > 60) return { error: `${tipo}: máximo 60.` };
  const out = [], vistos = new Set();
  for (const [i, x] of lista.entries()) {
    const nombre = limpiarTexto(x && x.n, 40);
    if (!nombre) continue;
    const clave = nombre.toLowerCase();
    if (vistos.has(clave)) return { error: `${tipo}: «${nombre}» está repetido.` };
    vistos.add(clave);
    const p = centimos(x.p);
    if (p === null || Number.isNaN(p)) return { error: `${tipo}, fila ${i + 1}: revisa el precio de «${nombre}».` };
    const o = { n: nombre, p };
    if (tipo === 'Servicios') {
      const d = entero(x.d, 5, 600, null);
      if (x.d !== undefined && x.d !== '' && d === null) return { error: `Servicios: la duración de «${nombre}» debe ser de 5 a 600 minutos.` };
      if (d) o.d = d;
    } else {
      if (x.s !== undefined && x.s !== '' && x.s !== null) {
        const s = entero(x.s, -9999, 99999, null);
        if (s === null) return { error: `Productos: revisa el stock de «${nombre}».` };
        o.s = s;
      }
      const m = entero(x.m, 0, 9999, 0);
      if (m) o.m = m;
    }
    out.push(o);
  }
  return { lista: out };
}

/** El catálogo de /admin («Corte = 30») no tiene duración ni stock: al guardarlo se conservan los de la gestión. */
export function conservarExtras(nuevo, viejo) {
  const antes = new Map((leerJson(viejo, []) || []).map((x) => [String(x.n).toLowerCase(), x]));
  return JSON.stringify(leerJson(nuevo, []).map((x) => {
    const a = antes.get(String(x.n).toLowerCase());
    if (!a) return x;
    const o = { ...x };
    for (const k of ['d', 's', 'm']) if (a[k] !== undefined && o[k] === undefined) o[k] = a[k];
    return o;
  }));
}

/** Descuenta (o devuelve, con signo -1) del stock los productos vendidos que llevan control de stock. */
async function moverStock(env, n, items, signo) {
  const vendidos = items.filter((x) => x.t === 'p');
  if (!vendidos.length) return;
  const fila = await env.DB.prepare('SELECT productos FROM negocios WHERE id = ?').bind(n.id).first();
  const lista = leerJson(fila && fila.productos, []);
  let cambio = false;
  for (const x of vendidos) {
    const p = lista.find((y) => y.n === x.n);
    if (p && Number.isFinite(Number(p.s)) && p.s !== '' && p.s !== null) { p.s = Number(p.s) - signo * x.c; cambio = true; }
  }
  if (cambio) await env.DB.prepare('UPDATE negocios SET productos = ? WHERE id = ?').bind(JSON.stringify(lista), n.id).run();
}

// ---------- ventas ----------
function ventaJson(v, nombres) {
  return {
    id: v.id, dia: v.dia, hora: v.hora, clienteId: v.cliente_id, nombre: v.nombre, personalId: v.personal_id,
    personal: v.personal_id ? nombres.get(v.personal_id) || '' : '', items: leerJson(v.items, []), servicios: v.servicios, productos: v.productos,
    descuento: v.descuento, total: v.total, metodo: v.metodo, citaId: v.cita_id, nota: v.nota, anulada: !!v.anulada,
  };
}

/** Comisión de una venta para quien la atendió: sus % sobre servicios y productos, después del descuento. */
function comisionDe(v, p) {
  const bruto = v.servicios + v.productos;
  if (!p || !bruto) return 0;
  const factor = v.total / bruto;
  return Math.round(v.servicios * factor * p.comision / 100 + v.productos * factor * p.comision_prod / 100);
}

// ---------- reportes ----------
/** Totales de ventas y gastos entre dos días (incluidos). */
async function totales(env, n, desde, hasta) {
  const [v, g] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS ventas, COALESCE(SUM(total), 0) AS ingresos FROM ventas WHERE negocio_id = ? AND anulada = 0 AND dia BETWEEN ? AND ?').bind(n.id, desde, hasta),
    env.DB.prepare('SELECT COALESCE(SUM(monto), 0) AS gastos FROM gastos WHERE negocio_id = ? AND dia BETWEEN ? AND ?').bind(n.id, desde, hasta),
  ]);
  const r = { ventas: v.results[0].ventas, ingresos: v.results[0].ingresos, gastos: g.results[0].gastos };
  r.ganancia = r.ingresos - r.gastos;
  return r;
}

async function finanzas(env, n, mes) {
  const ahora = ahoraLima();
  const { desde, hasta, anterior } = limitesMes(mes);
  const enCurso = mes === ahora.dia.slice(0, 7);
  // El mes anterior se compara «a la misma fecha» si el mes está en curso (del 1 al día de hoy).
  const la = limitesMes(anterior);
  const hastaAnt = enCurso ? `${anterior}-${String(Math.min(Number(ahora.dia.slice(8)), Number(la.hasta.slice(8)))).padStart(2, '0')}` : la.hasta;
  const [ventas, gastos, equipoT, citas, nuevos] = await env.DB.batch([
    env.DB.prepare('SELECT dia, hora, items, servicios, productos, descuento, total, metodo, personal_id, cliente_id FROM ventas WHERE negocio_id = ? AND anulada = 0 AND dia BETWEEN ? AND ?').bind(n.id, desde, hasta),
    env.DB.prepare('SELECT dia, categoria, monto, metodo FROM gastos WHERE negocio_id = ? AND dia BETWEEN ? AND ?').bind(n.id, desde, hasta),
    env.DB.prepare('SELECT * FROM personal WHERE negocio_id = ?').bind(n.id),
    env.DB.prepare(`SELECT estado, origen, COUNT(*) AS n FROM citas WHERE negocio_id = ? AND dia BETWEEN ? AND ? AND estado != 'bloqueo' GROUP BY estado, origen`).bind(n.id, desde, hasta),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM clientes WHERE negocio_id = ? AND date(creado, '-5 hours') BETWEEN ? AND ?`).bind(n.id, desde, hasta),
  ]);
  const ant = await totales(env, n, `${anterior}-01`, hastaAnt);
  const dias = Number(hasta.slice(8));
  const porDia = Array.from({ length: dias }, (_, i) => ({ dia: `${mes}-${String(i + 1).padStart(2, '0')}`, ingresos: 0, gastos: 0 }));
  const metodos = new Map(), categorias = new Map(), servicios = new Map(), productos = new Map(), clientes = new Set();
  const personas = new Map(equipoT.results.map((p) => [p.id, p]));
  const porPersona = new Map();
  let ingresos = 0, descuentos = 0, totalServicios = 0, totalProductos = 0;
  const semana = Array(7).fill(0);
  for (const v of ventas.results) {
    ingresos += v.total; descuentos += v.descuento; totalServicios += v.servicios; totalProductos += v.productos;
    porDia[Number(v.dia.slice(8)) - 1].ingresos += v.total;
    semana[diaSemana(v.dia)] += v.total;
    metodos.set(v.metodo, (metodos.get(v.metodo) || 0) + v.total);
    if (v.cliente_id) clientes.add(v.cliente_id);
    const factor = v.servicios + v.productos ? v.total / (v.servicios + v.productos) : 0;
    for (const x of leerJson(v.items, [])) {
      const m = x.t === 'p' ? productos : servicios;
      const a = m.get(x.n) || { n: x.n, veces: 0, total: 0 };
      a.veces += x.c || 1; a.total += Math.round((x.p * (x.c || 1)) * factor);
      m.set(x.n, a);
    }
    const k = v.personal_id || 0;
    const pp = porPersona.get(k) || { id: k, ventas: 0, total: 0, comision: 0 };
    pp.ventas += 1; pp.total += v.total; pp.comision += comisionDe(v, personas.get(v.personal_id));
    porPersona.set(k, pp);
  }
  let totalGastos = 0;
  for (const g of gastos.results) {
    totalGastos += g.monto;
    porDia[Number(g.dia.slice(8)) - 1].gastos += g.monto;
    categorias.set(g.categoria, (categorias.get(g.categoria) || 0) + g.monto);
  }
  const ordenar = (m) => [...m].map(([k, v]) => ({ n: k, total: v })).sort((a, b) => b.total - a.total);
  const top = (m) => [...m.values()].sort((a, b) => b.total - a.total).slice(0, 8);
  const resumenCitas = { total: 0, atendidas: 0, noVino: 0, canceladas: 0, web: 0 };
  for (const c of citas.results) {
    resumenCitas.total += c.n;
    if (c.estado === 'atendida') resumenCitas.atendidas += c.n;
    if (c.estado === 'no_vino') resumenCitas.noVino += c.n;
    if (c.estado === 'cancelada') resumenCitas.canceladas += c.n;
    if (c.origen === 'web') resumenCitas.web += c.n;
  }
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const mejorDia = semana.some(Boolean) ? DIAS[semana.indexOf(Math.max(...semana))] : '';
  return {
    mes, enCurso, hastaAnterior: hastaAnt,
    ingresos, gastos: totalGastos, ganancia: ingresos - totalGastos, ventas: ventas.results.length,
    ticket: ventas.results.length ? Math.round(ingresos / ventas.results.length) : 0, descuentos,
    servicios: totalServicios, productos: totalProductos, clientesAtendidos: clientes.size, clientesNuevos: nuevos.results[0].n,
    anterior: ant, meta: leerAjustes(n).meta, mejorDia,
    porDia, metodos: ordenar(metodos), categorias: ordenar(categorias),
    topServicios: top(servicios), topProductos: top(productos),
    equipo: [...porPersona.values()].map((p) => ({ ...p, nombre: p.id ? personas.get(p.id)?.nombre || '—' : 'Sin asignar' })).sort((a, b) => b.total - a.total),
    citas: resumenCitas,
  };
}

const celdaCsv = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita fórmulas al abrir en Excel
  return `"${s.replace(/"/g, '""')}"`;
};

// ---------- API de la gestión (con sesión del panel) ----------
/** h: { sesion, dueno, clientePanel(c), CAMPOS_CLIENTE, visita(c, monto, servicio) → aviso | null } */
export async function apiGestion(req, env, n, partes, url, h, datos) {
  const [recurso, id, sub] = partes;
  const metodo = req.method;
  if (!n.gestion && h.sesion.r !== 'admin') return error('La gestión del negocio no está activa. Pídele a tu proveedor que la active.', 403);
  const soloDueno = () => (h.dueno ? null : error('Solo el dueño puede ver esto. Entra con la clave del dueño.', 403));
  const aj = leerAjustes(n);
  const ahora = ahoraLima();

  // Todo lo que la página necesita al abrir.
  if (recurso === 'datos' && metodo === 'GET') {
    let wa = '';
    try { wa = JSON.parse(n.redes || '{}').whatsapp || ''; } catch { wa = ''; }
    return json({
      rol: h.dueno ? 'dueno' : 'caja', hoy: ahora.dia, hora: ahora.hora, claveDueno: !!n.clave_dueno,
      negocio: { nombre: n.nombre, slug: n.slug, tipo: n.tipo || 'sellos', whatsapp: wa },
      ajustes: aj, equipo: await equipo(env, n, h.dueno), ...catalogoDe(n), metodos: aj.metodos, todosMetodos: METODOS, categorias: CATEGORIAS,
    });
  }

  if (recurso === 'inicio' && metodo === 'GET') {
    const nombres = await mapaNombres(env, n);
    const manana = sumarDias(ahora.dia, 1);
    const [citasHoy, porConfirmar, mananaT, ventasHoy, gastosHoy, cumple] = await env.DB.batch([
      env.DB.prepare(`SELECT * FROM citas WHERE negocio_id = ? AND dia = ? AND estado NOT IN ('cancelada', 'bloqueo') ORDER BY hora`).bind(n.id, ahora.dia),
      env.DB.prepare(`SELECT * FROM citas WHERE negocio_id = ? AND dia >= ? AND estado = 'pendiente' ORDER BY dia, hora LIMIT 20`).bind(n.id, ahora.dia),
      env.DB.prepare(`SELECT * FROM citas WHERE negocio_id = ? AND dia = ? AND estado IN ('pendiente', 'confirmada') ORDER BY hora`).bind(n.id, manana),
      env.DB.prepare('SELECT metodo, COUNT(*) AS n, SUM(total) AS total FROM ventas WHERE negocio_id = ? AND dia = ? AND anulada = 0 GROUP BY metodo').bind(n.id, ahora.dia),
      env.DB.prepare('SELECT metodo, SUM(monto) AS total FROM gastos WHERE negocio_id = ? AND dia = ? GROUP BY metodo').bind(n.id, ahora.dia),
      env.DB.prepare('SELECT id, nombre, celular FROM clientes WHERE negocio_id = ? AND cumple = ? LIMIT 20').bind(n.id, ahora.dia.slice(5)),
    ]);
    const vendido = ventasHoy.results.reduce((t, x) => t + x.total, 0);
    const gastado = gastosHoy.results.reduce((t, x) => t + x.total, 0);
    const efectivo = (ventasHoy.results.find((x) => x.metodo === 'Efectivo')?.total || 0) - (gastosHoy.results.find((x) => x.metodo === 'Efectivo')?.total || 0);
    const out = {
      hoy: ahora.dia, hora: ahora.hora,
      dia: { ventas: ventasHoy.results.reduce((t, x) => t + x.n, 0), vendido, gastado, efectivo, metodos: ventasHoy.results.map((x) => ({ n: x.metodo, total: x.total })) },
      citas: citasHoy.results.map((c) => citaJson(c, nombres)),
      porConfirmar: porConfirmar.results.map((c) => citaJson(c, nombres)),
      manana: mananaT.results.map((c) => citaJson(c, nombres)),
      cumpleanos: cumple.results.map((c) => ({ id: c.id, nombre: c.nombre, celularWa: c.celular })),
      stockBajo: leerServicios(n, 'productos').filter((p) => p.s !== undefined && p.s <= (p.m || 0)).map((p) => ({ n: p.n, s: p.s, m: p.m || 0 })),
    };
    if (h.dueno) {
      const mes = ahora.dia.slice(0, 7), lm = limitesMes(mes);
      const la = limitesMes(lm.anterior);
      const hastaAnt = `${lm.anterior}-${String(Math.min(Number(ahora.dia.slice(8)), Number(la.hasta.slice(8)))).padStart(2, '0')}`;
      const [actual, anterior] = await Promise.all([totales(env, n, lm.desde, ahora.dia), totales(env, n, `${lm.anterior}-01`, hastaAnt)]);
      out.mes = { ...actual, anterior, meta: aj.meta, diasMes: Number(lm.hasta.slice(8)), diaMes: Number(ahora.dia.slice(8)) };
    }
    return json(out);
  }

  // ----- agenda -----
  if (recurso === 'citas' && !id && metodo === 'GET') {
    const desde = diaValido(url.searchParams.get('desde')) ? url.searchParams.get('desde') : ahora.dia;
    const dias = entero(url.searchParams.get('dias'), 1, 42, 1);
    const nombres = await mapaNombres(env, n);
    const filas = await env.DB.prepare('SELECT * FROM citas WHERE negocio_id = ? AND dia BETWEEN ? AND ? ORDER BY dia, hora, id')
      .bind(n.id, desde, sumarDias(desde, dias - 1)).all();
    return json({ desde, dias, citas: filas.results.map((c) => citaJson(c, nombres)), horario: aj.horario, intervalo: aj.intervalo });
  }

  if (recurso === 'citas' && metodo === 'POST' && (!id || !sub)) {
    // Crear (sin id) o editar una cita. Con bloqueo: true, cierra ese horario (almuerzo, permiso...).
    const actual = id ? await env.DB.prepare('SELECT * FROM citas WHERE id = ? AND negocio_id = ?').bind(Number(id) || 0, n.id).first() : null;
    if (id && !actual) return error('Esa cita ya no existe.', 404);
    const bloqueo = actual ? actual.estado === 'bloqueo' : !!datos.bloqueo;
    const dia = String(datos.dia || ''), hora = String(datos.hora || '');
    if (!diaValido(dia)) return error('Elige el día.');
    if (!HORA.test(hora)) return error('Elige la hora.');
    const dur = entero(datos.dur, 5, 720, null);
    if (!dur) return error('La duración debe ser de 5 a 720 minutos.');
    if (aMin(hora) + dur > 1440) return error('La cita no puede pasar de la medianoche.');
    const eq = await equipo(env, n, true);
    let personal = datos.personal_id ? Number(datos.personal_id) : null;
    if (personal && !eq.some((p) => p.id === personal)) return error('Elige quién atiende.');
    if (!personal && eq.some((p) => p.activo && p.agenda) && !bloqueo) return error('Elige quién atiende.');
    const servicio = limpiarTexto(datos.servicio, 120), nota = limpiarTexto(datos.nota, 300);
    const precio = centimos(datos.precio);
    if (Number.isNaN(precio)) return error('Revisa el precio.');
    let cli = { id: null, nombre: bloqueo ? limpiarTexto(datos.nombre, 60) || 'Horario bloqueado' : '', celular: '' };
    if (!bloqueo) {
      cli = await clienteDe(env, n, datos);
      if (cli.error) return error(cli.error);
      if (cli.nombre.length < 2) return error('Escribe el nombre del cliente.');
      if (!servicio) return error('Elige el servicio.');
    }
    if (!datos.forzar) {
      const c = await choque(env, n, { dia, hora, dur, personal, id: actual && actual.id });
      if (c) {
        const quien = c.estado === 'bloqueo' ? 'un horario bloqueado' : `la cita de ${c.nombre || 'otro cliente'}${c.servicio ? ` (${c.servicio})` : ''}`;
        return json({ error: `Ese horario choca con ${quien} de ${c.hora} a ${aHora(aMin(c.hora) + c.dur)}.`, choque: true }, 409);
      }
    }
    if (actual) {
      await env.DB.prepare('UPDATE citas SET dia=?, hora=?, dur=?, personal_id=?, cliente_id=?, nombre=?, celular=?, servicio=?, precio=?, nota=? WHERE id = ?')
        .bind(dia, hora, dur, personal, cli.id, cli.nombre, cli.celular, servicio, precio || 0, nota, actual.id).run();
      return json({ ok: true, id: actual.id });
    }
    const estado = bloqueo ? 'bloqueo' : datos.confirmada ? 'confirmada' : 'pendiente';
    const fila = await env.DB.prepare(
      `INSERT INTO citas (negocio_id, dia, hora, dur, personal_id, cliente_id, nombre, celular, servicio, precio, estado, origen, nota) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'panel', ?) RETURNING id`
    ).bind(n.id, dia, hora, dur, personal, cli.id, cli.nombre, cli.celular, servicio, precio || 0, estado, nota).first();
    return json({ ok: true, id: fila.id }, 201);
  }

  if (recurso === 'citas' && id && sub === 'estado' && metodo === 'POST') {
    const c = await env.DB.prepare('SELECT * FROM citas WHERE id = ? AND negocio_id = ?').bind(Number(id) || 0, n.id).first();
    if (!c) return error('Esa cita ya no existe.', 404);
    if (datos.estado === 'borrar') {
      if (c.venta_id) return error('Esta cita ya se cobró: anula la venta primero.', 409);
      await env.DB.prepare('DELETE FROM citas WHERE id = ?').bind(c.id).run();
      return json({ ok: true });
    }
    if (!ESTADOS.includes(datos.estado) || c.estado === 'bloqueo') return error('Estado no válido.');
    if (c.venta_id && datos.estado !== 'atendida') return error('Esta cita ya se cobró: anula la venta primero.', 409);
    await env.DB.prepare('UPDATE citas SET estado = ? WHERE id = ?').bind(datos.estado, c.id).run();
    return json({ ok: true });
  }

  // ----- caja -----
  if (recurso === 'ventas' && !id && metodo === 'GET') {
    const dia = h.dueno && diaValido(url.searchParams.get('dia')) ? url.searchParams.get('dia') : ahora.dia;
    const nombres = await mapaNombres(env, n);
    const [ventas, gastos] = await env.DB.batch([
      env.DB.prepare('SELECT * FROM ventas WHERE negocio_id = ? AND dia = ? ORDER BY hora DESC, id DESC').bind(n.id, dia),
      env.DB.prepare('SELECT * FROM gastos WHERE negocio_id = ? AND dia = ? ORDER BY id DESC').bind(n.id, dia),
    ]);
    const validas = ventas.results.filter((v) => !v.anulada);
    const porMetodo = new Map();
    for (const v of validas) porMetodo.set(v.metodo, (porMetodo.get(v.metodo) || 0) + v.total);
    const gEfectivo = gastos.results.filter((g) => g.metodo === 'Efectivo').reduce((t, g) => t + g.monto, 0);
    return json({
      dia, hoy: ahora.dia,
      ventas: ventas.results.map((v) => ventaJson(v, nombres)),
      gastos: gastos.results.map((g) => ({ id: g.id, categoria: g.categoria, detalle: g.detalle, monto: g.monto, metodo: g.metodo })),
      resumen: {
        total: validas.reduce((t, v) => t + v.total, 0), ventas: validas.length,
        metodos: [...porMetodo].map(([k, v]) => ({ n: k, total: v })).sort((a, b) => b.total - a.total),
        gastos: gastos.results.reduce((t, g) => t + g.monto, 0), efectivoCaja: (porMetodo.get('Efectivo') || 0) - gEfectivo,
      },
    });
  }

  if (recurso === 'ventas' && !id && metodo === 'POST') {
    const cat = catalogoDe(n);
    const items = [];
    for (const x of (Array.isArray(datos.items) ? datos.items : []).slice(0, 20)) {
      const nombre = limpiarTexto(x && x.n, 60);
      if (!nombre) continue;
      const t = x.t === 'p' ? 'p' : 's';
      const enCatalogo = (t === 'p' ? cat.productos : cat.servicios).find((y) => y.n === nombre);
      const p = x.p === undefined || x.p === '' ? (enCatalogo ? enCatalogo.p : null) : centimos(x.p);
      if (p === null || Number.isNaN(p)) return error(`Revisa el precio de «${nombre}».`);
      const c = entero(x.c ?? 1, 1, 99, null);
      if (!c) return error(`Revisa la cantidad de «${nombre}».`);
      items.push({ n: nombre, t, p, c });
    }
    if (!items.length) return error('Agrega al menos un servicio o producto.');
    const servicios = items.filter((x) => x.t === 's').reduce((s, x) => s + x.p * x.c, 0);
    const productos = items.filter((x) => x.t === 'p').reduce((s, x) => s + x.p * x.c, 0);
    const descuento = centimos(datos.descuento) || 0;
    if (Number.isNaN(descuento) || descuento > servicios + productos) return error('El descuento no puede ser mayor que el total.');
    const total = servicios + productos - descuento;
    const metodoPago = aj.metodos.includes(datos.metodo) ? datos.metodo : METODOS.includes(datos.metodo) ? datos.metodo : null;
    if (!metodoPago) return error('Elige cómo pagó.');
    const eq = await equipo(env, n, true);
    const personal = datos.personal_id ? Number(datos.personal_id) : null;
    if (personal && !eq.some((p) => p.id === personal)) return error('Elige quién atendió.');
    // El dueño puede anotar ventas de días anteriores (hasta 60 días); la caja, solo las de hoy.
    let dia = ahora.dia, hora = ahora.hora;
    if (h.dueno && datos.dia && datos.dia !== ahora.dia) {
      if (!diaValido(datos.dia) || datos.dia > ahora.dia || diasEntre(datos.dia, ahora.dia) > 60) return error('La fecha debe ser de hoy o de los últimos 60 días.');
      dia = datos.dia; hora = '12:00';
    }
    const cli = await clienteDe(env, n, datos);
    if (cli.error) return error(cli.error);
    let cita = null;
    if (datos.cita_id) {
      cita = await env.DB.prepare('SELECT id, venta_id FROM citas WHERE id = ? AND negocio_id = ?').bind(Number(datos.cita_id) || 0, n.id).first();
      if (!cita) return error('Esa cita ya no existe.');
      if (cita.venta_id) return error('Esta cita ya se cobró.', 409);
    }
    const nota = limpiarTexto(datos.nota, 200);
    const fila = await env.DB.prepare(
      `INSERT INTO ventas (negocio_id, dia, hora, cliente_id, nombre, personal_id, items, servicios, productos, descuento, total, metodo, cita_id, nota)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
    ).bind(n.id, dia, hora, cli.id, cli.nombre || '', personal, JSON.stringify(items), servicios, productos, descuento, total, metodoPago, cita ? cita.id : null, nota).first();
    if (cita) await env.DB.prepare(`UPDATE citas SET estado = 'atendida', venta_id = ? WHERE id = ?`).bind(fila.id, cita.id).run();
    await moverStock(env, n, items, 1);
    // Si tiene tarjeta, la venta suma su visita (sello, puntos o saldo) con lo cobrado.
    let tarjeta = null;
    if (cli.id && datos.sello !== false && dia === ahora.dia) {
      const c = await env.DB.prepare(`SELECT ${h.CAMPOS_CLIENTE} FROM clientes WHERE id = ?`).bind(cli.id).first();
      const aviso = await h.visita(c, total || null, items.map((x) => x.n).join(' + ').slice(0, 200));
      const nuevo = await env.DB.prepare(`SELECT ${h.CAMPOS_CLIENTE} FROM clientes WHERE id = ?`).bind(cli.id).first();
      tarjeta = { aviso, cliente: h.clientePanel(nuevo) };
    }
    return json({ ok: true, id: fila.id, total, tarjeta }, 201);
  }

  if (recurso === 'ventas' && id && sub === 'anular' && metodo === 'POST') {
    const v = await env.DB.prepare('SELECT * FROM ventas WHERE id = ? AND negocio_id = ?').bind(Number(id) || 0, n.id).first();
    if (!v) return error('Esa venta ya no existe.', 404);
    if (v.anulada) return error('Esa venta ya está anulada.', 409);
    if (!h.dueno && v.dia !== ahora.dia) return error('Solo el dueño puede anular ventas de otros días.', 403);
    const [upd] = await env.DB.batch([
      env.DB.prepare('UPDATE ventas SET anulada = 1 WHERE id = ? AND anulada = 0').bind(v.id),
      env.DB.prepare(`UPDATE citas SET estado = 'confirmada', venta_id = NULL WHERE venta_id = ? AND negocio_id = ?`).bind(v.id, n.id),
    ]);
    if (upd.meta.changes) await moverStock(env, n, leerJson(v.items, []), -1);
    return json({ ok: true });
  }

  // ----- gastos -----
  if (recurso === 'gastos' && !id && metodo === 'GET') {
    const no = soloDueno(); if (no) return no;
    const mes = MES.test(url.searchParams.get('mes') || '') ? url.searchParams.get('mes') : ahora.dia.slice(0, 7);
    const { desde, hasta, anterior } = limitesMes(mes);
    const nombres = await mapaNombres(env, n);
    const [lista, fijosAnt] = await env.DB.batch([
      env.DB.prepare('SELECT * FROM gastos WHERE negocio_id = ? AND dia BETWEEN ? AND ? ORDER BY dia DESC, id DESC').bind(n.id, desde, hasta),
      env.DB.prepare('SELECT * FROM gastos WHERE negocio_id = ? AND fijo = 1 AND dia BETWEEN ? AND ? ORDER BY dia').bind(n.id, `${anterior}-01`, limitesMes(anterior).hasta),
    ]);
    // Gastos fijos del mes pasado que todavía no se anotaron este mes (misma categoría y detalle).
    const ya = new Set(lista.results.map((g) => `${g.categoria}|${g.detalle.toLowerCase()}`));
    const pendientes = mes >= ahora.dia.slice(0, 7) ? fijosAnt.results.filter((g) => !ya.has(`${g.categoria}|${g.detalle.toLowerCase()}`)) : [];
    const g = (x) => ({ id: x.id, dia: x.dia, categoria: x.categoria, detalle: x.detalle, monto: x.monto, metodo: x.metodo, personalId: x.personal_id, personal: x.personal_id ? nombres.get(x.personal_id) || '' : '', fijo: !!x.fijo });
    return json({ mes, gastos: lista.results.map(g), pendientes: pendientes.map(g), total: lista.results.reduce((t, x) => t + x.monto, 0) });
  }

  if (recurso === 'gastos' && !id && metodo === 'POST') {
    const categoria = CATEGORIAS.includes(datos.categoria) ? datos.categoria : null;
    if (!categoria) return error('Elige la categoría del gasto.');
    const monto = centimos(datos.monto);
    if (!monto || Number.isNaN(monto)) return error('Escribe cuánto gastaste.');
    const metodoPago = METODOS.includes(datos.metodo) ? datos.metodo : 'Efectivo';
    let dia = ahora.dia;
    if (datos.dia && datos.dia !== ahora.dia) {
      if (!h.dueno) return error('Desde la caja solo se anotan gastos de hoy.', 403);
      if (!diaValido(datos.dia) || diasEntre(ahora.dia, datos.dia) > 31 || diasEntre(datos.dia, ahora.dia) > 366) return error('Revisa la fecha del gasto.');
      dia = datos.dia;
    }
    const personal = datos.personal_id ? Number(datos.personal_id) : null;
    if (personal && !(await env.DB.prepare('SELECT 1 FROM personal WHERE id = ? AND negocio_id = ?').bind(personal, n.id).first())) return error('Elige a la persona del equipo.');
    const fila = await env.DB.prepare('INSERT INTO gastos (negocio_id, dia, categoria, detalle, monto, metodo, personal_id, fijo) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
      .bind(n.id, dia, categoria, limpiarTexto(datos.detalle, 120), monto, metodoPago, personal, h.dueno && datos.fijo ? 1 : 0).first();
    return json({ ok: true, id: fila.id }, 201);
  }

  if (recurso === 'gastos' && id && sub === 'borrar' && metodo === 'POST') {
    const g = await env.DB.prepare('SELECT dia FROM gastos WHERE id = ? AND negocio_id = ?').bind(Number(id) || 0, n.id).first();
    if (!g) return error('Ese gasto ya no existe.', 404);
    if (!h.dueno && g.dia !== ahora.dia) return error('Solo el dueño puede borrar gastos de otros días.', 403);
    await env.DB.prepare('DELETE FROM gastos WHERE id = ? AND negocio_id = ?').bind(Number(id), n.id).run();
    return json({ ok: true });
  }

  // ----- finanzas -----
  if (recurso === 'finanzas' && metodo === 'GET') {
    const no = soloDueno(); if (no) return no;
    const mes = MES.test(url.searchParams.get('mes') || '') ? url.searchParams.get('mes') : ahora.dia.slice(0, 7);
    return json(await finanzas(env, n, mes));
  }

  if (recurso === 'finanzas.csv' && metodo === 'GET') {
    const no = soloDueno(); if (no) return no;
    const mes = MES.test(url.searchParams.get('mes') || '') ? url.searchParams.get('mes') : ahora.dia.slice(0, 7);
    const { desde, hasta } = limitesMes(mes);
    const nombres = await mapaNombres(env, n);
    const [ventas, gastos] = await env.DB.batch([
      env.DB.prepare('SELECT * FROM ventas WHERE negocio_id = ? AND dia BETWEEN ? AND ? ORDER BY dia, hora, id').bind(n.id, desde, hasta),
      env.DB.prepare('SELECT * FROM gastos WHERE negocio_id = ? AND dia BETWEEN ? AND ? ORDER BY dia, id').bind(n.id, desde, hasta),
    ]);
    const s2 = (c) => (c / 100).toFixed(2);
    const filas = [['tipo', 'fecha', 'hora', 'detalle', 'cliente', 'atendio', 'medio_de_pago', 'descuento', 'monto', 'estado'].map(celdaCsv).join(',')];
    for (const v of ventas.results) {
      const det = leerJson(v.items, []).map((x) => `${x.c > 1 ? `${x.c} × ` : ''}${x.n}`).join(' + ');
      filas.push(['ingreso', v.dia, v.hora, det, v.nombre, v.personal_id ? nombres.get(v.personal_id) || '' : '', v.metodo, s2(v.descuento), s2(v.total), v.anulada ? 'anulada' : ''].map(celdaCsv).join(','));
    }
    for (const g of gastos.results) {
      filas.push(['gasto', g.dia, '', `${g.categoria}${g.detalle ? ` · ${g.detalle}` : ''}`, '', g.personal_id ? nombres.get(g.personal_id) || '' : '', g.metodo, '', s2(-g.monto), ''].map(celdaCsv).join(','));
    }
    return texto('﻿' + filas.join('\r\n'), 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="caja-${n.slug}-${mes}.csv"` });
  }

  // ----- clientes -----
  if (recurso === 'clientes' && !id && metodo === 'GET') {
    const q = String(url.searchParams.get('q') || '').trim().slice(0, 60);
    let filas;
    if (!q) {
      // Sin búsqueda: los últimos que vinieron o compraron.
      filas = await env.DB.prepare(`SELECT ${h.CAMPOS_CLIENTE}, notas FROM clientes WHERE negocio_id = ? ORDER BY COALESCE(ultima_visita, creado) DESC LIMIT 25`).bind(n.id).all();
    } else {
      const digitos = q.replace(/\D/g, '');
      const patron = `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
      filas = await env.DB.prepare(
        `SELECT ${h.CAMPOS_CLIENTE}, notas FROM clientes WHERE negocio_id = ? AND (nombre LIKE ? ESCAPE '\\' OR (? != '' AND celular LIKE ?) OR codigo = ?)
         ORDER BY ultima_visita DESC LIMIT 15`
      ).bind(n.id, patron, digitos.length >= 3 ? digitos : '', `%${digitos.slice(-9)}%`, q.toUpperCase()).all();
    }
    return json({ clientes: filas.results.map((c) => ({ ...h.clientePanel(c), notas: c.notas })) });
  }

  if (recurso === 'clientes' && !id && metodo === 'POST') {
    const nombre = limpiarTexto(datos.nombre, 60), celular = celularPeru(datos.celular);
    if (nombre.length < 2) return error('Escribe el nombre del cliente.');
    if (!celular) return error('Revisa el celular: 9 dígitos que empiezan con 9.');
    if (await env.DB.prepare('SELECT 1 FROM clientes WHERE negocio_id = ? AND celular = ?').bind(n.id, celular).first()) return error('Ya hay un cliente con ese celular. Búscalo.', 409);
    const cid = await clientePorCelular(env, n, nombre, celular, !!datos.recordatorios);
    if (datos.notas) await env.DB.prepare('UPDATE clientes SET notas = ? WHERE id = ?').bind(String(datos.notas).slice(0, 1000), cid).run();
    return json({ ok: true, id: cid }, 201);
  }

  if (recurso === 'clientes' && id && /^\d+$/.test(id)) {
    const c = await env.DB.prepare(`SELECT ${h.CAMPOS_CLIENTE}, notas FROM clientes WHERE id = ? AND negocio_id = ?`).bind(Number(id), n.id).first();
    if (!c) return error('Cliente no encontrado.', 404);
    if (sub === 'notas' && metodo === 'POST') {
      // Texto libre de varias líneas: alergias, tipo de piel, fórmula del tinte, cómo le gusta el corte...
      const notas = String(datos.notas ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, 1000);
      await env.DB.prepare('UPDATE clientes SET notas = ? WHERE id = ?').bind(notas, c.id).run();
      return json({ ok: true });
    }
    if (!sub && metodo === 'GET') {
      const nombres = await mapaNombres(env, n);
      const [citas, ventas, suma] = await env.DB.batch([
        env.DB.prepare('SELECT * FROM citas WHERE cliente_id = ? AND negocio_id = ? ORDER BY dia DESC, hora DESC LIMIT 20').bind(c.id, n.id),
        env.DB.prepare('SELECT * FROM ventas WHERE cliente_id = ? AND negocio_id = ? AND anulada = 0 ORDER BY dia DESC, hora DESC LIMIT 20').bind(c.id, n.id),
        env.DB.prepare('SELECT COUNT(*) AS compras, COALESCE(SUM(total), 0) AS total, MIN(dia) AS desde, MAX(dia) AS ultima FROM ventas WHERE cliente_id = ? AND negocio_id = ? AND anulada = 0').bind(c.id, n.id),
      ]);
      return json({
        cliente: { ...h.clientePanel(c), notas: c.notas },
        citas: citas.results.map((x) => citaJson(x, nombres)), ventas: ventas.results.map((x) => ventaJson(x, nombres)), resumen: suma.results[0],
      });
    }
  }

  // ----- equipo -----
  if (recurso === 'personal' && metodo === 'GET') {
    const no = soloDueno(); if (no) return no;
    const mes = MES.test(url.searchParams.get('mes') || '') ? url.searchParams.get('mes') : ahora.dia.slice(0, 7);
    const { desde, hasta } = limitesMes(mes);
    const [filas, ventas] = await env.DB.batch([
      env.DB.prepare('SELECT * FROM personal WHERE negocio_id = ? ORDER BY activo DESC, nombre').bind(n.id),
      env.DB.prepare('SELECT personal_id, servicios, productos, total FROM ventas WHERE negocio_id = ? AND anulada = 0 AND dia BETWEEN ? AND ? AND personal_id IS NOT NULL').bind(n.id, desde, hasta),
    ]);
    const pagado = await env.DB.prepare(`SELECT personal_id, SUM(monto) AS total FROM gastos WHERE negocio_id = ? AND dia BETWEEN ? AND ? AND personal_id IS NOT NULL GROUP BY personal_id`).bind(n.id, desde, hasta).all();
    const pagos = new Map(pagado.results.map((x) => [x.personal_id, x.total]));
    return json({
      mes,
      equipo: filas.results.map((p) => {
        const suyas = ventas.results.filter((v) => v.personal_id === p.id);
        return { ...persona(p), ventas: suyas.length, total: suyas.reduce((t, v) => t + v.total, 0), comisionMes: suyas.reduce((t, v) => t + comisionDe(v, p), 0), pagado: pagos.get(p.id) || 0 };
      }),
    });
  }

  if (recurso === 'personal' && metodo === 'POST') {
    const no = soloDueno(); if (no) return no;
    const nombre = limpiarTexto(datos.nombre, 40);
    if (nombre.length < 2) return error('Escribe el nombre.');
    const crudo = String(datos.celular || '').trim(), celular = crudo ? celularPeru(crudo) : '';
    if (crudo && !celular) return error('Revisa el celular: 9 dígitos que empiezan con 9.');
    const comision = entero(datos.comision || 0, 0, 100, null), comisionProd = entero(datos.comision_prod || 0, 0, 100, null);
    if (comision === null || comisionProd === null) return error('La comisión debe ser de 0 a 100 %.');
    const color = COLOR.test(datos.color || '') ? datos.color : '#8AB4F8';
    const nombresServ = new Set(leerServicios(n).map((s) => s.n));
    const servicios = JSON.stringify((Array.isArray(datos.servicios) ? datos.servicios : []).map(String).filter((s) => nombresServ.has(s)).slice(0, 60));
    const vals = [nombre, limpiarTexto(datos.cargo, 40), celular, color, comision, comisionProd, servicios, datos.agenda === false ? 0 : 1, datos.activo === false ? 0 : 1];
    if (id) {
      const r = await env.DB.prepare('UPDATE personal SET nombre=?, cargo=?, celular=?, color=?, comision=?, comision_prod=?, servicios=?, agenda=?, activo=? WHERE id = ? AND negocio_id = ?')
        .bind(...vals, Number(id) || 0, n.id).run();
      if (!r.meta.changes) return error('No encontrado.', 404);
      return json({ ok: true, id: Number(id) });
    }
    if ((await env.DB.prepare('SELECT COUNT(*) AS n FROM personal WHERE negocio_id = ?').bind(n.id).first()).n >= 40) return error('Máximo 40 personas en el equipo.');
    const fila = await env.DB.prepare('INSERT INTO personal (nombre, cargo, celular, color, comision, comision_prod, servicios, agenda, activo, negocio_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
      .bind(...vals, n.id).first();
    return json({ ok: true, id: fila.id }, 201);
  }

  // ----- catálogo -----
  if (recurso === 'catalogo' && metodo === 'POST') {
    const no = soloDueno(); if (no) return no;
    const sv = leerItemsCatalogo(datos.servicios, 'Servicios');
    if (sv.error) return error(sv.error);
    const pd = leerItemsCatalogo(datos.productos, 'Productos');
    if (pd.error) return error(pd.error);
    await env.DB.prepare('UPDATE negocios SET servicios = ?, productos = ? WHERE id = ?').bind(JSON.stringify(sv.lista), JSON.stringify(pd.lista), n.id).run();
    return json({ ok: true, servicios: sv.lista, productos: pd.lista });
  }

  // ----- ajustes -----
  if (recurso === 'ajustes' && metodo === 'POST') {
    const no = soloDueno(); if (no) return no;
    const horario = [];
    for (let i = 0; i < 7; i++) {
      const x = Array.isArray(datos.horario) ? datos.horario[i] : null;
      if (!x) { horario.push(null); continue; }
      if (!(Array.isArray(x) && HORA.test(x[0]) && HORA.test(x[1]) && x[0] < x[1])) return error('Revisa el horario: la hora de cierre debe ser después de la de apertura.');
      horario.push([x[0], x[1]]);
    }
    const meta = centimos(datos.meta);
    if (Number.isNaN(meta)) return error('Revisa la meta del mes: solo números.');
    const metodos = (Array.isArray(datos.metodos) ? datos.metodos : []).filter((m) => METODOS.includes(m));
    if (!metodos.length) return error('Deja al menos un medio de pago.');
    const nuevo = {
      horario, intervalo: Number(datos.intervalo), reservas: !!datos.reservas, anticipacion: Number(datos.anticipacion), diasReserva: Number(datos.diasReserva),
      notaReserva: limpiarTexto(datos.notaReserva, 200), meta: meta || 0, metodos,
    };
    const valido = leerAjustes({ ajustes: JSON.stringify(nuevo) });
    await env.DB.prepare('UPDATE negocios SET ajustes = ? WHERE id = ?').bind(JSON.stringify(valido), n.id).run();
    return json({ ok: true, ajustes: valido });
  }

  if (recurso === 'clave' && metodo === 'POST') {
    const no = soloDueno(); if (no) return no;
    const clave = String(datos.clave || '');
    if (clave.length < 8) return error('La clave del dueño debe tener al menos 8 caracteres.');
    if (n.clave_hash && (await verificarClave(clave, n.clave_hash))) return error('Usa una clave distinta a la del panel de caja: esa la conoce tu equipo.');
    const fila = await env.DB.prepare('UPDATE negocios SET clave_dueno = ?, clave_dueno_ver = clave_dueno_ver + 1 WHERE id = ? RETURNING clave_dueno_ver')
      .bind(await hashClave(clave), n.id).first();
    // Quien la cambió sigue adentro como dueño; las demás sesiones de dueño se cierran.
    if (h.sesion.r === 'admin') return json({ ok: true });
    const s = await crearSesion(env, { r: 'staff', n: n.id, v: n.clave_ver, d: fila.clave_dueno_ver });
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('sesion', s, { maxAge: DURACION_SESION }) });
  }

  return error('No encontrado.', 404);
}

/** El dueño: el administrador, quien entró con la clave del dueño o, si el negocio no tiene clave del dueño, la del panel. */
export function esDueno(s, n) {
  if (!s) return false;
  if (s.r === 'admin') return true;
  if (s.r !== 'staff' || s.n !== n.id || s.v !== n.clave_ver) return false;
  return n.clave_dueno ? s.d === n.clave_dueno_ver : true;
}

// ---------- reserva en línea (pública: /slug/reservar) ----------
export const reservasActivas = (n) => !!n.gestion && !n.suspendido && leerAjustes(n).reservas;

/** Servicios que se pueden reservar: los que tienen duración (o todos, con la duración del intervalo). */
function serviciosReserva(n, aj) {
  return leerServicios(n).map((s) => ({ n: s.n, p: s.p, d: s.d || aj.intervalo }));
}

export async function apiReserva(req, env, n, partes, url, datos) {
  if (!reservasActivas(n)) return error('Este negocio no recibe reservas en línea por ahora.', 404);
  const aj = leerAjustes(n);
  const ahora = ahoraLima();
  const [accion] = partes;
  const eq = (await equipo(env, n)).filter((p) => p.agenda);
  const servicios = serviciosReserva(n, aj);

  if (accion === 'opciones' && req.method === 'GET') {
    const dias = Array.from({ length: aj.diasReserva }, (_, i) => { const d = sumarDias(ahora.dia, i); return { dia: d, abierto: !!aj.horario[diaSemana(d)] }; });
    return json({ servicios, equipo: eq.map((p) => ({ id: p.id, nombre: p.nombre, cargo: p.cargo, servicios: p.servicios })), dias, nota: aj.notaReserva });
  }

  const leer = (d) => {
    const s = servicios.find((x) => x.n === d.servicio);
    const dia = String(d.dia || '');
    const personalId = d.personal ? Number(d.personal) : null;
    if (!s) return { error: 'Elige el servicio.' };
    if (!diaValido(dia) || dia < ahora.dia || diasEntre(ahora.dia, dia) >= aj.diasReserva) return { error: 'Elige un día de la lista.' };
    if (personalId && !eq.some((p) => p.id === personalId)) return { error: 'Elige quién te atiende.' };
    return { s, dia, personalId };
  };

  if (accion === 'horas' && req.method === 'GET') {
    const r = leer(Object.fromEntries(url.searchParams));
    if (r.error) return error(r.error);
    const horas = await horasLibres(env, n, aj, { dia: r.dia, dur: r.s.d, servicio: r.s.n, personalId: r.personalId });
    return json({ horas: horas.map((x) => x.hora) });
  }

  if (!accion && req.method === 'POST') {
    const r = leer(datos);
    if (r.error) return error(r.error);
    const nombre = limpiarTexto(datos.nombre, 60), celular = celularPeru(datos.celular);
    if (nombre.length < 2) return error('Escribe tu nombre.');
    if (!celular) return error('Revisa tu celular: deben ser 9 dígitos y empezar con 9.');
    if (!(datos.acepta === true || datos.acepta === '1')) return error('Para reservar debes aceptar el aviso de privacidad.');
    if (!HORA.test(String(datos.hora || ''))) return error('Elige la hora.');
    if (!(await limitar(env, `res:${n.id}:${ip(req)}`, 10, 3600))) return error('Demasiadas reservas desde esta conexión. Intenta más tarde.', 429);
    const pendientes = await env.DB.prepare(`SELECT COUNT(*) AS n FROM citas WHERE negocio_id = ? AND celular = ? AND dia >= ? AND origen = 'web' AND estado IN ('pendiente', 'confirmada')`)
      .bind(n.id, celular, ahora.dia).first();
    if (pendientes.n >= 3) return error('Ya tienes 3 reservas pendientes. Escríbenos por WhatsApp si necesitas otra.', 409);
    const libres = await horasLibres(env, n, aj, { dia: r.dia, dur: r.s.d, servicio: r.s.n, personalId: r.personalId });
    const hueco = libres.find((x) => x.hora === datos.hora);
    if (!hueco) return error('Esa hora se acaba de ocupar. Elige otra.', 409);
    // «Cualquiera»: quien tenga menos citas ese día.
    let personal = hueco.personal[0];
    if (!r.personalId && hueco.personal.length > 1) {
      const cargas = new Map((await env.DB.prepare(`SELECT personal_id, COUNT(*) AS n FROM citas WHERE negocio_id = ? AND dia = ? AND estado IN ${OCUPAN} GROUP BY personal_id`).bind(n.id, r.dia).all()).results.map((x) => [x.personal_id, x.n]));
      personal = [...hueco.personal].sort((a, b) => (cargas.get(a) || 0) - (cargas.get(b) || 0))[0];
    }
    const cliente = await env.DB.prepare('SELECT id FROM clientes WHERE negocio_id = ? AND celular = ?').bind(n.id, celular).first();
    const ini = aMin(datos.hora), fin = ini + r.s.d;
    // Se inserta solo si el horario sigue libre (dos personas reservando a la vez).
    const fila = await env.DB.prepare(
      `INSERT INTO citas (negocio_id, dia, hora, dur, personal_id, cliente_id, nombre, celular, servicio, precio, estado, origen)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'pendiente', 'web'
       WHERE NOT EXISTS (SELECT 1 FROM citas WHERE negocio_id = ?1 AND dia = ?2 AND estado IN ${OCUPAN}
         AND (?5 IS NULL OR personal_id = ?5 OR personal_id IS NULL) AND ${MIN_SQL} < ?12 AND ?11 < ${MIN_SQL} + dur)
       RETURNING id`
    ).bind(n.id, r.dia, datos.hora, r.s.d, personal, cliente ? cliente.id : null, nombre, celular, r.s.n, r.s.p, ini, fin).first();
    if (!fila) return error('Esa hora se acaba de ocupar. Elige otra.', 409);
    let wa = '';
    try { wa = JSON.parse(n.redes || '{}').whatsapp || ''; } catch { wa = ''; }
    return json({
      ok: true,
      cita: { dia: r.dia, hora: datos.hora, servicio: r.s.n, precio: r.s.p, personal: personal ? eq.find((p) => p.id === personal)?.nombre || '' : '' },
      whatsapp: wa,
    }, 201);
  }
  return error('No encontrado.', 404);
}

