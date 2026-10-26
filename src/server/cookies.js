/**
 * Cookies de sesión, en `node:http` puro (sin Express ni cookie-parser).
 *
 * Las dos son httpOnly: el JavaScript del navegador nunca las ve, que es lo
 * que limita el daño de un XSS. El session token además es de larga duración,
 * así que se trata como una contraseña.
 */

export const COOKIE_SESSION = 'session'
export const COOKIE_JWT = 'jwt'
// Credenciales de TKC de la persona, selladas (ver credencialesTkc.js).
export const COOKIE_TKC = 'tkc'
// Preferencia (no secreta) de borrar las credenciales de TKC al cerrar sesión.
export const COOKIE_TKC_OLVIDAR = 'tkc_olvidar'
// Estado del login con Google entre el inicio y la vuelta: lleva el
// code_verifier de PKCE, que nunca debe llegar al JS del navegador.
export const COOKIE_GOOGLE = 'google_flow'

// `secure` solo en producción: en desarrollo se sirve por http://localhost y
// el navegador descartaría una cookie Secure.
const EN_PRODUCCION = process.env.NODE_ENV === 'production'

const BASE = [
  'Path=/',
  'HttpOnly',
  // Lax y no Strict: con Strict, volver desde un enlace externo dejaría al
  // usuario deslogueado a ojos del servidor. Lax ya corta el CSRF de formularios
  // de terceros, que es el riesgo real aquí.
  'SameSite=Lax',
]

function serializar(nombre, valor, maxAgeSegundos) {
  const partes = [`${nombre}=${encodeURIComponent(valor)}`, ...BASE]
  if (EN_PRODUCCION) partes.push('Secure')
  if (maxAgeSegundos !== undefined) partes.push(`Max-Age=${maxAgeSegundos}`)
  return partes.join('; ')
}

/** Lee las cookies de la petición. Devuelve {} si no hay cabecera. */
export function leerCookies(req) {
  const cabecera = req.headers?.cookie
  if (!cabecera) return {}

  const salida = {}
  for (const trozo of cabecera.split(';')) {
    const igual = trozo.indexOf('=')
    if (igual < 1) continue
    const nombre = trozo.slice(0, igual).trim()
    const valor = trozo.slice(igual + 1).trim()
    try {
      salida[nombre] = decodeURIComponent(valor)
    } catch {
      salida[nombre] = valor
    }
  }
  return salida
}

/**
 * Fija las dos cookies de sesión.
 * @param {number} diasSesion vida del session token
 */
export function fijarCookiesSesion(res, { sessionToken, jwt, diasSesion = 30 }) {
  const cabeceras = []
  if (sessionToken !== undefined) {
    cabeceras.push(serializar(COOKIE_SESSION, sessionToken, diasSesion * 24 * 60 * 60))
  }
  if (jwt !== undefined) {
    // El JWT dura ~15 min, pero la cookie se deja de sesión (sin Max-Age): si
    // caducara sola, el cliente no podría ni intentar renovarla.
    cabeceras.push(serializar(COOKIE_JWT, jwt))
  }
  anexarSetCookie(res, cabeceras)
}

/**
 * Borra las cookies de sesión. Las credenciales de TKC NO: duran sus días aunque
 * se cierre sesión, salvo que la persona haya pedido olvidarlas al salir (el
 * logout lo decide con `COOKIE_TKC_OLVIDAR`).
 */
export function limpiarCookiesSesion(res) {
  anexarSetCookie(res, [
    serializar(COOKIE_SESSION, '', 0),
    serializar(COOKIE_JWT, '', 0),
  ])
}

/** Credenciales de TKC selladas: caducan solas a los `dias` días. */
export function fijarCookieTkc(res, sellado, dias) {
  anexarSetCookie(res, [serializar(COOKIE_TKC, sellado, dias * 24 * 60 * 60)])
}

/** Preferencia «olvidar mis credenciales de TKC al cerrar sesión»: dura un año. */
export function fijarOlvidarTkcAlSalir(res, olvidar) {
  anexarSetCookie(res, [
    olvidar ? serializar(COOKIE_TKC_OLVIDAR, '1', 365 * 24 * 60 * 60) : serializar(COOKIE_TKC_OLVIDAR, '', 0),
  ])
}

export function limpiarCookieTkc(res) {
  anexarSetCookie(res, [serializar(COOKIE_TKC, '', 0)])
}

/** Estado del flujo de Google: vida corta, la vuelta tarda segundos. */
export function fijarCookieGoogle(res, estado) {
  anexarSetCookie(res, [serializar(COOKIE_GOOGLE, JSON.stringify(estado), 10 * 60)])
}

export function limpiarCookieGoogle(res) {
  anexarSetCookie(res, [serializar(COOKIE_GOOGLE, '', 0)])
}

/** Acumula Set-Cookie sin pisar las que ya hubiera en la respuesta. */
function anexarSetCookie(res, nuevas) {
  if (nuevas.length === 0) return
  const previas = res.getHeader('Set-Cookie')
  const todas = previas
    ? [...(Array.isArray(previas) ? previas : [previas]), ...nuevas]
    : nuevas
  res.setHeader('Set-Cookie', todas)
}
