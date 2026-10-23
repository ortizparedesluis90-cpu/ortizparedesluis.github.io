// Plantillas HTML. Todo el JavaScript va en /static (la política CSP no permite scripts en línea).
import { e, primerNombre, celularVisible, AVISO_VERSION } from './util.js';
import { atributos, colores, decor, selloLleno, logoHtml, portadaHtml } from './diseno.js';
import { leerPrograma, leerServicios, estado, lema, soles, TIPOS, conTarjeta } from './programa.js';

// Cambia este valor cada vez que modifiques public/static: los navegadores guardan esos archivos 1 hora.
const V = '2026-11-05';

const ICONOS = {
  check: 'M5 12.5l4.2 4.2L19 7',
  regalo: 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-3-5-3.5-5-1.5S10 7 12 7zm0 0c1.5-3 5-3.5 5-1.5S14 7 12 7z',
  wa: 'M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5zm4.6 11.8c-.2.6-1.1 1.1-1.6 1.2-.4.1-1 .1-1.6-.1-1.7-.6-3.6-2.1-4.6-3.7-.5-.8-.7-1.7-.5-2.5.2-.6.6-1 1-1.2h.6l.9 2c.1.2 0 .4-.1.6l-.5.6c.6 1.1 1.5 2 2.6 2.6l.6-.6c.2-.2.4-.2.6-.1l1.8.9c.2.1.3.4.2.6z',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2zM16 16h2v2h-2z',
  salir: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  instagram: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM17.5 6.5h.01',
  tiktok: 'M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.5 2.5 2.3 4 5 4',
  facebook: 'M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V10H6.5v3.5H9V21h3.5v-7.5H15l.5-3.5h-3V7a1 1 0 0 1 1-1H15z',
  maps: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  web: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
  camara: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  persona: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c.8-3.6 3.9-5.5 7.5-5.5s6.7 1.9 7.5 5.5',
  wallet: 'M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3M4 7.5V17a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5zM16 13.5h.01',
};
export const icono = (n) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${ICONOS[n]}"/></svg>`;

function base({ titulo, negocio, cuerpo, scripts = [], clase = '', decorar = false, neutro = false }) {
  // neutro: paneles (administración y negocio) siempre en negro y blanco, sin los colores de la marca.
  if (neutro) negocio = null;
  const d = negocio && negocio.d;
  const claro = d ? colores(d).claro : false;
  const tema = claro ? 'claro' : 'oscuro';
  const css = negocio ? `<link rel="stylesheet" href="${e(negocio.temaUrl || `/${negocio.slug}/tema.css`)}">` : '';
  return `<!doctype html>
<html lang="es-PE" ${d ? atributos(d) : 'data-tema="oscuro"'}${decorar ? ' data-decor="1"' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="${tema === 'claro' ? 'light' : 'dark'}">
<title>${e(titulo)}</title>
<link rel="icon" href="/static/icono.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/app.css?v=${V}">
${css}
</head>
<body class="${clase}">
${decorar && d ? decor(d) : ''}
<a class="saltar" href="#principal">Saltar al contenido</a>
${cuerpo}
${scripts.map((s) => `<script src="/static/${s}?v=${V}" defer></script>`).join('\n')}
</body>
</html>`;
}

