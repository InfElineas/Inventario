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
import { leerCredenciales } from './credencialesTkc.js'
import { query } from './db.js'

const TKC_API_ENDPOINTS = {
  inventario: '/api/tkc/inventario',
  existencia: '/api/tkc/existencia',
  existencias: '/api/tkc/existencias',
  submayor: '/api/tkc/submayor',
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


// ── Volcar el submayor en nuestra copia ───────────────────────────
//
// `productos.almacen` y `.tienda` salen de una foto del submayor que el cron de
// elineas-transferencia saca dos veces al día, así que el catálogo podía ir
// hasta dieciocho horas por detrás: alguien movía mercancía y la pantalla
// seguía enseñando los números de la mañana.
//
// Al abrir el catálogo de un almacén se le pregunta al submayor de verdad y lo
// que diga se guarda. Tarda —un almacén de 9.000 productos son unos 19 s—, pero
// se hace en segundo plano: la tabla se pinta enseguida con lo que hay y se
// corrige al llegar. El caché del recorrido es compartido y dura diez minutos,
// así que diez personas abriendo el mismo almacén cuestan un recorrido, no
// diez.

/** Cuánto se espera a que termine el recorrido antes de volcar lo que haya. */
const ESPERA_SUBMAYOR_MS = 120 * 1000
/** Filas por sentencia. Un almacén grande son ~9.000. */
const LOTE = 1000

/** Espera a que el recorrido del almacén acabe y devuelve el mapa completo. */
async function submayorCompleto(tkc, almacen, refrescar) {
  const limite = Date.now() + ESPERA_SUBMAYOR_MS
  // Con `ids: []` solo se pide el progreso: no transfiere el mapa.
  let estado = await getExistencias(tkc, { almacen, ids: [], refrescar })
  while (!estado.progreso.listo && Date.now() < limite) {
    await new Promise((seguir) => { setTimeout(seguir, 1000) })
    estado = await getExistencias(tkc, { almacen, ids: [] })
  }
  const todo = await getExistencias(tkc, { almacen })
  return { existencias: todo.existencias, progreso: todo.progreso }
}

/**
 * Escribe las existencias en `productos`, por lotes.
 *
 * Se unen por `id_tienda`, que es como los identifica el submayor. Un producto
 * sin id de tienda no está ahí y se queda como estaba.
 */
async function guardarExistencias(clave, existencias) {
  const filas = Object.entries(existencias)
  let actualizados = 0

  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE)
    const valores = []
    const tuplas = lote.map(([id, e]) => {
      const n = valores.push(id, e.fisica, e.enAlmacen, e.enTienda)
      return `($${n - 3}::text, $${n - 2}::numeric, $${n - 1}::numeric, $${n}::numeric)`
    })
    valores.push(clave)

    const { rowCount } = await query(
      `UPDATE productos p
          SET exist_fisica = v.ef,
              almacen      = v.a,
              tienda       = v.t,
              -- De ahora: la sincronización no debe pisarlo con la foto de la
              -- mañana (ver supabase/existencias_en.sql).
              existencias_en = now(),
              updated_date = now()
         FROM (VALUES ${tuplas.join(', ')}) AS v(id, ef, a, t)
        WHERE p.almacen_num = $${valores.length} AND p.id_tienda = v.id`,
      valores,
    )
    actualizados += rowCount ?? 0
  }

  return actualizados
}

async function volcarSubmayor(tkc, { almacenTkc, clave, refrescar }) {
  const { existencias, progreso } = await submayorCompleto(tkc, almacenTkc, refrescar)
  const actualizados = await guardarExistencias(clave, existencias)
  // `listo: false` significa que se volcó un mapa parcial: mejor que nada, y
  // la siguiente apertura lo completa. Se dice para no aparentar exactitud.
  return { actualizados, leidos: Object.keys(existencias).length, progreso }
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
      const sesion = await resolverSesion(req, res)
      if (!sesion) {
        return json(res, 401, { error: 'Sesión no válida' })
      }

      // Nada va a TKC sin que la persona haya puesto su cuenta. El cliente
      // reconoce `codigo` y le pide las credenciales antes de reintentar.
      if (!leerCredenciales(req, sesion.email)) {
        return json(res, 403, {
          codigo: 'no_tkc_credentials',
          error: 'Falta tu usuario de TKC. Ingrésalo para continuar.',
        })
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

      if (route === 'submayor') {
        const resumen = await volcarSubmayor(tkc, {
          almacenTkc: tkcValue,
          clave: String(body.almacen),
          refrescar: body.refrescar === true,
        })
        return json(res, 200, resumen)
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
