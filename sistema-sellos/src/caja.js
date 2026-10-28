// Cuadre de caja: se abre con un fondo en efectivo, se anota la plata que se saca o se agrega y se cierra contando
// lo que hay (arqueo). El sistema calcula cuánto efectivo debería haber —fondo + ventas y cobros de fiados en efectivo
// + entradas − gastos en efectivo − salidas— y muestra si cuadra, falta o sobra. Los demás medios (Yape, Plin, tarjeta)
// se listan para revisarlos contra la app o el voucher. Quien no es el dueño cuenta «a ciegas»: no ve lo esperado
// hasta cerrar, así cuenta de verdad. Sirve igual para comercios y para negocios de servicios.
import { json, error, limpiarTexto } from './util.js';
import { ahoraLima, centimos, leerAjustes, leerJson, MES, limitesMes } from './gestion.js';

const ahoraUtc = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
// Billetes y monedas del Perú, en céntimos: para contar la caja por denominación.
export const DENOMINACIONES = [20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10];

/** Lo que pasó en el turno: las ventas, cobros y gastos registrados desde que se abrió (id mayor que la marca de la
 *  apertura) y con fecha del turno, así una venta cargada con fecha de días pasados no entra en la caja de hoy. */
export async function resumenTurno(env, n, c) {
  const m0 = leerJson(c.marcas, {});
  const [v, ab, g, m] = await env.DB.batch([
    env.DB.prepare(`SELECT metodo, COUNT(*) AS n, COALESCE(SUM(total), 0) AS total FROM ventas
      WHERE negocio_id = ? AND anulada = 0 AND id > ? AND dia >= ? GROUP BY metodo`).bind(n.id, m0.v || 0, c.dia),
    env.DB.prepare(`SELECT metodo, COUNT(*) AS n, COALESCE(SUM(monto), 0) AS total FROM abonos
      WHERE negocio_id = ? AND id > ? AND dia >= ? GROUP BY metodo`).bind(n.id, m0.a || 0, c.dia),
    env.DB.prepare(`SELECT metodo, COUNT(*) AS n, COALESCE(SUM(monto), 0) AS total FROM gastos
      WHERE negocio_id = ? AND id > ? AND dia >= ? GROUP BY metodo`).bind(n.id, m0.g || 0, c.dia),
    env.DB.prepare('SELECT tipo, COALESCE(SUM(monto), 0) AS total FROM caja_movimientos WHERE caja_id = ? GROUP BY tipo').bind(c.id),
  ]);
  const de = (res, metodo) => res.results.find((x) => x.metodo === metodo)?.total || 0;
  const metodos = new Map();
  for (const x of v.results) metodos.set(x.metodo, { n: x.metodo, ventas: x.n, total: x.total, cobros: 0 });
  for (const x of ab.results) { const a = metodos.get(x.metodo) || { n: x.metodo, ventas: 0, total: 0, cobros: 0 }; a.cobros = x.total; metodos.set(x.metodo, a); }
  const entradas = m.results.find((x) => x.tipo === 'entrada')?.total || 0;
  const salidas = m.results.find((x) => x.tipo === 'salida')?.total || 0;
  const r = {
    fondo: c.fondo, ventasEfectivo: de(v, 'Efectivo'), cobrosEfectivo: de(ab, 'Efectivo'), gastosEfectivo: de(g, 'Efectivo'), entradas, salidas,
    ventas: v.results.reduce((t, x) => t + x.n, 0), vendido: v.results.reduce((t, x) => t + x.total, 0), fiado: de(v, 'Fiado'),
    gastos: g.results.reduce((t, x) => t + x.total, 0),
    metodos: [...metodos.values()].filter((x) => x.n !== 'Fiado').sort((a, b) => (b.n === 'Efectivo') - (a.n === 'Efectivo') || b.total - a.total),
  };
  r.esperado = r.fondo + r.ventasEfectivo + r.cobrosEfectivo + r.entradas - r.gastosEfectivo - r.salidas;
  return r;
}

function cajaJson(c, conDetalle = true) {
  return {
    id: c.id, estado: c.estado, dia: c.dia, hora: c.hora, abrio: c.abrio, fondo: c.fondo,
    cierreDia: c.cierre_dia, cierreHora: c.cierre_hora, cerro: c.cerro, esperado: c.esperado, contado: c.contado, diferencia: c.diferencia, dejado: c.dejado,
    nota: c.nota, ...(conDetalle ? { detalle: leerJson(c.detalle, {}) } : {}),
  };
}

const quienEs = (h) => (h.empleado ? h.empleado.nombre : h.sesion && h.sesion.r === 'admin' ? 'Administrador' : h.dueno ? 'Dueño' : 'Caja');

