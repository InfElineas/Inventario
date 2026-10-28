/**
 * Cliente TKC: mantiene una cookie de sesión cacheada a nivel de módulo (dura
 * lo que dure el proceso del servidor) y consulta los endpoints DataTables de
 * TKC. Si la sesión expira (respuesta no-JSON / 401 / 403), vuelve a loguearse
 * una vez y reintenta.
 *
 * Portado de `elineas-vd` (`src/modules/inventory/tkc/client.ts`).
 *
 * `tkcPost` es la parte genérica (cookie + reintento + parseo): la comparten el
 * endpoint de inventario de aquí y el del submayor (`submayor.js`), que
 * necesitan la MISMA sesión — de lo contrario cada uno haría su propio login.
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
function looksLikeExpiredSession(response) {
  if (response.status === 401 || response.status === 403) return true
  // Una sesión caducada devuelve el HTML del login en vez de JSON.
  return !(response.headers.get('content-type') ?? '').includes('json')
}

function postOnce(config, cookie, { path, referer, body }) {
  return fetch(`${config.tkcBase}${path}`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Referer: `${config.tkcBase}${referer}`,
      ...REQUEST_HEADERS,
    },
    body,
    redirect: 'manual',
  })
}

/**
 * POST autenticado a un DataTables de TKC, con reintento único si la sesión
 * caducó.
 *
 * @param {{ tkcBase: string, tkcUser: string, tkcPass: string }} config
 * @param {{ path: string, referer: string, body: string, label?: string }} request
 *        `referer` es relativo a `tkcBase`; TKC lo comprueba en algunos endpoints.
 * @returns {Promise<object>} La respuesta JSON tal cual.
 */
export async function tkcPost(config, { path, referer, body, label = 'TKC' }) {
  let cookie = await ensureCookie(config, false)
  let response = await postOnce(config, cookie, { path, referer, body })

  if (looksLikeExpiredSession(response)) {
    cookie = await ensureCookie(config, true)
    response = await postOnce(config, cookie, { path, referer, body })
  }

  if (!response.ok && response.status !== 200) {
    throw new Error(`TKC ${label} HTTP ${response.status}`)
  }

  try {
    return await response.json()
  } catch (error) {
    throw new Error(
      `Respuesta de TKC no es JSON válido: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}

function getOnce(config, cookie, { path, referer }) {
  return fetch(`${config.tkcBase}${path}`, {
    headers: {
      Cookie: cookie,
      Referer: `${config.tkcBase}${referer}`,
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'text/html, */*; q=0.01',
    },
    redirect: 'manual',
  })
}

/**
 * GET autenticado que devuelve HTML, con el mismo reintento que `tkcPost`.
 *
 * No todo en TKC es un DataTables: el historial de un producto es un trozo de
 * HTML pensado para meterse en un modal. Se pide igual —misma cookie, mismo
 * reintento— y quien lo llama se encarga de sacarle los datos.
 *
 * @returns {Promise<string>} El HTML tal cual.
 */
export async function tkcGetHtml(config, { path, referer, label = 'TKC' }) {
  let cookie = await ensureCookie(config, false)
  let response = await getOnce(config, cookie, { path, referer })

  // Aquí no vale mirar el content-type —la respuesta buena YA es HTML—, así
  // que la sesión caducada se reconoce por el estado o por el formulario de
  // login que TKC devuelve en su lugar.
  let html = await response.text()
  if (response.status === 401 || response.status === 403 || /name="password"/i.test(html)) {
    cookie = await ensureCookie(config, true)
    response = await getOnce(config, cookie, { path, referer })
    html = await response.text()
  }

  if (!response.ok && response.status !== 200) {
    throw new Error(`TKC ${label} HTTP ${response.status}`)
  }
  return html
}

/**
 * Pide una página del DataTables de inventario.
 *
 * @param {{ tkcBase: string, tkcUser: string, tkcPass: string }} config
 * @param {import('./body.js').BodyParams} params
 * @returns {Promise<{ success: boolean, draw: number, recordsTotal: number, recordsFiltered: number, data: object[] }>}
 */
export function fetchInventoryPage(config, params) {
  return tkcPost(config, {
    path: FETCH_PATH,
    referer: '/provider/products',
    body: buildBody(params),
    label: 'inventario',
  })
}
