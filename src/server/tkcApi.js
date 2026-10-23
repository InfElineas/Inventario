/**
 * Núcleo HTTP-agnóstico de la API de TKC: valida la sesión del Identity Server,
 * resuelve el almacén y despacha a `listInventory` / `fetchExistencia` /
 * `getExistencias`.
 *
 * Middleware estilo Connect `(req, res, next)` — lo mismo que espera
 * `server.middlewares.use()` de Vite y lo mismo que acepta un `http.Server` de
 * Node sin adaptar nada. Por eso dev/preview (`vite-plugin-tkc.js`) y
 * producción (`server/index.js`) comparten exactamente este archivo; solo
 * cambia de dónde sale la config (`loadEnv` de Vite vs `process.env`).
 */

import { listInventory } from '../services/tkc/normalize.js'
import { fetchExistencia } from '../services/tkc/submayor.js'
import { getExistencias } from '../services/tkc/existencias.js'
import { keyToTkcValue } from '../services/tkc/warehouses.js'
import { resolverSesion } from './session.js'

const TKC_API_ENDPOINTS = {
  inventario: '/api/tkc/inventario',
  existencia: '/api/tkc/existencia',
  existencias: '/api/tkc/existencias',
}

const MAX_BODY = 64 * 1024
/** Tope de ids por petición: una página de la tabla son 250 como mucho. */
const MAX_IDS = 500

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
 * @param {object} deps
 * @param {{tkcBase: string, tkcUser: string, tkcPass: string}} deps.tkc
 *        `null` cuando faltan las credenciales de TKC: el middleware responde 503
 *        en vez de dejar pasar peticiones sin validar.
 * @returns {(req: object, res: object, next: () => any) => Promise<void>}
 */
export function createTkcApiMiddleware({ tkc }) {
  return async function tkcApiMiddleware(req, res, next) {
    const path = req.url?.split('?')[0]
    const route = Object.keys(TKC_API_ENDPOINTS).find((k) => TKC_API_ENDPOINTS[k] === path)
    if (!route) return next()
    if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' })

    if (!tkc?.tkcBase || !tkc.tkcUser || !tkc.tkcPass) {
      return json(res, 503, {
        error: 'TKC no configurado: falta TKC_BASE, TKC_USER o TKC_PASS en .env',
      })
    }

    try {
      // La sesión llega en la cookie httpOnly que fija /api/auth/login, no en
      // una cabecera: el navegador no tiene acceso al token para ponerlo él.
      if (!(await resolverSesion(req, res))) {
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
}
