// Análisis del mes: lo que pasó en el negocio y qué hacer para ganar más. Lo que más se vende y lo que más deja,
// la merma, la plata parada en productos que no salen, lo que se está por acabar, los gastos que subieron y las horas fuertes.
// Lo ve el dueño en /slug/analisis (desde Reportes) y tú desde /admin, para mandárselo cada mes como el reporte de la tarjeta.
import { ahoraLima, limitesMes, leerJson, modoDe, finanzas, diasEntre, sumarDias } from './gestion.js';
import { resultadoMes, agruparMermas, porCobrar } from './comercio.js';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const VENTANA = 60; // días que se miran para saber qué rota y qué no
export const soles = (c) => {
  const [ent, dec] = (Math.abs(Math.round(c)) / 100).toFixed(2).split('.');
  return `${c < 0 ? '− ' : ''}S/ ${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`;
};
const cambio = (a, b) => (b ? Math.round(((a - b) / Math.abs(b)) * 100) : null);
const cant = (c) => (Number.isInteger(c) ? String(c) : String(Math.round(c * 100) / 100).replace('.', ','));

export async function analisisMes(env, n, mes) {
  const comercio = modoDe(n) === 'comercio';
  const ahora = ahoraLima();
  const { desde, hasta, anterior } = limitesMes(mes);
  const f = await finanzas(env, n, mes);
  const fin = f.enCurso ? ahora.dia : hasta;
  const [ventas, gastosAnt] = await env.DB.batch([
    env.DB.prepare('SELECT dia, hora, items, servicios, productos, total FROM ventas WHERE negocio_id = ? AND anulada = 0 AND dia BETWEEN ? AND ?').bind(n.id, desde, hasta),
    env.DB.prepare('SELECT categoria, SUM(monto) AS total FROM gastos WHERE negocio_id = ? AND dia BETWEEN ? AND ? GROUP BY categoria').bind(n.id, `${anterior}-01`, f.hastaAnterior),
  ]);

  // ----- productos y servicios del mes -----
  const prod = new Map();
  const horas = Array(24).fill(0), semana = Array(7).fill(0), diasSemana = Array(7).fill(0);
  for (let d = desde; d <= fin; d = sumarDias(d, 1)) diasSemana[new Date(Date.parse(d)).getUTCDay()]++;
  for (const v of ventas.results) {
    const bruto = v.servicios + v.productos, factor = bruto ? v.total / bruto : 0;
    const hh = Number(String(v.hora).slice(0, 2));
    if (hh >= 0 && hh < 24) horas[hh] += v.total;
    semana[new Date(Date.parse(v.dia)).getUTCDay()] += v.total;
    for (const x of leerJson(v.items, [])) {
      const c = x.c || 1, clave = x.a ? `a${x.a}` : `n${x.n}`;
      const a = prod.get(clave) || { n: x.n, a: x.a || null, producto: x.t === 'p', unidades: 0, total: 0, costo: 0, sinCosto: false };
      const neto = Math.round(x.p * c * factor);
      a.unidades = Math.round((a.unidades + c) * 1000) / 1000; a.total += neto; a.costo += Math.round((x.k || 0) * c);
      if (a.producto && !x.k) a.sinCosto = true;
      prod.set(clave, a);
    }
  }
  const lista = [...prod.values()].map((p) => ({
    ...p, ganancia: p.total - p.costo, margen: p.total && !p.sinCosto ? Math.round(((p.total - p.costo) / p.total) * 100) : null,
    precio: p.unidades ? Math.round(p.total / p.unidades) : 0,
  }));
  const masVendidos = [...lista].sort((a, b) => b.total - a.total).slice(0, 10);
  const conCosto = lista.filter((p) => p.producto && !p.sinCosto);
  const masGanancia = [...conCosto].sort((a, b) => b.ganancia - a.ganancia).slice(0, 10);
  // Estrella: los pocos productos que hacen el 80 % de la ganancia (regla 80/20). Nunca deben faltar.
  const gananciaTotal = conCosto.reduce((t, p) => t + Math.max(0, p.ganancia), 0);
  const estrella = [];
  let acumulado = 0;
  for (const p of [...conCosto].sort((a, b) => b.ganancia - a.ganancia)) {
    if (p.ganancia <= 0 || acumulado >= gananciaTotal * 0.8) break;
    estrella.push(p); acumulado += p.ganancia;
  }

  // ----- horas y días fuertes (promedio por día de la semana: un mes puede tener 5 sábados y 4 lunes) -----
  const promedioDia = semana.map((t, i) => (diasSemana[i] ? Math.round(t / diasSemana[i]) : 0));
  const conVentas = promedioDia.map((t, i) => ({ i, t })).filter((x) => x.t > 0);
  const mejorDia = conVentas.length ? conVentas.reduce((a, b) => (b.t > a.t ? b : a)) : null;
  const peorDia = conVentas.length > 2 ? conVentas.reduce((a, b) => (b.t < a.t ? b : a)) : null;
  let horaPico = null;
  for (let h = 0; h < 23; h++) { const t = horas[h] + horas[h + 1]; if (t && (!horaPico || t > horaPico.t)) horaPico = { h, t }; }

  // ----- comercio: ganancia real, merma, stock -----
  let r = null, rAnt = null, merma = null, dormidos = [], agotarse = [], capitalDormido = 0, valorInventario = 0, porCobrarT = 0, deudores = 0;
  if (comercio) {
    const desdeV = sumarDias(fin, -(VENTANA - 1));
    const [res, resAnt, extra, deudas] = await Promise.all([
      resultadoMes(env, n, desde, hasta),
      resultadoMes(env, n, `${anterior}-01`, f.hastaAnterior),
      env.DB.batch([
        env.DB.prepare('SELECT * FROM mermas WHERE negocio_id = ? AND dia BETWEEN ? AND ?').bind(n.id, desde, hasta),
        env.DB.prepare(`SELECT a.id, a.nombre, a.variante, a.stock, a.costo, a.minimo, a.unidad, a.creado, p.costo AS pcosto FROM articulos a LEFT JOIN articulos p ON p.id = a.padre
          WHERE a.negocio_id = ? AND a.activo = 1 AND a.controla = 1`).bind(n.id),
        env.DB.prepare('SELECT items FROM ventas WHERE negocio_id = ? AND anulada = 0 AND dia BETWEEN ? AND ?').bind(n.id, desdeV, fin),
        env.DB.prepare('SELECT MIN(dia) AS d FROM ventas WHERE negocio_id = ? AND anulada = 0').bind(n.id),
      ]),
      porCobrar(env, n),
    ]);
    r = res; rAnt = resAnt;
    const [mermas, arts, ventasV, primera] = extra.map((x) => x.results);
    merma = { total: mermas.reduce((t, m) => t + m.costo, 0), registros: mermas.length, ...agruparMermas(mermas) };
    porCobrarT = deudas.reduce((t, c) => t + c.saldo, 0); deudores = deudas.length;
    // Rotación: cuánto se vendió de cada artículo en los últimos 60 días (o desde la primera venta).
    const rotacion = new Map();
    for (const v of ventasV) for (const x of leerJson(v.items, [])) if (x.a) rotacion.set(x.a, (rotacion.get(x.a) || 0) + (x.c || 1));
    const dias = primera[0] && primera[0].d ? Math.max(7, Math.min(VENTANA, diasEntre(primera[0].d, fin) + 1)) : 0;
    for (const a of arts) {
      const nombre = a.variante ? `${a.nombre} — ${a.variante}` : a.nombre;
      const costo = a.costo || a.pcosto || 0;
      if (a.stock > 0) valorInventario += a.stock * costo;
      const vendido = rotacion.get(a.id) || 0;
      const antiguo = diasEntre(String(a.creado).slice(0, 10), fin) >= 30;
      if (dias >= 30 && a.stock > 0 && !vendido && antiguo) dormidos.push({ n: nombre, stock: a.stock, unidad: a.unidad, valor: Math.round(a.stock * costo) });
      if (dias && vendido > 0) {
        const porDia = vendido / dias, quedan = a.stock > 0 ? Math.floor(a.stock / porDia) : 0;
        if (quedan < 7) agotarse.push({ n: nombre, stock: a.stock, unidad: a.unidad, dias: quedan, porSemana: Math.round(porDia * 7 * 10) / 10 });
      }
    }
    dormidos.sort((a, b) => b.valor - a.valor);
    capitalDormido = dormidos.reduce((t, d) => t + d.valor, 0);
    agotarse.sort((a, b) => a.dias - b.dias || b.porSemana - a.porSemana);
    valorInventario = Math.round(valorInventario);
  }

  // ----- gastos que subieron (sin la compra de mercadería, que depende de cuánto vendes) -----
  const antes = new Map(gastosAnt.results.map((g) => [g.categoria, g.total]));
  const gastos = f.categorias.filter((g) => !comercio || g.n !== 'Compra de mercadería').map((g) => ({ ...g, antes: antes.get(g.n) || 0, cambio: cambio(g.total, antes.get(g.n) || 0) }));

  // ----- resumen -----
  const ingresos = f.ingresos, ingresosAnt = f.anterior.ingresos;
  const ganancia = comercio ? r.gananciaNeta : f.ganancia;
  const gananciaAnt = comercio ? rAnt.gananciaNeta : f.anterior.ganancia;
  const resumen = {
    ingresos, ingresosAnt, cambioIngresos: cambio(ingresos, ingresosAnt),
    ganancia, gananciaAnt, cambioGanancia: cambio(ganancia, gananciaAnt),
    margen: ingresos ? Math.round((ganancia / ingresos) * 100) : 0,
    ventas: f.ventas, ticket: f.ticket, ticketAnt: f.anterior.ventas ? Math.round(f.anterior.ingresos / f.anterior.ventas) : 0,
    gastos: comercio ? r.gastosOperativos : f.gastos, costoVendido: comercio ? r.costoVendido : 0, merma: merma ? merma.total : 0,
    compras: comercio ? r.compras : 0, clientesNuevos: f.clientesNuevos, clientesAtendidos: f.clientesAtendidos,
  };

  // Punto de equilibrio: cuánto hay que vender al mes para cubrir gastos y merma con el margen que deja cada venta.
  const margenBruto = comercio ? (ingresos ? (ingresos - r.costoVendido) / ingresos : 0) : 1;
  const diasMes = Number(hasta.slice(8)), diasCorridos = Number(fin.slice(8));
  resumen.equilibrio = margenBruto > 0 ? Math.round((resumen.gastos + resumen.merma) / margenBruto) : 0;
  resumen.proyeccion = f.enCurso && diasCorridos ? Math.round((ingresos / diasCorridos) * diasMes) : ingresos;
  resumen.diasMes = diasMes;

  const a = {
    mes, enCurso: f.enCurso, hasta: fin, anterior, comercio, resumen, masVendidos, masGanancia, estrella, gananciaTotal,
    sinCosto: lista.filter((p) => p.sinCosto).map((p) => p.n), merma, dormidos: dormidos.slice(0, 12), capitalDormido, totalDormidos: dormidos.length,
    agotarse: agotarse.slice(0, 10), valorInventario, porCobrar: porCobrarT, deudores, gastos, metodos: f.metodos, citas: f.citas, equipo: f.equipo,
    semana: promedioDia.map((t, i) => ({ n: DIAS[i], total: t })), horas: horas.map((t, h) => ({ h, total: t })),
    mejorDia: mejorDia && DIAS[mejorDia.i], peorDia: peorDia && peorDia.i !== (mejorDia && mejorDia.i) ? DIAS[peorDia.i] : null,
    horaPico: horaPico && `${String(horaPico.h).padStart(2, '0')}:00 a ${String(horaPico.h + 2).padStart(2, '0')}:00`,
    porDia: f.porDia,
  };
  a.consejos = consejos(a);
  a.oportunidad = a.consejos.reduce((t, c) => t + (c.monto || 0), 0);
  return a;
}

