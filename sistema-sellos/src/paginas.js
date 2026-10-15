// Plantillas HTML. Todo el JavaScript va en /static (la política CSP no permite scripts en línea).
import { e, primerNombre, celularVisible } from './util.js';

const ICONOS = {
  check: 'M5 12.5l4.2 4.2L19 7',
  regalo: 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-3-5-3.5-5-1.5S10 7 12 7zm0 0c1.5-3 5-3.5 5-1.5S14 7 12 7z',
  wa: 'M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5zm4.6 11.8c-.2.6-1.1 1.1-1.6 1.2-.4.1-1 .1-1.6-.1-1.7-.6-3.6-2.1-4.6-3.7-.5-.8-.7-1.7-.5-2.5.2-.6.6-1 1-1.2h.6l.9 2c.1.2 0 .4-.1.6l-.5.6c.6 1.1 1.5 2 2.6 2.6l.6-.6c.2-.2.4-.2.6-.1l1.8.9c.2.1.3.4.2.6z',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2zM16 16h2v2h-2z',
  salir: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
};
export const icono = (n) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${ICONOS[n]}"/></svg>`;

function base({ titulo, negocio, cuerpo, scripts = [], clase = '' }) {
  const tema = negocio ? e(negocio.tema) : 'oscuro';
  const css = negocio ? `<link rel="stylesheet" href="/${e(negocio.slug)}/tema.css">` : '';
  return `<!doctype html>
<html lang="es-PE" data-tema="${tema}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="${tema === 'claro' ? 'light' : 'dark'}">
<title>${e(titulo)}</title>
<link rel="icon" href="/static/icono.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/app.css">
${css}
</head>
<body class="${clase}">
<a class="saltar" href="#principal">Saltar al contenido</a>
${cuerpo}
${scripts.map((s) => `<script src="/static/${s}" defer></script>`).join('\n')}
</body>
</html>`;
}

const pie = (n) => `<footer class="pie">
  <p><a href="/${e(n.slug)}/privacidad">Aviso de privacidad</a></p>
  <p>${e(n.programa)} · ${e(n.nombre)}</p>
</footer>`;

export function registro(n, { error = '', valores = {} } = {}) {
  const titular = n.razon_social || n.nombre;
  return base({
    titulo: `${n.programa} · ${n.nombre}`,
    negocio: n,
    scripts: ['comun.js', 'registro.js'],
    cuerpo: `
<main id="principal" class="contenedor">
  <header class="cabeza">
    <p class="antetitulo">${e(n.nombre)}</p>
    <h1>${e(n.programa)}</h1>
    <p class="bajada">Junta <strong>${n.meta} sellos</strong> y gana <strong>${e(n.premio)}</strong>.</p>
  </header>

  <ol class="pasos" aria-label="Cómo funciona">
    <li><span class="num" aria-hidden="true">1</span><span>Crea tu tarjeta gratis con tu nombre y celular.</span></li>
    <li><span class="num" aria-hidden="true">2</span><span>En cada visita muestra tu código QR en caja y te sumamos un sello.</span></li>
    <li><span class="num" aria-hidden="true">3</span><span>Al completar ${n.meta} sellos, reclamas tu premio.</span></li>
  </ol>

  <form class="tarjeta-form" id="form-registro" method="post" action="/${e(n.slug)}/registro" novalidate>
    <input type="hidden" name="origen" id="origen" value="${valores.origen === 'qr' ? 'qr' : 'enlace'}">
    <h2>Crea tu tarjeta</h2>
    <p class="nota">Solo pedimos lo necesario: tu nombre y tu celular.</p>
    <div class="campo">
      <label for="nombre">Nombre</label>
      <input id="nombre" name="nombre" type="text" autocomplete="given-name" maxlength="60" required value="${e(valores.nombre)}">
    </div>
    <div class="campo">
      <label for="celular">Celular (WhatsApp)</label>
      <div class="prefijo"><span aria-hidden="true">+51</span>
        <input id="celular" name="celular" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="11" placeholder="9XX XXX XXX" required aria-describedby="celular-ayuda" value="${e(valores.celular)}">
      </div>
      <p class="ayuda" id="celular-ayuda">9 dígitos, empieza con 9.</p>
    </div>
    <div class="check">
      <input id="acepta" name="acepta" type="checkbox" value="1" required>
      <label for="acepta">Tengo 14 años o más, leí el <a href="/${e(n.slug)}/privacidad" target="_blank" rel="noopener">aviso de privacidad</a> y acepto que ${e(titular)} use mi nombre y celular para administrar mi tarjeta de sellos.</label>
    </div>
    <div class="check">
      <input id="recordatorios" name="recordatorios" type="checkbox" value="1">
      <label for="recordatorios">Quiero recibir por WhatsApp recordatorios de mis sellos y premios. <span class="opcional">(Opcional. Puedes darte de baja cuando quieras.)</span></label>
    </div>
    <p class="aviso-error" id="registro-error" role="alert"${error ? '' : ' hidden'}>${e(error)}</p>
    <button class="boton primario ancho" type="submit">Crear mi tarjeta</button>
  </form>
</main>
${pie(n)}`,
  });
}

