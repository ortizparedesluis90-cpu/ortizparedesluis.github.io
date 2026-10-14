# Demos para clientes

Genera las páginas de demostración, cada una en un solo archivo `.html` que se abre en el celular:

| Archivo | Negocio | Programa de fidelización |
|---|---|---|
| `demo-barberia.html` | barbería | Club Filo: sellos |
| `demo-spa.html` | spa | Alma Rewards: puntos y niveles |
| `demo-salon-belleza.html` | salón de belleza premium | Belle Club: sellos y VIP |

```bash
python3 -I demos-clientes/generar.py salida/
```

Todos los datos son de ejemplo. Los botones de WhatsApp no llevan número, y la tarjeta del demo es una simulación que no guarda nada.

## Conectar un demo al sistema real de sellos

Primero publica la carpeta `sistema-sellos/` (ver su LEEME.md) y crea el negocio en `/admin`. Los identificadores que esperan los demos son `filo`, `alma` y `belle`. Luego genera el demo con la dirección del sistema:

```bash
SELLOS_URL=https://sistema-sellos.TU-SUBDOMINIO.workers.dev SOLO=barberia python3 -I demos-clientes/generar.py salida/
```

Se crea `demo-barberia-conectado.html` con el botón **«Crear o abrir mi tarjeta real»**, que lleva al registro del negocio en el sistema de sellos.

Para personalizar un demo, edita el tema correspondiente en `THEMES` dentro de `generar.py`: nombre, servicios, precios, equipo, horario, colores y programa de premios.

Las fuentes tienen licencia SIL Open Font License 1.1 (ver `fonts/OFL.txt`).
