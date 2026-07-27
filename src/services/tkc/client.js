/**
 * Cliente TKC: mantiene una cookie de sesión cacheada a nivel de módulo (dura
 * lo que dure el proceso del servidor) y consulta el endpoint DataTables de
 * inventario. Si la sesión expira (respuesta no-JSON / 401 / 403), vuelve a
 * loguearse una vez y reintenta.
 *
 * Portado de `elineas-vd` (`src/modules/inventory/tkc/client.ts`).
 */

import { login } from './auth.js'
import { buildBody } from './body.js'

const FETCH_PATH = '/provider/invetario/productos'

const REQUEST_HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
}

// Cookie de sesión compartida entre peticiones + candado para no lanzar varios
// logins en paralelo.
let cachedCookie = null
let loginPromise = null

async function ensureCookie(config, force) {
  if (force) cachedCookie = null
  if (cachedCookie) return cachedCookie
  if (!loginPromise) {
    loginPromise = login(config)
      .then((cookie) => {
        cachedCookie = cookie
        return cookie
      })
      .finally(() => {
        loginPromise = null
      })
  }
  return loginPromise
}

/** Descarta la cookie cacheada (útil en tests y al rotar credenciales). */
export function resetSession() {
  cachedCookie = null
  loginPromise = null
}

function looksLikeExpiredSession(response) {
  if (response.status === 401 || response.status === 403) return true
  // Una sesión caducada devuelve el HTML del login en vez de JSON.
  return !(response.headers.get('content-type') ?? '').includes('json')
}

function postPage(config, cookie, body) {
  return fetch(`${config.tkcBase}${FETCH_PATH}`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Referer: `${config.tkcBase}/provider/products`,
      ...REQUEST_HEADERS,
    },
    body,
    redirect: 'manual',
  })
}

/**
 * Pide una página del DataTables de inventario.
 *
 * @param {{ tkcBase: string, tkcUser: string, tkcPass: string }} config
 * @param {import('./body.js').BodyParams} params
 * @returns {Promise<{ success: boolean, draw: number, recordsTotal: number, recordsFiltered: number, data: object[] }>}
 */
export async function fetchInventoryPage(config, params) {
  const body = buildBody(params)

  let cookie = await ensureCookie(config, false)
  let response = await postPage(config, cookie, body)

  if (looksLikeExpiredSession(response)) {
    cookie = await ensureCookie(config, true)
    response = await postPage(config, cookie, body)
  }

  if (!response.ok && response.status !== 200) {
    throw new Error(`TKC inventario HTTP ${response.status}`)
  }

  try {
    return await response.json()
  } catch (error) {
    throw new Error(
      `Respuesta de TKC no es JSON válido: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
