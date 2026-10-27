# Sistema de sellos: tarjeta de cliente frecuente digital

Es un sistema real, con base de datos, para que barberías, spas, salones o cualquier negocio den **sellos por cada visita** y un **premio** al completar la tarjeta. Una sola instalación sirve para **muchos negocios**, y cada uno tiene su enlace, su panel y su clave.

Funciona en **Cloudflare Workers + D1**. El plan gratuito alcanza para empezar con varios negocios pequeños.

## Cómo funciona

| Quién | Qué hace | Dirección |
|---|---|---|
| **Cliente** | Crea su tarjeta con su nombre y celular. Ve sus sellos y su código QR. | `https://TU-WORKER/filo` |
| **Negocio** | Escanea el QR del cliente con la cámara del celular y suma un sello o entrega el premio. Ve quién está cerca del premio y le escribe por WhatsApp con un toque. | `https://TU-WORKER/filo/panel` |
| **Negocio** | Imprime el cartel con el QR, con sus colores: tótem acrílico vertical de 15 × 21 cm, A4 vertical (pared), A5 vertical (mostrador), 10 × 15 cm (mesa), A5 horizontal o A4 horizontal. | `https://TU-WORKER/filo/cartel` |
| **Tú** | Creas los negocios, sus claves y su premio, y ves la actividad de todos. | `https://TU-WORKER/admin` |

1. El cliente escanea el cartel del mostrador o abre el enlace desde la bio de Instagram o desde la página de enlaces, y crea su tarjeta.
2. En cada visita muestra su tarjeta. El negocio la escanea en el panel y toca **+1 sello**. La tarjeta del cliente se actualiza sola en unos segundos.
   El QR de la tarjeta también se puede leer con la cámara normal del celular o con Google Lens: abre el panel del negocio con ese cliente listo. Si el celular no tiene la sesión del panel abierta, primero pide la clave.
3. Al completar los sellos, el panel activa **Canjear premio** y la tarjeta vuelve a empezar.

