// Diseño de cada negocio: estilos, paletas, tipografías, fondos, tarjeta y sellos.
// Todo se guarda como JSON en negocios.diseno y se convierte en CSS en /<negocio>/tema.css.
import { e } from './util.js';

// ---------- tipografías (archivos en public/static/fuentes, licencia OFL) ----------
const F = (familia, archivo) => ({ familia, archivo });
const FUENTES = {
  playfair: F('Playfair Display', 'playfair-display'), cormorant: F('Cormorant Garamond', 'cormorant-garamond'),
  bebas: F('Bebas Neue', 'bebas-neue'), cinzel: F('Cinzel', 'cinzel'), abril: F('Abril Fatface', 'abril-fatface'),
  bodoni: F('Bodoni Moda', 'bodoni-moda'), italiana: F('Italiana', 'italiana'), oswald: F('Oswald', 'oswald'),
  anton: F('Anton', 'anton'), unbounded: F('Unbounded', 'unbounded'), syne: F('Syne', 'syne'),
  greatvibes: F('Great Vibes', 'great-vibes'), dancing: F('Dancing Script', 'dancing-script'), pacifico: F('Pacifico', 'pacifico'),
  lora: F('Lora', 'lora'), dmserif: F('DM Serif Display', 'dm-serif-display'), spacegrotesk: F('Space Grotesk', 'space-grotesk'),
  righteous: F('Righteous', 'righteous'), marker: F('Permanent Marker', 'permanent-marker'), manrope: F('Manrope', 'manrope'),
  montserrat: F('Montserrat', 'montserrat'), dmsans: F('DM Sans', 'dm-sans'), jost: F('Jost', 'jost'), poppins: F('Poppins', 'poppins'),
  inter: F('Inter', 'inter'), lato: F('Lato', 'lato'), raleway: F('Raleway', 'raleway'), nunito: F('Nunito', 'nunito'),
};
// titulo: [fuente, peso], texto: [fuente, peso normal, peso fuerte]
const T = (nombre, titulo, texto, extra = {}) => ({ nombre, titulo, texto, ...extra });
export const TIPOGRAFIAS = {
  clasica: T('Clásica', ['playfair', 600], ['manrope', 400, 700]),
  lujosa: T('Lujosa', ['cormorant', 600], ['jost', 400, 600], { escala: 1.12 }),
  moderna: T('Moderna', ['manrope', 800], ['manrope', 400, 700], { espacio: '-.02em' }),
  urbana: T('Urbana', ['bebas', 400], ['dmsans', 400, 700], { escala: 1.25, espacio: '.02em' }),
  editorial: T('Editorial', ['dmserif', 400], ['inter', 400, 700]),
  imperial: T('Imperial', ['cinzel', 600], ['raleway', 400, 700], { escala: .9 }),
  fashion: T('Fashion', ['bodoni', 600], ['montserrat', 400, 700]),
  elegante: T('Elegante fina', ['italiana', 400], ['jost', 400, 600], { escala: 1.08 }),
  firma: T('Firma', ['greatvibes', 400], ['montserrat', 400, 700], { escala: 1.3, espacio: '0' }),
  vintage: T('Barbería vintage', ['abril', 400], ['lato', 400, 700]),
  deportiva: T('Deportiva', ['oswald', 600], ['inter', 400, 700], { espacio: '.01em' }),
  impacto: T('Impacto', ['anton', 400], ['poppins', 400, 600], { escala: 1.1, espacio: '.01em' }),
  geometrica: T('Geométrica', ['unbounded', 700], ['poppins', 400, 600], { escala: .88 }),
  creativa: T('Creativa', ['syne', 700], ['dmsans', 400, 700]),
  amigable: T('Amigable', ['pacifico', 400], ['nunito', 400, 700], { escala: .95, espacio: '0' }),
  grafiti: T('Grafiti', ['marker', 400], ['poppins', 400, 600], { espacio: '0' }),
  suave: T('Serif suave', ['lora', 600], ['lato', 400, 700]),
  tech: T('Tecnológica', ['spacegrotesk', 700], ['spacegrotesk', 400, 700], { espacio: '-.02em' }),
  retro: T('Neón retro', ['righteous', 400], ['nunito', 400, 700]),
  manuscrita: T('Manuscrita', ['dancing', 700], ['raleway', 400, 700], { escala: 1.15, espacio: '0' }),
};

