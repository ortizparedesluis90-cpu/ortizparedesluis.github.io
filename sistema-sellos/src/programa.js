// Tipos de programa de fidelización y catálogo de servicios del negocio.
//   sellos:   cada visita suma 1 sello; al llegar a la meta, se canjea el premio y la tarjeta empieza de nuevo.
//             Puede tener «premios en el camino» (hitos): a los 2 sellos un 20 %, a los 4 otro... sin reiniciar la tarjeta.
//   puntos:   cada S/ 1 de compra suma puntos; se canjean por premios de una lista.
//   cashback: cada compra devuelve un % como saldo para usar en la próxima.
// Las reglas se guardan como JSON en negocios.reglas, y los servicios y productos en negocios.servicios y negocios.productos.

export const TIPOS = { sellos: 'Sellos', puntos: 'Puntos', cashback: 'Cashback (saldo de vuelta)' };

const num = (v, def, min, max) => { const x = Number(v); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : def; };
const json = (t, def) => { try { const v = JSON.parse(t || ''); return v ?? def; } catch { return def; } };
const texto = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Reglas del programa del negocio, siempre válidas. Montos en céntimos. */
export function leerPrograma(n) {
  const r = json(n.reglas, {});
  const premios = (Array.isArray(r.premios) ? r.premios : [])
    .map((p) => ({ p: Math.round(num(p.p, 0, 0, 1e6)), n: texto(p.n, 60) }))
    .filter((p) => p.p > 0 && p.n).sort((a, b) => a.p - b.p).slice(0, 8);
  const meta = Math.round(Number(n.meta)) || 10;
  const hitos = (Array.isArray(r.hitos) ? r.hitos : [])
    .map((h) => ({ s: Math.round(num(h.s, 0, 0, 99)), n: texto(h.n, 60) }))
    .filter((h, i, l) => h.s >= 1 && h.s < meta && h.n && l.findIndex((x) => x.s === h.s) === i).sort((a, b) => a.s - b.s).slice(0, 5);
  return {
    tipo: TIPOS[n.tipo] ? n.tipo : 'sellos',
    porSol: num(r.porSol, 1, 0.1, 100),
    premios,
    pct: num(r.pct, 5, 0.5, 50),
    minimo: Math.round(num(r.minimo, 0, 0, 1e7)),
    hitos,
  };
}

/** Servicios o productos del negocio: [{n: nombre, p: precio en céntimos}]. La gestión del negocio (src/gestion.js)
 *  agrega d (minutos que dura un servicio) y, en productos, s (stock) y m (stock mínimo para avisar). */
export function leerServicios(n, campo = 'servicios') {
  const l = json(n[campo], []);
  return (Array.isArray(l) ? l : []).map((s) => {
    const o = { n: texto(s.n, 40), p: Math.round(num(s.p, 0, 0, 1e7)) };
    if (Number(s.d) > 0) o.d = Math.round(num(s.d, 30, 5, 600));
    if (s.s !== undefined && s.s !== null && s.s !== '' && Number.isFinite(Number(s.s))) o.s = Math.round(num(s.s, 0, -9999, 99999));
    if (Number(s.m) > 0) o.m = Math.round(num(s.m, 0, 0, 9999));
    return o;
  }).filter((s) => s.n).slice(0, 60);
}

