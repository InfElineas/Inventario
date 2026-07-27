/**
 * Plugin de Vite que expone el inventario de TKC:
 *
 *   POST /api/tkc/inventario   — una página del listado.
 *   POST /api/tkc/existencia   — el desglose EF / almacén / tienda de UN producto,
 *                                que solo publica el submayor. Réplica de
 *                                `GET /api/inventory/{idTienda}?almacen=` de ap-api.
 *   POST /api/tkc/existencias  — el mismo desglose para muchos ids de golpe,
 *                                servido desde el mapa por almacén (existencias.js).
 *
 * Existe porque el flujo de TKC **no puede correr en el navegador**: hace login
 * por formulario manejando CSRF y cabeceras Cookie/Set-Cookie (prohibidas para
 * `fetch`), TKC no envía cabeceras CORS para el origen de la app, y las
 * credenciales de servicio no deben acabar en el bundle. Este repo es una SPA
 * sin servidor, así que el middleware de Vite hace de capa servidor en `dev` y
 * en `preview`. Para producción, `server/index.js` reutiliza estos mismos
 * módulos (`src/services/tkc/*`) sin duplicar lógica.
 *
 * Los secretos se leen SIN prefijo `VITE_` (`loadEnv(mode, root, '')`), así que
 * Vite nunca los inyecta en el código del cliente.
 */

import { loadEnv } from 'vite'
import { listInventory } from './src/services/tkc/normalize.js'
import { fetchExistencia } from './src/services/tkc/submayor.js'
import { getExistencias } from './src/services/tkc/existencias.js'
import { keyToTkcValue } from './src/services/tkc/warehouses.js'

const ENDPOINTS = {
  inventario: '/api/tkc/inventario',
  existencia: '/api/tkc/existencia',
  existencias: '/api/tkc/existencias',
}
/** Tope de ids por petición: una página de la tabla son 250 como mucho. */
const MAX_IDS = 500
const MAX_BODY = 64 * 1024

/** TTL del caché de tokens validados: evita un viaje a Supabase por request. */
const TOKEN_TTL_MS = 60_000

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > MAX_BODY) reject(new Error('Body demasiado grande'))
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('Body no es JSON válido'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * Valida el access token de Supabase del usuario contra `/auth/v1/user`.
 *
 * Sin esto el endpoint sería un proxy abierto a TKC con credenciales de
 * servicio compartidas: cualquiera que conociera la URL consultaría el
 * inventario sin pasar por el login de la app. Es el equivalente al
 * `requireAuthMiddleware` de elineas-vd.
 */
function makeTokenVerifier({ supabaseUrl, supabaseKey }) {
  const cache = new Map()

  return async function verify(token) {
    if (!token) return false
    const hit = cache.get(token)
    if (hit && hit > Date.now()) return true

    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      cache.delete(token)
      return false
    }
    cache.set(token, Date.now() + TOKEN_TTL_MS)
    // Poda perezosa: el caché solo crece con tokens vivos de esta sesión.
    if (cache.size > 200) {
      const now = Date.now()
      for (const [k, exp] of cache) if (exp <= now) cache.delete(k)
    }
    return true
  }
}

export function tkcApiPlugin() {
  let tkc = null
  let verifyToken = null
  let authConfigured = false

  const middleware = async (req, res, next) => {
    const path = req.url?.split('?')[0]
    const route = Object.keys(ENDPOINTS).find((k) => ENDPOINTS[k] === path)
    if (!route) return next()
    if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' })

    if (!tkc?.tkcBase || !tkc.tkcUser || !tkc.tkcPass) {
      return json(res, 503, {
        error: 'TKC no configurado: falta TKC_BASE, TKC_USER o TKC_PASS en .env',
      })
    }
    if (!authConfigured) {
      return json(res, 503, {
        error: 'Falta VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY para validar la sesión',
      })
    }

    try {
      const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
      if (!(await verifyToken(bearer))) {
        return json(res, 401, { error: 'Sesión no válida' })
      }

      const body = await readBody(req)

      const tkcValue = keyToTkcValue(body.almacen)
      if (!tkcValue) {
        return json(res, 400, {
          error: `Almacén desconocido: "${body.almacen ?? ''}". No está en el catálogo de TKC.`,
        })
      }

      if (route === 'existencias') {
        const ids = Array.isArray(body.ids) ? body.ids.slice(0, MAX_IDS).map(String) : undefined
        const result = await getExistencias(tkc, {
          almacen: tkcValue,
          ids,
          refrescar: body.refrescar === true,
        })
        return json(res, 200, result)
      }

      if (route === 'existencia') {
        const idTienda = String(body.idTienda ?? '').trim()
        if (!idTienda) {
          return json(res, 400, { error: 'Falta idTienda (el campo id_online del listado).' })
        }

        const producto = await fetchExistencia(tkc, { idTienda, almacen: tkcValue })
        if (!producto) {
          // 404 y no 502: el submayor respondió bien, el producto no está ahí.
          return json(res, 404, {
            error: `El submayor no tiene el producto ${idTienda} en este almacén.`,
          })
        }
        return json(res, 200, producto)
      }

      const result = await listInventory(tkc, {
        page: Number(body.page) || 1,
        limit: Number(body.limit) || 50,
        almacenes: [tkcValue],
        search: typeof body.search === 'string' ? body.search : '',
        sortBy: body.sortBy,
        sortDir: body.sortDir,
        existencia: body.existencia,
      })

      return json(res, 200, result)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      // El detalle es útil aquí: el operador es quien depura las credenciales.
      return json(res, 502, { error: `Error consultando TKC: ${msg}` })
    }
  }

  return {
    name: 'tkc-api',

    configResolved(resolved) {
      // Prefijo '' → carga TODAS las claves del .env, también las sin VITE_.
      //
      // Ojo con la precedencia: con prefijo '' loadEnv también vuelca process.env
      // encima de lo leído del fichero, así que una variable exportada en el shell
      // GANA sobre .env (es la convención habitual, pero sorprende). Si un TKC_*
      // exportado no coincide con el .env, manda el del shell.
      const env = loadEnv(resolved.mode, resolved.root, '')
      const pick = (name) => env[name] ?? ''

      tkc = {
        tkcBase: pick('TKC_BASE').replace(/\/+$/, ''),
        tkcUser: pick('TKC_USER'),
        tkcPass: pick('TKC_PASS'),
      }

      const supabaseUrl = pick('VITE_SUPABASE_URL').replace(/\/+$/, '')
      const supabaseKey = pick('VITE_SUPABASE_ANON_KEY')
      authConfigured = Boolean(supabaseUrl && supabaseKey)
      verifyToken = makeTokenVerifier({ supabaseUrl, supabaseKey })
    },

    configureServer(server) {
      server.middlewares.use(middleware)
    },

    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

export default tkcApiPlugin
