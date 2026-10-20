# Sistema de sellos: tarjeta de cliente frecuente digital

Es un sistema real, con base de datos, para que barberías, spas, salones o cualquier negocio den **sellos por cada visita** y un **premio** al completar la tarjeta. Una sola instalación sirve para **muchos negocios**, y cada uno tiene su enlace, su panel y su clave.

Funciona en **Cloudflare Workers + D1**. El plan gratuito alcanza para empezar con varios negocios pequeños.

## Cómo funciona

| Quién | Qué hace | Dirección |
|---|---|---|
| **Cliente** | Crea su tarjeta con su nombre y celular. Ve sus sellos y su código QR. | `https://TU-WORKER/filo` |
| **Negocio** | Escanea el QR del cliente con la cámara del celular y suma un sello o entrega el premio. Ve quién está cerca del premio y le escribe por WhatsApp con un toque. | `https://TU-WORKER/filo/panel` |
| **Negocio** | Imprime el cartel con el QR para el mostrador, en A5 (mostrador), A4 (pared) o 10 × 15 cm (mesa), con sus colores. | `https://TU-WORKER/filo/cartel` |
| **Tú** | Creas los negocios, sus claves y su premio, y ves la actividad de todos. | `https://TU-WORKER/admin` |

1. El cliente escanea el cartel del mostrador o abre el enlace desde la bio de Instagram o desde la página de enlaces, y crea su tarjeta.
2. En cada visita muestra su tarjeta. El negocio la escanea en el panel y toca **+1 sello**. La tarjeta del cliente se actualiza sola en unos segundos.
   El QR de la tarjeta también se puede leer con la cámara normal del celular o con Google Lens: abre el panel del negocio con ese cliente listo. Si el celular no tiene la sesión del panel abierta, primero pide la clave.
3. Al completar los sellos, el panel activa **Canjear premio** y la tarjeta vuelve a empezar.

**Protecciones incluidas:**
- Nadie puede sumarse sellos solo, porque se necesita la clave del panel.
- Hay un tiempo mínimo entre dos sellos del mismo cliente (por defecto 3 horas), para evitar escanear dos veces por error.
- El negocio puede deshacer un sello sumado por error durante 30 minutos.

## Redes del negocio y lista de clientes

- En `/admin` puedes cargar el WhatsApp, Instagram, TikTok, Facebook, Google Maps y la Página Bio o web de cada negocio. Esos enlaces aparecen en la página que abre el QR del cartel, junto con el registro, y también en la tarjeta del cliente.
- En el panel, la sección **Clientes registrados** muestra a cada cliente apenas crea su tarjeta: sus sellos, la fecha en que se registró y si llegó por el QR del cartel. Se actualiza sola cada minuto.

## Tipos de tarjeta: sellos, puntos o cashback

En `/admin`, **Tipo de tarjeta** define cómo gana el cliente:

| Tipo | Ideal para | Cómo funciona |
|---|---|---|
| **Sellos** | Barberías, spas, salones | 1 sello por visita; al llegar a la meta (por ejemplo, 10) canjea el premio. El monto es opcional. |
| **Puntos** | Cafeterías, restaurantes, tiendas | Cada S/ 1 de compra suma puntos (se configura cuántos). Se canjean por una lista de premios: «100 = Café gratis», uno por línea. |
| **Cashback** | Restaurantes, tiendas, minimarkets | Cada compra devuelve un % como saldo (por ejemplo, 5 %). El cliente lo usa como descuento desde un saldo mínimo. |

- En puntos y cashback, el **monto de la compra es obligatorio** al registrar la visita, porque de ahí salen los puntos o el saldo.
- **Canjear:** en puntos, el panel muestra los premios que le alcanzan al cliente; en cashback, cuánto saldo usar en esa compra.
- **Deshacer** devuelve lo que sumó la última visita (sello, puntos o saldo), si fue en los últimos 30 minutos y antes de un canje.
- La tarjeta del cliente, la página de registro, el cartel y Google Wallet muestran sellos, puntos o saldo según el tipo.
- En «Tus números», el costo del programa en cashback es el **saldo que usaron** los clientes; en sellos y puntos, el costo de cada premio entregado.
- **Minutos mínimos entre visitas:** en cafeterías conviene bajarlo (por ejemplo, a 30), porque un cliente puede volver el mismo día.

