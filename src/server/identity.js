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

/**
 * Login contra el IS.
 *
 * Se envía `systemSlug` a propósito: así el IS rechaza con 403 a quien no
 * tenga ningún rol en este sistema, en vez de emitir un token válido en otros.
 *
 * @returns {Promise<{ ok: true, user: object, jwt: string, sessionToken: string }
 *                  | { ok: false, status: number, error: string }>}
 */
export async function signIn(email, password) {
  const res = await fetch(url('/api/auth/sign-in'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

  return { ok: true, user: datos.user, jwt: datos.token, sessionToken }
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
