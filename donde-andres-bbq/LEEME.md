# Donde Andrés BBQ — linktree + tienda online

Sitio estático para GitHub Pages. Dirección pública:
`https://ortizparedesluis90-cpu.github.io/ortizparedesluis.github.io/donde-andres-bbq/`
(la URL exacta depende de la configuración de GitHub Pages del repositorio).

## Qué incluye

| Página | Contenido |
|---|---|
| `index.html` | Linktree (reservas, redes, ubicación, reseñas) + tienda con carrito y checkout |
| `terminos.html` | Términos y condiciones |
| `privacidad.html` | Política de privacidad (Ley N.° 29733) |
| `cookies.html` | Política de cookies |
| `reembolsos.html` | Política de reembolsos |
| `libro-reclamaciones.html` | Libro de Reclamaciones virtual (Ley N.° 29571) |

## Cómo funciona la compra

1. El cliente agrega productos y llena sus datos (solo los necesarios).
2. Acepta términos y privacidad (casilla obligatoria, desmarcada por defecto).
3. Paga con **Yape, Plin o transferencia** a las cuentas del negocio y escribe el número de operación.
4. Se abre WhatsApp con el pedido completo dirigido al número del negocio. Si hay correo configurado,
   también puede enviarlo por correo al negocio con copia para él.
5. El negocio verifica el pago en su app o banco y confirma al cliente por WhatsApp.

**No se piden datos de tarjeta.** Ver «Pagos con tarjeta y notificaciones automáticas» abajo.

## Antes de publicar para clientes (obligatorio)

Todo se edita en **`assets/js/config.js`**:

- [ ] `business.legalName` y `business.ruc`: razón social y RUC exactos según SUNAT.
- [ ] `business.email`: correo para pedidos, reclamos y solicitudes sobre datos personales.
- [ ] `payments.yape` / `payments.plin`: número y titular (idealmente cuentas del negocio, no personales).
- [ ] `payments.transfer`: banco, titular, cuenta en soles y CCI. **Aquí va el dinero de las transferencias.**
- [ ] Opcional: imágenes de QR de Yape/Plin en `assets/img/` y su ruta en `qr`.
- [ ] `products[].price`: precios reales. Un producto con `price: 0` no se puede comprar.
- [ ] Descripciones de Carapulcra BBQ y Dúo de chorizos (`desc`).
- [ ] `delivery.districts`: deja solo los distritos que realmente cubres. `delivery.fee` si cobras delivery.
- [ ] `delivery.hours`: horario de pedidos.
- [ ] Revisa con un abogado los textos legales (son un modelo, no asesoría legal).
- [ ] Cambia `demo: true` a `demo: false`.

## Agregar o editar productos

En `config.js`, dentro de `products`, copia un bloque y cambia sus datos:

```js
{
  id: 'costilla-res', name: 'Costilla de res', desc: 'Ahumada 10 horas.',
  price: 89.9, image: 'assets/img/platos/costilla-res.jpg', available: true,
  alt: 'Costilla de res ahumada cortada en tiras sobre una tabla de madera.'
},
```

Sube la foto a `assets/img/platos/` (JPG vertical, ~540×795 px, menos de 150 KB).
Escribe un `alt` que describa lo que se ve: es obligatorio para la accesibilidad.
Para ocultar temporalmente un plato del delivery: `available: false`.

Se puede editar directamente en GitHub (botón del lápiz) sin instalar nada.

## Analítica

Pon tu ID de Google Analytics 4 (`G-XXXXXXX`) en `analytics.ga4Id`. Solo se carga si la
persona acepta en el aviso de cookies. Sin ID, no se carga nada de terceros.

## Pagos con tarjeta y notificaciones automáticas (siguiente fase)

GitHub Pages solo sirve archivos estáticos: no puede guardar claves secretas ni ejecutar código
en un servidor. Por eso, esta versión **no** hace:

- **Cobros con tarjeta.** Nunca se deben pedir números de tarjeta en un formulario propio (PCI DSS).
  Se necesita una pasarela peruana (Culqi, Izipay, Niubiz o Mercado Pago) con contrato de comercio,
  que además puede cobrar Yape y billeteras como Plin y deposita en la cuenta bancaria del negocio
  que se configure en su panel. Su integración requiere un pequeño servidor (p. ej., Cloudflare
  Workers o Vercel) para crear las órdenes con la clave secreta y recibir la confirmación del pago.
- **Verificación automática de Yape/Plin.** Hoy el negocio verifica cada pago a mano.
- **Correos y WhatsApp automáticos** al cliente y al negocio. Requieren ese mismo servidor, un
  servicio de correo (p. ej., Resend o SendGrid) y la API de WhatsApp Business con plantillas aprobadas por Meta.
- **Libro de Reclamaciones con registro en servidor** (numeración correlativa y constancia automática).

## Fuentes y créditos

- Fuentes Oswald y Barlow alojadas localmente, licencia SIL Open Font License (ver `assets/fonts/`).
- Logo y fotografías: proporcionados por el negocio. Confirma que tienes los derechos de uso de cada foto.

## Versión de un solo archivo

Para tener todo el sitio en un único `.html` (para abrirlo con doble clic o compartirlo):

```
python3 donde-andres-bbq/herramientas/crear-archivo-unico.py
```

Crea `donde-andres-bbq/donde-andres-bbq-archivo-unico.html` con los estilos, fuentes, fotos, la tienda
y las páginas legales dentro (se abren con `#terminos`, `#privacidad`, etc.). Vuelve a generarlo después
de cada cambio en `config.js`. Esa versión no lleva la política de seguridad de contenido (CSP), que
exige archivos separados; para publicar en internet usa la carpeta completa.