/** «Corte = 30» por línea → [{n, p}] (p en céntimos). Devuelve { lista } o { error }. */
function lineas(t, max, que) {
  const lista = [];
  for (const [i, l] of String(t || '').split('\n').entries()) {
    if (!l.trim()) continue;
    const m = /^(.+?)\s*[=:]\s*(?:S\/\s*)?(\d+(?:[.,]\d{1,2})?)\s*$/i.exec(l.trim());
    if (!m) return { error: `${que}, línea ${i + 1}: escribe «nombre = número», por ejemplo «Corte = 30».` };
    lista.push({ n: texto(m[1], 60), x: Number(m[2].replace(',', '.')) });
  }
  if (lista.length > max) return { error: `${que}: máximo ${max} líneas.` };
  return { lista };
}
/** Servicios y productos que el cajero elige con un toque en cada visita. */
export const leerCatalogo = (n) => [...leerServicios(n), ...leerServicios(n, 'productos')];
export function textoAServicios(t, que = 'Servicios') {
  const r = lineas(t, 60, que);
  return r.error ? r : { lista: r.lista.map((s) => ({ n: s.n.slice(0, 40), p: Math.round(s.x * 100) })) };
}
export function textoAPremios(t) {
  // «100 = Café gratis» o «Café gratis = 100»
  const lista = [];
  for (const [i, l] of String(t || '').split('\n').entries()) {
    if (!l.trim()) continue;
    const a = /^(\d+)\s*(?:puntos?|pts?)?\s*[=:]\s*(.+)$/i.exec(l.trim()) || /^(.+?)\s*[=:]\s*(\d+)\s*(?:puntos?|pts?)?$/i.exec(l.trim());
    if (!a) return { error: `Premios, línea ${i + 1}: escribe «puntos = premio», por ejemplo «100 = Café gratis».` };
    const [p, nombre] = /^\d+$/.test(a[1]) ? [Number(a[1]), a[2]] : [Number(a[2]), a[1]];
    if (!(p > 0)) return { error: `Premios, línea ${i + 1}: los puntos deben ser mayores que 0.` };
    lista.push({ p, n: texto(nombre, 60) });
  }
  if (lista.length > 8) return { error: 'Premios: máximo 8.' };
  return { lista: lista.sort((x, y) => x.p - y.p) };
}
/** Premios en el camino de una tarjeta de sellos: «2 = 20 % de descuento» por línea (sellos = premio). */
export function textoAHitos(t, meta) {
  const lista = [];
  for (const [i, l] of String(t || '').split('\n').entries()) {
    if (!l.trim()) continue;
    const a = /^(\d+)\s*(?:sellos?)?\s*[=:]\s*(.+)$/i.exec(l.trim()) || /^(.+?)\s*[=:]\s*(\d+)\s*(?:sellos?)?$/i.exec(l.trim());
    if (!a) return { error: `Premios en el camino, línea ${i + 1}: escribe «sellos = premio», por ejemplo «2 = 20 % de descuento».` };
    const [s, nombre] = /^\d+$/.test(a[1]) ? [Number(a[1]), a[2]] : [Number(a[2]), a[1]];
    if (!(s >= 1 && s < meta)) return { error: `Premios en el camino, línea ${i + 1}: los sellos deben ser de 1 a ${meta - 1} (el premio de los ${meta} sellos es el premio final).` };
    if (lista.some((h) => h.s === s)) return { error: `Premios en el camino: hay dos premios para ${s} sellos.` };
    lista.push({ s, n: texto(nombre, 60) });
  }
  if (lista.length > 5) return { error: 'Premios en el camino: máximo 5.' };
  return { lista: lista.sort((x, y) => x.s - y.s) };
}
export const serviciosATexto = (l) => l.map((s) => `${s.n} = ${s.p / 100}`).join('\n');
export const premiosATexto = (l) => l.map((p) => `${p.p} = ${p.n}`).join('\n');

export const soles = (c) => `S/ ${(c / 100).toFixed(2).replace(/\.00$/, '')}`;

/** Lo que gana el cliente en una visita con ese monto (céntimos). */
export function ganar(pr, monto) {
  if (pr.tipo === 'puntos') return { sellos: 0, puntos: Math.floor((monto / 100) * pr.porSol), saldo: 0 };
  if (pr.tipo === 'cashback') return { sellos: 0, puntos: 0, saldo: Math.round(monto * pr.pct / 100) };
  return { sellos: 1, puntos: 0, saldo: 0 };
}

/** Si la tarjeta del cliente conserva una promoción anterior (meta_t y premio_t, ver «Cada tarjeta respeta su
 *  promoción» en LEEME.md), el negocio se ve con esa meta y ese premio para ese cliente. */
