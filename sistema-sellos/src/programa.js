// Tipos de programa de fidelización y catálogo de servicios del negocio.
//   sellos:   cada visita suma 1 sello; al llegar a la meta, se canjea el premio.
//   puntos:   cada S/ 1 de compra suma puntos; se canjean por premios de una lista.
//   cashback: cada compra devuelve un % como saldo para usar en la próxima.
// Las reglas se guardan como JSON en negocios.reglas y los servicios en negocios.servicios.

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
  return {
    tipo: TIPOS[n.tipo] ? n.tipo : 'sellos',
    porSol: num(r.porSol, 1, 0.1, 100),
    premios,
    pct: num(r.pct, 5, 0.5, 50),
    minimo: Math.round(num(r.minimo, 0, 0, 1e7)),
  };
}

export function leerServicios(n) {
  const l = json(n.servicios, []);
  return (Array.isArray(l) ? l : [])
    .map((s) => ({ n: texto(s.n, 40), p: Math.round(num(s.p, 0, 0, 1e7)) })).filter((s) => s.n).slice(0, 30);
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
export function textoAServicios(t) {
  const r = lineas(t, 30, 'Servicios');
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
export const serviciosATexto = (l) => l.map((s) => `${s.n} = ${s.p / 100}`).join('\n');
export const premiosATexto = (l) => l.map((p) => `${p.p} = ${p.n}`).join('\n');

export const soles = (c) => `S/ ${(c / 100).toFixed(2).replace(/\.00$/, '')}`;

/** Lo que gana el cliente en una visita con ese monto (céntimos). */
export function ganar(pr, monto) {
  if (pr.tipo === 'puntos') return { sellos: 0, puntos: Math.floor((monto / 100) * pr.porSol), saldo: 0 };
  if (pr.tipo === 'cashback') return { sellos: 0, puntos: 0, saldo: Math.round(monto * pr.pct / 100) };
  return { sellos: 1, puntos: 0, saldo: 0 };
}

/** Estado de la tarjeta de un cliente, en textos listos para mostrar. */
export function estado(n, c) {
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
  const sellos = c.sellos | 0, listo = sellos >= n.meta;
  return { tipo: 'sellos', sellos, listo, progreso: `${Math.min(sellos, n.meta)} de ${n.meta} sellos`, premio: listo ? `¡Premio listo! ${n.premio}` : `Premio: ${n.premio}` };
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
export function pasos(n) {
  const pr = leerPrograma(n);
  if (pr.tipo === 'puntos') return ['En cada compra muestra tu código QR en caja y te sumamos tus puntos.', 'Canjea tus puntos por los premios que quieras.'];
  if (pr.tipo === 'cashback') return [`En cada compra muestra tu código QR en caja y recibes el ${pr.pct} % como saldo.`, 'Usa tu saldo como descuento en tus próximas compras.'];
  return ['En cada visita muestra tu código QR en caja y te sumamos un sello.', `Al completar ${n.meta} sellos, reclamas tu premio.`];
}