**Protecciones incluidas:**
- Nadie puede sumarse sellos solo, porque se necesita la clave del panel.
- Hay un tiempo mínimo entre dos sellos del mismo cliente (por defecto 3 horas), para evitar escanear dos veces por error.
- El negocio puede deshacer un sello sumado por error durante 30 minutos.
- **Pedir el servicio en cada visita** (casilla en `/admin`, marcada por defecto): el cajero no puede sumar la visita sin tocar un servicio del catálogo o escribir el monto cobrado. Así «Tus números» muestra lo que el negocio ganó de verdad y sus servicios más vendidos. Si elige servicios sin escribir el monto, el monto es la suma de sus precios. Se desmarca solo en negocios donde casi todo es un mismo servicio al mismo precio.
- **Cada tarjeta respeta su promoción** (tarjetas de sellos): si en `/admin` cambias los sellos, el premio o los premios en el camino, los clientes que ya tienen sellos conservan la promoción con la que empezaron (`meta_t`, `premio_t` y `hitos_t` en `clientes`) hasta canjearla; al canjear, su tarjeta nueva ya usa la promoción actual. Los que no tienen sellos y los nuevos usan la nueva de inmediato. Si vuelves a una promoción anterior, quienes la conservaban quedan otra vez con la actual. Al guardar, `/admin` dice cuántos clientes conservan su promoción anterior, y en el panel la ficha del cliente lo avisa («Promoción anterior: 3 sellos = 50 % en cejas»). El historial guarda qué premio se canjeó.
- **Premios en el camino** (tarjetas de sellos, campo opcional en `/admin`, sección 1): premios antes de la meta, uno por línea, «sellos = premio» («2 = 20 % de descuento», «4 = 20 % de descuento»). Se canjean sin descontar sellos ni reiniciar la tarjeta (`clientes.hito` guarda hasta cuál ya canjeó); al llegar a los «Sellos para el premio» se entrega el premio final y la tarjeta empieza de cero. La tarjeta del cliente, la página de registro y el cartel muestran la lista de premios, y las casillas que dan premio llevan un regalito. En el panel, «Canjear premio» deja elegir cuál entrega, y «Escríbeles hoy» incluye a quienes ya tienen uno listo.
- **Cumpleaños** (opcional): al registrarse, el cliente puede dar su día y mes (sin año); el cajero también puede anotarlo o corregirlo en la ficha. En «Escríbeles hoy» aparecen los cumpleaños de hoy y de los próximos 6 días con su mensaje de WhatsApp listo, y la ficha avisa «¡Hoy es su cumpleaños!». Si el negocio pone un **regalo de cumpleaños** en `/admin` (sección 3), sale en el registro y en el mensaje. El 29 de febrero se celebra el 28 en años no bisiestos. Sale también en la lista de clientes (Excel).
- **Primer sello de regalo** (casilla en `/admin`, sección 1, solo en tarjetas de sellos; apagada por defecto): la tarjeta nueva empieza con 1 sello. Queda en el historial como «Sello de bienvenida» (tipo `regalo`) y no cuenta como visita ni como ingreso. Una tarjeta que empieza con avance se completa más que una vacía.
- **Tarjeta del cliente:** arriba solo el logo (si no hay logo, el nombre y el programa). La tarjeta dice en grande cuánto falta («Te faltan 9 sellos para tu Corte gratis»), con barra de avance y la etiqueta «1 de 10»; cuando la completa, «¡Premio listo!». Debajo, el QR («Muestra este código en caja»), Google Wallet y «Guardar mi tarjeta por WhatsApp».
- **Página de registro:** el logo, la frase del programa, una vista de cómo será su tarjeta (con el sello de regalo si está activo), el formulario corto y los 3 pasos en una línea al final.
- **Panel:** «Hoy» en grande arriba, una barra fija abajo con **Escanear QR** y **Buscar** (siempre a la mano), «Escríbeles hoy» destacado con borde, «Este mes» en 3 números y «Salir» chico arriba a la derecha.
- **Historial del cliente** (en su ficha, al escanear su QR o buscarlo): «Suele pedir» con sus 3 servicios más frecuentes y «Sus últimas visitas» con las 10 últimas (fecha, servicio y monto, canjes y traspaso de papel).
- **Pasar sellos de su tarjeta de papel** (en la ficha del cliente, solo en tarjetas de sellos): para los clientes que ya tenían tarjeta de papel. Se usa una sola vez por cliente, de 1 a la meta de sellos, y no cuenta como visita ni como ingreso en «Tus números». Queda en el historial como «traspaso» y se puede deshacer en los 30 minutos siguientes. El cajero se queda con la tarjeta de papel para que no se use dos veces.

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

En `/admin` se escriben los servicios con su precio, uno por línea: «Corte = 30», «Barba = 15», y aparte los **productos** que vende el local: «Cera = 25», «Shampoo = 30». Al registrar una visita aparecen como botones (los productos en su propio grupo, debajo): se tocan los que se hizo o compró el cliente y **el monto se suma solo**. Los números del negocio en `/admin` muestran los **servicios más vendidos** de los últimos 90 días.

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
- **Cuota mensual:** lo que paga cada negocio (de S/ 59 a S/ 79 según la zona y el tamaño del local). Se anota en el formulario. El negocio no la ve ni la puede cambiar: solo se usa para tu cálculo de ganancia en «Rendimiento de tus negocios». En «Rendimiento de tus negocios», **Cobras al mes** suma las cuotas de los negocios que ya pagan (no cuenta los suspendidos, los que están en su mes gratis ni las cortesías).
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

## Estadísticas del cartel y del enlace

En `/admin`, dentro de **Ver números** de cada negocio, «Su cartel y su enlace (últimos 30 días)» muestra:

- cuántas personas **escanearon el QR del cartel** (hoy y en total);
- cuántas abrieron el enlace de registro desde cualquier lugar (QR, bio o WhatsApp);
- cuántas **tarjetas nuevas** se crearon y cuántas vinieron del QR;
- qué porcentaje de quienes abren el enlace termina creando su tarjeta;
- cuántos clientes tienen tarjeta y cuántos aceptan recordatorios.