export function conTarjeta(n, c) {
  if (!(c && (c.meta_t || c.premio_t))) return n;
  // Sus premios en el camino también son los de su promoción (sin hitos_t: era una promoción sin ellos).
  const reglas = n.tipo === 'sellos' || !n.tipo ? JSON.stringify({ ...json(n.reglas, {}), hitos: json(c.hitos_t, []) }) : n.reglas;
  return { ...n, meta: c.meta_t || n.meta, premio: c.premio_t || n.premio, reglas };
}

/** Premios de una tarjeta de sellos, en orden: los del camino y el final, con su estado para ese cliente.
 *  c.hito = sellos del último premio del camino que ya canjeó en esta tarjeta (vuelve a 0 al canjear el final). */
export function premiosSellos(n, c) {
  n = conTarjeta(n, c);
  const sellos = c.sellos | 0, hecho = c.hito | 0;
  return [
    ...leerPrograma(n).hitos.map((h) => ({ s: h.s, n: h.n, canjeado: h.s <= hecho, listo: h.s > hecho && sellos >= h.s })),
    { s: n.meta, n: n.premio, final: true, canjeado: false, listo: sellos >= n.meta },
  ];
}

/** Estado de la tarjeta de un cliente, en textos listos para mostrar. */
export function estado(n, c) {
  n = conTarjeta(n, c);
  const pr = leerPrograma(n);
  if (pr.tipo === 'puntos') {
    const puntos = c.puntos | 0, alcanzables = pr.premios.filter((p) => p.p <= puntos), siguiente = pr.premios.find((p) => p.p > puntos) || null;
    return {
      tipo: 'puntos', puntos, alcanzables, siguiente, listo: alcanzables.length > 0,
      progreso: `${puntos} punto${puntos === 1 ? '' : 's'}`,
      premio: alcanzables.length ? `Ya puedes canjear: ${alcanzables[alcanzables.length - 1].n}`
        : siguiente ? `Te faltan ${siguiente.p - puntos} puntos para ${siguiente.n}` : 'Pronto habrá premios',
    };
  }
  if (pr.tipo === 'cashback') {
    const saldo = c.saldo | 0, listo = saldo > 0 && saldo >= pr.minimo;
    return {
      tipo: 'cashback', saldo, listo,
      progreso: `${soles(saldo)} de saldo`,
      premio: listo ? `Puedes usar ${soles(saldo)} en tu próxima compra` : pr.minimo ? `Lo usas desde ${soles(pr.minimo)} de saldo` : 'Junta saldo en cada compra',
    };
  }
  const sellos = c.sellos | 0, hitos = premiosSellos(n, c);
  const listos = hitos.filter((h) => h.listo), siguiente = hitos.find((h) => !h.canjeado && h.s > sellos) || null;
  return {
    tipo: 'sellos', sellos, listo: listos.length > 0, hitos, siguiente,
    progreso: `${Math.min(sellos, n.meta)} de ${n.meta} sellos`,
    premio: listos.length ? `¡Premio listo! ${listos[0].n}` : siguiente && !siguiente.final ? `Próximo premio: ${siguiente.n}` : `Premio: ${n.premio}`,
  };
}

/** Frase corta del programa (registro, cartel). Devuelve [antes, resaltado, después, resaltado] para armar HTML. */
export function lema(n) {
  const pr = leerPrograma(n);
  if (pr.tipo === 'puntos') {
    const p = pr.premios[0];
    return ['Gana ', `${pr.porSol === 1 ? '1 punto' : `${pr.porSol} puntos`} por cada S/ 1`, p ? ' y canjéalos por premios, como ' : ' y canjéalos por premios', p ? p.n : ''];
  }
  if (pr.tipo === 'cashback') return ['Recibe ', `${pr.pct} % de vuelta`, ' en cada compra para usar en la ', 'próxima'];
  return ['Junta ', `${n.meta} sellos`, ' y gana ', n.premio];
}
