// Comercio: bodegas, minimarkets, ferreterías, tiendas de ropa, zapaterías, florerías, licorerías, librerías...
// Inventario con variantes (talla, color) y recetas (insumos), ventas con costo y ganancia real, fiados (lo que los
// clientes deben), proveedores y compras (lo que el negocio debe). Montos en céntimos; cantidades con hasta 3 decimales (kg, litros).
// Se usa cuando el rubro del negocio es de comercio (src/gestion.js RUBROS). Lo demás (clientes, gastos, equipo) es de src/gestion.js.
import { json, error, texto, limpiarTexto, celularPeru, celularVisible, nuevoToken } from './util.js';
import {
  METODOS, leerAjustes, ahoraLima, leerJson, centimos, diasEntre, limitesMes, diaValido, MES,
  mapaNombres, clienteDe, ventaJson, finanzas, celdaCsv, primerosPasos,
} from './gestion.js';

export const UNIDADES = ['unidad', 'kg', 'litro', 'metro', 'paquete', 'caja', 'docena', 'servicio'];
const cantidad = (v) => { const x = Math.round(Number(String(v ?? '').replace(',', '.')) * 1000) / 1000; return Number.isFinite(x) && x > 0 && x <= 99999 ? x : null; };
const redondear = (x) => Math.round(x * 1000) / 1000;

function articulo(r) {
  return {
    id: r.id, padre: r.padre, nombre: r.nombre, variante: r.variante, codigo: r.codigo, categoria: r.categoria, unidad: r.unidad,
    precio: r.precio, costo: r.costo, stock: r.stock, minimo: r.minimo, controla: !!r.controla, receta: leerJson(r.receta, []),
  };
}
const nombreArticulo = (r, padre) => (padre ? `${padre.nombre} — ${r.variante}` : r.nombre);

/** Filas de artículos por id (y sus padres e insumos), del negocio. */
async function cargarArticulos(env, n, ids) {
  const mapa = new Map();
  let pendientes = [...new Set(ids.filter(Boolean).map(Number))];
  for (let vuelta = 0; vuelta < 3 && pendientes.length; vuelta++) {
    const nuevos = [];
    for (let i = 0; i < pendientes.length; i += 90) {
      const parte = pendientes.slice(i, i + 90);
      const filas = (await env.DB.prepare(`SELECT * FROM articulos WHERE negocio_id = ? AND id IN (${parte.map(() => '?').join(',')})`).bind(n.id, ...parte).all()).results;
      for (const f of filas) {
        mapa.set(f.id, f);
        if (f.padre && !mapa.has(f.padre)) nuevos.push(f.padre);
        for (const r of leerJson(f.receta, [])) if (!mapa.has(Number(r.a))) nuevos.push(Number(r.a));
      }
    }
    pendientes = [...new Set(nuevos)];
  }
  return mapa;
}
const tieneVariantes = async (env, n, ids) => {
  if (!ids.length) return new Set();
  const filas = (await env.DB.prepare(`SELECT DISTINCT padre FROM articulos WHERE negocio_id = ? AND activo = 1 AND padre IN (${ids.map(() => '?').join(',')})`).bind(n.id, ...ids).all()).results;
  return new Set(filas.map((f) => f.padre));
};

/** Costo unitario de un artículo: el suyo, el de su producto (variante) o la suma de sus insumos (receta). */
function costoDe(r, mapa) {
  const receta = leerJson(r.receta, []);
  if (receta.length) return Math.round(receta.reduce((t, x) => t + (mapa.get(Number(x.a))?.costo || 0) * Number(x.c), 0));
  return r.costo || (r.padre ? mapa.get(r.padre)?.costo || 0 : 0);
}

/** Cuánto stock se mueve por vender (signo 1) o anular (-1) estos ítems: los insumos de la receta, o el artículo mismo. */
function movimientosStock(items, mapa, signo) {
  const delta = new Map();
  for (const x of items) {
    if (!x.a) continue;
    const r = mapa.get(Number(x.a));
    if (!r) continue;
    const receta = leerJson(r.receta, []);
    if (receta.length) for (const ins of receta) delta.set(Number(ins.a), (delta.get(Number(ins.a)) || 0) - signo * Number(ins.c) * x.c);
    else if (r.controla) delta.set(r.id, (delta.get(r.id) || 0) - signo * x.c);
  }
  return delta;
}
const aplicarStock = (env, n, delta) => [...delta].filter(([, d]) => d).map(([id, d]) =>
  env.DB.prepare('UPDATE articulos SET stock = ROUND(stock + ?, 3) WHERE id = ? AND negocio_id = ? AND controla = 1').bind(redondear(d), id, n.id));

/** Lo que cada cliente debe por lo que se llevó fiado, menos lo que ya abonó. */
async function porCobrar(env, n) {
  const filas = (await env.DB.prepare(
    `SELECT c.id, c.nombre, c.celular,
       (SELECT COALESCE(SUM(total), 0) FROM ventas v WHERE v.cliente_id = c.id AND v.negocio_id = ?1 AND v.metodo = 'Fiado' AND v.anulada = 0) AS fiado,
       (SELECT COALESCE(SUM(monto), 0) FROM abonos a WHERE a.cliente_id = c.id AND a.negocio_id = ?1) AS abonado,
       (SELECT MAX(dia) FROM ventas v WHERE v.cliente_id = c.id AND v.negocio_id = ?1 AND v.metodo = 'Fiado' AND v.anulada = 0) AS ultimo
     FROM clientes c WHERE c.negocio_id = ?1 AND EXISTS (SELECT 1 FROM ventas v WHERE v.cliente_id = c.id AND v.metodo = 'Fiado' AND v.anulada = 0)`
  ).bind(n.id).all()).results;
  const hoy = ahoraLima().dia;
  return filas.map((f) => ({ id: f.id, nombre: f.nombre, celular: celularVisible(f.celular), celularWa: f.celular, saldo: f.fiado - f.abonado, fiado: f.fiado, abonado: f.abonado, ultimo: f.ultimo, dias: f.ultimo ? diasEntre(f.ultimo, hoy) : 0 }))
    .filter((f) => f.saldo > 0).sort((a, b) => b.saldo - a.saldo);
}