export function tarjeta(n, c, qrSvg, url) {
  const sellos = Math.min(c.sellos, n.meta);
  const extra = Math.max(0, c.sellos - n.meta);
  const listo = c.sellos >= n.meta;
  const casillas = Array.from({ length: n.meta }, (_, i) =>
    `<li class="sello${i < sellos ? ' lleno' : ''}">${i < sellos ? icono('check') : `<span>${i + 1}</span>`}</li>`).join('');
  const codigo = c.codigo.replace(/(.{4})(.{4})/, '$1 $2');
  const mensaje = `Mi tarjeta ${n.programa} de ${n.nombre}: ${url}`;
  return base({
    titulo: `Mi tarjeta · ${n.programa}`,
    negocio: n,
    scripts: ['comun.js', 'tarjeta.js'],
    cuerpo: `
<main id="principal" class="contenedor" data-api="/api/n/${e(n.slug)}/t/${e(c.token)}" data-meta="${n.meta}">
  <header class="cabeza compacta">
    <p class="antetitulo">${e(n.nombre)}</p>
    <h1>${e(n.programa)}</h1>
  </header>

  <section class="carnet" aria-labelledby="hola">
    <div class="carnet-top">
      <h2 id="hola">Hola, ${e(primerNombre(c.nombre))}</h2>
      <p class="progreso" id="progreso" aria-live="polite">${listo ? '¡Completaste tu tarjeta!' : `Llevas <strong>${c.sellos}</strong> de ${n.meta} sellos`}</p>
    </div>
    <ol class="sellos" id="sellos" aria-label="Sellos: ${sellos} de ${n.meta}">${casillas}</ol>
    <p class="extra" id="extra"${extra ? '' : ' hidden'}>+${extra} sello${extra === 1 ? '' : 's'} para tu próxima tarjeta</p>
    <p class="premio${listo ? ' listo' : ''}" id="premio">${icono('regalo')}<span>${listo ? `<strong>¡Premio listo!</strong> Pide en caja: ${e(n.premio)}` : `Premio: ${e(n.premio)}`}</span></p>
  </section>

  <section class="qr-caja" aria-labelledby="qr-titulo">
    <h2 id="qr-titulo">Tu código</h2>
    <p>Muéstralo en caja en cada visita.</p>
    <div class="qr" role="img" aria-label="Código QR de tu tarjeta">${qrSvg}</div>
    <p class="codigo" aria-label="Código ${e(c.codigo.split('').join(' '))}">${e(codigo)}</p>
  </section>

  <section class="acciones">
    <a class="boton" href="https://wa.me/${e(c.celular)}?text=${encodeURIComponent(mensaje)}" target="_blank" rel="noopener">${icono('wa')}Enviarme el enlace por WhatsApp</a>
    <p class="nota">Guarda este enlace o agrégalo a tu pantalla de inicio (menú del navegador → «Agregar a pantalla de inicio»). Es tu tarjeta: no lo compartas.</p>
  </section>

  <dl class="datos">
    <div><dt>Visitas</dt><dd id="visitas">${c.visitas}</dd></div>
    <div><dt>Premios canjeados</dt><dd id="premios">${c.premios}</dd></div>
  </dl>

  <details class="borrar">
    <summary>Eliminar mis datos</summary>
    <p>Se borrarán tu tarjeta, tus sellos y tu celular de forma permanente.</p>
    <button class="boton peligro" type="button" id="eliminar">Eliminar mi tarjeta</button>
    <p class="aviso-error" id="eliminar-msg" role="alert" hidden></p>
  </details>
</main>
${pie(n)}`,
  });
}