/** El número de WhatsApp del negocio (para mandarle el cierre al dueño). */
async function whatsappDe(env, n) {
  let wa = '';
  try { wa = JSON.parse(n.redes || '{}').whatsapp || ''; } catch { wa = ''; }
  return wa || (await env.DB.prepare('SELECT celular FROM cuentas WHERE negocio_id = ? LIMIT 1').bind(n.id).first())?.celular || '';
}

export const cajaAbierta = (env, n) => env.DB.prepare(`SELECT * FROM cajas WHERE negocio_id = ? AND estado = 'abierta'`).bind(n.id).first();

/** Faltantes y sobrantes de caja de un mes (para el análisis del mes). */
export async function cuadresDelMes(env, n, desde, hasta) {
  const f = await env.DB.prepare(`SELECT COUNT(*) AS cierres, COALESCE(SUM(CASE WHEN diferencia < 0 THEN -diferencia ELSE 0 END), 0) AS faltante,
    COALESCE(SUM(CASE WHEN diferencia > 0 THEN diferencia ELSE 0 END), 0) AS sobrante, COALESCE(SUM(CASE WHEN diferencia < 0 THEN 1 ELSE 0 END), 0) AS conFaltante
    FROM cajas WHERE negocio_id = ? AND estado = 'cerrada' AND cierre_dia BETWEEN ? AND ?`).bind(n.id, desde, hasta).first();
  return f;
}