/** Lo que el negocio le debe a cada proveedor por compras sin pagar completas. */
async function porPagar(env, n) {
  const filas = (await env.DB.prepare(
    `SELECT p.id, p.nombre, p.celular, COALESCE(SUM(c.total - c.pagado), 0) AS saldo, MIN(c.dia) AS desde, COUNT(c.id) AS compras
     FROM proveedores p JOIN compras c ON c.proveedor_id = p.id AND c.negocio_id = p.negocio_id AND c.pagado < c.total
     WHERE p.negocio_id = ? GROUP BY p.id ORDER BY saldo DESC`
  ).bind(n.id).all()).results;
  return filas.map((f) => ({ ...f, celularWa: f.celular, celular: celularVisible(f.celular) }));
}

function proveedorJson(p) {
  return { id: p.id, nombre: p.nombre, ruc: p.ruc, celular: celularVisible(p.celular), celularWa: p.celular, contacto: p.contacto, nota: p.nota, activo: !!p.activo };
}

/** Lee «nombre; precio; costo; stock; código; categoría» por línea (separado por tabulador, punto y coma o coma). */
function leerImportacion(t) {
  const lineas = String(t || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lineas.length > 1000) return { error: 'Máximo 1000 productos por vez.' };
  const out = [];
  for (const [i, l] of lineas.entries()) {
    const sep = l.includes('\t') ? '\t' : l.includes(';') ? ';' : ',';
    const c = l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ''));
    if (i === 0 && /nombre|producto/i.test(c[0]) && /precio/i.test(l)) continue; // encabezado
    const nombre = limpiarTexto(c[0], 80);
    if (!nombre) continue;
    const precio = centimos(String(c[1] || '').replace(/^S\/\s*/i, ''));
    if (precio === null || Number.isNaN(precio)) return { error: `Línea ${i + 1} («${nombre}»): revisa el precio.` };
    const costo = c[2] ? centimos(String(c[2]).replace(/^S\/\s*/i, '')) : 0;
    if (Number.isNaN(costo)) return { error: `Línea ${i + 1} («${nombre}»): revisa el costo.` };
    const stock = c[3] ? Number(String(c[3]).replace(',', '.')) : null;
    if (c[3] && !Number.isFinite(stock)) return { error: `Línea ${i + 1} («${nombre}»): revisa el stock.` };
    out.push({ nombre, precio, costo: costo || 0, stock, codigo: limpiarTexto(c[4], 40), categoria: limpiarTexto(c[5], 40) });
  }
  return { lista: out };
}

// ---------- API ----------
/** Devuelve la respuesta si la ruta es del comercio, o null para que la atienda src/gestion.js.
 *  h: lo mismo que recibe apiGestion (sesion, dueno, empleado, clientePanel, visita, CAMPOS_CLIENTE). */