const NOMBRES_REDES = { whatsapp: 'WhatsApp', instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', maps: 'Cómo llegar', web: 'Página web' };
const ICONO_RED = { whatsapp: 'wa', instagram: 'instagram', tiktok: 'tiktok', facebook: 'facebook', maps: 'maps', web: 'web' };

/** Enlaces a las redes del negocio (se configuran en /admin). */
function redes(n, titulo) {
  let r = {};
  try { r = JSON.parse(n.redes || '{}'); } catch { r = {}; }
  const items = Object.keys(NOMBRES_REDES).filter((k) => r[k]).map((k) => {
    const href = k === 'whatsapp' ? `https://wa.me/${r[k]}` : r[k];
    return `<li><a class="red" href="${e(href)}" target="_blank" rel="noopener">${icono(ICONO_RED[k])}<span>${NOMBRES_REDES[k]}</span></a></li>`;
  });
  if (!items.length) return '';
  return `<section class="redes" aria-labelledby="t-redes"><h2 id="t-redes">${e(titulo)}</h2><ul>${items.join('')}</ul></section>`;
}

const pie = (n) => `<footer class="pie">
  <p><a href="/${e(n.slug)}/privacidad">Aviso de privacidad</a></p>
  <p>${e(n.programa)} · ${e(n.nombre)}</p>
</footer>`;

// «Junta <b>10 sellos</b> y gana <b>Corte gratis</b>» según el tipo de programa.
const lemaHtml = (n) => { const [a, b, c, d] = lema(n); return `${e(a)}<strong>${e(b)}</strong>${e(c)}${d ? `<strong>${e(d)}</strong>` : ''}`; };
/** Arriba de la página: si hay logo, solo el logo (el nombre queda para lectores de pantalla); si no, nombre y programa. */
const marca = (n) => (n.d.logo
  ? `${logoHtml(n.d, n.nombre)}<h1 class="oculto-accesible">${e(n.programa)} · ${e(n.nombre)}</h1>`
  : `<p class="antetitulo">${e(n.nombre)}</p><h1>${e(n.programa)}</h1>`);
/** La frase que más motiva: cuánto le falta. La repite public/static/tarjeta.js al actualizarse. */
function fraseFalta(n, c) {
  const f = Math.max(0, n.meta - c.sellos);
  if (!f) return `¡Completaste tu tarjeta!<br>Pide en caja tu <strong>${e(n.premio)}</strong>`;
  if (f === 1) return `¡Te falta solo <strong>1 sello</strong>!<br>para tu <strong>${e(n.premio)}</strong>`;
  return `Te faltan <strong>${f} sellos</strong><br>para tu <strong>${e(n.premio)}</strong>`;
}
const pausa = (texto) => `<section class="pausa" role="status"><h2>Programa en pausa</h2><p>${texto}</p></section>`;

/** Los 3 pasos en palabras cortas, para el final de la página de registro. */
function pasosCortos(n) {
  const t = leerPrograma(n).tipo;
  if (t === 'puntos') return ['Creas tu tarjeta', 'Sumas puntos al comprar', 'Los canjeas por premios'];
  if (t === 'cashback') return ['Creas tu tarjeta', 'Juntas saldo al comprar', 'Lo usas como descuento'];
  return ['Creas tu tarjeta', 'Muestras tu QR en caja', `Ganas tu ${n.premio}`];
}

/** Así se verá su tarjeta (solo en sellos): lo que va a recibir, con el sello de regalo si el negocio lo da. */
function vistaTarjeta(n) {
  if (leerPrograma(n).tipo !== 'sellos') return '';
  const regalo = n.sello_regalo ? 1 : 0;
  const casillas = Array.from({ length: n.meta }, (_, i) => `<li class="sello${i < regalo ? ' lleno' : ''}">${i < regalo ? selloLleno(n.d) : `<span>${i + 1}</span>`}</li>`).join('');
  return `
  <section class="carnet vista-tarjeta" aria-label="Así se verá tu tarjeta">
    <div class="carnet-top"><p class="vista-nombre">${e(n.programa)}</p><span class="pill-avance">${regalo} de ${n.meta}</span></div>
    <ol class="sellos chicos" data-n="${Math.min(n.meta, 10)}" aria-hidden="true">${casillas}</ol>
    <p class="regalo-aviso">${icono('regalo')}<span>${regalo ? 'Tu primer sello va de regalo al crear tu tarjeta' : `Completa ${n.meta} sellos y gana ${e(n.premio)}`}</span></p>
  </section>`;
}

export function registro(n, { error = '', valores = {} } = {}) {
  return base({
    titulo: `${n.programa} · ${n.nombre}`,
    negocio: n,
    scripts: ['comun.js', 'registro.js', 'efectos.js'],
    decorar: true,
    cuerpo: `
<main id="principal" class="contenedor">
  ${portadaHtml(n.d)}
  <header class="cabeza compacta">
    ${marca(n)}
    <p class="bajada">${lemaHtml(n)}.</p>
  </header>

  ${n.suspendido ? pausa('Por ahora no estamos creando tarjetas nuevas. Vuelve a intentarlo más adelante.') : ''}
  <div${n.suspendido ? ' hidden' : ''}>
  ${vistaTarjeta(n)}

  <form class="tarjeta-form" id="form-registro" method="post" action="/${e(n.slug)}/registro" novalidate>
    <input type="hidden" name="origen" id="origen" value="${valores.origen === 'qr' ? 'qr' : 'enlace'}">
    <h2 class="oculto-accesible">Crea tu tarjeta</h2>
    <div class="campo">
      <label for="nombre">Tu nombre</label>
      <input id="nombre" name="nombre" type="text" autocomplete="given-name" maxlength="60" required value="${e(valores.nombre)}">
    </div>
    <div class="campo">
      <label for="celular">Tu celular (WhatsApp)</label>
      <div class="prefijo"><span aria-hidden="true">+51</span>
        <input id="celular" name="celular" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="16" placeholder="9XX XXX XXX" required aria-describedby="celular-ayuda" value="${e(valores.celular)}">
      </div>
      <p class="ayuda" id="celular-ayuda">9 dígitos, empieza con 9.</p>
    </div>
    <div class="check">
      <input id="acepta" name="acepta" type="checkbox" value="1" required>
      <label for="acepta">Tengo 14 años o más y acepto el <a href="/${e(n.slug)}/privacidad" target="_blank" rel="noopener">aviso de privacidad</a>.</label>
    </div>
    <div class="check">
      <input id="recordatorios" name="recordatorios" type="checkbox" value="1">
      <label for="recordatorios">Avísame por WhatsApp cuando esté cerca de mi premio <span class="opcional">(opcional, te das de baja cuando quieras)</span></label>
    </div>
    <p class="aviso-error" id="registro-error" role="alert"${error ? '' : ' hidden'}>${e(error)}</p>
    <button class="boton primario ancho grande" type="submit">Crear mi tarjeta gratis</button>
    <p class="seguro">Solo usamos tu nombre y celular para tu tarjeta. Sin apps ni contraseñas.</p>
  </form>
  <ol class="pasos-cortos" aria-label="Cómo funciona">
    ${pasosCortos(n).map((t, i) => `<li><strong>${i + 1}</strong><span>${e(t)}</span></li>`).join('')}
  </ol>
  </div>

  ${redes(n, 'Síguenos y reserva')}
</main>
${pie(n)}`,
  });
}

/** Carnet de puntos o cashback (en sellos se usan las casillas). */
function carnetSaldo(n, c) {
  const st = estado(n, c), pr = leerPrograma(n);
  if (st.tipo === 'puntos') {
    const sig = st.siguiente, base = sig ? sig.p : (pr.premios[pr.premios.length - 1]?.p || 1);
    const avance = Math.min(100, Math.round((st.puntos / base) * 100));
    return `
    <div class="saldo-grande"><strong id="saldo-valor">${st.puntos}</strong><span>punto${st.puntos === 1 ? '' : 's'}</span></div>
    <div class="barra" role="progressbar" aria-label="Avance al siguiente premio" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${avance}"><span></span></div>
    <p class="premio${st.listo ? ' listo' : ''}" id="premio">${icono('regalo')}<span>${e(st.premio)}</span></p>
    <ul class="premios-lista">${pr.premios.map((p) => `<li class="${p.p <= st.puntos ? 'alcanzado' : ''}"><span>${e(p.n)}</span><strong>${p.p} pts</strong></li>`).join('')}</ul>
    <p class="nota">Ganas ${pr.porSol === 1 ? '1 punto' : `${pr.porSol} puntos`} por cada S/ 1 de compra.</p>`;
  }
  return `
    <div class="saldo-grande"><strong id="saldo-valor">${e(soles(st.saldo))}</strong><span>de saldo a favor</span></div>
    <p class="premio${st.listo ? ' listo' : ''}" id="premio">${icono('regalo')}<span>${e(st.premio)}</span></p>
    <p class="nota">Recibes el ${pr.pct} % de cada compra como saldo para tus próximas compras.</p>`;
}

export function tarjeta(n, c, qrSvg, url) {
  // Con la promoción de su tarjeta (puede ser una anterior, que conserva hasta canjearla).
  n = conTarjeta(n, c);
  const tipo = leerPrograma(n).tipo;
  const sellos = Math.min(c.sellos, n.meta);
  const extra = Math.max(0, c.sellos - n.meta);
  const listo = c.sellos >= n.meta;
  const casillas = Array.from({ length: n.meta }, (_, i) =>
    `<li class="sello${i < sellos ? ' lleno' : ''}">${i < sellos ? selloLleno(n.d) : `<span>${i + 1}</span>`}</li>`).join('');
  const codigo = c.codigo.replace(/(.{4})(.{4})/, '$1 $2');
  const mensaje = `Mi tarjeta ${n.programa} de ${n.nombre}: ${url}`;
  return base({
    titulo: `Mi tarjeta · ${n.programa}`,
    negocio: n,
    scripts: ['comun.js', 'tarjeta.js', 'efectos.js'],
    decorar: true,
    cuerpo: `
<main id="principal" class="contenedor"${n.vista ? '' : ` data-api="/api/n/${e(n.slug)}/t/${e(c.token)}"`} data-meta="${n.meta}" data-tipo="${tipo}" data-premio="${e(n.premio)}">
  <template id="sello-lleno">${selloLleno(n.d)}</template>
  <header class="cabeza compacta">
    ${marca(n)}
  </header>

  ${n.suspendido ? pausa('Tus sellos están guardados. Por ahora el negocio no está sumando sellos.') : ''}
  <section class="carnet" aria-labelledby="hola">
    <span class="brillo" aria-hidden="true"></span>
    <div class="carnet-top">
      <h2 id="hola">Hola, ${e(primerNombre(c.nombre))}</h2>
      ${tipo === 'sellos' ? `<span class="pill-avance" id="avance">${sellos} de ${n.meta}</span>` : ''}
    </div>
    ${tipo === 'sellos' ? `<p class="frase-avance" id="progreso" aria-live="polite">${fraseFalta(n, c)}</p>
    <div class="barra" role="progressbar" aria-label="Avance de tu tarjeta" aria-valuemin="0" aria-valuemax="${n.meta}" aria-valuenow="${sellos}" id="barra"><span></span></div>
    <ol class="sellos" id="sellos" aria-label="Sellos: ${sellos} de ${n.meta}">${casillas}</ol>
    ${c.meta_t || c.premio_t ? '<p class="promo-anterior">Tu tarjeta conserva la promoción con la que empezaste.</p>' : ''}
    <p class="extra" id="extra"${extra ? '' : ' hidden'}>+${extra} sello${extra === 1 ? '' : 's'} para tu próxima tarjeta</p>
    <p class="premio listo" id="premio"${listo ? '' : ' hidden'}>${icono('regalo')}<span><strong>¡Premio listo!</strong> Muestra tu código en caja</span></p>` : carnetSaldo(n, c)}
  </section>

  <section class="qr-caja" aria-labelledby="qr-titulo">
    <h2 id="qr-titulo">Muestra este código en caja</h2>
    <div class="qr" role="img" aria-label="Código QR de tu tarjeta">${qrSvg}</div>
    <p class="codigo" aria-label="Código ${e(c.codigo.split('').join(' '))}">${e(codigo)}</p>
  </section>

  <section class="acciones">
    ${n.wallet ? `<a class="boton wallet" href="/${e(n.slug)}/t/${e(c.token)}/wallet" rel="nofollow">${icono('wallet')}Agregar a Google Wallet</a>` : ''}
    <a class="boton" href="https://wa.me/${e(c.celular)}?text=${encodeURIComponent(mensaje)}" target="_blank" rel="noopener">${icono('wa')}Guardar mi tarjeta por WhatsApp</a>
    <p class="nota">Te llega tu enlace a tu WhatsApp para abrirla cuando quieras. No lo compartas.</p>
  </section>

  ${redes(n, `Reserva y síguenos`)}

  <details class="borrar">
    <summary>Eliminar mis datos</summary>
    <p>Se borrarán tu tarjeta, tu historial y tu celular de forma permanente.</p>
    <button class="boton peligro" type="button" id="eliminar">Eliminar mi tarjeta</button>
    <p class="aviso-error" id="eliminar-msg" role="alert" hidden></p>
  </details>
</main>
${pie(n)}`,
  });
}

export function cartel(n, qr, url) {
  const pr = leerPrograma(n);
  const tercero = pr.tipo === 'puntos' ? 'Muéstrala en cada compra y suma puntos' : pr.tipo === 'cashback' ? 'Muéstrala en cada compra y junta saldo' : 'Muéstrala en cada visita y suma sellos';
  // En sellos, una fila con los sellos de la meta (los primeros llenos) para que se entienda de un vistazo.
  const fila = pr.tipo === 'sellos'
    ? `<div class="l-sellos" aria-hidden="true">${Array.from({ length: Math.min(n.meta, 12) }, (_, i) => `<i${i < 3 ? ' class="lleno"' : ''}></i>`).join('')}</div>` : '';
  const formatos = [['acrilico', 'Tótem acrílico', '15 × 21 cm'], ['a4', 'A4 vertical · pared', '21 × 29.7 cm'], ['a5', 'A5 vertical · mostrador', '14.8 × 21 cm'], ['mesa', 'Mesa', '10 × 15 cm'], ['a5h', 'A5 horizontal', '21 × 15 cm'], ['a4h', 'A4 horizontal', '29.7 × 21 cm']];
  return base({
    titulo: `Cartel · ${n.programa}`,
    negocio: n,
    clase: 'es-cartel',
    scripts: ['cartel.js'],
    cuerpo: `
<main id="principal" class="cartel-hoja">
  <div class="cartel-barra solo-pantalla">
    <div><h1>Cartel para imprimir</h1><p class="nota">Elige el tamaño y toca Imprimir. Usa papel mate (no brillante) para que el QR se lea mejor.</p></div>
    <div class="formatos" role="group" aria-label="Tamaño del cartel">${formatos.map(([k, t, m], i) => `<button class="boton chico" type="button" data-f="${k}" aria-pressed="${i === 0}">${t}<span>${m}</span></button>`).join('')}</div>
    <button class="boton primario" type="button" id="imprimir">Imprimir</button>
    ${n.suspendido ? '<p class="aviso-error">Este negocio está suspendido: el QR mostrará «Programa en pausa».</p>' : ''}
  </div>
  <article class="lamina" id="lamina" data-f="acrilico" aria-label="Cartel de ${e(n.programa)}">
    <div class="l-marco">
      <header class="l-cabeza">
        ${n.d.logo ? `<img class="l-logo" src="/m/${e(n.d.logo)}" alt="${e(n.nombre)}">` : `<p class="l-negocio">${e(n.nombre)}</p>`}
        <h2 class="l-programa">${e(n.programa)}</h2>
        <p class="l-lema">${lemaHtml(n)}</p>
        ${fila}
      </header>
      <div class="l-qr">
        <p class="l-qr-k">Escanéame</p>
        <div class="l-qr-img" role="img" aria-label="Código QR para crear tu tarjeta">${qr}</div>
      </div>
      <ol class="l-pasos">
        <li>${icono('camara')}<span>Escanea el QR con la cámara de tu celular</span></li>
        <li>${icono('persona')}<span>Pon tu nombre y celular: tu tarjeta queda lista</span></li>
        <li>${icono('qr')}<span>${tercero}</span></li>
      </ol>
      <p class="l-pie"><strong>Gratis</strong> · Sin descargar apps<span class="l-url">${e(url.replace(/^https?:\/\//, ''))}</span></p>
    </div>
  </article>
</main>`,
  });
}

export function privacidad(n, env) {
  const titular = n.razon_social || n.nombre;
  const proveedor = env.PROVEEDOR_NOMBRE ? `${e(env.PROVEEDOR_NOMBRE)}${env.PROVEEDOR_CORREO ? ` (${e(env.PROVEEDOR_CORREO)})` : ''}` : 'el proveedor técnico de la plataforma';
  const falta = (v, t) => (v ? e(v) : `<span class="falta">[${t}]</span>`);
  return base({
    titulo: `Aviso de privacidad · ${n.programa}`,
    negocio: n,
    cuerpo: `
<main id="principal" class="contenedor legal">
  <p><a href="/${e(n.slug)}">← Volver</a></p>
  <h1>Aviso de privacidad del programa ${e(n.programa)}</h1>
  <p class="nota">Versión ${AVISO_VERSION} · Ley N.° 29733, Ley de Protección de Datos Personales, y su Reglamento (D.S. N.° 016-2024-JUS).</p>

  <h2>¿Quién es responsable de tus datos?</h2>
  <p>${e(titular)}${n.ruc ? `, RUC ${e(n.ruc)}` : ''}, con domicilio en ${falta(n.direccion, 'dirección')} («el negocio»). Correo de contacto: ${falta(n.correo, 'correo')}.</p>

  <h2>¿Qué datos usamos?</h2>
  <ul>
    <li>Tu nombre y tu número de celular.</li>
    <li>Tus visitas registradas, sellos y premios canjeados (fecha y hora).</li>
  </ul>
  <p>No pedimos DNI, correo, dirección ni datos de pago.</p>

  <h2>¿Para qué?</h2>
  <ul>
    <li><strong>Administrar tu tarjeta de sellos</strong>: registrar tus visitas, mostrar tu avance y entregarte tus premios. Es necesario para participar.</li>
    <li><strong>Recordatorios por WhatsApp</strong> sobre tus sellos, premios y promociones del negocio, <strong>solo si marcaste la casilla opcional</strong>. Puedes darte de baja cuando quieras respondiendo «BAJA» o pidiéndolo en caja.</li>
  </ul>

  <h2>¿Quién más trata tus datos?</h2>
  <p>La plataforma la opera ${proveedor}, como encargado del tratamiento por cuenta del negocio. Los datos se guardan en servidores de Cloudflare, Inc. (Estados Unidos y otros países), lo que constituye un flujo transfronterizo de datos personales. No vendemos ni cedemos tus datos a terceros.</p>

  <h2>¿Por cuánto tiempo?</h2>
  <p>Mientras tu tarjeta esté activa. Si pasan 24 meses sin visitas, se elimina automáticamente.</p>

  <h2>Tus derechos</h2>
  <p>Puedes acceder, rectificar, cancelar u oponerte al uso de tus datos (derechos ARCO), y revocar tu consentimiento, escribiendo a ${falta(n.correo, 'correo')} o pidiéndolo en el local. También puedes borrar tu tarjeta tú mismo desde la opción «Eliminar mis datos». Responderemos dentro de los plazos de ley. Si no estás conforme, puedes acudir a la Autoridad Nacional de Protección de Datos Personales del Ministerio de Justicia y Derechos Humanos.</p>

  <h2>Estadísticas</h2>
  <p>Contamos cuántas veces se abre la página de registro (por día y si llegó desde el QR del mostrador) con una cookie técnica que dura 12 horas. Ese conteo es anónimo: no guarda tu IP ni ningún dato tuyo.</p>

  <h2>Seguridad</h2>
  <p>El acceso al panel del negocio está protegido con clave, la conexión es cifrada (HTTPS) y tu tarjeta solo se abre con tu enlace privado.</p>
</main>
${pie(n)}`,
  });
}

/** «Tus números» completos (los pinta public/static/numeros.js). Van en /admin y, si se activa, en el panel. */
function bloqueNumeros(titulo = 'Tus números') {
  return `
    <section class="bloque numeros" aria-labelledby="t-numeros">
      <div class="fila"><h2 id="t-numeros">${titulo}</h2><label class="mes"><span class="oculto-accesible">Mes</span><select id="n-mes"></select></label></div>
      <div class="vacio-numeros" id="n-vacio" hidden>
        <p><strong>Aún no hay visitas registradas.</strong> Con cada sello que se sume, aquí se irá llenando cuánto dejan los clientes, los mejores clientes y los días más fuertes.</p>
        <button class="boton chico" type="button" id="n-ver-ejemplo">Ver un ejemplo</button>
      </div>
      <div class="aviso-plan" id="n-ejemplo" role="status" hidden><span>Estás viendo un <strong>ejemplo con datos inventados</strong>.</span> <button class="boton chico" type="button" id="n-salir-ejemplo">Volver a los datos reales</button></div>
      <div class="heroe" id="n-heroe" aria-live="polite" tabindex="-1"></div>
      <p class="nota solo-tarjeta">Solo cuenta a los clientes <strong>con tarjeta</strong>: las visitas de quienes no se registraron no aparecen aquí. Por eso estos números son menores que la caja total; mientras más clientes se registren, más completos serán.</p>
      <dl class="datos" id="n-datos"></dl>

      <h3 class="subtitulo">Lo que dejaron los clientes con tarjeta, mes a mes <span>(últimos 6 meses)</span></h3>
      <div class="grafico" id="n-grafico"></div>
      <details class="ver-tabla"><summary>Ver en tabla</summary><div class="tabla-envoltura"><table class="tabla" id="n-tabla"></table></div></details>

      <h3 class="subtitulo">Clientes más fieles <span>(últimos 90 días)</span></h3>
      <ol class="lista ranking" id="n-top"></ol>

      <div id="n-vendidos-caja" hidden>
        <h3 class="subtitulo">Servicios más vendidos <span>(últimos 90 días)</span></h3>
        <ol class="lista ranking" id="n-vendidos"></ol>
      </div>

      <h3 class="subtitulo">Días con más visitas <span>(últimos 90 días)</span></h3>
      <div class="grafico" id="n-dias"></div>
      <p class="nota" id="n-horas"></p>

      <h3 class="subtitulo">Hace tiempo que no vienen</h3>
      <p class="nota" id="n-riesgo-nota"></p>
      <ul class="lista" id="n-riesgo"></ul>

      <p class="nota">Cómo se calcula: solo cuentan los clientes con tarjeta, y cada vez que registras una visita (sello o compra) cuenta como visita. Se usa lo cobrado en cada visita; si no se anotó, el precio promedio. «Clientes que volvieron» son los que vinieron este mes y ya habían venido antes. «Dejaron de venir» son los que venían seguido y llevan más de 45 días sin aparecer.</p>
    </section>`;
}

export function panel(n) {
  return base({
    titulo: `Panel · ${n.nombre}`,
    negocio: n,
    neutro: true,
    clase: 'es-panel',
    scripts: ['jsqr.js', 'comun.js', ...(n.mostrar_numeros ? ['numeros.js'] : []), 'panel.js'],
    cuerpo: `
<main id="principal" class="contenedor ancho" data-slug="${e(n.slug)}" data-meta="${n.meta}" data-premio="${e(n.premio)}" data-negocio="${e(n.nombre)}" data-programa="${e(n.programa)}" data-tipo="${leerPrograma(n).tipo}" data-reglas="${e(JSON.stringify(leerPrograma(n)))}" data-servicios="${e(JSON.stringify(leerServicios(n)))}" data-pedir="${n.pedir_servicio ? 1 : 0}">
  <header class="cabeza compacta fila cabeza-panel">
    <div><p class="antetitulo">Panel</p><h1>${e(n.nombre)}</h1></div>
    <button class="salir-discreto" type="button" id="salir" hidden>Salir</button>
  </header>

  <noscript><p class="aviso-error">El panel necesita JavaScript activado.</p></noscript>
  <section class="pausa" id="suspendido" role="alert" hidden><h2>Panel suspendido</h2><p>Comunícate con tu proveedor para reactivarlo. Tus clientes y sus sellos están guardados.</p></section>
  <p class="aviso-plan" id="aviso-plan" role="status" hidden></p>

  <form id="login" class="tarjeta-form" hidden>
    <h2>Ingresar</h2>
    <div class="campo"><label for="clave">Clave del panel</label><input id="clave" type="password" autocomplete="current-password" required></div>
    <p class="aviso-error" id="login-error" role="alert" hidden></p>
    <button class="boton primario ancho" type="submit">Entrar</button>
  </form>

  <div id="app" hidden>
    <section class="hoy" aria-labelledby="t-hoy">
      <p class="hoy-t" id="t-hoy">Hoy</p>
      <p class="hoy-valor" id="hoy-visitas" aria-live="polite">0 visitas</p>
      <p class="hoy-nota">Escanea a cada cliente al cobrar.</p>
    </section>

    <section class="bloque" aria-labelledby="t-buscar" id="registrar">
      <h2 id="t-buscar">Buscar cliente</h2>
      <div class="camara" id="camara" hidden>
        <video id="video" playsinline muted></video>
        <div class="mira" aria-hidden="true"></div>
        <p class="camara-ayuda" aria-hidden="true">Pon el QR dentro del cuadro, a un palmo del celular</p>
        <div class="camara-botones"><button class="boton chico" type="button" id="linterna" aria-pressed="false" hidden>Linterna</button><button class="boton chico" type="button" id="cerrar-camara">Cerrar cámara</button></div>
      </div>
      <form id="buscar" class="buscar">
        <label for="q">Código, celular o nombre</label>
        <div class="fila-input"><input id="q" type="search" autocomplete="off" required><button class="boton" type="submit">Buscar</button></div>
      </form>
      <p class="aviso-error" id="buscar-msg" role="alert" hidden></p>
      <ul class="resultados" id="resultados" hidden></ul>
    </section>

    <section class="bloque cliente" id="cliente" aria-labelledby="c-nombre" hidden tabindex="-1">
      <div class="fila"><h2 id="c-nombre"></h2><span class="chip" id="c-codigo"></span></div>
      <p class="sub" id="c-celular"></p>
      <ol class="sellos chicos" id="c-sellos" aria-hidden="true"></ol>
      <p class="progreso" id="c-progreso" aria-live="polite"></p>
      <p class="promo-aviso" id="c-promo" hidden></p>
      <p class="suele" id="c-suele" hidden></p>
      <div class="servicios-elegir" id="c-servicios" role="group" aria-label="Servicios de esta visita" hidden></div>
      <div class="campo monto"><label for="c-monto" id="c-monto-label">Cobrado en esta visita (S/) <span>opcional</span></label><input id="c-monto" type="text" inputmode="decimal" autocomplete="off" maxlength="9" aria-describedby="c-monto-ayuda"><p class="ayuda" id="c-monto-ayuda">Si lo dejas vacío, se cuenta tu precio promedio en «Tus números».</p></div>
      <div class="botones">
        <button class="boton primario grande" type="button" id="sumar">+1 sello</button>
        <button class="boton grande" type="button" id="canjear" disabled>Canjear premio</button>
      </div>
      <div class="canje-opciones" id="c-canje" hidden></div>
      <p class="estado" id="c-msg" role="status"></p>
      <details class="historial" id="c-historial" open>
        <summary>Sus últimas visitas</summary>
        <ul class="lista-historial" id="c-hist-lista"></ul>
      </details>
      <div class="botones chicos">
        <button class="boton chico" type="button" id="deshacer">Deshacer última visita</button>
        <a class="boton chico" id="reenviar" target="_blank" rel="noopener">${icono('wa')}Enviarle su tarjeta</a>
        <label class="interruptor"><input type="checkbox" id="c-recordatorios"> Acepta recordatorios</label>
      </div>
      <details class="papel" id="c-papel"${leerPrograma(n).tipo === 'sellos' ? '' : ' hidden'}>
        <summary>Pasar sellos de su tarjeta de papel</summary>
        <p class="nota">Úsalo una sola vez, cuando el cliente te entrega su tarjeta de papel. Si tiene varias, suma todos los sellos. No cuenta como visita y quédate con su tarjeta de papel.</p>
        <div class="fila-input"><label class="oculto-accesible" for="c-papel-n">Sellos que tenía en papel</label><input id="c-papel-n" type="number" inputmode="numeric" min="1" max="${n.meta}" placeholder="Ej.: 3"><button class="boton" type="button" id="c-papel-btn">Pasar sellos</button></div>
      </details>
      <details class="borrar">
        <summary>Eliminar cliente</summary>
        <p>Úsalo si el cliente pide borrar sus datos. No se puede deshacer.</p>
        <button class="boton peligro chico" type="button" id="eliminar">Eliminar definitivamente</button>
      </details>
    </section>

    <section class="bloque destacado" aria-labelledby="t-cerca">
      <div class="fila"><h2 id="t-cerca">Escríbeles hoy <span class="chip" id="escribir-total" hidden></span></h2><button class="boton chico" type="button" id="recargar">Actualizar</button></div>
      <p class="nota">Un mensaje a tiempo hace que vuelvan. Solo salen los que aceptaron mensajes.</p>
      <p class="vacio-lista" id="escribir-vacio">Nadie por ahora. Cuando alguien esté cerca de su premio o deje de venir, aparecerá aquí.</p>
      <div id="cerca-caja" hidden>
        <h3 class="subtitulo">Cerca de su premio</h3>
        <ul class="lista" id="cerca"></ul>
      </div>
      <div id="extranamos-caja" hidden>
        <h3 class="subtitulo">Hace tiempo que no vienen</h3>
        <ul class="lista" id="extranamos"></ul>
      </div>
    </section>

    <section class="bloque" aria-labelledby="t-mes">
      <div class="fila"><h2 id="t-mes">Este mes</h2><span class="etiqueta-mes" id="mes-nombre"></span></div>
      <dl class="datos simples" id="res-mes"></dl>
      ${n.mostrar_numeros ? '' : '<p class="nota">Tu reporte completo (cuánto te dejaron tus clientes, tus días más fuertes y quiénes dejaron de venir) te llega cada mes por WhatsApp.</p>'}
    </section>

    <section class="bloque" aria-labelledby="t-top">
      <h2 id="t-top">Tus mejores clientes</h2>
      <p class="nota">Los que más vinieron en los últimos 3 meses. Trátalos como VIP.</p>
      <ol class="lista ranking" id="top"></ol>
    </section>

    ${n.mostrar_numeros ? bloqueNumeros() : ''}

    <section class="bloque" aria-labelledby="t-clientes">
      <div class="fila"><h2 id="t-clientes">Clientes registrados</h2><span class="chip" id="total-clientes">0</span></div>
      <p class="nota">Los últimos que crearon su tarjeta. Para encontrar a alguien, búscalo arriba en «Registrar visita».</p>
      <ul class="lista" id="clientes"></ul>
      <button class="boton chico" type="button" id="mas-clientes" hidden>Ver más clientes</button>
    </section>

    <section class="bloque" aria-labelledby="t-cartel">
      <h2 id="t-cartel">Tu cartel y tu enlace</h2>
      <p class="nota">Pon el cartel en el mostrador: tus clientes escanean el QR y crean su tarjeta en segundos.</p>
      <p><a class="boton primario" href="/${e(n.slug)}/cartel" target="_blank" rel="noopener">${icono('qr')}Imprimir cartel con QR</a></p>
      <p class="nota">O comparte este enlace en tu Instagram o WhatsApp: <a id="enlace-registro" href="/${e(n.slug)}">/${e(n.slug)}</a></p>
      <p><a class="boton chico" id="csv" href="/api/n/${e(n.slug)}/clientes.csv" download>Descargar lista de clientes (Excel)</a></p>
    </section>

    <nav class="barra-fija" aria-label="Registrar visita">
      <button class="boton primario grande" type="button" id="escanear" aria-label="Escanear QR del cliente">${icono('qr')}Escanear QR</button>
      <button class="boton grande" type="button" id="ir-buscar">Buscar</button>
    </nav>
  </div>
</main>`,
  });
}

export function admin() {
  return base({
    titulo: 'Administración · Sistema de sellos',
    clase: 'es-panel',
    scripts: ['comun.js', 'numeros.js', 'admin.js'],
    cuerpo: `
<main id="principal" class="contenedor ancho admin">
  <header class="cabeza compacta fila">
    <div><p class="antetitulo">Sistema de sellos</p><h1>Administración</h1></div>
    <button class="boton chico" type="button" id="salir" hidden>${icono('salir')}Salir</button>
  </header>
  <noscript><p class="aviso-error">Esta página necesita JavaScript activado.</p></noscript>

  <form id="login" class="tarjeta-form" hidden>
    <h2>Ingresar</h2>
    <div class="campo"><label for="clave">Clave de administración</label><input id="clave" type="password" autocomplete="current-password" required></div>
    <p class="aviso-error" id="login-error" role="alert" hidden></p>
    <button class="boton primario ancho" type="submit">Entrar</button>
  </form>

  <div id="app" hidden>
    <section class="bloque" aria-labelledby="t-negocios">
      <h2 id="t-negocios">Negocios</h2>
      <div class="aviso-cobros" id="cobros" role="status" hidden></div>
      <div class="tabla-envoltura" role="region" aria-label="Tabla de negocios" tabindex="0">
        <table class="tabla">
          <thead><tr><th scope="col">Negocio</th><th scope="col">Clientes</th><th scope="col">Escaneos del QR (30 días)</th><th scope="col">Visitas (30 días)</th><th scope="col">Cerca del premio</th><th scope="col">Plan y vencimiento</th><th scope="col">Enlaces</th></tr></thead>
          <tbody id="negocios"></tbody>
        </table>
      </div>
    </section>

    <section class="bloque detalle" id="detalle" aria-labelledby="t-numeros" hidden tabindex="-1">
      <div class="detalle-cabeza">
        <div class="detalle-negocio"><span class="detalle-logo" id="det-logo" aria-hidden="true"></span><div><p class="antetitulo">Números del negocio</p><p class="detalle-nombre" id="det-nombre"></p></div></div>
        <div class="botones chicos">
          <a class="boton chico primario" id="det-reporte" target="_blank" rel="noopener">Reporte del mes (PDF)</a>
          <a class="boton chico" id="det-wa" target="_blank" rel="noopener">${icono('wa')}Enviar resumen</a>
          <button class="boton chico" type="button" id="det-cerrar">Cerrar</button>
        </div>
      </div>
      <p class="nota">Esto ya no lo ve el dueño en su panel (salvo que actives «Mostrar números completos al dueño»). Elige el mes, abre el reporte, guárdalo en PDF y mándaselo por WhatsApp.</p>
      ${bloqueNumeros('Resumen del mes')}
      <h3 class="subtitulo">Su cartel y su enlace <span>(últimos 30 días)</span></h3>
      <dl class="datos" id="det-alcance"></dl>
    </section>

    <section class="bloque numeros" aria-labelledby="t-rend">
      <div class="fila"><h2 id="t-rend">Rendimiento de tus negocios</h2><span class="chip" id="r-mes"></span></div>
      <p class="nota" id="r-nota"></p>
      <dl class="datos" id="r-total"></dl>
      <div class="tabla-envoltura" role="region" aria-label="Rendimiento por negocio" tabindex="0">
        <table class="tabla rendimiento">
          <thead><tr><th scope="col">Negocio</th><th scope="col">Visitas</th><th scope="col">De clientes que regresan</th><th scope="col">Ganancia del programa</th><th scope="col">Por cada S/ 1</th><th scope="col">Dejaron de venir</th><th scope="col">Informe</th></tr></thead>
          <tbody id="rendimiento"></tbody>
        </table>
      </div>
      <p class="nota">Mismos cálculos que «Tus números» en el panel de cada negocio. «Informe» abre un WhatsApp al negocio con su resumen del mes: úsalo antes de cada renovación.</p>
    </section>

    <section class="bloque" aria-labelledby="t-form">
      <h2 id="t-form">Agregar o editar negocio</h2>
      <p class="nota">Para editar uno existente, toca «Editar» en la tabla. Deja la clave en blanco para no cambiarla.</p>
      <div class="editor">
      <form id="form-negocio" class="editor-form">
        <input type="hidden" name="editar" value="">
        <fieldset class="grupo">
          <legend>1. El negocio y su premio</legend>
          <div class="rejilla">
            <div class="campo"><label for="f-slug">Identificador (va en la dirección)</label><input id="f-slug" name="slug" required pattern="[a-z0-9\\-]{1,30}" placeholder="filo" aria-describedby="f-slug-ayuda"><p class="ayuda" id="f-slug-ayuda">Minúsculas, números y guiones.</p></div>
            <div class="campo"><label for="f-nombre">Nombre comercial</label><input id="f-nombre" name="nombre" required maxlength="60"></div>
            <div class="campo"><label for="f-programa">Nombre del programa</label><input id="f-programa" name="programa" required maxlength="40" placeholder="Club Filo"></div>
            <div class="campo"><label for="f-tipo">Tipo de tarjeta</label><select id="f-tipo" name="tipo" aria-describedby="f-tipo-ayuda">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${e(v)}</option>`).join('')}</select><p class="ayuda" id="f-tipo-ayuda">Sellos: barberías y spas. Puntos o cashback: cafeterías, restaurantes y tiendas, donde cada cliente gasta distinto.</p></div>
            <div class="campo" data-solo="puntos" hidden><label for="f-por-sol">Puntos por cada S/ 1</label><input id="f-por-sol" name="por_sol" type="text" inputmode="decimal" value="1" maxlength="5"></div>
            <div class="campo" data-solo="puntos" hidden><label for="f-premios-texto">Premios por puntos</label><textarea id="f-premios-texto" name="premios_texto" rows="4" placeholder="100 = Café gratis&#10;250 = Postre gratis&#10;500 = Almuerzo gratis" aria-describedby="f-premios-ayuda"></textarea><p class="ayuda" id="f-premios-ayuda">Uno por línea: puntos = premio.</p></div>
            <div class="campo" data-solo="cashback" hidden><label for="f-pct">Porcentaje de vuelta (%)</label><input id="f-pct" name="pct" type="text" inputmode="decimal" value="5" maxlength="5" aria-describedby="f-pct-ayuda"><p class="ayuda" id="f-pct-ayuda">De cada compra, este % queda como saldo del cliente.</p></div>
            <div class="campo" data-solo="cashback" hidden><label for="f-minimo">Saldo mínimo para usar (S/)</label><input id="f-minimo" name="minimo" type="text" inputmode="decimal" value="5" maxlength="7"></div>
            <div class="campo" data-solo="sellos"><label for="f-meta">Sellos para el premio</label><input id="f-meta" name="meta" type="number" min="3" max="20" value="10" required></div>
            <div class="campo" data-solo="sellos"><label for="f-premio">Premio</label><input id="f-premio" name="premio" required maxlength="60" placeholder="Corte gratis"></div>
            <div class="check ancho-total" data-solo="sellos"><input id="f-regalo" name="sello_regalo" type="checkbox" value="1" aria-describedby="f-regalo-ayuda"><label for="f-regalo">Primer sello de regalo al crear la tarjeta</label></div>
            <p class="ayuda ancho-total" data-solo="sellos" id="f-regalo-ayuda">Recomendado: una tarjeta que empieza con 1 sello se completa más que una vacía. No cuenta como visita.</p>
          </div>
        </fieldset>
        <fieldset class="diseno" id="diseno">
          <legend>2. Diseño de la página y la tarjeta</legend>
          <p class="nota">Elige un estilo rápido y luego ajusta lo que quieras. La vista previa se actualiza sola mientras eliges.</p>
          <h3 class="subtitulo">Estilo rápido</h3>
          <div class="opciones" id="d-estilos" role="group" aria-label="Estilos rápidos"></div>
          <h3 class="subtitulo">Colores</h3>
          <div class="opciones paletas" id="d-paletas" role="group" aria-label="Paletas de colores"></div>
          <div class="rejilla">
            <div class="campo"><label for="d-fondoColor">Color de fondo</label><input id="d-fondoColor" type="color" value="#0F0D0B"></div>
            <div class="campo"><label for="d-acento">Color principal (botones y sellos)</label><input id="d-acento" type="color" value="#C9A55C"></div>
          </div>
          <p class="ayuda">Los textos se ajustan solos para que siempre se lean bien sobre el fondo que elijas.</p>
          <h3 class="subtitulo">Letras, fondo y tarjeta</h3>
          <div class="rejilla">
            <div class="campo"><label for="d-tipografia">Tipografía</label><select id="d-tipografia"></select></div>
            <div class="campo"><label for="d-fondo">Fondo de la página</label><select id="d-fondo"></select></div>
            <div class="campo" id="c-animacion"><label for="d-animacion">Animación del fondo</label><select id="d-animacion"></select></div>
            <div class="campo" id="c-oscurecer"><label for="d-oscurecer">Oscurecer la foto o el video</label><input id="d-oscurecer" type="range" min="0.3" max="0.9" step="0.05" value="0.65"></div>
            <div class="campo"><label for="d-tarjeta">Estilo de la tarjeta</label><select id="d-tarjeta"></select></div>
            <div class="campo"><label for="d-forma">Forma de los sellos</label><select id="d-forma"></select></div>
            <div class="campo"><label for="d-icono">Ícono del sello</label><select id="d-icono"></select></div>
            <div class="campo"><label for="d-esquinas">Esquinas</label><select id="d-esquinas"></select></div>
            <div class="check"><input id="d-efecto3d" type="checkbox"><label for="d-efecto3d">Tarjeta en 3D (se inclina con el dedo y tiene brillo)</label></div>
          </div>
          <h3 class="subtitulo">Logo, fotos y video</h3>
          <p class="aviso-error" id="d-medios-aviso" hidden>Para subir fotos y videos falta activar el almacenamiento: en Cloudflare entra a <strong>Storage &amp; Databases → KV → Create</strong>, ponle de nombre <strong>medios</strong> y mándale el <strong>ID</strong> a quien te instaló el sistema.</p>
          <p class="nota" id="d-medios-guardar" hidden>Guarda el negocio primero para poder subir su logo, fotos y video.</p>
          <div class="medios">
          <div class="medio" data-tipo="logo">
            <p class="medio-nombre">Logo</p>
            <div class="medio-vista" id="mv-logo"><span>Sin archivo</span></div>
            <div class="botones chicos">
              <label class="boton chico subir">Subir<input type="file" accept="image/png,image/jpeg,image/webp" class="oculto-accesible" data-tipo="logo" aria-label="Subir logo"></label>
              <button class="boton chico" type="button" data-quitar="logo">Quitar</button>
            </div>
            <p class="ayuda">PNG con fondo transparente, cuadrado.</p>
          </div>
          <div class="medio" data-tipo="portada">
            <p class="medio-nombre">Foto de portada</p>
            <div class="medio-vista" id="mv-portada"><span>Sin archivo</span></div>
            <div class="botones chicos">
              <label class="boton chico subir">Subir<input type="file" accept="image/png,image/jpeg,image/webp" class="oculto-accesible" data-tipo="portada" aria-label="Subir foto de portada"></label>
              <button class="boton chico" type="button" data-quitar="portada">Quitar</button>
            </div>
            <p class="ayuda">Va arriba de la página de registro (o detrás de la tarjeta si eliges «Con foto de portada»).</p>
          </div>
          <div class="medio" data-tipo="imagen">
            <p class="medio-nombre">Imagen de fondo</p>
            <div class="medio-vista" id="mv-imagen"><span>Sin archivo</span></div>
            <div class="botones chicos">
              <label class="boton chico subir">Subir<input type="file" accept="image/png,image/jpeg,image/webp" class="oculto-accesible" data-tipo="imagen" aria-label="Subir imagen de fondo"></label>
              <button class="boton chico" type="button" data-quitar="imagen">Quitar</button>
            </div>
            <p class="ayuda">Para el fondo «Foto o imagen».</p>
          </div>
          <div class="medio" data-tipo="video">
            <p class="medio-nombre">Video de fondo</p>
            <div class="medio-vista" id="mv-video"><span>Sin archivo</span></div>
            <div class="botones chicos">
              <label class="boton chico subir">Subir<input type="file" accept="video/mp4,video/webm" class="oculto-accesible" data-tipo="video" aria-label="Subir video de fondo"></label>
              <button class="boton chico" type="button" data-quitar="video">Quitar</button>
            </div>
            <p class="ayuda">MP4 de 5 a 15 segundos, menos de 15 MB. Se reproduce sin sonido.</p>
          </div>
          </div>
        </fieldset>
        <fieldset class="grupo">
          <legend>3. Servicios y precios</legend>
          <p class="nota">Pon cada servicio con su precio. En cada visita el cajero lo elige con un toque y así «Tus números» del negocio muestra lo que de verdad ganó.</p>
          <div class="rejilla">
            <div class="campo"><label for="f-precio">Precio promedio por servicio (S/)</label><input id="f-precio" name="precio" type="text" inputmode="decimal" maxlength="7" placeholder="35" aria-describedby="f-precio-ayuda"><p class="ayuda" id="f-precio-ayuda">Lo que cobra en promedio (un corte, por ejemplo). Con eso su panel calcula cuánto le dejan sus clientes y cuánto deja de ganar.</p></div>
            <div class="campo"><label for="f-costo-premio">Lo que le cuesta dar el premio (S/)</label><input id="f-costo-premio" name="costo_premio" type="text" inputmode="decimal" maxlength="7" placeholder="Igual al precio" aria-describedby="f-costo-premio-ayuda"><p class="ayuda" id="f-costo-premio-ayuda">Vacío = se cuenta como un servicio que no cobra.</p></div>
            <div class="campo"><label for="f-espera">Minutos mínimos entre visitas</label><input id="f-espera" name="espera_min" type="number" min="0" max="10080" value="180"></div>
            <div class="campo ancho-total"><label for="f-servicios">Servicios o productos con su precio</label><textarea id="f-servicios" name="servicios_texto" rows="4" placeholder="Corte = 30&#10;Barba = 15&#10;Café americano = 8" aria-describedby="f-servicios-ayuda"></textarea><p class="ayuda" id="f-servicios-ayuda">Uno por línea: nombre = precio. En el panel se eligen con un toque al registrar la visita, y «Tus números» muestra los más vendidos.</p></div>
            <div class="check ancho-total"><input id="f-pedir" name="pedir_servicio" type="checkbox" value="1" checked aria-describedby="f-pedir-ayuda"><label for="f-pedir">Pedir el servicio en cada visita (recomendado)</label></div>
            <p class="ayuda ancho-total" id="f-pedir-ayuda">El cajero no puede sumar la visita sin elegir el servicio o escribir el monto cobrado. Desmárcalo solo si casi todo es un mismo servicio al mismo precio.</p>
            <div class="check ancho-total"><input id="f-mostrar" name="mostrar_numeros" type="checkbox" value="1" aria-describedby="f-mostrar-ayuda"><label for="f-mostrar">Mostrar números completos al dueño en su panel</label></div>
            <p class="ayuda ancho-total" id="f-mostrar-ayuda">Apagado (recomendado): su panel queda simple y tú le mandas el reporte cada mes. Actívalo solo si el dueño te pide ver todo.</p>
          </div>
        </fieldset>
        <fieldset class="grupo">
          <legend>4. Redes y contacto</legend>
          <div class="rejilla">
            <div class="campo"><label for="f-red-whatsapp">WhatsApp del negocio</label><input id="f-red-whatsapp" name="red_whatsapp" type="tel" inputmode="numeric" maxlength="11" placeholder="9XX XXX XXX"></div>
            <div class="campo"><label for="f-red-instagram">Instagram (enlace)</label><input id="f-red-instagram" name="red_instagram" type="url" placeholder="https://instagram.com/..."></div>
            <div class="campo"><label for="f-red-tiktok">TikTok (enlace)</label><input id="f-red-tiktok" name="red_tiktok" type="url" placeholder="https://tiktok.com/@..."></div>
            <div class="campo"><label for="f-red-facebook">Facebook (enlace)</label><input id="f-red-facebook" name="red_facebook" type="url" placeholder="https://facebook.com/..."></div>
            <div class="campo"><label for="f-red-maps">Google Maps (enlace)</label><input id="f-red-maps" name="red_maps" type="url" placeholder="https://maps.app.goo.gl/..."></div>
            <div class="campo"><label for="f-red-web">Página Bio o web (enlace)</label><input id="f-red-web" name="red_web" type="url" placeholder="https://..."></div>
          </div>
        </fieldset>
        <fieldset class="grupo">
          <legend>5. Datos legales, plan y clave</legend>
          <div class="rejilla">
            <div class="campo"><label for="f-razon">Razón social</label><input id="f-razon" name="razon_social" maxlength="100"></div>
            <div class="campo"><label for="f-ruc">RUC</label><input id="f-ruc" name="ruc" inputmode="numeric" pattern="\\d{11}" maxlength="11"></div>
            <div class="campo"><label for="f-direccion">Dirección</label><input id="f-direccion" name="direccion" maxlength="140"></div>
            <div class="campo"><label for="f-correo">Correo para derechos ARCO</label><input id="f-correo" name="correo" type="email" maxlength="100"></div>
            <div class="campo"><label for="f-plan">Plan</label><select id="f-plan" name="plan"><option value="">Sin definir</option><option value="prueba">Mes gratis</option><option value="mensual">Mensual</option><option value="cortesia">Cortesía</option></select></div>
            <div class="campo"><label for="f-cuota">Cuota mensual (S/)</label><input id="f-cuota" name="cuota" type="text" inputmode="decimal" maxlength="7" placeholder="69" aria-describedby="f-cuota-ayuda"><p class="ayuda" id="f-cuota-ayuda">De S/ 59 a S/ 79 según la zona y el tamaño del local. Solo la ves tú, en «Rendimiento».</p></div>
            <div class="campo"><label for="f-vence">Vence el</label><input id="f-vence" name="vence" type="date" aria-describedby="f-vence-ayuda"><p class="ayuda" id="f-vence-ayuda">Si lo dejas vacío en un negocio nuevo, vence en 1 mes (primer mes gratis).</p></div>
            <div class="campo"><label for="f-clave">Clave del panel del negocio</label><input id="f-clave" name="clave" type="password" minlength="8" autocomplete="new-password" aria-describedby="f-clave-ayuda"><p class="ayuda" id="f-clave-ayuda">Mínimo 8 caracteres. Cámbiala si un empleado se va.</p></div>
          </div>
        </fieldset>
      </form>
      <aside class="editor-vista" aria-labelledby="t-vista">
        <div class="fila"><h3 class="subtitulo" id="t-vista">Vista previa</h3>
          <div class="pestanas" role="group" aria-label="Qué ver"><button class="boton chico" type="button" data-vista="v-tarjeta" aria-pressed="true">Tarjeta</button><button class="boton chico" type="button" data-vista="v-registro" aria-pressed="false">Registro</button></div></div>
        <figure class="vista"><iframe id="v-tarjeta" title="Vista previa de la tarjeta del cliente"></iframe></figure>
        <figure class="vista" hidden><iframe id="v-registro" title="Vista previa de la página de registro"></iframe></figure>
        <p class="aviso-error" id="form-msg" role="status" hidden></p>
        <button class="boton primario ancho" type="submit" form="form-negocio" id="guardar-negocio">Guardar negocio</button>
      </aside>
      </div>
    </section>
  </div>
</main>`,
  });
}

/** Reporte del mes de un negocio, para guardar en PDF y mandarlo por WhatsApp (lo arma reporte.js). */
export function reporte() {
  return base({
    titulo: 'Reporte del mes',
    clase: 'es-reporte',
    scripts: ['comun.js', 'numeros.js', 'reporte.js'],
    cuerpo: `
<div class="reporte-barra" role="toolbar" aria-label="Opciones del reporte">
  <label>Mes <select id="r-mes"></select></label>
  <button class="boton primario chico" type="button" id="r-imprimir">Guardar en PDF</button>
  <a class="boton chico" id="r-wa" target="_blank" rel="noopener" hidden>${icono('wa')}Mensaje para el dueño</a>
  <span class="nota">En el celular: «Guardar en PDF» → Compartir → WhatsApp.</span>
</div>
<main id="principal" class="reporte-hoja"><p class="nota" id="r-estado">Cargando…</p><article id="reporte" hidden></article></main>`,
  });
}

export function inicio() {
  return base({
    titulo: 'Sistema de sellos',
    cuerpo: `<main id="principal" class="contenedor"><header class="cabeza"><h1>Tarjeta de cliente frecuente</h1><p class="bajada">Pide a tu negocio favorito el enlace para crear tu tarjeta.</p></header></main>`,
  });
}

export function noEncontrado() {
  return base({
    titulo: 'No encontrado',
    cuerpo: `<main id="principal" class="contenedor"><header class="cabeza"><h1>No encontramos esta página</h1><p class="bajada">Revisa el enlace o pídelo de nuevo en el local.</p></header></main>`,
  });
}

export { celularVisible };