// ---------- paletas: [nombre, fondo, acento] ----------
export const PALETAS = {
  'oro-negro': ['Oro y negro', '#0F0D0B', '#C9A55C'], champan: ['Champán', '#14110E', '#E2C792'],
  plata: ['Plata', '#111317', '#C8CED6'], cobre: ['Cobre', '#120E0C', '#D08A5A'], vino: ['Vino y oro', '#1A0B10', '#D9AE73'],
  terracota: ['Terracota', '#1A0F0A', '#E07A4F'], esmeralda: ['Esmeralda', '#0B1612', '#3FBF8F'], 'azul-noche': ['Azul noche', '#0B1020', '#6E98FF'],
  'neon-cian': ['Neón cian', '#070B14', '#22D3EE'], 'neon-rosa': ['Neón rosa', '#0D0710', '#FF4FA3'], 'urbano-rojo': ['Rojo urbano', '#0E0E10', '#FF4545'],
  lima: ['Lima', '#0C0F0A', '#B6F23C'], 'negro-blanco': ['Negro y blanco', '#0A0A0A', '#F5F5F5'], salvia: ['Salvia', '#F2F1EA', '#56704F'],
  arena: ['Arena', '#F7F1E8', '#9A5F33'], rosa: ['Rosa empolvado', '#FBF0F1', '#A8455F'], lavanda: ['Lavanda', '#F4F1FA', '#6650B0'],
  coral: ['Coral', '#FFF5F0', '#C9441F'], menta: ['Menta', '#EFFAF6', '#0E7A5E'], cielo: ['Cielo', '#F0F6FF', '#2158D6'],
  'blanco-negro': ['Blanco y negro', '#FAFAFA', '#111111'],
};