export async function apiComercio(req, env, n, partes, url, h, datos) {
  const [recurso, id, sub] = partes;
  const metodo = req.method;
  const soloDueno = () => (h.dueno ? null : error('Solo el dueño puede hacer esto. Entra con la clave del dueño.', 403));
  const aj = leerAjustes(n);
  const ahora = ahoraLima();

  // ----- inventario -----
  if (recurso === 'articulos' && !id && metodo === 'GET') {
    const filas = (await env.DB.prepare('SELECT * FROM articulos WHERE negocio_id = ? AND activo = 1 ORDER BY nombre, variante LIMIT 5000').bind(n.id).all()).results;
    const categorias = [...new Set(filas.map((f) => f.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    return json({ articulos: filas.map(articulo), categorias, unidades: UNIDADES });
  }

  if (recurso === 'articulos' && metodo === 'POST' && (!id || (/^\d+$/.test(id) && !sub))) {
    const no = soloDueno(); if (no) return no;
    const nombre = limpiarTexto(datos.nombre, 80);
    if (nombre.length < 2) return error('Escribe el nombre del producto.');
    const precio = centimos(datos.precio), costo = centimos(datos.costo) || 0;
    if (precio === null || Number.isNaN(precio)) return error('Escribe el precio de venta.');
    if (Number.isNaN(costo)) return error('Revisa el costo: solo números.');
    const unidad = UNIDADES.includes(datos.unidad) ? datos.unidad : 'unidad';
    const categoria = limpiarTexto(datos.categoria, 40), codigo = limpiarTexto(datos.codigo, 40);
    const stock = datos.stock === '' || datos.stock === undefined || datos.stock === null ? 0 : Number(String(datos.stock).replace(',', '.'));
    const minimo = datos.minimo === '' || datos.minimo === undefined ? 0 : Number(String(datos.minimo).replace(',', '.'));
    if (!Number.isFinite(stock) || Math.abs(stock) > 1e6) return error('Revisa el stock.');
    if (!Number.isFinite(minimo) || minimo < 0) return error('Revisa el stock mínimo.');
    const actual = id ? await env.DB.prepare('SELECT * FROM articulos WHERE id = ? AND negocio_id = ? AND padre IS NULL').bind(Number(id) || 0, n.id).first() : null;
    if (id && !actual) return error('Ese producto ya no existe.', 404);
    // Variantes (talla, color...): cada una con su código, su stock y, si quiere, su propio precio.
    const variantes = [];
    for (const v of (Array.isArray(datos.variantes) ? datos.variantes : []).slice(0, 60)) {
      const etiqueta = limpiarTexto(v && v.v, 40);
      if (!etiqueta) continue;
      const vs = v.stock === '' || v.stock === undefined ? 0 : Number(String(v.stock).replace(',', '.'));
      const vp = v.precio === '' || v.precio === undefined ? 0 : centimos(v.precio);
      if (!Number.isFinite(vs) || Number.isNaN(vp)) return error(`Revisa la variante «${etiqueta}».`);
      if (variantes.some((x) => x.v.toLowerCase() === etiqueta.toLowerCase())) return error(`La variante «${etiqueta}» está repetida.`);
      variantes.push({ id: Number(v.id) || null, v: etiqueta, codigo: limpiarTexto(v.codigo, 40), precio: vp || 0, stock: vs, minimo: Number(v.minimo) || 0 });
    }
    // Receta: los insumos que descuenta cada venta (un jugo: 0.25 kg de fresa + 1 vaso).
    const receta = [];
    for (const r of (Array.isArray(datos.receta) ? datos.receta : []).slice(0, 30)) {
      const c = cantidad(r && r.c);
      if (!r || !r.a) continue;
      if (!c) return error('Revisa las cantidades de la receta.');
      receta.push({ a: Number(r.a), c });
    }
    if (receta.length && variantes.length) return error('Un producto no puede tener variantes y receta a la vez.');
    if (receta.length) {
      const mapa = await cargarArticulos(env, n, receta.map((r) => r.a));
      for (const r of receta) {
        const ins = mapa.get(r.a);
        if (!ins || !ins.activo || ins.id === Number(id)) return error('Un insumo de la receta ya no existe.');
        if (!ins.controla) return error(`«${ins.nombre}» no lleva stock: no puede ser insumo de una receta.`);
      }
    }
    const codigos = [codigo, ...variantes.map((v) => v.codigo)].filter(Boolean);
    if (new Set(codigos).size !== codigos.length) return error('Hay un código repetido entre las variantes.');
    for (const c of codigos) {
      const otro = await env.DB.prepare('SELECT id, nombre, padre FROM articulos WHERE negocio_id = ? AND codigo = ? AND activo = 1').bind(n.id, c).first();
      if (otro && otro.id !== Number(id) && otro.padre !== Number(id) && !variantes.some((v) => v.id === otro.id)) return error(`El código ${c} ya lo tiene «${otro.nombre}».`);
    }
    const controla = variantes.length || receta.length || datos.controla === false || unidad === 'servicio' ? 0 : 1;
    let pid;
    if (actual) {
      await env.DB.prepare('UPDATE articulos SET nombre=?, codigo=?, categoria=?, unidad=?, precio=?, costo=?, stock=?, minimo=?, controla=?, receta=? WHERE id = ?')
        .bind(nombre, variantes.length ? '' : codigo, categoria, unidad, precio, costo, controla ? redondear(stock) : 0, minimo, controla, JSON.stringify(receta), actual.id).run();
      pid = actual.id;
    } else {
      if ((await env.DB.prepare('SELECT COUNT(*) AS n FROM articulos WHERE negocio_id = ? AND activo = 1').bind(n.id).first()).n >= 5000) return error('Llegaste al máximo de 5000 productos.');
      pid = (await env.DB.prepare('INSERT INTO articulos (negocio_id, nombre, codigo, categoria, unidad, precio, costo, stock, minimo, controla, receta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
        .bind(n.id, nombre, variantes.length ? '' : codigo, categoria, unidad, precio, costo, controla ? redondear(stock) : 0, minimo, controla, JSON.stringify(receta)).first()).id;
    }
    // Variantes: se actualizan las que vienen, se crean las nuevas y se dan de baja las que ya no están.
    const sentencias = [];
    const existentes = (await env.DB.prepare('SELECT id FROM articulos WHERE negocio_id = ? AND padre = ? AND activo = 1').bind(n.id, pid).all()).results.map((r) => r.id);
    for (const v of variantes) {
      if (v.id && existentes.includes(v.id)) {
        sentencias.push(env.DB.prepare('UPDATE articulos SET nombre=?, variante=?, codigo=?, categoria=?, unidad=?, precio=?, stock=?, minimo=? WHERE id = ?')
          .bind(nombre, v.v, v.codigo, categoria, unidad, v.precio, redondear(v.stock), v.minimo, v.id));
      } else {
        sentencias.push(env.DB.prepare('INSERT INTO articulos (negocio_id, padre, nombre, variante, codigo, categoria, unidad, precio, costo, stock, minimo, controla) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1)')
          .bind(n.id, pid, nombre, v.v, v.codigo, categoria, unidad, v.precio, redondear(v.stock), v.minimo));
      }
    }
    for (const e of existentes) if (!variantes.some((v) => v.id === e)) sentencias.push(env.DB.prepare('UPDATE articulos SET activo = 0 WHERE id = ?').bind(e));
    if (sentencias.length) await env.DB.batch(sentencias);
    return json({ ok: true, id: pid }, actual ? 200 : 201);
  }

  if (recurso === 'articulos' && id && sub === 'borrar' && metodo === 'POST') {
    const no = soloDueno(); if (no) return no;
    // Se da de baja (sus ventas pasadas se conservan) junto con sus variantes.
    await env.DB.prepare('UPDATE articulos SET activo = 0 WHERE negocio_id = ? AND (id = ? OR padre = ?)').bind(n.id, Number(id) || 0, Number(id) || 0).run();
    return json({ ok: true });
  }

  if (recurso === 'articulos' && id === 'importar' && metodo === 'POST') {
    const no = soloDueno(); if (no) return no;
    const r = leerImportacion(datos.texto);
    if (r.error) return error(r.error);
    if (!r.lista.length) return error('Pega al menos un producto: nombre; precio; costo; stock; código; categoría.');
    const existentes = (await env.DB.prepare('SELECT id, nombre, codigo FROM articulos WHERE negocio_id = ? AND activo = 1 AND padre IS NULL').bind(n.id).all()).results;
    const porCodigo = new Map(existentes.filter((x) => x.codigo).map((x) => [x.codigo, x.id]));
    const porNombre = new Map(existentes.map((x) => [x.nombre.toLowerCase(), x.id]));
    let nuevos = 0, actualizados = 0;
    const sentencias = r.lista.map((x) => {
      const ya = (x.codigo && porCodigo.get(x.codigo)) || porNombre.get(x.nombre.toLowerCase());
      if (ya) {
        actualizados++;
        return env.DB.prepare(`UPDATE articulos SET precio = ?, costo = CASE WHEN ? > 0 THEN ? ELSE costo END, stock = COALESCE(?, stock),
          codigo = CASE WHEN ? != '' THEN ? ELSE codigo END, categoria = CASE WHEN ? != '' THEN ? ELSE categoria END WHERE id = ?`)
          .bind(x.precio, x.costo, x.costo, x.stock, x.codigo, x.codigo, x.categoria, x.categoria, ya);
      }
      nuevos++;
      return env.DB.prepare('INSERT INTO articulos (negocio_id, nombre, codigo, categoria, precio, costo, stock) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(n.id, x.nombre, x.codigo, x.categoria, x.precio, x.costo, x.stock ?? 0);
    });
    if (existentes.length + nuevos > 5000) return error('Con esta importación pasarías el máximo de 5000 productos.');
    for (let i = 0; i < sentencias.length; i += 50) await env.DB.batch(sentencias.slice(i, i + 50));
    return json({ ok: true, nuevos, actualizados });
  }

  if (recurso === 'inventario.csv' && metodo === 'GET') {
    const no = soloDueno(); if (no) return no;
    const filas = (await env.DB.prepare(`SELECT a.*, p.nombre AS pnombre FROM articulos a LEFT JOIN articulos p ON p.id = a.padre
      WHERE a.negocio_id = ? AND a.activo = 1 AND NOT EXISTS (SELECT 1 FROM articulos h WHERE h.padre = a.id AND h.activo = 1) ORDER BY a.nombre, a.variante`).bind(n.id).all()).results;
    const s2 = (c) => (c / 100).toFixed(2);
    const lineas = [['producto', 'variante', 'codigo', 'categoria', 'unidad', 'precio', 'costo', 'stock', 'stock_minimo', 'valor_al_costo'].map(celdaCsv).join(',')];
    for (const a of filas) lineas.push([a.nombre, a.variante, a.codigo, a.categoria, a.unidad, s2(a.precio), s2(a.costo), a.controla ? a.stock : '', a.controla ? a.minimo : '', a.controla ? s2(Math.max(0, a.stock) * a.costo) : ''].map(celdaCsv).join(','));
    return texto('﻿' + lineas.join('\r\n'), 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="inventario-${n.slug}-${ahora.dia}.csv"` });
  }

  // ----- vender -----
  if (recurso === 'ventas' && !id && metodo === 'POST') {
    const lista = (Array.isArray(datos.items) ? datos.items : []).slice(0, 60);
    const mapa = await cargarArticulos(env, n, lista.map((x) => x && x.a));
    const conVariantes = await tieneVariantes(env, n, lista.filter((x) => x && x.a).map((x) => Number(x.a)));
    const items = [];
    for (const x of lista) {
      if (!x) continue;
      const c = cantidad(x.c ?? 1);
      if (!c) return error(`Revisa la cantidad de «${x.n || 'un producto'}».`);
      if (x.a) {
        const r = mapa.get(Number(x.a));
        if (!r || !r.activo) return error('Un producto del carrito ya no existe. Quítalo y vuelve a agregarlo.');
        if (conVariantes.has(r.id)) return error(`Elige la talla o variante de «${r.nombre}».`);
        const padre = r.padre ? mapa.get(r.padre) : null;
        const precioCat = r.precio || (padre ? padre.precio : 0);
        const p = x.p === undefined || x.p === '' || x.p === null ? precioCat : centimos(x.p);
        if (p === null || Number.isNaN(p)) return error(`Revisa el precio de «${r.nombre}».`);
        items.push({ n: nombreArticulo(r, padre), t: 'p', a: r.id, p, c, k: costoDe(r, mapa) });
      } else {
        const nombre = limpiarTexto(x.n, 60), p = centimos(x.p);
        if (!nombre) continue;
        if (p === null || Number.isNaN(p)) return error(`Revisa el precio de «${nombre}».`);
        items.push({ n: nombre, t: 's', p, c });
      }
    }
    if (!items.length) return error('Agrega al menos un producto.');
    const linea = (x) => Math.round(x.p * x.c);
    const servicios = items.filter((x) => x.t !== 'p').reduce((t, x) => t + linea(x), 0);
    const productos = items.filter((x) => x.t === 'p').reduce((t, x) => t + linea(x), 0);
    const descuento = centimos(datos.descuento) || 0;
    if (Number.isNaN(descuento) || descuento > servicios + productos) return error('El descuento no puede ser mayor que el total.');
    const total = servicios + productos - descuento;
    const costo = Math.round(items.reduce((t, x) => t + (x.k || 0) * x.c, 0));
    const fiado = datos.metodo === 'Fiado';
    if (fiado && !aj.fiado) return error('Activa el fiado en Ajustes para vender a crédito.');
    const metodoPago = fiado ? 'Fiado' : METODOS.includes(datos.metodo) ? datos.metodo : null;
    if (!metodoPago) return error('Elige cómo pagó.');
    const personal = datos.personal_id ? Number(datos.personal_id) : h.empleado ? h.empleado.id : null;
    if (personal && !(await env.DB.prepare('SELECT 1 FROM personal WHERE id = ? AND negocio_id = ?').bind(personal, n.id).first())) return error('Elige quién vendió.');
    let dia = ahora.dia, hora = ahora.hora;
    if (h.dueno && datos.dia && datos.dia !== ahora.dia) {
      if (!diaValido(datos.dia) || datos.dia > ahora.dia || diasEntre(datos.dia, ahora.dia) > 60) return error('La fecha debe ser de hoy o de los últimos 60 días.');
      dia = datos.dia; hora = '12:00';
    }
    // Fiado: se le anota la deuda al cliente, así que tiene que estar registrado (con su celular, para recordarle).
    const cli = await clienteDe(env, n, fiado && !datos.cliente_id ? { ...datos, tarjeta: true } : datos);
    if (cli.error) return error(cli.error);
    if (fiado && !cli.id) return error('Para fiar, elige al cliente o regístralo con su nombre y celular.');
    const token = nuevoToken();
    const [fila] = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO ventas (negocio_id, dia, hora, cliente_id, nombre, personal_id, items, servicios, productos, descuento, total, costo, metodo, nota, token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
      ).bind(n.id, dia, hora, cli.id, cli.nombre || '', personal, JSON.stringify(items), servicios, productos, descuento, total, costo, metodoPago, limpiarTexto(datos.nota, 200), token),
      ...aplicarStock(env, n, movimientosStock(items, mapa, 1)),
    ]);
    let tarjeta = null;
    if (cli.id && datos.sello !== false && dia === ahora.dia) {
      const c = await env.DB.prepare(`SELECT ${h.CAMPOS_CLIENTE} FROM clientes WHERE id = ?`).bind(cli.id).first();
      const aviso = await h.visita(c, total || null, items.map((x) => x.n).join(' + ').slice(0, 200));
      const nuevo = await env.DB.prepare(`SELECT ${h.CAMPOS_CLIENTE} FROM clientes WHERE id = ?`).bind(cli.id).first();
      tarjeta = { aviso, cliente: h.clientePanel(nuevo) };
    }
    return json({ ok: true, id: fila.results[0].id, total, token, tarjeta, celular: cli.celular || '' }, 201);
  }

  if (recurso === 'ventas' && id && sub === 'anular' && metodo === 'POST') {
    const v = await env.DB.prepare('SELECT * FROM ventas WHERE id = ? AND negocio_id = ?').bind(Number(id) || 0, n.id).first();
    if (!v) return error('Esa venta ya no existe.', 404);
    if (v.anulada) return error('Esa venta ya está anulada.', 409);
    if (!h.dueno && v.dia !== ahora.dia) return error('Solo el dueño puede anular ventas de otros días.', 403);
    const items = leerJson(v.items, []);
    const mapa = await cargarArticulos(env, n, items.map((x) => x.a));
    const [upd] = await env.DB.batch([env.DB.prepare('UPDATE ventas SET anulada = 1 WHERE id = ? AND anulada = 0').bind(v.id)]);
    if (upd.meta.changes) {
      const st = aplicarStock(env, n, movimientosStock(items, mapa, -1));
      if (st.length) await env.DB.batch(st);
    }
    return json({ ok: true });
  }

  // Caja del día: ventas, abonos de fiados y gastos.
  if (recurso === 'ventas' && !id && metodo === 'GET') {
    const dia = h.dueno && diaValido(url.searchParams.get('dia')) ? url.searchParams.get('dia') : ahora.dia;
    const nombres = await mapaNombres(env, n);
    const [ventas, gastos, abonos] = await env.DB.batch([
      env.DB.prepare('SELECT * FROM ventas WHERE negocio_id = ? AND dia = ? ORDER BY hora DESC, id DESC').bind(n.id, dia),
      env.DB.prepare('SELECT * FROM gastos WHERE negocio_id = ? AND dia = ? ORDER BY id DESC').bind(n.id, dia),
      env.DB.prepare('SELECT a.*, c.nombre FROM abonos a LEFT JOIN clientes c ON c.id = a.cliente_id WHERE a.negocio_id = ? AND a.dia = ? ORDER BY a.id DESC').bind(n.id, dia),
    ]);
    const validas = ventas.results.filter((v) => !v.anulada);
    const porMetodo = new Map();
    for (const v of validas) porMetodo.set(v.metodo, (porMetodo.get(v.metodo) || 0) + v.total);
    const efectivo = (lista, campo) => lista.filter((x) => x.metodo === 'Efectivo').reduce((t, x) => t + x[campo], 0);
    return json({
      dia, hoy: ahora.dia,
      ventas: ventas.results.map((v) => ({ ...ventaJson(v, nombres), costo: v.costo, token: v.token })),
      gastos: gastos.results.map((g) => ({ id: g.id, categoria: g.categoria, detalle: g.detalle, monto: g.monto, metodo: g.metodo })),
      abonos: abonos.results.map((a) => ({ id: a.id, nombre: a.nombre || 'Cliente', monto: a.monto, metodo: a.metodo, hora: a.hora })),
      resumen: {
        total: validas.reduce((t, v) => t + v.total, 0), ventas: validas.length,
        ganancia: validas.reduce((t, v) => t + v.total - v.costo, 0),
        metodos: [...porMetodo].map(([k, v]) => ({ n: k, total: v })).sort((a, b) => b.total - a.total),
        gastos: gastos.results.reduce((t, g) => t + g.monto, 0), cobrado: abonos.results.reduce((t, a) => t + a.monto, 0),
        efectivoCaja: efectivo(validas, 'total') + efectivo(abonos.results, 'monto') - efectivo(gastos.results, 'monto'),
      },
    });
  }

  // ----- deudas: fiados (te deben) y proveedores (debes) -----
  if (recurso === 'deudas' && metodo === 'GET') {
    const clientes = await porCobrar(env, n);
    const proveedores = h.dueno ? await porPagar(env, n) : [];
    return json({
      clientes, proveedores, porCobrar: clientes.reduce((t, c) => t + c.saldo, 0), porPagar: proveedores.reduce((t, p) => t + p.saldo, 0),
      negocio: n.nombre,
    });
  }

  if (recurso === 'abonos' && metodo === 'POST') {
    const cid = Number(datos.cliente_id) || 0;
    const deuda = (await porCobrar(env, n)).find((c) => c.id === cid);
    if (!deuda) return error('Ese cliente no tiene deuda.');
    const monto = centimos(datos.monto);
    if (!monto || Number.isNaN(monto)) return error('Escribe cuánto pagó.');
    if (monto > deuda.saldo) return error(`Debe ${(deuda.saldo / 100).toFixed(2)} soles: el pago no puede ser mayor.`);
    const metodoPago = METODOS.includes(datos.metodo) ? datos.metodo : 'Efectivo';
    await env.DB.prepare('INSERT INTO abonos (negocio_id, cliente_id, dia, hora, monto, metodo, nota) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(n.id, cid, ahora.dia, ahora.hora, monto, metodoPago, limpiarTexto(datos.nota, 120)).run();
    return json({ ok: true, saldo: deuda.saldo - monto });
  }

  if (recurso === 'deudas.csv' && metodo === 'GET') {
    const no = soloDueno(); if (no) return no;
    const [cl, pr] = await Promise.all([porCobrar(env, n), porPagar(env, n)]);
    const s2 = (c) => (c / 100).toFixed(2);
    const lineas = [['tipo', 'nombre', 'celular', 'saldo', 'desde'].map(celdaCsv).join(',')];
    for (const c of cl) lineas.push(['te debe (fiado)', c.nombre, c.celularWa, s2(c.saldo), c.ultimo].map(celdaCsv).join(','));
    for (const p of pr) lineas.push(['le debes (proveedor)', p.nombre, p.celularWa, s2(p.saldo), p.desde].map(celdaCsv).join(','));
    return texto('﻿' + lineas.join('\r\n'), 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="deudas-${n.slug}-${ahora.dia}.csv"` });
  }

  // ----- proveedores y compras -----
  if (recurso === 'proveedores' && metodo === 'GET') {
    const no = soloDueno(); if (no) return no;
    const [lista, deudas] = await Promise.all([
      env.DB.prepare('SELECT * FROM proveedores WHERE negocio_id = ? ORDER BY activo DESC, nombre').bind(n.id).all(),
      porPagar(env, n),
    ]);
    const saldo = new Map(deudas.map((d) => [d.id, d.saldo]));
    return json({ proveedores: lista.results.map((p) => ({ ...proveedorJson(p), saldo: saldo.get(p.id) || 0 })) });
  }

  if (recurso === 'proveedores' && metodo === 'POST') {
    const no = soloDueno(); if (no) return no;
    const nombre = limpiarTexto(datos.nombre, 60);
    if (nombre.length < 2) return error('Escribe el nombre del proveedor.');
    const crudo = String(datos.celular || '').trim(), celular = crudo ? celularPeru(crudo) : '';
    if (crudo && !celular) return error('Revisa el celular: 9 dígitos que empiezan con 9.');
    const ruc = String(datos.ruc || '').replace(/\D/g, '');
    if (ruc && ruc.length !== 11) return error('El RUC debe tener 11 dígitos.');
    const vals = [nombre, ruc, celular, limpiarTexto(datos.contacto, 60), limpiarTexto(datos.nota, 200), datos.activo === false ? 0 : 1];
    if (id) {
      const r = await env.DB.prepare('UPDATE proveedores SET nombre=?, ruc=?, celular=?, contacto=?, nota=?, activo=? WHERE id = ? AND negocio_id = ?').bind(...vals, Number(id) || 0, n.id).run();
      if (!r.meta.changes) return error('No encontrado.', 404);
      return json({ ok: true, id: Number(id) });
    }
    const fila = await env.DB.prepare('INSERT INTO proveedores (nombre, ruc, celular, contacto, nota, activo, negocio_id) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id').bind(...vals, n.id).first();
    return json({ ok: true, id: fila.id }, 201);
  }

  if (recurso === 'compras' && !id && metodo === 'GET') {
    const no = soloDueno(); if (no) return no;
    const prov = Number(url.searchParams.get('proveedor')) || 0;
    const filas = (await env.DB.prepare(`SELECT c.*, p.nombre AS proveedor FROM compras c LEFT JOIN proveedores p ON p.id = c.proveedor_id
      WHERE c.negocio_id = ? AND (? = 0 OR c.proveedor_id = ?) ORDER BY c.dia DESC, c.id DESC LIMIT 60`).bind(n.id, prov, prov).all()).results;
    return json({ compras: filas.map((c) => ({ id: c.id, dia: c.dia, proveedorId: c.proveedor_id, proveedor: c.proveedor || '', items: leerJson(c.items, []), total: c.total, pagado: c.pagado, nota: c.nota })) });
  }

  if (recurso === 'compras' && !id && metodo === 'POST') {
    const no = soloDueno(); if (no) return no;
    const lista = (Array.isArray(datos.items) ? datos.items : []).slice(0, 80);
    const mapa = await cargarArticulos(env, n, lista.map((x) => x && x.a));
    const conVariantes = await tieneVariantes(env, n, lista.filter((x) => x && x.a).map((x) => Number(x.a)));
    const items = [];
    for (const x of lista) {
      const r = x && mapa.get(Number(x.a));
      if (!r || !r.activo) return error('Un producto de la compra ya no existe.');
      if (conVariantes.has(r.id)) return error(`Elige la variante de «${r.nombre}» que compraste.`);
      if (!r.controla) return error(`«${r.nombre}» no lleva stock: no se compra (si tiene receta, compra sus insumos).`);
      const c = cantidad(x.c), k = centimos(x.k);
      if (!c) return error(`Revisa la cantidad de «${r.nombre}».`);
      if (k === null || Number.isNaN(k)) return error(`Escribe el costo de «${r.nombre}».`);
      items.push({ a: r.id, n: nombreArticulo(r, r.padre ? mapa.get(r.padre) : null), c, k });
    }
    if (!items.length) return error('Agrega los productos que compraste.');
    const total = Math.round(items.reduce((t, x) => t + x.c * x.k, 0));
    const pagadoPedido = datos.pagado === undefined || datos.pagado === '' ? total : centimos(datos.pagado);
    if (Number.isNaN(pagadoPedido) || pagadoPedido > total) return error('Lo pagado no puede ser mayor que el total de la compra.');
    const prov = datos.proveedor_id ? await env.DB.prepare('SELECT id, nombre FROM proveedores WHERE id = ? AND negocio_id = ?').bind(Number(datos.proveedor_id), n.id).first() : null;
    if (datos.proveedor_id && !prov) return error('Elige el proveedor.');
    if (pagadoPedido < total && !prov) return error('Para comprar a crédito, elige el proveedor: así sabes a quién le debes.');
    const dia = diaValido(datos.dia) && datos.dia <= ahora.dia && diasEntre(datos.dia, ahora.dia) <= 60 ? datos.dia : ahora.dia;
    const metodoPago = METODOS.includes(datos.metodo) ? datos.metodo : 'Efectivo';
    // Stock y costo promedio: (stock × costo anterior + cantidad × costo nuevo) ÷ stock nuevo.
    const sentencias = [];
    const acumulado = new Map();
    for (const x of items) {
      const r = mapa.get(x.a), prev = acumulado.get(x.a) || { stock: Math.max(0, r.stock), costo: r.costo || (r.padre ? mapa.get(r.padre)?.costo || 0 : 0) };
      const nuevoStock = prev.stock + x.c;
      const costo = prev.stock > 0 ? Math.round((prev.stock * prev.costo + x.c * x.k) / nuevoStock) : x.k;
      acumulado.set(x.a, { stock: nuevoStock, costo });
    }
    for (const x of items) sentencias.push(env.DB.prepare('UPDATE articulos SET stock = ROUND(stock + ?, 3) WHERE id = ?').bind(x.c, x.a));
    for (const [a, v] of acumulado) sentencias.push(env.DB.prepare('UPDATE articulos SET costo = ? WHERE id = ?').bind(v.costo, a));
    sentencias.push(env.DB.prepare('INSERT INTO compras (negocio_id, proveedor_id, dia, items, total, pagado, nota) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(n.id, prov ? prov.id : null, dia, JSON.stringify(items), total, pagadoPedido, limpiarTexto(datos.nota, 200)));
    if (pagadoPedido > 0) sentencias.push(env.DB.prepare(`INSERT INTO gastos (negocio_id, dia, categoria, detalle, monto, metodo) VALUES (?, ?, 'Compra de mercadería', ?, ?, ?)`)
      .bind(n.id, dia, prov ? `Compra a ${prov.nombre}` : 'Compra de mercadería', pagadoPedido, metodoPago));
    await env.DB.batch(sentencias);
    return json({ ok: true, total, debe: total - pagadoPedido }, 201);
  }

  if (recurso === 'compras' && id && sub === 'pago' && metodo === 'POST') {
    const no = soloDueno(); if (no) return no;
    const c = await env.DB.prepare('SELECT c.*, p.nombre AS proveedor FROM compras c LEFT JOIN proveedores p ON p.id = c.proveedor_id WHERE c.id = ? AND c.negocio_id = ?').bind(Number(id) || 0, n.id).first();
    if (!c) return error('Esa compra ya no existe.', 404);
    const monto = centimos(datos.monto);
    if (!monto || Number.isNaN(monto)) return error('Escribe cuánto pagaste.');
    if (monto > c.total - c.pagado) return error(`Solo falta pagar ${((c.total - c.pagado) / 100).toFixed(2)} soles.`);
    const metodoPago = METODOS.includes(datos.metodo) ? datos.metodo : 'Efectivo';
    const [upd] = await env.DB.batch([
      env.DB.prepare('UPDATE compras SET pagado = pagado + ? WHERE id = ? AND pagado + ? <= total').bind(monto, c.id, monto),
      env.DB.prepare(`INSERT INTO gastos (negocio_id, dia, categoria, detalle, monto, metodo) SELECT ?, ?, 'Compra de mercadería', ?, ?, ? WHERE changes() > 0`)
        .bind(n.id, ahora.dia, `Pago a ${c.proveedor || 'proveedor'}`, monto, metodoPago),
    ]);
    if (!upd.meta.changes) return error('Ese pago ya se registró.', 409);
    return json({ ok: true });
  }

  // ----- inicio -----
  if (recurso === 'inicio' && metodo === 'GET') {
    const [ventasHoy, gastosHoy, abonosHoy, bajo, cumple] = await env.DB.batch([
      env.DB.prepare('SELECT metodo, items, total, costo FROM ventas WHERE negocio_id = ? AND dia = ? AND anulada = 0').bind(n.id, ahora.dia),
      env.DB.prepare('SELECT metodo, SUM(monto) AS total FROM gastos WHERE negocio_id = ? AND dia = ? GROUP BY metodo').bind(n.id, ahora.dia),
      env.DB.prepare('SELECT metodo, SUM(monto) AS total FROM abonos WHERE negocio_id = ? AND dia = ? GROUP BY metodo').bind(n.id, ahora.dia),
      env.DB.prepare(`SELECT a.id, a.nombre, a.variante, a.stock, a.minimo, a.unidad FROM articulos a
        WHERE a.negocio_id = ? AND a.activo = 1 AND a.controla = 1 AND a.stock <= a.minimo AND (a.minimo > 0 OR a.stock <= 0) ORDER BY a.stock - a.minimo LIMIT 12`).bind(n.id),
      env.DB.prepare('SELECT id, nombre, celular FROM clientes WHERE negocio_id = ? AND cumple = ? LIMIT 20').bind(n.id, ahora.dia.slice(5)),
    ]);
    const v = ventasHoy.results;
    const sumaMetodo = (lista, m) => lista.find((x) => x.metodo === m)?.total || 0;
    const vendido = v.reduce((t, x) => t + x.total, 0);
    const conteo = new Map();
    for (const x of v) for (const it of leerJson(x.items, [])) { const a = conteo.get(it.n) || { n: it.n, c: 0, total: 0 }; a.c += it.c; a.total += Math.round(it.p * it.c); conteo.set(it.n, a); }
    const deudas = await porCobrar(env, n);
    const out = {
      hoy: ahora.dia, hora: ahora.hora,
      dia: {
        ventas: v.length, vendido, ganancia: v.reduce((t, x) => t + x.total - x.costo, 0),
        gastado: gastosHoy.results.reduce((t, x) => t + x.total, 0), fiado: v.filter((x) => x.metodo === 'Fiado').reduce((t, x) => t + x.total, 0),
        efectivo: v.filter((x) => x.metodo === 'Efectivo').reduce((t, x) => t + x.total, 0) + sumaMetodo(abonosHoy.results, 'Efectivo') - sumaMetodo(gastosHoy.results, 'Efectivo'),
      },
      masVendidos: [...conteo.values()].sort((a, b) => b.total - a.total).slice(0, 6),
      porCobrar: deudas.reduce((t, c) => t + c.saldo, 0), deudores: deudas.slice(0, 5),
      stockBajo: bajo.results.map((a) => ({ id: a.id, n: a.variante ? `${a.nombre} — ${a.variante}` : a.nombre, s: a.stock, m: a.minimo, u: a.unidad })),
      cumpleanos: cumple.results.map((c) => ({ id: c.id, nombre: c.nombre, celularWa: c.celular })),
      pasos: h.dueno ? await primerosPasos(env, n) : null,
    };
    if (h.dueno) {
      const mes = ahora.dia.slice(0, 7), lm = limitesMes(mes), la = limitesMes(lm.anterior);
      const hastaAnt = `${lm.anterior}-${String(Math.min(Number(ahora.dia.slice(8)), Number(la.hasta.slice(8)))).padStart(2, '0')}`;
      const [actual, anterior] = await Promise.all([resultadoMes(env, n, lm.desde, ahora.dia), resultadoMes(env, n, `${lm.anterior}-01`, hastaAnt)]);
      out.mes = { ...actual, anterior, meta: aj.meta, diasMes: Number(lm.hasta.slice(8)), diaMes: Number(ahora.dia.slice(8)) };
    }
    return json(out);
  }

  // ----- finanzas: las de la gestión, más el costo de lo vendido y la ganancia real -----
  if (recurso === 'finanzas' && metodo === 'GET') {
    const no = soloDueno(); if (no) return no;
    const mes = MES.test(url.searchParams.get('mes') || '') ? url.searchParams.get('mes') : ahora.dia.slice(0, 7);
    const f = await finanzas(env, n, mes);
    const { desde, hasta } = limitesMes(mes);
    const [ventas, cobrado] = await env.DB.batch([
      env.DB.prepare('SELECT items, servicios, productos, total, costo FROM ventas WHERE negocio_id = ? AND anulada = 0 AND dia BETWEEN ? AND ?').bind(n.id, desde, hasta),
      env.DB.prepare('SELECT COALESCE(SUM(monto), 0) AS n FROM abonos WHERE negocio_id = ? AND dia BETWEEN ? AND ?').bind(n.id, desde, hasta),
    ]);
    const r = await resultadoMes(env, n, desde, hasta);
    const prod = new Map();
    for (const v of ventas.results) {
      const bruto = v.servicios + v.productos, factor = bruto ? v.total / bruto : 0;
      for (const x of leerJson(v.items, [])) {
        const a = prod.get(x.n) || { n: x.n, veces: 0, total: 0, ganancia: 0 };
        const neto = Math.round(x.p * x.c * factor);
        a.veces = Math.round((a.veces + x.c) * 1000) / 1000; a.total += neto; a.ganancia += neto - Math.round((x.k || 0) * x.c);
        prod.set(x.n, a);
      }
    }
    const lista = [...prod.values()];
    const deudas = await Promise.all([porCobrar(env, n), porPagar(env, n)]);
    // En comercio la ganancia es: ventas − costo de lo vendido − gastos del negocio (sin las compras de mercadería,
    // que ya están en el costo de lo vendido).
    return json({
      ...f, ...r, anterior: await resultadoMes(env, n, `${limitesMes(mes).anterior}-01`, f.hastaAnterior),
      topProductos: lista.sort((a, b) => b.total - a.total).slice(0, 10),
      topGanancia: [...lista].sort((a, b) => b.ganancia - a.ganancia).slice(0, 10),
      cobradoFiados: cobrado.results[0].n, porCobrar: deudas[0].reduce((t, c) => t + c.saldo, 0), porPagar: deudas[1].reduce((t, p) => t + p.saldo, 0),
    });
  }

  return null;
}

/** Resultado de un periodo en comercio: ventas, costo de lo vendido, compras, gastos del negocio y ganancia. */
async function resultadoMes(env, n, desde, hasta) {
  const [v, g] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS ventas, COALESCE(SUM(total), 0) AS ingresos, COALESCE(SUM(costo), 0) AS costo FROM ventas WHERE negocio_id = ? AND anulada = 0 AND dia BETWEEN ? AND ?').bind(n.id, desde, hasta),
    env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN categoria = 'Compra de mercadería' THEN monto ELSE 0 END), 0) AS compras,
      COALESCE(SUM(CASE WHEN categoria != 'Compra de mercadería' THEN monto ELSE 0 END), 0) AS operativos FROM gastos WHERE negocio_id = ? AND dia BETWEEN ? AND ?`).bind(n.id, desde, hasta),
  ]);
  const x = v.results[0], y = g.results[0];
  return {
    ventas: x.ventas, ingresos: x.ingresos, costoVendido: x.costo, gananciaBruta: x.ingresos - x.costo,
    compras: y.compras, gastosOperativos: y.operativos, gastos: y.compras + y.operativos, gananciaNeta: x.ingresos - x.costo - y.operativos, ganancia: x.ingresos - x.costo - y.operativos,
  };
}

// Para la página del comprobante (/slug/v/TOKEN).
export async function ventaPorToken(env, n, token) {
  if (!/^[a-z2-9]{26}$/.test(token || '')) return null;
  const v = await env.DB.prepare('SELECT * FROM ventas WHERE token = ? AND negocio_id = ?').bind(token, n.id).first();
  if (!v) return null;
  const nombres = await mapaNombres(env, n);
  // Numeración propia de cada negocio: la venta N.° 1, 2, 3... de este negocio.
  const numero = (await env.DB.prepare('SELECT COUNT(*) AS n FROM ventas WHERE negocio_id = ? AND id <= ?').bind(n.id, v.id).first()).n;
  return { ...ventaJson(v, nombres), numero };
}