El conteo es anónimo y no guarda la IP ni ningún dato de la persona. Cada celular cuenta una vez cada 12 horas gracias a una cookie técnica, y el QR del cartel (`/SLUG/Q`, en mayúsculas para que tenga menos cuadritos) redirige a `/slug?o=qr` para distinguirlo de los demás enlaces. Los carteles viejos con `?o=qr` siguen funcionando. En `/admin` también ves los escaneos del QR de cada negocio.

### El panel del negocio: simple, para el día a día

El panel del dueño tiene solo lo que usa todos los días:

1. **Registrar visita:** escanear el QR o buscar al cliente, elegir el servicio y sumar el sello. La ficha del cliente muestra «Suele pedir» y sus últimas visitas.
2. **Este mes:** visitas de hoy, visitas del mes, clientes nuevos y premios entregados (solo cantidades, sin montos).
3. **Escríbeles hoy:** los clientes cerca de su premio y los que venían seguido y dejaron de venir (más de 45 días), con el WhatsApp ya escrito. Solo aparecen los que aceptaron recordatorios.
4. **Tus mejores clientes:** los 5 que más vinieron en 3 meses.
5. **Clientes registrados** (los 5 últimos, con «Ver más clientes»), y **Tu cartel y tu enlace** con la descarga de clientes en Excel (CSV).

Los montos y precios ya no se configuran en el panel: van en `/admin`, en «3. Servicios y precios» (precio promedio, lo que cuesta dar el premio y servicios con precio).

### Números del negocio y reporte del mes (en /admin)

Los números completos ya **no los ve el dueño**: los ves tú y se los mandas cada mes. En `/admin`, el botón **Ver números** de cada negocio (en la tabla de negocios o en «Rendimiento») abre:

- **Resumen del mes**, con selector de mes: «Este mes sus clientes con tarjeta le dejaron S/ …», clientes nuevos, clientes que volvieron, visitas, premios entregados (o saldo usado en cashback) y clientes que dejaron de venir, cada uno comparado con el mes anterior (el mes en curso, con el anterior a la misma fecha).
- **Gráfico de 6 meses** (con vista en tabla), **10 clientes más fieles**, **servicios más vendidos**, **días y horas con más visitas** (90 días) y **clientes que dejaron de venir**.
- **Su cartel y su enlace** (30 días): escaneos del QR, aperturas, tarjetas nuevas y cuántos crean su tarjeta.
- **Reporte del mes (PDF):** abre `/admin/reporte?n=SLUG&mes=AAAA-MM`, una hoja clara con el logo del negocio, lo principal en grande, los datos del mes, el gráfico, sus mejores clientes, lo que más se pide, sus días fuertes y **3 acciones para el próximo mes**. «Guardar en PDF» la imprime en A4; en el celular se guarda y se comparte por WhatsApp.
- **Enviar resumen:** abre WhatsApp al número del negocio con el resumen del mes ya escrito, para mandarlo junto al PDF.

Reglas de los cálculos:

- **Solo cuenta a los clientes con tarjeta.** Las visitas de quien no se registró no aparecen, así que los números son menores que la caja total del negocio.
- Se usa lo cobrado en cada visita; si no se anotó, el precio promedio del negocio. Si no hay precio, se usa el promedio de lo cobrado.
- **Se dejan de ganar:** estima cuánto dejan de dejar al mes los que dejaron de venir, si volvieran a su ritmo de siempre.
- Sin visitas todavía, **Ver un ejemplo** muestra la sección llena con datos inventados, marcada como ejemplo (sirve para enseñárselo a un prospecto).

**Mostrar números completos al dueño** (casilla en «3. Servicios y precios», apagada por defecto): si un dueño pide ver todo, actívala y su panel vuelve a tener «Tus números». Apagada, la API del panel tampoco entrega esos números.

La ganancia del programa (lo que dejan los clientes que regresan menos premios y cuota) y el «por cada S/ 1» solo se ven en «Rendimiento de tus negocios». Ahí también está **Enviar por WhatsApp**, un aviso corto del mes en curso.

## Recordatorios por WhatsApp

La sección **Escríbeles hoy** del panel lista, en «Cerca de su premio», a los clientes que **aceptaron recordatorios** y a quienes les faltan 2 sellos o menos, o que ya tienen su premio. Cada uno tiene un botón **Escribir por WhatsApp** con el mensaje ya escrito. El negocio lo envía desde su propio WhatsApp.

