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
  reglas        TEXT NOT NULL DEFAULT '{}',       -- JSON: puntos por S/ 1 y premios, o % de vuelta y saldo mínimo
  servicios     TEXT NOT NULL DEFAULT '[]',       -- JSON: [{n: nombre, p: precio en céntimos}]
  pedir_servicio INTEGER NOT NULL DEFAULT 1,      -- 1 = el cajero debe elegir el servicio (o escribir el monto) en cada visita
  mostrar_numeros INTEGER NOT NULL DEFAULT 0,     -- 1 = el dueño ve «Tus números» completos en su panel (si no, solo en /admin)
  clave_hash    TEXT NOT NULL DEFAULT '',         -- clave del panel (PBKDF2)
  clave_ver     INTEGER NOT NULL DEFAULT 1,       -- cambia al cambiar la clave: cierra sesiones viejas
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
  origen         TEXT NOT NULL DEFAULT 'enlace',  -- qr (cartel del mostrador) | enlace (bio, WhatsApp...)
  wallet         INTEGER NOT NULL DEFAULT 0,      -- 1 = guardó su tarjeta en Google Wallet
  creado         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (negocio_id, celular),
  UNIQUE (negocio_id, codigo)
);

CREATE TABLE IF NOT EXISTS movimientos (
  id          INTEGER PRIMARY KEY,
  negocio_id  INTEGER NOT NULL,
  cliente_id  INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,                      -- sello (visita) | canje | traspaso (sellos de la tarjeta de papel, una vez)
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
