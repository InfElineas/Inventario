/**
 * Cliente del Identity Server de Elineas.
 *
 * Reparto de responsabilidades, que es lo que más se presta a confusión:
 *
 *   · JWT (~15 min)  — prueba QUIÉN es el usuario. Se verifica localmente
 *                      contra el JWKS, sin llamar al IS en cada petición.
 *   · session token  — de larga duración. Se trata como una contraseña: solo
 *                      viaja en cookie httpOnly y sirve para renovar el JWT y
 *                      para consultar los roles.
 *   · roles          — el JWT NO los lleva de forma fiable. Los permisos en
 *                      ESTE sistema se consultan con el session token.
 *
 * El IS firma con EdDSA/Ed25519, que `jose` verifica sin problema.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose'

// Las variables se leen en cada uso, no al importar el módulo: en desarrollo el
// plugin de Vite las vuelca a process.env desde el .env DESPUÉS de que este
// módulo ya se importó, así que capturarlas arriba daría siempre vacío.
const authApiUrl = () => (process.env.AUTH_API_URL ?? '').replace(/\/+$/, '')
const systemSlug = () => process.env.SYSTEM_SLUG ?? 'inventario'
// El IS tal como lo ve el NAVEGADOR: puede diferir de AUTH_API_URL si este
// servidor lo alcanza por una dirección interna.
const authPublicUrl = () => (process.env.AUTH_PUBLIC_URL || authApiUrl()).replace(/\/+$/, '')

export function isIdentityConfigured() {
  return Boolean(authApiUrl())
}

// jose cachea el JWKS en memoria y lo refresca solo cuando aparece un `kid`
// desconocido, así que esto no es una llamada por petición.
let jwks = null
function getJwks() {
  if (!jwks) {
    const base = authApiUrl()
    if (!base) throw new Error('Falta AUTH_API_URL')
    jwks = createRemoteJWKSet(new URL('/api/auth/jwks', base))
  }
  return jwks
}

function url(ruta) {
  return new URL(ruta, authApiUrl())
}

/** X-Forwarded-For con la IP del cliente, o nada si no se conoce. */
function cabeceraIp(ip) {
  return ip ? { 'X-Forwarded-For': ip } : {}
}

/**
 * IP del cliente de una petición.
 *
 * Detrás de un único proxy de confianza (cloudflared) el valor fiable es el
 * ÚLTIMO de X-Forwarded-For: el proxy añade al final, y todo lo anterior pudo
 * inyectarlo el cliente. Debe coincidir con TRUST_PROXY_HOPS=1 del IS, que lee
 * la cabecera de derecha a izquierda. Sin cabecera (acceso directo, dev) se usa
 * la IP del socket.
 */
export function ipCliente(req) {
  const ultimo = String(req.headers?.['x-forwarded-for'] ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .at(-1)
  return ultimo ?? req.socket?.remoteAddress ?? undefined
}

/**
 * Login contra el IS.
 *
 * Se envía `systemSlug` a propósito: así el IS rechaza con 403 a quien no
 * tenga ningún rol en este sistema, en vez de emitir un token válido en otros.
 *
 * `ip` es la del navegador, no la de este servidor: el IS limita los intentos
 * por IP y por cuenta+IP. Sin reenviarla, todos los logins compartirían un
 * único bucket (el de este contenedor) y bastarían unos intentos fallidos para
 * bloquear cualquier cuenta.
 *
 * @returns {Promise<{ ok: true, user: object, jwt: string, sessionToken: string }
 *                  | { ok: false, status: number, error: string }>}
 */
export async function signIn(email, password, { ip } = {}) {
  const res = await fetch(url('/api/auth/sign-in'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabeceraIp(ip) },
    body: JSON.stringify({ email, password, systemSlug: systemSlug() }),
  })

  const datos = await res.json().catch(() => null)

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      // 403 = autenticó pero no tiene rol en este sistema. Merece un mensaje
      // distinto de "credenciales inválidas", o el usuario no sabrá qué pedir.
      error: res.status === 403
        ? 'Tu cuenta no tiene acceso a Inventario. Pide que te asignen un rol.'
        : 'Credenciales inválidas.',
    }
  }

  // El token de sesión viaja en cabecera, no en el cuerpo.
  const sessionToken = res.headers.get('set-auth-token')
  if (!sessionToken || !datos?.token) {
    return { ok: false, status: 502, error: 'Respuesta inesperada del servidor de identidad.' }
  }

  // `tkc` (las credenciales de TKC de la persona) llega SOLO aquí.
  return { ok: true, user: datos.user, jwt: datos.token, sessionToken, tkc: datos.tkc ?? null }
}

