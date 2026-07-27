/**
 * Login a TKC (almendarestravel): flujo CSRF + cookie.
 *
 * Portado de `elineas-vd` (`src/modules/inventory/tkc/auth.ts`), que a su vez lo
 * porta de `elineas-fetch-from-tkc`: GET /login para sacar el token CSRF y las
 * primeras cookies, POST /login_check para autenticarse y quedarnos con la
 * cookie de sesión que autoriza las peticiones al endpoint de inventario.
 *
 * ⚠ Solo corre en el servidor (middleware de Vite / server/index.js): manipula
 * las cabeceras Cookie y Set-Cookie, que el navegador no permite tocar, y usa
 * credenciales de servicio que nunca deben llegar al bundle.
 */

const CSRF_RE = /name="_csrf_token"\s+value="([^"]+)"/

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

/** Extrae el token CSRF del HTML de la página de login, o null si no está. */
export function extractCsrfToken(html) {
  const m = String(html ?? '').match(CSRF_RE)
  return m ? m[1] : null
}

/**
 * Lista de cabeceras `Set-Cookie` de una respuesta.
 *
 * `Headers.getSetCookie()` solo existe desde Node 19.7. El fallback parte la
 * cabecera unida por comas, pero solo cuando lo que sigue parece un nuevo par
 * `nombre=valor` — así `Expires=Wed, 01 Jan 2020 …` no se rompe por su propia
 * coma (tras ella viene `01 Jan …;`, que no encaja con el lookahead).
 */
export function getSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie()
  const raw = headers.get('set-cookie')
  return raw ? raw.split(/,\s*(?=[^=;,]+=)/) : []
}

/**
 * Convierte una lista de cabeceras `Set-Cookie` en un string `k=v; k2=v2`,
 * quedándose solo con el par `name=value` de cada una. Duplicados: gana el
 * último.
 */
export function parseCookies(setCookieHeaders) {
  const map = new Map()
  for (const c of setCookieHeaders) {
    const pair = c.split(';')[0].trim()
    const eq = pair.indexOf('=')
    if (eq < 0) continue
    const key = pair.slice(0, eq).trim()
    if (key) map.set(key, pair)
  }
  return [...map.values()].join('; ')
}

/** Fusiona dos strings de cookies (`k=v; …`); en conflicto gana el segundo. */
export function mergeCookies(c1, c2) {
  const map = new Map()
  for (const str of [c1, c2]) {
    if (!str) continue
    for (const pair of str.split('; ')) {
      const eq = pair.indexOf('=')
      if (eq < 0) continue
      const key = pair.slice(0, eq).trim()
      if (key) map.set(key, pair.trim())
    }
  }
  return [...map.values()].join('; ')
}

/**
 * Ejecuta el login completo y devuelve el string de cookies a usar en las
 * peticiones siguientes, o lanza si falla.
 *
 * @param {{ tkcBase: string, tkcUser: string, tkcPass: string }} config
 * @returns {Promise<string>}
 */
export async function login({ tkcBase, tkcUser, tkcPass }) {
  // ── GET /login → token CSRF + primeras cookies ──
  const getResp = await fetch(`${tkcBase}/login`, {
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'User-Agent': USER_AGENT,
    },
    redirect: 'follow',
  })
  if (getResp.status !== 200) throw new Error(`GET login HTTP ${getResp.status}`)

  const csrf = extractCsrfToken(await getResp.text())
  if (!csrf) throw new Error('No se encontró el token CSRF en la página de login')

  const cookie1 = parseCookies(getSetCookies(getResp.headers))

  // ── POST /login_check → cookies de sesión (sin seguir el redirect) ──
  const body =
    `_username=${encodeURIComponent(tkcUser)}` +
    `&_password=${encodeURIComponent(tkcPass)}` +
    `&_csrf_token=${encodeURIComponent(csrf)}`

  const postResp = await fetch(`${tkcBase}/login_check`, {
    method: 'POST',
    headers: {
      Cookie: cookie1,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${tkcBase}/login`,
      Origin: 'https://almendarestravel.com',
      'User-Agent': USER_AGENT,
    },
    body,
    redirect: 'manual',
  })

  // Un login correcto redirige (302); algunos setups responden 200.
  if (postResp.status !== 302 && postResp.status !== 200) {
    throw new Error(`POST login_check HTTP ${postResp.status}`)
  }

  return mergeCookies(cookie1, parseCookies(getSetCookies(postResp.headers)))
}
