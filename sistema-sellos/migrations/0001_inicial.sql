-- Tablas del sistema de sellos. El Worker también las crea solo al arrancar
-- (asegurarEsquema en src/index.js), así que aplicar esta migración es opcional.

CREATE TABLE IF NOT EXISTS negocios (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,             -- parte de la dirección: /filo
  nombre        TEXT NOT NULL,                    -- nombre comercial
  razon_social  TEXT NOT NULL DEFAULT '',
  ruc           TEXT NOT NULL DEFAULT '',
  direccion     TEXT NOT NULL DEFAULT '',
  correo        TEXT NOT NULL DEFAULT '',         -- para derechos ARCO
  whatsapp      TEXT NOT NULL DEFAULT '',
  programa      TEXT NOT NULL,                    -- "Club Filo"
  meta          INTEGER NOT NULL DEFAULT 10,      -- sellos para el premio
  premio        TEXT NOT NULL,                    -- "Corte gratis"
  espera_min    INTEGER NOT NULL DEFAULT 180,     -- minutos mínimos entre dos sellos del mismo cliente
  color         TEXT NOT NULL DEFAULT '#C9A45C',
  tema          TEXT NOT NULL DEFAULT 'oscuro',   -- oscuro | claro
  redes         TEXT NOT NULL DEFAULT '{}',       -- JSON: whatsapp, instagram, tiktok, facebook, maps, web
  diseno        TEXT NOT NULL DEFAULT '{}',       -- JSON: estilo, colores, tipografía, fondo, tarjeta y sellos (src/diseno.js)
  plan          TEXT NOT NULL DEFAULT '',         -- plan contratado (solo informativo para /admin)
  vence         TEXT NOT NULL DEFAULT '',         -- fecha de vencimiento AAAA-MM-DD (hora de Lima)
  suspendido    INTEGER NOT NULL DEFAULT 0,       -- 1 = servicio en pausa: no registra ni suma sellos
  precio_visita INTEGER NOT NULL DEFAULT 0,       -- «Tus números»: ticket promedio, en céntimos
  costo_premio  INTEGER NOT NULL DEFAULT 0,       -- lo que le cuesta al negocio dar el premio (0 = el ticket)
  inversion_mes INTEGER NOT NULL DEFAULT 0,       -- lo que paga al mes por el sistema
  tipo          TEXT NOT NULL DEFAULT 'sellos',   -- sellos | puntos | cashback (src/programa.js)
  reglas        TEXT NOT NULL DEFAULT '{}',       -- JSON: puntos por S/ 1 y premios, o % de vuelta y saldo mínimo, o premios en el camino de los sellos (hitos)
  servicios     TEXT NOT NULL DEFAULT '[]',       -- JSON: [{n: nombre, p: precio en céntimos}]
  productos     TEXT NOT NULL DEFAULT '[]',       -- JSON: productos que vende, igual que servicios (salen aparte en el panel)
  regalo_cumple TEXT NOT NULL DEFAULT '',         -- regalo de cumpleaños que ofrece (texto libre, opcional)
  pedir_servicio INTEGER NOT NULL DEFAULT 1,      -- 1 = el cajero debe elegir el servicio (o escribir el monto) en cada visita
  mostrar_numeros INTEGER NOT NULL DEFAULT 0,     -- 1 = el dueño ve «Tus números» completos en su panel (si no, solo en /admin)
  sello_regalo  INTEGER NOT NULL DEFAULT 0,       -- 1 = la tarjeta nueva empieza con 1 sello de regalo (solo sellos)
  clave_hash    TEXT NOT NULL DEFAULT '',         -- clave del panel (PBKDF2)
  clave_ver     INTEGER NOT NULL DEFAULT 1,       -- cambia al cambiar la clave: cierra sesiones viejas
  rubro         TEXT NOT NULL DEFAULT '',         -- bodega, ferreteria, ropa, barberia, spa... (src/gestion.js RUBROS). Define si es comercio o servicios
  gestion       INTEGER NOT NULL DEFAULT 0,       -- 1 = tiene la gestión del negocio (/slug/gestion: agenda, caja, gastos, finanzas)
  ajustes       TEXT NOT NULL DEFAULT '{}',       -- JSON de la gestión: horario, reservas en línea, meta del mes, medios de pago (src/gestion.js)
  clave_dueno   TEXT NOT NULL DEFAULT '',         -- clave del dueño (PBKDF2): ve finanzas, gastos y personal. Vacía = la clave del panel lo ve todo
  clave_dueno_ver INTEGER NOT NULL DEFAULT 1,     -- cambia al cambiar la clave del dueño
  invitacion    TEXT NOT NULL DEFAULT '',         -- enlace de un solo uso (/unirse/TOKEN) para que el dueño ponga su correo y su clave
  invitacion_vence TEXT NOT NULL DEFAULT '',      -- AAAA-MM-DD
  activo        INTEGER NOT NULL DEFAULT 1,
  creado        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clientes (
  id             INTEGER PRIMARY KEY,
  negocio_id     INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  token          TEXT NOT NULL UNIQUE,            -- enlace privado de la tarjeta
  codigo         TEXT NOT NULL,                   -- código del QR / para dictar en caja
  nombre         TEXT NOT NULL,
  celular        TEXT NOT NULL,                   -- 51XXXXXXXXX
  recordatorios  INTEGER NOT NULL DEFAULT 0,      -- aceptó mensajes por WhatsApp
  sellos         INTEGER NOT NULL DEFAULT 0,
  puntos         INTEGER NOT NULL DEFAULT 0,      -- programa de puntos
  saldo          INTEGER NOT NULL DEFAULT 0,      -- cashback: saldo a favor, en céntimos
  visitas        INTEGER NOT NULL DEFAULT 0,
  premios        INTEGER NOT NULL DEFAULT 0,
  ultima_visita  TEXT,
  consentimiento TEXT NOT NULL,                   -- fecha y versión del aviso aceptado
  origen         TEXT NOT NULL DEFAULT 'enlace',  -- qr (cartel del mostrador) | enlace (bio, WhatsApp...) | caja (lo registró el negocio al cobrar o agendar)
  wallet         INTEGER NOT NULL DEFAULT 0,      -- 1 = guardó su tarjeta en Google Wallet
  meta_t         INTEGER,                         -- promoción que conserva su tarjeta (sellos) si el negocio la cambió; NULL = la actual
  premio_t       TEXT,                            -- premio de esa promoción; se borran al canjear
  hitos_t        TEXT,                            -- JSON: premios en el camino de esa promoción
  hito           INTEGER NOT NULL DEFAULT 0,      -- sellos del último premio del camino ya canjeado en esta tarjeta (0 al canjear el final)
  cumple         TEXT,                            -- cumpleaños «MM-DD» (sin año), opcional
  notas          TEXT NOT NULL DEFAULT '',        -- ficha del cliente en la gestión: alergias, preferencias, fórmula del tinte...
  creado         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (negocio_id, celular),
  UNIQUE (negocio_id, codigo)
);

CREATE TABLE IF NOT EXISTS movimientos (
  id          INTEGER PRIMARY KEY,
  negocio_id  INTEGER NOT NULL,
  cliente_id  INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,                      -- sello (visita) | canje | traspaso (sellos de la tarjeta de papel, una vez) | regalo (sello de bienvenida)
  monto       INTEGER,                            -- lo cobrado en esa visita, en céntimos (opcional). En un canje de cashback, el saldo usado
  servicio    TEXT,                               -- servicios de la visita («Corte + Barba») o premio canjeado
  puntos      INTEGER,                            -- puntos sumados (o restados en un canje). NULL en sellos
  saldo       INTEGER,                            -- saldo sumado (o usado en un canje), en céntimos. NULL en sellos
  sellos      INTEGER,                            -- en un traspaso, cuántos sellos de papel se pasaron
  creado      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cuántas veces se abre la página de registro, por día (hora de Lima) y origen.
-- Solo contadores: no se guarda IP ni ningún dato de la persona.
CREATE TABLE IF NOT EXISTS vistas (
  negocio_id  INTEGER NOT NULL,
  dia         TEXT NOT NULL,                      -- AAAA-MM-DD
  origen      TEXT NOT NULL,                      -- qr | enlace
  n           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (negocio_id, dia, origen)
);

CREATE TABLE IF NOT EXISTS intentos (
  clave  TEXT PRIMARY KEY,
  n      INTEGER NOT NULL,
  desde  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clientes_negocio ON clientes (negocio_id, sellos);
CREATE INDEX IF NOT EXISTS idx_mov_cliente ON movimientos (cliente_id, creado);
CREATE INDEX IF NOT EXISTS idx_mov_negocio ON movimientos (negocio_id, creado);

-- Fotos y videos del diseño. El archivo vive en Cloudflare KV (binding MEDIOS); aquí solo el registro.
CREATE TABLE IF NOT EXISTS medios (
  id          TEXT PRIMARY KEY,                   -- m + 16 caracteres al azar
  negocio_id  INTEGER NOT NULL REFERENCES negocios(id),
  tipo        TEXT NOT NULL,                      -- logo | portada | imagen | video
  mime        TEXT NOT NULL,
  tam         INTEGER NOT NULL,
  creado      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS medios_negocio ON medios (negocio_id);

-- ===== Gestión del negocio (src/gestion.js). Montos en céntimos; días y horas en hora de Lima. =====

-- Equipo: quién atiende (barberos, estilistas, masajistas...) y su comisión.
CREATE TABLE IF NOT EXISTS personal (
  id            INTEGER PRIMARY KEY,
  negocio_id    INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,
  cargo         TEXT NOT NULL DEFAULT '',         -- «Barbero», «Manicurista»...
  celular       TEXT NOT NULL DEFAULT '',
  color         TEXT NOT NULL DEFAULT '#8AB4F8',  -- color de sus citas en la agenda
  comision      INTEGER NOT NULL DEFAULT 0,       -- % de lo que cobra en servicios
  comision_prod INTEGER NOT NULL DEFAULT 0,       -- % de lo que vende en productos
  servicios     TEXT NOT NULL DEFAULT '[]',       -- JSON: nombres de los servicios que hace (vacío = todos). Para la reserva en línea
  agenda        INTEGER NOT NULL DEFAULT 1,       -- 1 = tiene agenda (se le pueden reservar citas)
  clave_hash    TEXT NOT NULL DEFAULT '',         -- su propia clave para entrar (con su celular) como caja. Vacía = no entra
  clave_ver     INTEGER NOT NULL DEFAULT 1,       -- cambia al cambiar su clave o al quitarle el acceso
  activo        INTEGER NOT NULL DEFAULT 1,       -- 0 = ya no trabaja aquí (sus ventas se conservan)
  creado        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_personal_negocio ON personal (negocio_id);

-- Agenda: citas y horarios bloqueados.
CREATE TABLE IF NOT EXISTS citas (
  id            INTEGER PRIMARY KEY,
  negocio_id    INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  dia           TEXT NOT NULL,                    -- AAAA-MM-DD
  hora          TEXT NOT NULL,                    -- HH:MM
  dur           INTEGER NOT NULL DEFAULT 30,      -- minutos
  personal_id   INTEGER,                          -- quién atiende (NULL = el negocio, si no hay equipo cargado)
  cliente_id    INTEGER,                          -- NULL si no tiene tarjeta (o se eliminó)
  nombre        TEXT NOT NULL DEFAULT '',
  celular       TEXT NOT NULL DEFAULT '',         -- 51XXXXXXXXX
  servicio      TEXT NOT NULL DEFAULT '',
  precio        INTEGER NOT NULL DEFAULT 0,
  estado        TEXT NOT NULL DEFAULT 'pendiente',-- pendiente | confirmada | atendida | no_vino | cancelada | bloqueo (horario cerrado)
  origen        TEXT NOT NULL DEFAULT 'panel',    -- panel | web (la reservó el cliente en /slug/reservar)
  nota          TEXT NOT NULL DEFAULT '',
  venta_id      INTEGER,
  creado        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_citas_dia ON citas (negocio_id, dia, hora);
CREATE INDEX IF NOT EXISTS idx_citas_cliente ON citas (cliente_id);

-- Caja: cada cobro.
CREATE TABLE IF NOT EXISTS ventas (
  id            INTEGER PRIMARY KEY,
  negocio_id    INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  dia           TEXT NOT NULL,                    -- AAAA-MM-DD
  hora          TEXT NOT NULL,                    -- HH:MM
  cliente_id    INTEGER,
  nombre        TEXT NOT NULL DEFAULT '',
  personal_id   INTEGER,                          -- quién atendió (para su comisión)
  items         TEXT NOT NULL DEFAULT '[]',       -- JSON: [{n: nombre, t: s (servicio) | p (producto), p: precio, c: cantidad, a: artículo, k: costo}]
  servicios     INTEGER NOT NULL DEFAULT 0,       -- suma de los servicios (antes del descuento)
  productos     INTEGER NOT NULL DEFAULT 0,       -- suma de los productos (antes del descuento)
  descuento     INTEGER NOT NULL DEFAULT 0,
  total         INTEGER NOT NULL DEFAULT 0,
  costo         INTEGER NOT NULL DEFAULT 0,       -- comercio: lo que costó lo vendido (para la ganancia real)
  token         TEXT,                             -- enlace privado del comprobante (/slug/v/TOKEN)
  metodo        TEXT NOT NULL DEFAULT 'Efectivo', -- Efectivo | Yape | Plin | Tarjeta | Transferencia | Fiado (se lo debe el cliente)
  cita_id       INTEGER,
  nota          TEXT NOT NULL DEFAULT '',
  anulada       INTEGER NOT NULL DEFAULT 0,
  creado        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ventas_dia ON ventas (negocio_id, dia);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas (cliente_id);

-- Gastos del negocio.
CREATE TABLE IF NOT EXISTS gastos (
  id            INTEGER PRIMARY KEY,
  negocio_id    INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  dia           TEXT NOT NULL,                    -- AAAA-MM-DD
  categoria     TEXT NOT NULL,
  detalle       TEXT NOT NULL DEFAULT '',
  monto         INTEGER NOT NULL,
  metodo        TEXT NOT NULL DEFAULT 'Efectivo',
  personal_id   INTEGER,                          -- sueldo, comisión o adelanto de alguien del equipo
  fijo          INTEGER NOT NULL DEFAULT 0,       -- 1 = se repite cada mes (alquiler, luz...): el mes siguiente sale como pendiente
  creado        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gastos_dia ON gastos (negocio_id, dia);

-- ===== Comercio (src/comercio.js): bodegas, ferreterías, tiendas de ropa, florerías... =====

-- Inventario. Un producto con variantes (talla, color) es una fila «padre» y una fila por variante (padre = id del padre),
-- cada una con su código y su stock. Un producto con receta (un jugo, un arreglo floral) descuenta sus insumos al venderse.
CREATE TABLE IF NOT EXISTS articulos (
  id            INTEGER PRIMARY KEY,
  negocio_id    INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  padre         INTEGER,                          -- variante de este producto (NULL = producto)
  nombre        TEXT NOT NULL,
  variante      TEXT NOT NULL DEFAULT '',         -- «M / Negro», «Talla 38»
  codigo        TEXT NOT NULL DEFAULT '',         -- código de barras o interno
  categoria     TEXT NOT NULL DEFAULT '',
  unidad        TEXT NOT NULL DEFAULT 'unidad',   -- unidad | kg | litro | metro | paquete | caja | servicio
  precio        INTEGER NOT NULL DEFAULT 0,       -- en una variante, 0 = el del producto
  costo         INTEGER NOT NULL DEFAULT 0,       -- costo promedio (se actualiza con cada compra)
  stock         REAL NOT NULL DEFAULT 0,
  minimo        REAL NOT NULL DEFAULT 0,          -- avisa cuando el stock llega aquí
  controla      INTEGER NOT NULL DEFAULT 1,       -- 0 = no lleva stock (un servicio, o un producto con variantes o receta)
  receta        TEXT NOT NULL DEFAULT '[]',       -- JSON: [{a: insumo, c: cantidad}]
  activo        INTEGER NOT NULL DEFAULT 1,
  creado        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_articulos_negocio ON articulos (negocio_id, activo, nombre);
CREATE INDEX IF NOT EXISTS idx_articulos_codigo ON articulos (negocio_id, codigo);

CREATE TABLE IF NOT EXISTS proveedores (
  id            INTEGER PRIMARY KEY,
  negocio_id    INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,
  ruc           TEXT NOT NULL DEFAULT '',
  celular       TEXT NOT NULL DEFAULT '',
  contacto      TEXT NOT NULL DEFAULT '',
  nota          TEXT NOT NULL DEFAULT '',
  activo        INTEGER NOT NULL DEFAULT 1,
  creado        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Compras de mercadería: suben el stock. Lo pagado se anota también como gasto («Compra de mercadería»);
-- lo que falta pagar es deuda con el proveedor.
CREATE TABLE IF NOT EXISTS compras (
  id            INTEGER PRIMARY KEY,
  negocio_id    INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  proveedor_id  INTEGER,
  dia           TEXT NOT NULL,
  items         TEXT NOT NULL DEFAULT '[]',       -- JSON: [{a: artículo, n: nombre, c: cantidad, k: costo unitario}]
  total         INTEGER NOT NULL DEFAULT 0,
  pagado        INTEGER NOT NULL DEFAULT 0,
  nota          TEXT NOT NULL DEFAULT '',
  creado        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_compras_negocio ON compras (negocio_id, dia);

-- Pagos de los clientes a cuenta de lo que se llevaron fiado.
CREATE TABLE IF NOT EXISTS abonos (
  id            INTEGER PRIMARY KEY,
  negocio_id    INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  cliente_id    INTEGER,
  dia           TEXT NOT NULL,
  hora          TEXT NOT NULL,
  monto         INTEGER NOT NULL,
  metodo        TEXT NOT NULL DEFAULT 'Efectivo',
  nota          TEXT NOT NULL DEFAULT '',
  creado        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_abonos_negocio ON abonos (negocio_id, dia);
CREATE INDEX IF NOT EXISTS idx_abonos_cliente ON abonos (cliente_id);

-- Cuentas creadas por el propio negocio en /crear: entran con su correo y su clave (la clave del dueño del negocio).
CREATE TABLE IF NOT EXISTS cuentas (
  id            INTEGER PRIMARY KEY,
  correo        TEXT NOT NULL UNIQUE,
  nombre        TEXT NOT NULL,
  celular       TEXT NOT NULL DEFAULT '',
  negocio_id    INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  creado        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Merma: mercadería que se pierde (vencida, rota, robada, consumo propio) y correcciones del conteo físico.
-- cantidad > 0 es lo que salió del stock; < 0 es lo que sobró al contar. costo = cantidad × costo unitario de ese momento.
CREATE TABLE IF NOT EXISTS mermas (
  id            INTEGER PRIMARY KEY,
  negocio_id    INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  articulo_id   INTEGER NOT NULL,
  nombre        TEXT NOT NULL,
  dia           TEXT NOT NULL,
  hora          TEXT NOT NULL,
  cantidad      REAL NOT NULL,
  costo         INTEGER NOT NULL DEFAULT 0,
  motivo        TEXT NOT NULL,
  nota          TEXT NOT NULL DEFAULT '',
  personal_id   INTEGER,
  creado        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mermas_negocio ON mermas (negocio_id, dia);

-- Cuadre de caja: cada turno se abre con un fondo en efectivo y se cierra contando lo que hay (arqueo).
-- El turno suma las ventas, abonos y gastos registrados después de abrir (por id, que solo crece: no se cruzan dos turnos
-- aunque uno cierre y otro abra en el mismo segundo).
CREATE TABLE IF NOT EXISTS cajas (
  id            INTEGER PRIMARY KEY,
  negocio_id    INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  estado        TEXT NOT NULL DEFAULT 'abierta',  -- abierta | cerrada
  dia           TEXT NOT NULL,                    -- día (Lima) en que se abrió
  hora          TEXT NOT NULL,
  abierta_en    TEXT NOT NULL DEFAULT (datetime('now')),
  abrio         TEXT NOT NULL DEFAULT '',         -- nombre de quien abrió
  fondo         INTEGER NOT NULL DEFAULT 0,       -- efectivo con que empieza
  marcas        TEXT NOT NULL DEFAULT '{}',       -- JSON {v, a, g}: último id de ventas, abonos y gastos al abrir; el turno cuenta los siguientes
  cerrada_en    TEXT,
  cierre_dia    TEXT,
  cierre_hora   TEXT,
  cerro         TEXT NOT NULL DEFAULT '',
  esperado      INTEGER,                          -- efectivo que debería haber
  contado       INTEGER,                          -- efectivo que se contó
  diferencia    INTEGER,                          -- contado − esperado (negativo: falta)
  dejado        INTEGER,                          -- efectivo que queda para el siguiente turno
  detalle       TEXT NOT NULL DEFAULT '{}',       -- JSON: resumen del turno al cerrar
  nota          TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_cajas_negocio ON cajas (negocio_id, estado, id);
-- Una sola caja abierta por negocio.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cajas_abierta ON cajas (negocio_id) WHERE estado = 'abierta';

-- Plata que se saca de la caja (depósito, pago al dueño) o se agrega (sencillo) durante el turno.
CREATE TABLE IF NOT EXISTS caja_movimientos (
  id            INTEGER PRIMARY KEY,
  negocio_id    INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  caja_id       INTEGER NOT NULL,
  tipo          TEXT NOT NULL,                    -- entrada | salida
  monto         INTEGER NOT NULL,
  motivo        TEXT NOT NULL DEFAULT '',
  hora          TEXT NOT NULL,
  quien         TEXT NOT NULL DEFAULT '',
  creado        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_caja_mov ON caja_movimientos (caja_id);