### Servicios y productos con precio

En `/admin` (o en el panel, en «Configurar tus montos») se escriben los servicios con su precio, uno por línea: «Corte = 30», «Barba = 15», «Café americano = 8». Al registrar una visita aparecen como botones: se tocan los que se hizo el cliente y **el monto se suma solo**. «Tus números» muestra el **ticket promedio** y los **servicios más vendidos** de los últimos 90 días.

## Diseño de cada negocio

En `/admin`, al crear o editar un negocio, la sección **Diseño de la página y la tarjeta** permite personalizarlo sin tocar código, con vista previa en vivo:

- **12 estilos rápidos:** Clásico, Lujoso, Moderno, Urbano, Barbería vintage, Minimal, Neón, Spa, Belleza, Deportivo, Cafetería e Imperial. Cada uno ajusta todo lo demás de una vez.
- **21 paletas de colores** y colores propios. Los textos se ajustan solos para que siempre se lean bien (contraste AA).
- **20 tipografías**, todas con licencia libre OFL: Playfair, Cormorant, Bebas Neue, Cinzel, Bodoni, Great Vibes, Oswald, Anton y otras.
- **Fondo:**
  - color liso o degradado;
  - animado: partículas doradas, aurora, luces desenfocadas, ondas, malla urbana o destello;
  - foto o video.
- **Tarjeta:** clásica, metálica, vidrio, minimalista, neón o con foto de portada.
  - Opcional: **efecto 3D**, que se inclina con el dedo y tiene brillo.
- **Sellos:**
  - forma: círculo, cuadrado, diamante o hexágono;
  - ícono: visto, estrella, corazón, tijera, corona, flor, hoja, gota, café, rayo, diamante, pesa o el logo del negocio.
- **Logo, foto de portada, imagen de fondo y video de fondo.**
  - Las imágenes se achican solas en el navegador antes de subirse.
  - El video debe ser MP4 o WebM de menos de 15 MB.

### Activar fotos y videos (una sola vez)

Los archivos se guardan en **Cloudflare KV**, que es gratis hasta 1 GB.

1. En Cloudflare entra a **Storage & Databases → KV → Create** y ponle de nombre `medios`.
2. Copia su **ID** y agrégalo al final de `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "MEDIOS"
id = "EL_ID_DE_TU_KV"
```

3. Vuelve a publicar.

**Ya está activado** (KV `medios`). Mientras no lo esté, todo lo demás del diseño funciona y el panel muestra un aviso en la parte de fotos. Las fotos que ya no usa ningún negocio se borran solas al día siguiente.

## Planes, vencimientos y suspensión

- **Al crear un negocio** queda con el plan «Mes gratis» y vence en **1 mes**. Puedes cambiar el plan y la fecha en el formulario.
- **Cuota mensual:** lo que paga cada negocio (de S/ 59 a S/ 79 según la zona y el tamaño del local). Se anota en el formulario. El negocio no la ve en «Tus números» ni la puede cambiar: solo se usa para tu cálculo de ganancia en «Rendimiento de tus negocios». En «Rendimiento de tus negocios», **Cobras al mes** suma las cuotas de los negocios que ya pagan (no cuenta los suspendidos, los que están en su mes gratis ni las cortesías).
- **En la tabla de `/admin`:**
  - cada negocio muestra si está **al día**, si **vence en pocos días** o si **ya venció**;
  - arriba aparece un aviso con los vencidos y los que vencen en los próximos 7 días;
  - los botones **+1 mes** y **+1 año** renuevan desde la fecha de vencimiento (o desde hoy, si ya venció).
