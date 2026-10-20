# Kit de ventas

Piezas para ofrecer la tarjeta de sellos digital:

- `tarjetas.html`: 7 piezas de 1080×1350 para WhatsApp y el carrusel de Instagram.
- `folleto.html`: folleto A4 para imprimir, con frente y reverso.
- `guia.html`: guía de ventas con mensajes de WhatsApp e Instagram, guion de llamada y respuestas a objeciones.
- `guion.html`: guion de venta completo: la oferta paso a paso, todo lo que incluye, los beneficios, cómo mostrar «Tus números», la presentación de 10 minutos, precios y el informe mensual.

## Cambiar tus datos

Edita `datos.json`: tu nombre, tu WhatsApp, tu Instagram, los planes y la oferta.

## Generar los archivos

Desde esta carpeta, en una computadora con Node.js y Playwright:

```bash
mkdir -p out
python3 -m http.server 8091 --bind 127.0.0.1 &
PW=$(npm root -g)/playwright node render.js tarjetas   # out/venta-1..7.png
PW=$(npm root -g)/playwright node render.js folleto    # out/folleto.pdf
PW=$(npm root -g)/playwright node render.js guia       # out/guia.pdf
PW=$(npm root -g)/playwright node render.js guion      # out/guion.pdf
```

Las imágenes de los celulares son renders 3D del sistema real; las capturas `img/numeros-*.png` son del panel real con datos de ejemplo. Las tipografías Playfair Display y Manrope tienen licencia libre OFL.