/**
 * Verifica firma y expiración del JWT contra el JWKS público.
 *
 * El `sub` identifica al usuario en el IS. Un eventual `role` del payload NO se
 * usa para autorizar: los permisos salen de `getRoles`.
 *
 * @returns {Promise<null | { sub: string, email?: string, name?: string }>}
 */
export async function verifyJwt(token) {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getJwks())
    return payload
  } catch {
    return null // firma inválida o expirado (~15 min)
  }
}

/** Emite un JWT nuevo con el session token, sin volver a pedir credenciales. */
export async function refreshJwt(sessionToken) {
  if (!sessionToken) return null
  const res = await fetch(url('/api/auth/token'), {
    headers: { Authorization: `Bearer ${sessionToken}` },
  })
  if (!res.ok) return null
  const datos = await res.json().catch(() => null)
  return datos?.token ?? null
}

/**
 * Roles del usuario en ESTE sistema. Va con el session token, no con el JWT.
 * @returns {Promise<Array<{ id: string, name: string, description: string|null }>>}
 */
export async function getRoles(sessionToken) {
  if (!sessionToken) return []
  const destino = url('/api/user-roles/me')
  destino.searchParams.set('systemSlug', systemSlug())

  const res = await fetch(destino, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  })
  if (!res.ok) return []

  const datos = await res.json().catch(() => null)
  return Array.isArray(datos?.roles) ? datos.roles : []
}

/** Revoca la sesión en el IS. Best-effort: el fallo no debe impedir salir. */
export async function signOut(sessionToken) {
  if (!sessionToken) return
  try {
    await fetch(url('/api/auth/sign-out'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
    })
  } catch {
    // Da igual: las cookies se borran de todos modos.
  }
}

// ── Login con Google (redirect + PKCE) ─────────────────────────
//
// El navegador va al IS, este lo lleva a Google y lo devuelve a `redirectTo`
// con un código de un solo uso (60 s) que este SERVIDOR canjea. Google nunca
// crea cuentas: el usuario debe existir ya en el IS con ese correo.

/** URL del IS a la que hay que redirigir el navegador para empezar. */
export function urlInicioGoogle({ redirectTo, challenge, state }) {
  const destino = new URL('/api/auth/google/start', authPublicUrl())
  destino.searchParams.set('redirect_to', redirectTo)
  destino.searchParams.set('code_challenge', challenge)
  destino.searchParams.set('state', state)
  destino.searchParams.set('systemSlug', systemSlug())
  return destino.toString()
}

/**
 * Canjea el código por la sesión. Responde igual que `signIn`, salvo que el
 * fallo trae el `code` del IS (INVALID_CODE, ...) para mostrarlo en el login.
 *
 * @returns {Promise<{ ok: true, user: object, jwt: string, sessionToken: string }
 *                  | { ok: false, status: number, code: string }>}
 */
export async function canjearGoogle(code, verifier, { ip } = {}) {
  const res = await fetch(url('/api/auth/google/exchange'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabeceraIp(ip) },
    body: JSON.stringify({ code, code_verifier: verifier }),
  })

  const datos = await res.json().catch(() => null)

  if (!res.ok) {
    return { ok: false, status: res.status, code: datos?.code ?? 'GOOGLE_AUTH_FAILED' }
  }

  const sessionToken = res.headers.get('set-auth-token')
  if (!sessionToken || !datos?.token) {
    return { ok: false, status: 502, code: 'GOOGLE_AUTH_FAILED' }
  }

  // `tkc` (las credenciales de TKC de la persona) llega SOLO aquí.
  return { ok: true, user: datos.user, jwt: datos.token, sessionToken, tkc: datos.tkc ?? null }
}