/** Recomendaciones concretas, de la que más plata mueve a la que menos. monto: lo que podría ganar o ahorrar al mes. */
function consejos(a) {
  const out = [];
  const r = a.resumen;
  if (!r.ventas) {
    out.push({ tipo: 'info', titulo: 'Aún no hay ventas este mes', detalle: 'Registra cada venta en «Vender» (o en «Caja»): con eso este análisis te dirá qué sale más, cuánto ganas y dónde ahorrar.' });
    return out;
  }
  if (r.ganancia < 0 && r.equilibrio) {
    const porDia = Math.round(r.equilibrio / r.diasMes);
    out.push({ tipo: 'alerta', primero: true, titulo: `Este mes vas perdiendo ${soles(-r.ganancia)}`, detalle: `Para cubrir tus gastos necesitas vender unos ${soles(r.equilibrio)} al mes (${soles(porDia)} por día)${a.enCurso ? `; a este ritmo llegarías a ${soles(r.proyeccion)}` : `; vendiste ${soles(r.ingresos)}`}. Lo que más ayuda: subir el margen de lo que más vendes y bajar los gastos fijos.` });
  }
  // Margen bajo o venta a pérdida: subir un poco el precio donde se vende mucho es la plata más fácil.
  const bajos = a.masVendidos.concat(a.masGanancia).filter((p, i, l) => p.producto && p.margen !== null && p.margen < 15 && p.unidades >= 3 && l.indexOf(p) === i);
  for (const p of bajos.slice(0, 3)) {
    const costoU = p.unidades ? p.costo / p.unidades : 0;
    const precioSugerido = Math.ceil(costoU / 0.8 / 10) * 10; // ganar al menos 20 %, redondeado a 10 céntimos
    const extra = Math.max(0, Math.round((precioSugerido - p.precio) * p.unidades));
    if (p.margen < 0) out.push({ tipo: 'alerta', titulo: `Pierdes plata con «${p.n}»`, detalle: `Lo vendes en promedio a ${soles(p.precio)} y te cuesta ${soles(Math.round(costoU))}. Revisa el costo o súbelo a ${soles(precioSugerido)}.`, monto: extra });
    else if (extra > 0) out.push({ tipo: 'venta', titulo: `Ganas poco con «${p.n}» (${p.margen} %)`, detalle: `Vendiste ${cant(p.unidades)}. Si lo dejas en ${soles(precioSugerido)} (o consigues mejor precio con tu proveedor) ganarías ${soles(extra)} más al mes.`, monto: extra });
  }
  if (a.merma && a.merma.total > 0) {
    const m = a.merma, top = m.porMotivo[0], p = m.porProducto[0];
    const pct = r.ingresos ? Math.round((m.total / r.ingresos) * 1000) / 10 : 0;
    const que = {
      Vencido: 'Compra menos cantidad y más seguido; pon adelante lo que vence primero.',
      'Dañado o roto': 'Revisa cómo se guarda y cómo llega del proveedor; reclama lo que llega dañado.',
      'Robo o faltante': 'Cuenta cada semana los productos más caros y ten la caja y los estantes a la vista.',
      'Consumo propio': 'Anótalo siempre y ponte un límite: también es plata del negocio.',
      'Regalo o muestra': 'Reserva los regalos para clientes con tarjeta: así vuelven.',
      Conteo: 'Haz el conteo cada semana con los 20 productos que más vendes: encuentras el problema antes.',
    }[top && top.n] || '';
    out.push({ tipo: 'ahorro', titulo: `Perdiste ${soles(m.total)} en merma (${pct} % de tus ventas)`, detalle: `${top ? `La mayor parte: ${top.n.toLowerCase()} (${soles(top.total)})` : ''}${p ? `, sobre todo «${p.n}»` : ''}. ${que} Bajarla a la mitad son ${soles(Math.round(m.total / 2))} más al mes.`, monto: Math.round(m.total / 2) });
  }
  if (a.capitalDormido > 0) {
    out.push({ tipo: 'ahorro', titulo: `Tienes ${soles(a.capitalDormido)} parados en ${a.totalDormidos} ${a.totalDormidos === 1 ? 'producto' : 'productos'} que no se venden`, detalle: `No se vendieron en los últimos ${VENTANA} días${a.dormidos[0] ? ` (el que más: «${a.dormidos[0].n}», ${soles(a.dormidos[0].valor)})` : ''}. Haz una oferta o un combo con lo que sí sale, y no los vuelvas a comprar: esa plata te sirve para lo que rota.` });
  }
  if (a.agotarse.length) {
    const x = a.agotarse.slice(0, 3).map((p) => `«${p.n}» (${p.dias ? `~${p.dias} ${p.dias === 1 ? 'día' : 'días'}` : 'agotado'})`).join(', ');
    out.push({ tipo: 'alerta', titulo: 'Repón antes de quedarte sin stock', detalle: `Al ritmo que se venden, se acaban pronto: ${x}. Un cliente que no encuentra lo que busca se va a otra tienda.` });
  }
  if (a.estrella.length && a.gananciaTotal > 0) {
    out.push({ tipo: 'venta', titulo: `${a.estrella.length} ${a.estrella.length === 1 ? 'producto te deja' : 'productos te dejan'} el 80 % de la ganancia`, detalle: `${a.estrella.slice(0, 5).map((p) => `«${p.n}»`).join(', ')}${a.estrella.length > 5 ? ' y otros' : ''}. Nunca te quedes sin ellos, ponlos a la vista y ofrécelos con otro producto.` });
  }
  for (const g of a.gastos.filter((x) => x.antes > 0 && x.cambio >= 20 && x.total - x.antes >= 3000).slice(0, 2)) {
    out.push({ tipo: 'ahorro', titulo: `${g.n} subió ${g.cambio} %`, detalle: `Gastaste ${soles(g.total)} contra ${soles(g.antes)} el mes pasado a la misma fecha. Revisa si fue algo puntual o si se puede bajar.`, monto: g.total - g.antes });
  }
  if (a.sinCosto.length) {
    out.push({ tipo: 'info', titulo: `${a.sinCosto.length} ${a.sinCosto.length === 1 ? 'producto vendido no tiene' : 'productos vendidos no tienen'} costo`, detalle: `Sin el costo no se sabe cuánto ganas con ${a.sinCosto.length === 1 ? 'él' : 'ellos'}: ${a.sinCosto.slice(0, 4).map((x) => `«${x}»`).join(', ')}${a.sinCosto.length > 4 ? ' y otros' : ''}. Pónselo en «Productos» o registra tus compras.` });
  }
  if (a.porCobrar > 0) {
    out.push({ tipo: 'alerta', titulo: `Te deben ${soles(a.porCobrar)} en fiados`, detalle: `Son ${a.deudores} ${a.deudores === 1 ? 'cliente' : 'clientes'}. Mándales el recordatorio por WhatsApp desde «Fiados y deudas»: la plata fiada no te sirve para reponer.` });
  }
  if (a.citas && a.citas.noVino >= 2 && a.citas.total) {
    const pct = Math.round((a.citas.noVino / a.citas.total) * 100);
    const perdido = r.ventas ? Math.round((r.ingresos / r.ventas) * a.citas.noVino) : 0;
    out.push({ tipo: 'ahorro', titulo: `${a.citas.noVino} citas no vinieron (${pct} %)`, detalle: `Son unos ${soles(perdido)} que no entraron. Confírmalas por WhatsApp el día anterior desde la Agenda y pide un adelanto en las más largas.`, monto: Math.round(perdido / 2) });
  }
  if (a.horaPico || a.peorDia) {
    out.push({ tipo: 'venta', titulo: 'Tus horas y días fuertes', detalle: `${a.horaPico ? `Vendes más de ${a.horaPico}${a.mejorDia ? `, y el mejor día es el ${a.mejorDia}` : ''}: ten todo repuesto y sencillo en caja a esa hora. ` : ''}${a.peorDia ? `El ${a.peorDia} es el más flojo: prueba una oferta solo de ese día.` : ''}` });
  }
  if (r.ticketAnt && r.ticket < r.ticketAnt * 0.95) {
    out.push({ tipo: 'venta', titulo: `Cada cliente gasta menos: ${soles(r.ticket)} por venta`, detalle: `El mes pasado eran ${soles(r.ticketAnt)}. Ofrece un segundo producto al cobrar («¿le agrego…?») o arma combos.` });
  }
  const orden = { alerta: 0, ahorro: 1, venta: 2, info: 3 };
  return out.sort((x, y) => (y.primero ? 1 : 0) - (x.primero ? 1 : 0) || (y.monto || 0) - (x.monto || 0) || orden[x.tipo] - orden[y.tipo]).slice(0, 8);
}