- **El negocio también ve el aviso** en su panel 7 días antes del vencimiento: «Tu plan vence el…».
- **Suspender** pone el servicio en pausa:
  - el panel deja de funcionar;
  - la página de registro muestra «Programa en pausa»;
  - los clientes ven sus sellos, pero no se suman nuevos.
  - **No se borra nada**: al tocar **Reactivar**, todo vuelve a funcionar igual.

## Google Wallet (opcional)

Con Google Wallet activado, la tarjeta del cliente muestra el botón **«Agregar a Google Wallet»**.

- Solo aparece en Android; en iPhone no se muestra.
- El pase lleva sus sellos, su QR y el premio, y se actualiza solo cada vez que se suma un sello.

Para activarlo:

1. **Crea tu cuenta de emisor** en <https://pay.google.com/business/console>. Al terminar verás tu **Issuer ID**.
2. **Crea un proyecto** en <https://console.cloud.google.com>:
   - activa la **Google Wallet API**;
   - crea una **cuenta de servicio**;
   - en **Claves**, crea una clave **JSON** y descárgala.
3. **Da acceso a la cuenta de servicio:** en la consola de Google Wallet, en **Users**, invita el correo de esa cuenta de servicio con el rol **Developer**.
4. **Agrega 3 secretos** en Cloudflare (Worker → Settings → Variables and Secrets, tipo **Secret**):
   - `WALLET_ISSUER_ID`: tu Issuer ID.
   - `WALLET_SA_EMAIL`: el `client_email` del JSON.
   - `WALLET_SA_KEY`: el `private_key` del JSON, completo, desde `-----BEGIN PRIVATE KEY-----` hasta el final.

Mientras Google no apruebe tu cuenta para producción, los pases funcionan solo con las cuentas de Google que agregues como **usuarios de prueba** en la consola de Wallet. Para publicarlo para todos, pide el acceso de producción en esa misma consola.

## Estadísticas del panel

El resumen del panel muestra dos grupos de datos:

- **Tu cartel y tu enlace (últimos 30 días):**
  - cuántas personas **escanearon el QR del cartel** (hoy y en total);
  - cuántas abrieron el enlace de registro desde cualquier lugar (QR, bio o WhatsApp);
  - cuántas **tarjetas nuevas** se crearon y cuántas de ellas vinieron del QR;
  - qué porcentaje de quienes abren el enlace termina creando su tarjeta.
- **Tus clientes:**
  - cuántos tienen tarjeta y cuántos vinieron en los últimos 30 días;
  - las visitas de hoy y de los últimos 30 días;
  - los premios canjeados y cuántos aceptan recordatorios.

El conteo es anónimo y no guarda la IP ni ningún dato de la persona. Cada celular cuenta una vez cada 12 horas gracias a una cookie técnica, y el QR del cartel (`/SLUG/Q`, en mayúsculas para que tenga menos cuadritos) redirige a `/slug?o=qr` para distinguirlo de los demás enlaces. Los carteles viejos con `?o=qr` siguen funcionando. En `/admin` también ves los escaneos del QR de cada negocio.

### Tus números: ingresos y retorno del programa

La sección **Tus números** del panel muestra cuánto le rinde la tarjeta al negocio, mes por mes:

