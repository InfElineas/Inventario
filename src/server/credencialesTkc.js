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
 * `tkc`. El navegador solo sabe el booleano `tiene_tkc`, nunca la contraseña.
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
import { leerCookies, fijarCookieTkc, limpiarCookieTkc, COOKIE_TKC } from './cookies.js'

const credencialValida = (c) =>
  typeof c?.username === 'string' && c.username !== '' &&
  typeof c?.password === 'string' && c.password !== ''

/**
 * Guarda lo que devolvió el login. `credenciales` es `null` cuando el usuario
 * no tiene ninguna enlazada: en ese caso se BORRA la cookie, o alguien a quien
 * acaban de quitárselas seguiría usando las viejas.
 *
 * Nunca lanza: el login no puede depender de una comodidad. Sin
 * TKC_SECRET_KEY se registra y se sigue.
 *
 * @returns {boolean} si quedó alguna guardada
 */
export function recordarCredenciales(res, credenciales) {
  if (!credencialValida(credenciales)) {
    limpiarCookieTkc(res)
    return false
  }
  try {
    const { username, password } = credenciales
    fijarCookieTkc(res, sellar(JSON.stringify({ username, password })))
    return true
  } catch (error) {
    // Sin el valor: este log acaba junto al resto y no debe filtrar nada.
    console.error('[tkc] no se pudieron guardar las credenciales:', error?.message ?? error)
    limpiarCookieTkc(res)
    return false
  }
}

/** Las credenciales de la petición, o `null` si no hay o no se pueden abrir. */
export function leerCredenciales(req) {
  const sellado = leerCookies(req)[COOKIE_TKC]
  if (!sellado) return null
  try {
    const c = JSON.parse(abrir(sellado))
    return credencialValida(c) ? { username: c.username, password: c.password } : null
  } catch {
    return null
  }
}
