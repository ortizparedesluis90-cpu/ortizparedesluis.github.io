// Google Wallet: pase de cliente frecuente (loyalty) firmado con una cuenta de servicio de Google Cloud.
// Se activa con WALLET_ISSUER_ID, WALLET_SA_EMAIL y el secreto WALLET_SA_KEY (ver LEEME.md).
import { estado } from './programa.js';

export const walletActivo = (env) => Boolean(env.WALLET_ISSUER_ID && env.WALLET_SA_EMAIL && env.WALLET_SA_KEY);

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlTexto = (t) => b64url(new TextEncoder().encode(t));

let llaveCache = null;
async function llave(env) {
  if (llaveCache) return llaveCache;
  // Acepta la llave tal como viene en el JSON de Google (con \n escritos como texto).
  const pem = String(env.WALLET_SA_KEY).replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  llaveCache = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  return llaveCache;
}

export async function firmar(env, payload) {
  const cuerpo = `${b64urlTexto(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64urlTexto(JSON.stringify(payload))}`;
  const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await llave(env), new TextEncoder().encode(cuerpo));
  return `${cuerpo}.${b64url(firma)}`;
}

// Los ID solo admiten letras, números, punto, guion y guion bajo.
const idClase = (env, n) => `${env.WALLET_ISSUER_ID}.sellos_${n.slug}`;
export const idObjeto = (env, n, c) => `${env.WALLET_ISSUER_ID}.${n.slug}_${c.codigo}`;

function clase(env, n, logo) {
  return {
    id: idClase(env, n),
    issuerName: n.nombre.slice(0, 20),
    programName: n.programa.slice(0, 20),
    programLogo: { sourceUri: { uri: logo }, contentDescription: { defaultValue: { language: 'es-PE', value: n.nombre } } },
    hexBackgroundColor: n.d.fondoColor,
    reviewStatus: 'UNDER_REVIEW',
    countryCode: 'PE',
    localizedRewardsTier: { defaultValue: { language: 'es-PE', value: n.premio.slice(0, 40) } },
  };
}

// Lo que muestra el pase según el tipo de programa.
function saldoPase(n, c) {
  const st = estado(n, c);
  if (st.tipo === 'puntos') return { loyaltyPoints: { label: 'Puntos', balance: { int: st.puntos } }, premio: st.premio };
  if (st.tipo === 'cashback') return { loyaltyPoints: { label: 'Saldo', balance: { money: { micros: st.saldo * 10000, currencyCode: 'PEN' } } }, premio: st.premio };
  return {
    loyaltyPoints: sp.loyaltyPoints,
    premio: c.sellos >= n.meta ? `¡Listo! Pide en caja: ${n.premio}` : `Al completar ${n.meta} sellos: ${n.premio}`,
  };
}

function objeto(env, n, c, origen) {
  const sp = saldoPase(n, c);
  return {
    id: idObjeto(env, n, c),
    classId: idClase(env, n),
    state: 'ACTIVE',
    accountId: c.codigo,
    accountName: String(c.nombre || '').split(' ')[0].slice(0, 25),
    loyaltyPoints: { label: `Sellos (de ${n.meta})`, balance: { int: Math.min(c.sellos, n.meta) } },
    barcode: { type: 'QR_CODE', value: `${origen.toUpperCase()}/${n.slug.toUpperCase()}/K/${c.codigo}`, alternateText: c.codigo },
    textModulesData: [{ id: 'premio', header: 'Premio', body: sp.premio }],
    linksModuleData: { uris: [{ id: 'tarjeta', uri: `${origen}/${n.slug}/t/${c.token}`, description: 'Ver mi tarjeta' }] },
  };
}

const API = 'https://walletobjects.googleapis.com/walletobjects/v1';
const clasesListas = new Set();

/** Crea (o actualiza) en Google la clase del negocio y el pase del cliente. */
async function crearEnGoogle(env, n, c, origen, logo) {
  const auth = { Authorization: `Bearer ${await tokenAcceso(env)}`, 'Content-Type': 'application/json' };
  const subir = async (tipo, cuerpo) => {
    const r = await fetch(`${API}/${tipo}`, { method: 'POST', headers: auth, body: JSON.stringify(cuerpo) });
    if (r.status === 409) {
      const u = await fetch(`${API}/${tipo}/${encodeURIComponent(cuerpo.id)}`, { method: 'PATCH', headers: auth, body: JSON.stringify(cuerpo) });
      if (!u.ok) throw new Error(`${tipo} ${u.status}`);
    } else if (!r.ok) throw new Error(`${tipo} ${r.status} ${(await r.text()).slice(0, 200)}`);
  };
  if (!clasesListas.has(n.slug)) { await subir('loyaltyClass', clase(env, n, logo)); clasesListas.add(n.slug); }
  await subir('loyaltyObject', objeto(env, n, c, origen));
}

/** Enlace «Agregar a Google Wallet». Si Google responde, el enlace solo lleva el ID del pase (corto);
 *  si no, lleva la clase y el pase completos dentro del JWT firmado. */
export async function enlaceGuardar(env, n, c, origen, logo) {
  let payload;
  try {
    await crearEnGoogle(env, n, c, origen, logo);
    payload = { loyaltyObjects: [{ id: idObjeto(env, n, c), classId: idClase(env, n) }] };
  } catch (err) {
    console.error('Google Wallet', String(err));
    payload = { loyaltyClasses: [clase(env, n, logo)], loyaltyObjects: [objeto(env, n, c, origen)] };
  }
  const jwt = await firmar(env, { iss: env.WALLET_SA_EMAIL, aud: 'google', typ: 'savetowallet', iat: Math.floor(Date.now() / 1000), origins: [origen], payload });
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

let token = { valor: '', vence: 0 };
async function tokenAcceso(env) {
  if (token.valor && token.vence > Date.now() + 60000) return token.valor;
  const ahora = Math.floor(Date.now() / 1000);
  const afirmacion = await firmar(env, {
    iss: env.WALLET_SA_EMAIL, scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
    aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600,
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${afirmacion}`,
  });
  if (!r.ok) throw new Error(`token ${r.status}`);
  const d = await r.json();
  token = { valor: d.access_token, vence: Date.now() + (d.expires_in || 3600) * 1000 };
  return token.valor;
}

/** Actualiza los sellos del pase ya guardado. Si falla, la tarjeta web sigue siendo la fuente de verdad. */
export async function actualizar(env, n, c, origen) {
  try {
    const o = objeto(env, n, c, origen);
    const r = await fetch(`${API}/loyaltyObject/${encodeURIComponent(o.id)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await tokenAcceso(env)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ loyaltyPoints: o.loyaltyPoints, textModulesData: o.textModulesData, state: 'ACTIVE' }),
    });
    if (!r.ok && r.status !== 404) console.error('Google Wallet', r.status, (await r.text()).slice(0, 300));
  } catch (err) {
    console.error('Google Wallet', String(err));
  }
}
