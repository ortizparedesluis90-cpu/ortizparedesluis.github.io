/*
 * CONFIGURACIÓN DEL NEGOCIO — Donde Andrés BBQ
 * ------------------------------------------------------------------
 * Este es el ÚNICO archivo que necesitas editar para:
 *   - completar los datos legales del negocio (RUC, razón social, correo)
 *   - configurar Yape, Plin y la cuenta bancaria donde recibes el dinero
 *   - agregar, quitar o cambiar productos y precios de la tienda
 *   - activar la analítica (Google Analytics 4)
 *
 * Los campos vacíos ('') se muestran en la web como "Por completar" mientras
 * `demo` sea true. Cuando todo esté completo y verificado, cambia `demo` a false.
 * Guía completa: LEEME.md
 */
window.DA_CONFIG = {
  /* true = modo demostración: se muestra un aviso, los precios son de ejemplo
     y el último paso NO envía el pedido (solo muestra una vista previa). */
  demo: true,

  /* Fecha de la última actualización de las políticas legales (AAAA-MM-DD). */
  policiesUpdated: '2026-09-25',

  business: {
    name: 'Donde Andrés BBQ',          // nombre comercial
    legalName: '',                      // razón social exacta según SUNAT — POR COMPLETAR
    ruc: '',                            // RUC de 11 dígitos — POR COMPLETAR
    address: 'Jirón Leoncio Prado 723, Surquillo 15047, Lima, Perú',
    email: '',                          // correo para pedidos, reclamos y datos personales — POR COMPLETAR
    whatsapp: '51986045212',            // con código de país, sin + ni espacios
    phoneDisplay: '986 045 212',
    instagram: 'https://www.instagram.com/dondeandresbbq',
    tiktok: 'https://www.tiktok.com/@donde_andresbbq'
  },

  /* Medios de pago. Un medio SOLO aparece en la tienda si tiene sus datos
     completos (en modo demo se muestra con "Por completar").
     qr: ruta opcional a la imagen del QR, p. ej. 'assets/img/qr-yape.png' */
  payments: {
    yape: { number: '', holder: '', qr: '' },
    plin: { number: '', holder: '', qr: '' },
    transfer: {
      bank: '',       // p. ej. 'BCP', 'Interbank', 'BBVA', 'Scotiabank'
      holder: '',     // titular de la cuenta (idealmente la razón social)
      account: '',    // número de cuenta en soles
      cci: ''         // código de cuenta interbancario (20 dígitos)
    }
  },

  delivery: {
    fee: 0,               // 0 = delivery incluido en el precio
    feeByDistrict: {},    // opcional, p. ej. { 'Ancón': 15, 'Pucusana': 15 }
    eta: '45 a 90 minutos según distrito y demanda',
    hours: '',            // horario de atención de pedidos — POR COMPLETAR, p. ej. 'Mar–Dom, 12:00–22:00'
    minOrder: 0,          // monto mínimo de pedido en soles (0 = sin mínimo)
    /* Distritos donde se entrega. Por defecto, los 43 distritos de Lima
       Metropolitana. Quita los que no cubras. */
    districts: [
      'Ancón', 'Ate', 'Barranco', 'Breña', 'Carabayllo', 'Chaclacayo', 'Chorrillos',
      'Cieneguilla', 'Comas', 'El Agustino', 'Independencia', 'Jesús María', 'La Molina',
      'La Victoria', 'Lima (Cercado)', 'Lince', 'Los Olivos', 'Lurigancho-Chosica', 'Lurín',
      'Magdalena del Mar', 'Miraflores', 'Pachacámac', 'Pucusana', 'Pueblo Libre',
      'Puente Piedra', 'Punta Hermosa', 'Punta Negra', 'Rímac', 'San Bartolo', 'San Borja',
      'San Isidro', 'San Juan de Lurigancho', 'San Juan de Miraflores', 'San Luis',
      'San Martín de Porres', 'San Miguel', 'Santa Anita', 'Santa María del Mar',
      'Santa Rosa', 'Santiago de Surco', 'Surquillo', 'Villa El Salvador',
      'Villa María del Triunfo'
    ]
  },

  /* PRODUCTOS
     id:        identificador único, sin espacios ni tildes
     name:      nombre visible
     desc:      descripción corta
     price:     precio final en soles, impuestos incluidos (número, p. ej. 89.9)
     image:     ruta de la foto
     alt:       texto alternativo: describe lo que se ve en la foto
     available: false = se muestra "No disponible para delivery" y no se puede comprar
     Un producto con price: 0 se muestra como "Precio por confirmar" y no se puede
   comprar (en modo demo se usan los precios de ejemplo de abajo). */
  products: [
    {
      id: 'brisket-angus', name: 'Brisket angus americano',
      desc: 'Carne de res angus premium americana ahumada 12 horas.',
      price: 0, image: 'assets/img/platos/brisket-angus.jpg', available: true,
      alt: 'Pieza gruesa de brisket ahumado con corteza oscura, servida sobre una plancha de hierro.'
    },
    {
      id: 'ribs-bbq', name: 'Baby back ribs BBQ',
      desc: 'Costillas de cerdo con extra carne, ahumadas 6 horas y terminadas a la brasa.',
      price: 0, image: 'assets/img/platos/ribs-bbq.jpg', available: true,
      alt: 'Costillas de cerdo cortadas y glaseadas con salsa BBQ brillante sobre una plancha de hierro.'
    },
    {
      id: 'entranas', name: 'Las entrañas de Channels',
      desc: 'Entraña fina USA de 400 g con una guarnición.',
      price: 0, image: 'assets/img/platos/entranas.jpg', available: true,
      alt: 'Entraña a la parrilla en tiras sobre plancha de hierro, con una canastilla de papas fritas y salsas al lado.'
    },
    {
      id: 'pasta-verde-brisket', name: 'Pasta verde con brisket',
      desc: 'Fettuccine en salsa verde con brisket angus y parmesano.',
      price: 0, image: 'assets/img/platos/pasta-verde-brisket.jpg', available: true,
      alt: 'Fettuccine en salsa verde con una tajada de brisket encima, en un plato blanco.'
    },
    {
      id: 'ocausa', name: 'O’Causa',
      desc: 'Causa de papa amarilla frita en panko con pulled pork, palta, tocino, chalaquita y alioli verde.',
      price: 0, image: 'assets/img/platos/ocausa.jpg', available: true,
      alt: 'Causa frita cubierta de cerdo deshilachado, cebolla, brotes y alioli verde, sobre láminas de palta.'
    },
    {
      id: 'mollejas', name: 'Mollejas de res argentinas',
      desc: 'Mollejas de res argentinas ahumadas 4 horas y terminadas a la brasa.',
      price: 0, image: 'assets/img/platos/mollejas.jpg', available: true,
      alt: 'Varias mollejas de res doradas a la brasa en un plato claro, con brotes verdes y limón.'
    },
    {
      id: 'carapulcra', name: 'Carapulcra BBQ',
      desc: '',  // descripción POR COMPLETAR
      price: 0, image: 'assets/img/platos/carapulcra.jpg', available: true,
      alt: 'Plato hondo de carapulcra con trozos de carne y cubierta de chicharrón crocante picado.'
    },
    {
      id: 'duo-chorizos', name: 'Dúo de chorizos',
      desc: '',  // descripción POR COMPLETAR
      price: 0, image: 'assets/img/platos/duo-chorizos.jpg', available: true,
      alt: 'Chorizos a la parrilla cortados en trozos gruesos en un plato claro, con un pocillo de salsa roja.'
    }
  ],

  /* ANALÍTICA — Google Analytics 4. Déjalo vacío para no usar analítica.
     Solo se carga si la persona acepta las cookies de analítica. */
  analytics: { ga4Id: '' }
};

/* Precios de ejemplo solo para el modo demostración. Se ignoran cuando demo = false. */
window.DA_DEMO_PRICES = {
  'brisket-angus': 79, 'ribs-bbq': 72, 'entranas': 69, 'pasta-verde-brisket': 49,
  'ocausa': 38, 'mollejas': 45, 'carapulcra': 42, 'duo-chorizos': 36
};