/** El resumen corto para mandar por WhatsApp. */
export function textoWhatsApp(n, a, enlace, nombreMes) {
  const r = a.resumen;
  const flecha = (c) => (c === null ? '' : ` (${c >= 0 ? '▲' : '▼'} ${Math.abs(c)} % vs. el mes pasado)`);
  const l = [`📊 *Análisis de ${nombreMes}* · ${n.nombre}`, '', `Vendiste *${soles(r.ingresos)}*${flecha(r.cambioIngresos)}`, `Ganancia: *${soles(r.ganancia)}*${flecha(r.cambioGanancia)}`];
  if (a.comercio && r.merma) l.push(`Merma: ${soles(r.merma)}`);
  if (a.masVendidos.length) l.push(`Lo que más sale: ${a.masVendidos.slice(0, 3).map((p) => p.n).join(', ')}`);
  if (a.consejos[0]) l.push('', `💡 ${a.consejos[0].titulo}`);
  if (a.oportunidad > 0) l.push(`Podrías ganar hasta ${soles(a.oportunidad)} más al mes con los consejos del análisis.`);
  l.push('', `Míralo completo: ${enlace}`);
  return l.join('\n');
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombreMes = (mes) => `${MESES[Number(mes.slice(5)) - 1]} ${mes.slice(0, 4)}`;