export function cartel(n, qr, url) {
  return base({
    titulo: `Cartel · ${n.programa}`,
    negocio: n,
    clase: 'es-cartel',
    cuerpo: `
<main id="principal" class="contenedor cartel">
  <p class="antetitulo">${e(n.nombre)}</p>
  <h1>${e(n.programa)}</h1>
  <p class="bajada">Junta <strong>${n.meta} sellos</strong> y gana <strong>${e(n.premio)}</strong></p>
  <div class="qr grande" role="img" aria-label="Código QR para crear tu tarjeta">${qr}</div>
  <p class="cartel-paso">Escanea con la cámara de tu celular y crea tu tarjeta gratis</p>
  <p class="nota">${e(url.replace(/^https?:\/\//, ''))}</p>
  <p class="nota solo-pantalla">Imprime esta página (menú del navegador → Imprimir) y ponla en el mostrador.</p>
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
  <p class="nota">Versión ${'1'} · Ley N.° 29733, Ley de Protección de Datos Personales, y su Reglamento (D.S. N.° 016-2024-JUS).</p>

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

export function panel(n) {
  return base({
    titulo: `Panel · ${n.nombre}`,
    negocio: n,
    clase: 'es-panel',
    scripts: ['jsqr.js', 'comun.js', 'panel.js'],
    cuerpo: `
<main id="principal" class="contenedor ancho" data-slug="${e(n.slug)}" data-meta="${n.meta}" data-premio="${e(n.premio)}" data-negocio="${e(n.nombre)}" data-programa="${e(n.programa)}">
  <header class="cabeza compacta fila">
    <div><p class="antetitulo">Panel del negocio</p><h1>${e(n.nombre)}</h1></div>
    <button class="boton chico" type="button" id="salir" hidden>${icono('salir')}Salir</button>
  </header>

  <noscript><p class="aviso-error">El panel necesita JavaScript activado.</p></noscript>

  <form id="login" class="tarjeta-form" hidden>
    <h2>Ingresar</h2>
    <div class="campo"><label for="clave">Clave del panel</label><input id="clave" type="password" autocomplete="current-password" required></div>
    <p class="aviso-error" id="login-error" role="alert" hidden></p>
    <button class="boton primario ancho" type="submit">Entrar</button>
  </form>

  <div id="app" hidden>
    <section class="bloque" aria-labelledby="t-buscar">
      <h2 id="t-buscar">Registrar visita</h2>
      <button class="boton primario ancho grande" type="button" id="escanear">${icono('qr')}Escanear QR del cliente</button>
      <div class="camara" id="camara" hidden>
        <video id="video" playsinline muted></video>
        <div class="mira" aria-hidden="true"></div>
        <button class="boton chico" type="button" id="cerrar-camara">Cerrar cámara</button>
      </div>
      <form id="buscar" class="buscar">
        <label for="q">O escribe el código, celular o nombre</label>
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
      <div class="botones">
        <button class="boton primario grande" type="button" id="sumar">+1 sello</button>
        <button class="boton grande" type="button" id="canjear" disabled>Canjear premio</button>
      </div>
      <p class="estado" id="c-msg" role="status"></p>
      <div class="botones chicos">
        <button class="boton chico" type="button" id="deshacer">Deshacer último sello</button>
        <a class="boton chico" id="reenviar" target="_blank" rel="noopener">${icono('wa')}Enviarle su tarjeta</a>
        <label class="interruptor"><input type="checkbox" id="c-recordatorios"> Acepta recordatorios</label>
      </div>
      <details class="borrar">
        <summary>Eliminar cliente</summary>
        <p>Úsalo si el cliente pide borrar sus datos. No se puede deshacer.</p>
        <button class="boton peligro chico" type="button" id="eliminar">Eliminar definitivamente</button>
      </details>
    </section>

    <section class="bloque" aria-labelledby="t-cerca">
      <div class="fila"><h2 id="t-cerca">Cerca del premio</h2><button class="boton chico" type="button" id="recargar">Actualizar</button></div>
      <p class="nota">Clientes que aceptaron recordatorios y les faltan 2 sellos o menos (o ya tienen su premio). Escríbeles con un toque.</p>
      <ul class="lista" id="cerca"></ul>
    </section>

    <section class="bloque" aria-labelledby="t-resumen">
      <h2 id="t-resumen">Resumen</h2>
      <h3 class="subtitulo">Tu cartel y tu enlace <span>(últimos 30 días)</span></h3>
      <dl class="datos" id="res-alcance"></dl>
      <p class="nota">Cada celular cuenta una vez cada 12 horas. «Escaneos del QR» cuenta solo el QR del cartel del mostrador.</p>
      <h3 class="subtitulo">Tus clientes</h3>
      <dl class="datos" id="res-clientes"></dl>
      <p><a class="boton chico" id="csv" href="/api/n/${e(n.slug)}/clientes.csv" download>Descargar clientes (CSV)</a></p>
      <p class="nota">Enlace para que tus clientes creen su tarjeta: <a id="enlace-registro" href="/${e(n.slug)}">/${e(n.slug)}</a></p>
      <p><a class="boton chico" href="/${e(n.slug)}/cartel" target="_blank" rel="noopener">${icono('qr')}Cartel con QR para el mostrador</a></p>
    </section>
  </div>
</main>`,
  });
}

export function admin() {
  return base({
    titulo: 'Administración · Sistema de sellos',
    clase: 'es-panel',
    scripts: ['comun.js', 'admin.js'],
    cuerpo: `
<main id="principal" class="contenedor ancho">
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
      <div class="tabla-envoltura" role="region" aria-label="Tabla de negocios" tabindex="0">
        <table class="tabla">
          <thead><tr><th scope="col">Negocio</th><th scope="col">Clientes</th><th scope="col">Escaneos del QR (30 días)</th><th scope="col">Visitas (30 días)</th><th scope="col">Cerca del premio</th><th scope="col">Enlaces</th></tr></thead>
          <tbody id="negocios"></tbody>
        </table>
      </div>
    </section>

    <section class="bloque" aria-labelledby="t-form">
      <h2 id="t-form">Agregar o editar negocio</h2>
      <p class="nota">Para editar uno existente, escribe el mismo identificador. Deja la clave en blanco para no cambiarla.</p>
      <form id="form-negocio" class="rejilla">
        <div class="campo"><label for="f-slug">Identificador (va en la dirección)</label><input id="f-slug" name="slug" required pattern="[a-z0-9-]{1,30}" placeholder="filo" aria-describedby="f-slug-ayuda"><p class="ayuda" id="f-slug-ayuda">Minúsculas, números y guiones.</p></div>
        <div class="campo"><label for="f-nombre">Nombre comercial</label><input id="f-nombre" name="nombre" required maxlength="60"></div>
        <div class="campo"><label for="f-programa">Nombre del programa</label><input id="f-programa" name="programa" required maxlength="40" placeholder="Club Filo"></div>
        <div class="campo"><label for="f-meta">Sellos para el premio</label><input id="f-meta" name="meta" type="number" min="3" max="20" value="10" required></div>
        <div class="campo"><label for="f-premio">Premio</label><input id="f-premio" name="premio" required maxlength="60" placeholder="Corte gratis"></div>
        <div class="campo"><label for="f-espera">Minutos mínimos entre sellos</label><input id="f-espera" name="espera_min" type="number" min="0" max="10080" value="180"></div>
        <div class="campo"><label for="f-razon">Razón social</label><input id="f-razon" name="razon_social" maxlength="100"></div>
        <div class="campo"><label for="f-ruc">RUC</label><input id="f-ruc" name="ruc" inputmode="numeric" pattern="\\d{11}" maxlength="11"></div>
        <div class="campo"><label for="f-direccion">Dirección</label><input id="f-direccion" name="direccion" maxlength="140"></div>
        <div class="campo"><label for="f-correo">Correo para derechos ARCO</label><input id="f-correo" name="correo" type="email" maxlength="100"></div>
        <div class="campo"><label for="f-color">Color de acento</label><input id="f-color" name="color" type="color" value="#C9A45C"></div>
        <div class="campo"><label for="f-tema">Tema</label><select id="f-tema" name="tema"><option value="oscuro">Oscuro</option><option value="claro">Claro</option></select></div>
        <div class="campo"><label for="f-clave">Clave del panel del negocio</label><input id="f-clave" name="clave" type="password" minlength="8" autocomplete="new-password" aria-describedby="f-clave-ayuda"><p class="ayuda" id="f-clave-ayuda">Mínimo 8 caracteres. Cámbiala si un empleado se va.</p></div>
        <p class="aviso-error" id="form-msg" role="status" hidden></p>
        <button class="boton primario" type="submit">Guardar negocio</button>
      </form>
    </section>
  </div>
</main>`,
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