- Solo aparecen quienes marcaron la casilla opcional al registrarse. Así lo exige la Ley 29733: el uso para mensajes es una finalidad aparte y opcional.
- Cada mensaje incluye «responde BAJA». Si el cliente lo pide, el negocio desmarca **Acepta recordatorios** en su ficha.
- Tú también ves en `/admin` cuántos clientes de cada negocio están cerca del premio.

## Gestión del negocio (servicio aparte)

Para barberías, salones, spas, centros de uñas y de estética: agenda, reservas en línea, caja, gastos y finanzas en un solo lugar, en `/slug/gestion`. Se activa por negocio en `/admin` con la casilla **Gestión del negocio**. Usa los mismos clientes, servicios y productos que las tarjetas, y la misma clave.

**Dos roles**
- **Caja** (la clave del panel): ve la agenda, cobra, anota los gastos del día y ve a los clientes. No ve finanzas, gastos del mes ni el equipo.
- **Dueño** (la clave del dueño): lo ve todo. Se crea en `/admin` o en la gestión, en Ajustes. Mientras el negocio no tenga clave del dueño, la clave del panel lo ve todo.

**Secciones**
- **Inicio**: lo vendido hoy, el efectivo que debería haber en la gaveta, los gastos del día y la ganancia del mes (con la meta). También las citas de hoy y los pendientes: reservas por confirmar, recordatorios de mañana por WhatsApp, cumpleaños y productos por acabarse.
- **Agenda**: una columna por persona del equipo, vista por día o por semana. Avisa si una cita choca con otra. Se puede bloquear un horario (almuerzo, permiso). Cada cita se confirma o recuerda por WhatsApp y se cobra con un toque.
- **Caja**: cada venta lleva servicios y productos del catálogo (o un concepto libre), quién atendió, descuento y medio de pago (efectivo, Yape, Plin, tarjeta o transferencia). Si el cliente tiene tarjeta, la venta le suma su sello, sus puntos o su saldo. Muestra el cierre del día por medio de pago. Una venta se puede anular, y sus productos vuelven al stock.
- **Clientes**: ficha con lo que gastó, su historial de compras, sus próximas citas y notas (alergias, fórmula del tinte…).
- **Gastos**: por categoría. Un gasto marcado como **fijo** (alquiler, luz) aparece el mes siguiente como pendiente, para anotarlo con un toque.
- **Finanzas**: ingresos, gastos, ganancia y ticket promedio, comparados con el mes pasado a la misma fecha. Incluye ingresos por día, servicios y productos más vendidos, medios de pago, comisiones del equipo y citas (no vinieron, reservas en línea). Se descarga en Excel (CSV) para el contador.
- **Equipo**: cada persona con su color, su comisión (de servicios y de productos), los servicios que hace y si tiene agenda. Muestra cuánto le toca y cuánto se le pagó: los pagos se anotan como gasto eligiendo a la persona.
- **Servicios y productos**: precio, duración de cada servicio (para la agenda y las reservas), y stock y aviso de stock bajo de cada producto. Si guardas el catálogo desde `/admin`, la duración y el stock se conservan.
- **Ajustes**: horario por día, cada cuántos minutos va la agenda, reservas en línea, meta del mes, medios de pago y clave del dueño.

**Reservas en línea** (`/slug/reservar`, con la marca del negocio)
- El cliente elige servicio, persona (o «Cualquiera»), día y hora. Solo ve las horas que de verdad están libres, según el horario, la duración del servicio, las citas y los bloqueos.
- La cita llega a la gestión **por confirmar**. Con «Cualquiera», se asigna a quien tenga menos citas ese día.
- Si dos personas eligen la misma hora a la vez, solo entra la primera.
- Límites: 10 reservas por hora desde una misma conexión, y 3 reservas pendientes por celular.
- Con las reservas activas, la tarjeta del cliente muestra el botón **Reservar una cita**.

