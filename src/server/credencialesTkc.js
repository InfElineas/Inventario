/**
 * Credenciales de TKC de CADA usuario.
 *
 * Cada persona entra en TKC con su propia cuenta; el Identity Server las
 * custodia cifradas y las entrega **solo en la respuesta del login** (ni el
 * refresco del JWT ni /user-roles las traen). Por eso hay que guardarlas en ese
 * momento: si no, la sesión sobreviviría a la credencial y la persona se
 * quedaría sin TKC con la sesión válida.
 *
 * Se guardan selladas (AES-256-GCM, `secretBox.js`) en la cookie httpOnly
 * `tkc`, ligadas al email de quien las puso (otra persona en el mismo navegador
 * no las hereda) y con caducidad de 7 días —también DENTRO del sello, no solo
 * en el Max-Age—. El navegador solo sabe el booleano `tiene_tkc`, nunca la contraseña.
 *
 * Una cookie que no se puede abrir (clave rotada, valor manipulado, otro
 * despliegue) NO es un error: equivale a «sin credenciales». La salida —volver
 * a entrar— es trivial, y hacer fallar la petición convertiría una rotación de
 * clave en una caída.
 *
 * Esto es lo que usa la escritura de ajustes (`transferenciasApi.js`): los
 * documentos quedan en TKC a nombre de quien los hace. Las `TKC_USER`/`TKC_PASS`
 * del .env siguen siendo solo para lo que corre sin usuario (inventario, sync).
 */

import { sellar, abrir } from './secretBox.js'
import { credencialesAceptadas } from '../services/tkc/auth.js'
import { leerCookies, fijarCookieTkc, limpiarCookieTkc, COOKIE_TKC, COOKIE_TKC_OLVIDAR } from './cookies.js'

/** Cuánto duran las credenciales guardadas: se ponen una vez por semana. */
export const DIAS_CREDENCIALES_TKC = 7

const normalizar = (email) => String(email ?? '').trim().toLowerCase()

const credencialValida = (c) =>
  typeof c?.username === 'string' && c.username !== '' &&
  typeof c?.password === 'string' && c.password !== ''

/**
 * Guarda credenciales para `email`. `credenciales` es `null` cuando no hay
 * ninguna que guardar: en ese caso se BORRA la cookie.
 *
 * Nunca lanza: el login no puede depender de una comodidad. Sin
 * TKC_SECRET_KEY se registra y se sigue.
 *
 * @returns {number|null} cuándo caducan (ms desde epoch), o `null` si no quedó ninguna
 */
export function recordarCredenciales(res, credenciales, email) {
  if (!credencialValida(credenciales) || !normalizar(email)) {
    limpiarCookieTkc(res)
    return null
  }
  try {
    const { username, password } = credenciales
    const exp = Date.now() + DIAS_CREDENCIALES_TKC * 24 * 60 * 60 * 1000
    fijarCookieTkc(
      res,
      sellar(JSON.stringify({ username, password, email: normalizar(email), exp })),
      DIAS_CREDENCIALES_TKC,
    )
    return exp
  } catch (error) {
    // Sin el valor: este log acaba junto al resto y no debe filtrar nada.
    console.error('[tkc] no se pudieron guardar las credenciales:', error?.message ?? error)
    limpiarCookieTkc(res)
    return null
  }
}

function abrirCookie(req, email) {
  const sellado = leerCookies(req)[COOKIE_TKC]
  if (!sellado) return null
  try {
    const c = JSON.parse(abrir(sellado))
    if (!credencialValida(c)) return null
    if (typeof c.exp !== 'number' || c.exp <= Date.now()) return null
    if (normalizar(c.email) !== normalizar(email)) return null
    return c
  } catch {
    return null
  }
}

/** Las credenciales de `email` en la petición, o `null` si no hay, caducaron o no se abren. */
export function leerCredenciales(req, email) {
  const c = abrirCookie(req, email)
  return c ? { username: c.username, password: c.password } : null
}

/** Lo que el navegador puede saber: si hay, cuándo caducan y su preferencia al salir. */
export function estadoCredenciales(req, email) {
  const c = abrirCookie(req, email)
  return {
    tiene: Boolean(c),
    expira: c?.exp ?? null,
    olvidarAlSalir: leerCookies(req)[COOKIE_TKC_OLVIDAR] === '1',
  }
}

/**
 * Comprueba contra TKC unas credenciales que acaba de escribir la persona.
 * @returns {Promise<boolean>} `false` si TKC las rechaza; lanza si no responde.
 */
export const verificarCredenciales = (tkcBase, { username, password }) =>
  credencialesAceptadas({ tkcBase, tkcUser: username, tkcPass: password })