/** Rutas /api/n/slug/g/caja…; devuelve null si la ruta no es de la caja. */
export async function apiCaja(req, env, n, partes, url, h, datos) {
  const [recurso, id, sub] = partes;
  if (recurso !== 'caja') return null;
  const metodo = req.method;
  const ahora = ahoraLima();
  if (!leerAjustes(n).funciones.cuadre) return error('Activa «Cuadre de caja» en Ajustes → Funciones.', 403);

  if (!id && metodo === 'GET') {
    const c = await cajaAbierta(env, n);
    const ultima = await env.DB.prepare(`SELECT * FROM cajas WHERE negocio_id = ? AND estado = 'cerrada' ORDER BY id DESC LIMIT 1`).bind(n.id).first();
    let abierta = null;
    if (c) {
      const r = await resumenTurno(env, n, c);
      const movimientos = (await env.DB.prepare('SELECT * FROM caja_movimientos WHERE caja_id = ? ORDER BY id DESC').bind(c.id).all()).results
        .map((x) => ({ id: x.id, tipo: x.tipo, monto: x.monto, motivo: x.motivo, hora: x.hora, quien: x.quien }));
      // A ciegas: quien no es el dueño ve cuánto vendió, pero no cuánto efectivo debería haber.
      abierta = { ...cajaJson(c, false), movimientos, resumen: h.dueno ? r : { ventas: r.ventas, metodos: r.metodos.filter((x) => x.n !== 'Efectivo') }, deAyer: c.dia < ahora.dia };
    }
    const mes = MES.test(url.searchParams.get('mes') || '') ? url.searchParams.get('mes') : ahora.dia.slice(0, 7);
    const { desde, hasta } = limitesMes(mes);
    const historial = h.dueno
      ? (await env.DB.prepare(`SELECT * FROM cajas WHERE negocio_id = ? AND estado = 'cerrada' AND cierre_dia BETWEEN ? AND ? ORDER BY id DESC LIMIT 100`).bind(n.id, desde, hasta).all()).results.map((x) => cajaJson(x, false))
      : [];
    return json({
      abierta, ciego: !h.dueno, sugerido: ultima ? ultima.dejado || 0 : 0, hoy: ahora.dia, mes, historial,
      ultima: ultima && (h.dueno || ultima.cierre_dia === ahora.dia) ? cajaJson(ultima, false) : null,
      resumenMes: h.dueno ? await cuadresDelMes(env, n, desde, hasta) : null, denominaciones: DENOMINACIONES,
    });
  }

  if (id === 'abrir' && metodo === 'POST') {
    if (await cajaAbierta(env, n)) return error('La caja ya está abierta.', 409);
    const fondo = datos.fondo === '' || datos.fondo === undefined ? 0 : centimos(datos.fondo);
    if (fondo === null || Number.isNaN(fondo)) return error('Escribe con cuánto efectivo empiezas (puede ser 0).');
    const [v, a, g] = (await env.DB.batch(['ventas', 'abonos', 'gastos'].map((t) => env.DB.prepare(`SELECT COALESCE(MAX(id), 0) AS m FROM ${t}`)))).map((x) => x.results[0].m);
    try {
      await env.DB.prepare('INSERT INTO cajas (negocio_id, dia, hora, abrio, fondo, marcas) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(n.id, ahora.dia, ahora.hora, quienEs(h), fondo, JSON.stringify({ v, a, g })).run();
    } catch {
      return error('La caja ya está abierta.', 409); // otra persona la abrió al mismo tiempo
    }
    return json({ ok: true }, 201);
  }

  if (id === 'movimiento' && metodo === 'POST') {
    const c = await cajaAbierta(env, n);
    if (!c) return error('Primero abre la caja.', 409);
    const tipo = datos.tipo === 'entrada' ? 'entrada' : datos.tipo === 'salida' ? 'salida' : null;
    if (!tipo) return error('Elige si sacas o agregas dinero.');
    const monto = centimos(datos.monto);
    if (!monto || Number.isNaN(monto)) return error('Escribe el monto.');
    const motivo = limpiarTexto(datos.motivo, 80);
    if (tipo === 'salida' && !motivo) return error('Escribe para qué sacas el dinero (por ejemplo: depósito al banco).');
    if (tipo === 'salida' && monto > (await resumenTurno(env, n, c)).esperado) return error('No hay tanto efectivo en la caja.');
    await env.DB.prepare('INSERT INTO caja_movimientos (negocio_id, caja_id, tipo, monto, motivo, hora, quien) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(n.id, c.id, tipo, monto, motivo, ahora.hora, quienEs(h)).run();
    return json({ ok: true }, 201);
  }

  if (id === 'cerrar' && metodo === 'POST') {
    const c = await cajaAbierta(env, n);
    if (!c) return error('La caja ya está cerrada.', 409);
    // Conteo por billetes y monedas (opcional) o el total contado.
    const billetes = {};
    let porBilletes = 0;
    for (const d of DENOMINACIONES) {
      const k = Number(datos.billetes && datos.billetes[d]);
      if (k > 0 && Number.isInteger(k) && k < 100000) { billetes[d] = k; porBilletes += d * k; }
    }
    const vacio = datos.contado === '' || datos.contado === undefined || datos.contado === null;
    const contado = Object.keys(billetes).length ? porBilletes : vacio ? null : centimos(datos.contado);
    if (contado === null || Number.isNaN(contado)) return error('Cuenta el efectivo y escribe cuánto hay.');
    const dejado = datos.dejado === '' || datos.dejado === undefined ? 0 : centimos(datos.dejado);
    if (Number.isNaN(dejado) || dejado > contado) return error('Lo que dejas para el siguiente turno no puede ser más que lo contado.');
    const hasta = ahoraUtc();
    const r = await resumenTurno(env, n, c);
    const movimientos = (await env.DB.prepare('SELECT tipo, monto, motivo, hora, quien FROM caja_movimientos WHERE caja_id = ? ORDER BY id').bind(c.id).all()).results;
    const diferencia = contado - r.esperado;
    const upd = await env.DB.prepare(`UPDATE cajas SET estado = 'cerrada', cerrada_en = ?, cierre_dia = ?, cierre_hora = ?, cerro = ?, esperado = ?, contado = ?, diferencia = ?, dejado = ?, detalle = ?, nota = ?
      WHERE id = ? AND estado = 'abierta'`).bind(hasta, ahora.dia, ahora.hora, quienEs(h), r.esperado, contado, diferencia, dejado,
      JSON.stringify({ ...r, movimientos, billetes }), limpiarTexto(datos.nota, 200), c.id).run();
    if (!upd.meta.changes) return error('La caja ya está cerrada.', 409);
    const cerrada = await env.DB.prepare('SELECT * FROM cajas WHERE id = ?').bind(c.id).first();
    return json({ ok: true, caja: cajaJson(cerrada), whatsapp: await whatsappDe(env, n) });
  }

  if (/^\d+$/.test(id || '') && !sub && metodo === 'GET') {
    const c = await env.DB.prepare(`SELECT * FROM cajas WHERE id = ? AND negocio_id = ? AND estado = 'cerrada'`).bind(Number(id), n.id).first();
    if (!c) return error('No encontrado.', 404);
    if (!h.dueno && c.cierre_dia !== ahora.dia) return error('Solo el dueño puede ver cierres de otros días.', 403);
    return json({ caja: cajaJson(c), whatsapp: await whatsappDe(env, n) });
  }

  // Reabrir el último cierre (se cerró por error). Solo el dueño y si no hay otra caja abierta.
  if (/^\d+$/.test(id || '') && sub === 'reabrir' && metodo === 'POST') {
    if (!h.dueno) return error('Solo el dueño puede reabrir la caja.', 403);
    if (await cajaAbierta(env, n)) return error('Ya hay una caja abierta.', 409);
    const ultima = await env.DB.prepare(`SELECT id FROM cajas WHERE negocio_id = ? AND estado = 'cerrada' ORDER BY id DESC LIMIT 1`).bind(n.id).first();
    if (!ultima || ultima.id !== Number(id)) return error('Solo se puede reabrir el último cierre.', 409);
    await env.DB.prepare(`UPDATE cajas SET estado = 'abierta', cerrada_en = NULL, cierre_dia = NULL, cierre_hora = NULL, cerro = '', esperado = NULL, contado = NULL, diferencia = NULL, dejado = NULL, detalle = '{}' WHERE id = ?`).bind(ultima.id).run();
    return json({ ok: true });
  }

  return error('No encontrado.', 404);
}