**Privacidad**
- Si un cliente borra su tarjeta, sus ventas se quedan en la caja (son contabilidad) pero sin su nombre, y sus citas pasadas pierden nombre y celular.
- Las citas de más de 24 meses se borran solas.
- Un cliente que compró o tuvo una cita en los últimos 24 meses no se borra, aunque no haya sumado sellos.

## Comercios: bodegas, tiendas, ferreterías… (servicio aparte)

Si el **tipo de negocio** es un comercio (bodega, minimarket, kiosko, ferretería, ropa, zapatería, librería, florería, licorería, regalos, vivero, restaurante, botica, car wash), la gestión cambia: no hay agenda (se puede activar en Ajustes) y aparecen estas secciones:

**Secciones del comercio**
- **Vender**: punto de venta.
  - Busca el producto o escanea su código de barras. Un lector USB escribe el código y da Enter; en el celular, la cámara lo lee con el botón «Escanear».
  - Vende por unidad o por kilo, litro o metro.
  - Elige la variante (talla, color), aplica un descuento, calcula el vuelto y cobra, o fía al cliente.
  - Cada venta suma a la tarjeta del cliente y deja un **comprobante** (nota de venta) para imprimir, guardar en PDF o mandar por WhatsApp.
- **Inventario**:
  - Cada producto tiene precio, costo, ganancia, stock y aviso de stock bajo.
  - **Variantes**: cada talla o color con su código y su stock.
  - **Recetas**: un jugo o un arreglo floral descuenta sus insumos al venderse.
  - Se importa pegando la lista desde Excel (nombre, precio, costo, stock, código, categoría) y se descarga en Excel.
- **Comprar mercadería**: sube el stock y recalcula el costo promedio. Lo pagado se anota como gasto; lo que falta pagar queda como deuda con el proveedor.
- **Deudas**: lo que te deben tus clientes (fiados, con recordatorio por WhatsApp y registro de pagos) y lo que debes a tus proveedores.
- **Proveedores**: sus datos, sus compras y los pagos.
- **Finanzas**: ventas − costo de lo vendido = ganancia bruta; − gastos del negocio = ganancia.

**Para todos los negocios**
- **Tu tarjeta de clientes**: el dueño elige sellos o puntos, el premio, los premios en el camino, el regalo de cumpleaños y el estilo, sin pasar por `/admin`.
- **Equipo con acceso propio**: a cada persona se le puede dar una clave. Entra con su celular, como caja, y sus ventas salen a su nombre. Si se va, se le quita el acceso.
- **Ajustes**: datos del negocio (salen en el comprobante), clave de caja, fiado y agenda.

## Cuentas creadas por el propio negocio

- **Página de inicio** (`/`): presenta Tappe.
- **Crear cuenta** (`/crear`): con el nombre del negocio, el tipo, el nombre del dueño, su celular, su correo y una clave, el negocio queda funcionando al instante, con 30 días de prueba y la gestión activada.
- **Entrar** (`/entrar`): el dueño entra con su correo y su clave.
- **Términos** (`/terminos`).
- **Primeros pasos**: en Inicio, el negocio ve lo que le falta configurar.
- **Límite**: 5 cuentas por hora desde la misma conexión.
- **En `/admin`**: los negocios nuevos aparecen como cualquier otro, con plan «Mes gratis», para que les cobres o los suspendas.
- **Soporte por WhatsApp**: pon tu número en `SOPORTE_WHATSAPP` (en `wrangler.toml`). Sale en la gestión, en el pie del sitio y en «¿Olvidaste tu clave?».

**La nota de venta no es una boleta ni una factura electrónica de SUNAT.** Para la facturación electrónica hay que conectarse con un proveedor autorizado (PSE/OSE). Queda pendiente.

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
- `src/gestion.js`: la gestión del negocio (agenda, caja, gastos, finanzas, equipo, catálogo) y la reserva en línea.
- `src/comercio.js`: lo propio de los comercios (inventario, ventas con costo, deudas, proveedores y compras).
- `src/auth.js`: claves (PBKDF2), sesiones firmadas y límite de intentos.
- `src/util.js`: utilidades.
- `migrations/0001_inicial.sql`: las tablas. El Worker también las crea solo.
- `public/static/`: estilos y scripts del navegador, incluido jsQR para leer el QR (licencia Apache-2.0).