- **Solo cuenta a los clientes con tarjeta.** Las visitas de quien no se registró no aparecen, así que los números son menores que la caja total del negocio.
- **Precio por servicio:** lo puedes poner tú al crear el negocio en `/admin`. Si falta, el panel lo pregunta arriba de todo («Para empezar: ¿cuánto cobras en promedio por un servicio?»). Sin visitas todavía, el botón **Ver un ejemplo** muestra la sección llena con datos inventados, marcada como ejemplo.
- **Dejas de ganar:** estima cuánto dejan de dejar al mes los clientes que dejaron de venir, si volvieran a su ritmo de siempre.
- **Montos del negocio** (en «Configurar tus montos»): el precio promedio por visita, lo que le cuesta dar el premio y sus servicios con precio.
- **Cobrado en esta visita** (opcional): al sumar un sello se puede anotar lo que pagó el cliente. Si se deja vacío, se cuenta el precio promedio.
- **Número principal:** «Este mes tus clientes con tarjeta te dejaron S/ …», con las visitas, los clientes que volvieron y la comparación con el mes anterior. A propósito no muestra costos ni la cuota del sistema, para que se entienda de un vistazo.
- **Datos del mes:** clientes nuevos, clientes que volvieron, visitas, premios entregados (o saldo usado en cashback) y clientes que dejaron de venir. Cada dato muestra la diferencia con el mes anterior; el mes en curso se compara con el anterior a la misma fecha.
- **Gráfico de 6 meses** con lo que dejaron los clientes con tarjeta cada mes, con vista en tabla.
- **Ranking de los 10 clientes más fieles**, **días y horas con más visitas** (90 días) y **clientes que dejaron de venir** (2 visitas o más y nada en 45 días), con botón de WhatsApp si aceptaron recordatorios.

La ganancia del programa (lo que dejan los clientes que regresan menos premios y cuota) y el «por cada S/ 1» solo se ven en tu `/admin`, en «Rendimiento de tus negocios». El informe por WhatsApp que le mandas al negocio usa los datos simples.

En `/admin`, **Rendimiento de tus negocios** muestra lo mismo para todos los negocios del mes en curso (comparado con el mes anterior a la misma fecha) y un botón **Enviar por WhatsApp** que le manda a cada negocio su informe del mes, listo para usar antes de cada renovación.

## Recordatorios por WhatsApp

La sección **Cerca del premio** del panel lista a los clientes que **aceptaron recordatorios** y a quienes les faltan 2 sellos o menos, o que ya tienen su premio. Cada uno tiene un botón **Escribir por WhatsApp** con el mensaje ya escrito. El negocio lo envía desde su propio WhatsApp.

- Solo aparecen quienes marcaron la casilla opcional al registrarse. Así lo exige la Ley 29733: el uso para mensajes es una finalidad aparte y opcional.
- Cada mensaje incluye «responde BAJA». Si el cliente lo pide, el negocio desmarca **Acepta recordatorios** en su ficha.
- Tú también ves en `/admin` cuántos clientes de cada negocio están cerca del premio.

## Instalación (una sola vez, desde una computadora)

Necesitas una cuenta gratis en <https://dash.cloudflare.com> y Node.js 20 o superior.

```bash
cd sistema-sellos
npm install
npx wrangler login                      # abre el navegador para entrar a Cloudflare
npx wrangler d1 create sellos           # crea la base de datos
```

1. **Base de datos:** copia el `database_id` que muestra el último comando y pégalo en `wrangler.toml`, en lugar de los ceros.
2. **Tus datos:** en `wrangler.toml` completa `PROVEEDOR_NOMBRE` y `PROVEEDOR_CORREO`. Son tu nombre o el de tu empresa, y aparecen en el aviso de privacidad como encargado del tratamiento.
3. **Claves y publicación:**

```bash
npx wrangler secret put ADMIN_PASSWORD   # tu clave de administración (mínimo 12 caracteres)
npx wrangler secret put SESSION_SECRET   # texto largo al azar; por ejemplo, el resultado de: openssl rand -base64 32
npx wrangler d1 migrations apply sellos --remote
npx wrangler deploy
```

Al terminar, Wrangler muestra la dirección, por ejemplo `https://sistema-sellos.TU-SUBDOMINIO.workers.dev`. Si tienes dominio propio, puedes conectarlo en Cloudflare: Workers → tu Worker → Settings → Domains & Routes.

### Otra opción: publicar desde GitHub, sin computadora

1. En Cloudflare, crea la base de datos en **Storage & Databases → D1 SQL Database → Create**, con el nombre `sellos`, y pega su **Database ID** en `wrangler.toml`.
2. En **Workers & Pages → Create → Import a repository**, conecta este repositorio con esta configuración:
   - **Project name:** `sistema-sellos`
   - **Root directory:** `/sistema-sellos`
   - **Build command:** vacío
   - **Deploy command:** `npx wrangler deploy`
   - **Production branch:** la rama donde esté el sistema