// ---------- opciones ----------
export const FONDOS = { liso: 'Color liso', degradado: 'Degradado con brillo', animado: 'Animado', imagen: 'Foto o imagen', video: 'Video' };
export const ANIMACIONES = { particulas: 'Partículas doradas', aurora: 'Aurora', bokeh: 'Luces desenfocadas', ondas: 'Ondas', malla: 'Malla urbana', brillo: 'Destello' };
export const TARJETAS = { clasica: 'Clásica', metal: 'Metálica', vidrio: 'Vidrio', minimal: 'Minimalista', neon: 'Neón', foto: 'Con foto de portada' };
export const FORMAS = { circulo: 'Círculo', cuadrado: 'Cuadrado suave', diamante: 'Diamante', hexagono: 'Hexágono' };
export const ESQUINAS = { redondas: 'Redondas', suaves: 'Suaves', rectas: 'Rectas' };
export const ICONOS_SELLO = {
  check: ['Visto', 'M5 12.5l4.2 4.2L19 7'],
  estrella: ['Estrella', 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z'],
  corazon: ['Corazón', 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'],
  tijera: ['Tijera', 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.2 7.8L20 19.5M8.2 16.2L20 4.5'],
  corona: ['Corona', 'M4 18.5h16M5 18.5L4 8l5 4 3-6.5 3 6.5 5-4-1 10.5'],
  flor: ['Flor', 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 10c-1.6-2.6-1.6-5 0-6.5 1.6 1.5 1.6 3.9 0 6.5zM12 14c1.6 2.6 1.6 5 0 6.5-1.6-1.5-1.6-3.9 0-6.5zM10 12c-2.6 1.6-5 1.6-6.5 0 1.5-1.6 3.9-1.6 6.5 0zM14 12c2.6-1.6 5-1.6 6.5 0-1.5 1.6-3.9 1.6-6.5 0z'],
  hoja: ['Hoja', 'M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19l7-7'],
  gota: ['Gota', 'M12 3.5s6 6.5 6 10.5a6 6 0 0 1-12 0c0-4 6-10.5 6-10.5z'],
  cafe: ['Café', 'M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c0 1.2 1 1.3 1 2.5M12 3.5c0 1.2 1 1.3 1 2.5'],
  rayo: ['Rayo', 'M13 3L5 13.5h6L10 21l8-10.5h-6z'],
  diamante: ['Diamante', 'M7 4h10l4 5-9 11L3 9zM3 9h18M10 4l-2 5 4 11 4-11-2-5'],
  pesa: ['Pesa', 'M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12'],
  logo: ['Logo del negocio', ''],
};

// ---------- estilos rápidos ----------
const E = (nombre, d) => ({ nombre, d });
export const ESTILOS = {
  clasico: E('Clásico', { paleta: 'oro-negro', tipografia: 'clasica', fondo: 'degradado', tarjeta: 'clasica', forma: 'circulo', icono: 'check', esquinas: 'redondas', efecto3d: false }),
  lujoso: E('Lujoso', { paleta: 'champan', tipografia: 'lujosa', fondo: 'animado', animacion: 'particulas', tarjeta: 'metal', forma: 'diamante', icono: 'corona', esquinas: 'suaves', efecto3d: true }),
  moderno: E('Moderno', { paleta: 'cielo', tipografia: 'moderna', fondo: 'liso', tarjeta: 'minimal', forma: 'cuadrado', icono: 'check', esquinas: 'suaves', efecto3d: false }),
  urbano: E('Urbano', { paleta: 'urbano-rojo', tipografia: 'urbana', fondo: 'animado', animacion: 'malla', tarjeta: 'vidrio', forma: 'hexagono', icono: 'rayo', esquinas: 'rectas', efecto3d: true }),
  vintage: E('Barbería vintage', { paleta: 'vino', tipografia: 'vintage', fondo: 'degradado', tarjeta: 'clasica', forma: 'circulo', icono: 'tijera', esquinas: 'redondas', efecto3d: false }),
  minimal: E('Minimal', { paleta: 'arena', tipografia: 'editorial', fondo: 'liso', tarjeta: 'minimal', forma: 'circulo', icono: 'check', esquinas: 'suaves', efecto3d: false }),
  neon: E('Neón', { paleta: 'neon-cian', tipografia: 'retro', fondo: 'animado', animacion: 'aurora', tarjeta: 'neon', forma: 'circulo', icono: 'estrella', esquinas: 'redondas', efecto3d: true }),
  spa: E('Spa', { paleta: 'salvia', tipografia: 'elegante', fondo: 'animado', animacion: 'bokeh', tarjeta: 'vidrio', forma: 'circulo', icono: 'hoja', esquinas: 'redondas', efecto3d: false }),
  belleza: E('Belleza', { paleta: 'rosa', tipografia: 'firma', fondo: 'animado', animacion: 'bokeh', tarjeta: 'vidrio', forma: 'circulo', icono: 'corazon', esquinas: 'redondas', efecto3d: true }),
  deportivo: E('Deportivo', { paleta: 'lima', tipografia: 'deportiva', fondo: 'animado', animacion: 'ondas', tarjeta: 'metal', forma: 'hexagono', icono: 'pesa', esquinas: 'rectas', efecto3d: true }),
  cafe: E('Cafetería', { paleta: 'terracota', tipografia: 'suave', fondo: 'degradado', tarjeta: 'clasica', forma: 'circulo', icono: 'cafe', esquinas: 'redondas', efecto3d: false }),
  imperial: E('Imperial', { paleta: 'esmeralda', tipografia: 'imperial', fondo: 'animado', animacion: 'brillo', tarjeta: 'metal', forma: 'diamante', icono: 'diamante', esquinas: 'suaves', efecto3d: true }),
};

/** Opciones para el panel de administración (se envían como JSON). */
export function catalogo() {
  return {
    estilos: Object.fromEntries(Object.entries(ESTILOS).map(([k, v]) => [k, { nombre: v.nombre, ...v.d, colores: PALETAS[v.d.paleta] }])),
    paletas: PALETAS,
    tipografias: Object.fromEntries(Object.entries(TIPOGRAFIAS).map(([k, v]) => [k, { nombre: v.nombre, titulo: FUENTES[v.titulo[0]].familia, texto: FUENTES[v.texto[0]].familia }])),
    fondos: FONDOS, animaciones: ANIMACIONES, tarjetas: TARJETAS, formas: FORMAS, esquinas: ESQUINAS,
    iconos: Object.fromEntries(Object.entries(ICONOS_SELLO).map(([k, v]) => [k, v[0]])),
  };
}

// ---------- validación ----------
const COLOR = /^#[0-9a-fA-F]{6}$/;
const ID_MEDIO = /^m[a-z0-9]{16}$/;
const uno = (v, opciones, def) => (Object.prototype.hasOwnProperty.call(opciones, v) ? v : def);

/** Normaliza el diseño guardado (o enviado desde /admin). Compatible con negocios antiguos (color + tema). */
export function leerDiseno(n, crudo) {
  let d = crudo;
  if (typeof d === 'string') { try { d = JSON.parse(d || '{}'); } catch { d = {}; } }
  if (!d || typeof d !== 'object') d = {};
  const nuevo = !d.tipografia;
  const legadoFondo = n && n.tema === 'claro' ? '#FAF7F2' : '#121214';
  const legadoAcento = n && COLOR.test(n.color || '') ? n.color : '#C9A55C';
  const paleta = uno(d.paleta, { ...PALETAS, propia: 1 }, 'propia');
  return {
    estilo: uno(d.estilo, ESTILOS, ''),
    paleta,
    fondoColor: COLOR.test(d.fondoColor || '') ? d.fondoColor.toUpperCase() : (paleta !== 'propia' ? PALETAS[paleta][1] : legadoFondo),
    acento: COLOR.test(d.acento || '') ? d.acento.toUpperCase() : (paleta !== 'propia' ? PALETAS[paleta][2] : legadoAcento),
    tipografia: uno(d.tipografia, TIPOGRAFIAS, nuevo ? 'clasica' : 'clasica'),
    fondo: uno(d.fondo, FONDOS, 'degradado'),
    animacion: uno(d.animacion, ANIMACIONES, 'particulas'),
    oscurecer: Math.min(0.9, Math.max(0.3, Number(d.oscurecer) || 0.65)),
    tarjeta: uno(d.tarjeta, TARJETAS, 'clasica'),
    efecto3d: d.efecto3d === true || d.efecto3d === '1' || d.efecto3d === 'on',
    forma: uno(d.forma, FORMAS, 'circulo'),
    icono: uno(d.icono, ICONOS_SELLO, 'check'),
    esquinas: uno(d.esquinas, ESQUINAS, 'redondas'),
    logo: ID_MEDIO.test(d.logo || '') ? d.logo : '',
    portada: ID_MEDIO.test(d.portada || '') ? d.portada : '',
    imagen: ID_MEDIO.test(d.imagen || '') ? d.imagen : '',
    video: ID_MEDIO.test(d.video || '') ? d.video : '',
  };
}

export const mediosDe = (d) => [d.logo, d.portada, d.imagen, d.video].filter(Boolean);

// ---------- colores con contraste garantizado ----------
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c) => '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mezcla = (a, b, k) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * k)); };
export function luminancia(h) {
  const [r, g, b] = rgb(h).map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contraste = (a, b) => { const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** Acerca el color «c» al color «hacia» hasta lograr el contraste pedido sobre «fondo». */
function asegurar(c, fondo, hacia, minimo) {
  let k = 0, r = c;
  while (contraste(r, fondo) < minimo && k < 1) { k += 0.05; r = mezcla(c, hacia, k); }
  return r;
}

export function colores(d) {
  const fondo = d.fondoColor;
  const claro = luminancia(fondo) > 0.35;
  const texto = claro ? mezcla('#14110C', fondo, 0.05) : mezcla('#F7F3EC', fondo, 0.03);
  const acento = d.acento;
  return {
    claro, fondo, texto, acento,
    suave: asegurar(mezcla(texto, fondo, 0.32), fondo, texto, 4.6),
    superficie: claro ? mezcla(fondo, '#FFFFFF', 0.72) : mezcla(fondo, '#FFFFFF', 0.055),
    superficie2: claro ? mezcla(fondo, '#000000', 0.045) : mezcla(fondo, '#FFFFFF', 0.1),
    acentoTexto: asegurar(acento, fondo, texto, 4.6),
    sobreAcento: contraste(acento, '#111111') >= contraste(acento, '#FFFFFF') ? '#111111' : '#FFFFFF',
    error: claro ? '#B3261E' : '#FF8A80', ok: claro ? '#1E7B3A' : '#7FD99A',
  };
}

const rgba = (h, a) => `rgba(${rgb(h).join(',')},${a})`;

/** CSS del negocio: variables de color, tipografías, fondo y tarjeta. */
export function temaCss(n, d) {
  const c = colores(d);
  const t = TIPOGRAFIAS[d.tipografia];
  const ft = FUENTES[t.titulo[0]], fx = FUENTES[t.texto[0]];
  const cara = (f, peso) => `@font-face{font-family:"${f.familia}";src:url(/static/fuentes/${f.archivo}-${peso}.woff2) format("woff2");font-weight:${peso};font-display:swap}`;
  const radio = { redondas: '22px', suaves: '14px', rectas: '4px' }[d.esquinas];
  const css = [
    cara(ft, t.titulo[1]), cara(fx, t.texto[1]), cara(fx, t.texto[2]),
    `:root{--acento:${c.acento};--sobre-acento:${c.sobreAcento};--acento-texto:${c.acentoTexto};--fondo:${c.fondo};--superficie:${c.superficie};--superficie-2:${c.superficie2};`
    + `--texto:${c.texto};--suave:${c.suave};--borde:${rgba(c.texto, c.claro ? 0.13 : 0.15)};--borde-campo:${rgba(c.texto, 0.52)};--error:${c.error};--ok:${c.ok};`
    + `--radio:${radio};--f-titulo:"${ft.familia}",ui-serif,Georgia,serif;--f-texto:"${fx.familia}",ui-sans-serif,system-ui,sans-serif;`
    + `--w-titulo:${t.titulo[1]};--w-fuerte:${t.texto[2]};--escala-titulo:${t.escala || 1};--ls-titulo:${t.espacio || '-.01em'};--velo:${rgba(c.fondo, d.oscurecer)};color-scheme:${c.claro ? 'light' : 'dark'}}`,
  ];
  if (d.fondo === 'imagen' && d.imagen) css.push(`.decor-imagen{background-image:url(/m/${d.imagen})}`);
  if (d.tarjeta === 'foto' && d.portada) css.push(`.carnet{background-image:linear-gradient(160deg,${rgba(c.fondo, 0.55)},${rgba(c.fondo, 0.88)}),url(/m/${d.portada})!important}`);
  return css.join('\n');
}

/** Atributos para <html> según el diseño. */
export function atributos(d) {
  const c = colores(d);
  return `data-tema="${c.claro ? 'claro' : 'oscuro'}" data-fondo="${d.fondo}" data-anim="${d.animacion}" data-tarjeta="${d.tarjeta}" data-forma="${d.forma}" data-esquinas="${d.esquinas}"${d.efecto3d ? ' data-3d="1"' : ''}`;
}

/** Capa de fondo decorativa (solo en las páginas del cliente). */
export function decor(d) {
  if (d.fondo === 'animado') return `<div class="decor decor-anim" aria-hidden="true">${'<i></i>'.repeat(24)}</div>`;
  if (d.fondo === 'imagen' && d.imagen) return '<div class="decor decor-imagen" aria-hidden="true"></div><div class="velo" aria-hidden="true"></div>';
  if (d.fondo === 'video' && d.video) return `<div class="decor" aria-hidden="true"><video class="decor-video" src="/m/${d.video}" autoplay muted loop playsinline preload="auto"></video></div><div class="velo" aria-hidden="true"></div>`;
  return '';
}

/** Contenido de un sello lleno (ícono o logo). */
export function selloLleno(d) {
  if (d.icono === 'logo' && d.logo) return `<img class="sello-logo" src="/m/${d.logo}" alt="">`;
  const p = ICONOS_SELLO[d.icono === 'logo' ? 'check' : d.icono][1];
  return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${p}"/></svg>`;
}

export const logoHtml = (d, nombre) => (d.logo ? `<img class="logo" src="/m/${d.logo}" alt="${e(nombre)}">` : '');
export const portadaHtml = (d) => (d.portada && d.tarjeta !== 'foto' ? `<img class="portada" src="/m/${d.portada}" alt="">` : '');