3. En el Worker, en **Settings → Variables and Secrets**, agrega dos secretos:
   - `ADMIN_PASSWORD`: mínimo 12 caracteres.
   - `SESSION_SECRET`: un texto largo al azar.

Cada cambio que se suba a esa rama se publica solo.

**Para probarlo en tu computadora sin publicar nada:**
1. Crea el archivo `.dev.vars` con la línea `ADMIN_PASSWORD=una-clave-de-prueba-larga`.
2. Ejecuta `npm run dev`.
3. Abre <http://localhost:8787/admin>.

## Dar de alta un negocio

1. Entra a `/admin` con tu clave.
2. Completa:
   - el identificador (por ejemplo `filo`), el nombre y el nombre del programa;
   - cuántos sellos se necesitan para el premio y cuál es el premio;
   - los datos legales: razón social, RUC, dirección y correo para derechos ARCO;
   - el color, el tema y la **clave del panel**.
3. Entrégale al negocio:
   - el enlace del panel (`/filo/panel`) y su clave;
   - el cartel (`/filo/cartel`) para imprimir;
   - el enlace de registro (`/filo`) para su bio de Instagram, su página de enlaces o sus estados de WhatsApp.
4. Si un empleado se va, cambia la clave desde `/admin`. Las sesiones abiertas con la clave anterior se cierran solas.

En el panel, el navegador pide permiso para usar la cámara la primera vez. Funciona en Chrome para Android y en Safari para iPhone. Si la cámara falla, se puede escribir el código de 8 letras que aparece debajo del QR, el celular o el nombre del cliente.

## Privacidad y cumplimiento (Perú)

**Lo que ya hace el sistema:**
- Pide solo nombre y celular.
- Separa el consentimiento obligatorio (administrar la tarjeta) del opcional (recordatorios), y guarda la fecha y la versión del aviso aceptado.
- Publica un aviso de privacidad por negocio (`/filo/privacidad`) con el responsable, las finalidades, el flujo transfronterizo a Cloudflare, el plazo de conservación y los derechos ARCO.
- Deja que el cliente borre su tarjeta, y que el negocio borre a un cliente desde el panel.
- Borra automáticamente las tarjetas con **24 meses sin visitas** (tarea diaria).
- El negocio puede exportar sus clientes en CSV.

**Lo que tienen que hacer ustedes:**
- **El negocio es el responsable** de los datos y debe inscribir su banco de datos de clientes ante la Autoridad Nacional de Protección de Datos Personales (MINJUSDH).
- **Tú eres el encargado del tratamiento.** Firma con cada negocio un contrato o cláusula de encargo que diga para qué usas los datos (solo para operar el sistema), cómo los proteges, que no los cedes y que los devuelves o borras al terminar el servicio.
- No uses los números para otros fines ni los cruces entre negocios.
- Revisa con un abogado el texto final del aviso antes de usarlo con clientes reales.

## Costos de Cloudflare

El plan gratuito de Workers y D1 incluye un número diario de solicitudes y lecturas que, para negocios pequeños, alcanza de sobra. Revisa los límites vigentes en <https://developers.cloudflare.com/workers/platform/pricing/> y <https://developers.cloudflare.com/d1/platform/pricing/>. Si crecen, el plan pagado de Workers cuesta unos pocos dólares al mes.

## Archivos

- `src/index.js`: rutas, API y la tarea diaria.
- `src/paginas.js`: el HTML de las páginas.
- `src/auth.js`: claves (PBKDF2), sesiones firmadas y límite de intentos.
- `src/util.js`: utilidades.
- `migrations/0001_inicial.sql`: las tablas. El Worker también las crea solo.
- `public/static/`: estilos y scripts del navegador, incluido jsQR para leer el QR (licencia Apache-2.0).
