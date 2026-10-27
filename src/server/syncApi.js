/**
 * Sincronización del catálogo: /api/sync/*
 *
 * Reemplaza por completo el sync que hacía el navegador. Antes, la página leía
 * `invGlobal` del segundo proyecto de Supabase por REST, paginaba 55.000
 * productos, los mandaba en lotes a un RPC y escribía `sync_auto_log`. Ahora
 * `invGlobal` vive en la misma base que `productos`, así que todo eso es una
 * sentencia SQL que corre en el servidor: `sync_productos_desde_invglobal()`.
 *
 * El navegador solo dispara y espera el resultado.
 */

import { queryOne } from './db.js'
import { resolverSesion } from './session.js'

// Los mismos roles que podían lanzar el sync manual desde Configuración.
const ROLES = ['inv', 'administrador', 'superadmin']

function responder(res, status, cuerpo) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(cuerpo))
}

async function leerJson(req) {
  return new Promise((resolve, reject) => {
    let datos = ''
    req.on('data', (t) => { datos += t })
    req.on('end', () => {
      try { resolve(datos ? JSON.parse(datos) : {}) } catch { reject(new Error('JSON inválido')) }
    })
    req.on('error', reject)
  })
}

export function createSyncApiMiddleware() {
  return async function syncApiMiddleware(req, res, next) {
    const ruta = (req.url ?? '/').split('?')[0]
    if (!ruta.startsWith('/api/sync/')) return next()

    try {
      const sesion = await resolverSesion(req, res)
      if (!sesion) return responder(res, 401, { error: 'Sin sesión' })

      if (!ROLES.includes(sesion.usuario.role)) {
        return responder(res, 403, { error: 'Sin permiso para sincronizar' })
      }

      if (ruta === '/api/sync/productos' && req.method === 'POST') {
        const { almacen } = await leerJson(req)

        // La función lleva un advisory lock por almacén, así que dos syncs
        // simultáneos del mismo almacén no se pisan.
        const fila = await queryOne(
          'SELECT sync_productos_desde_invglobal($1) AS resultado',
          [almacen || null],
        )
        const resultado = fila.resultado

        // Los problemas del catálogo se detectan justo después de refrescarlo,
        // que es cuando pueden haber aparecido. Va aparte y no dentro de la
        // función de sync: si la detección falla, el catálogo ya sincronizado
        // no debe perderse por ello.
        await queryOne('SELECT inventario.detectar_casos_anuncio($1) AS resultado', [almacen || null])
          .then((f) => { resultado.casos_abiertos = f?.resultado?.abiertos ?? 0 })
          .catch((e) => console.warn('[sync-api] no se pudieron detectar casos de anuncio:', e.message))

        // El registro lo lleva el servidor: antes lo escribía el navegador,
        // que era quien hacía el sync.
        await queryOne(
          `INSERT INTO sync_auto_log (user_email, almacen, synced_at, synced, errors)
                VALUES ($1, $2, now(), $3, 0)
           ON CONFLICT (user_email, almacen) DO UPDATE
                  SET synced_at = excluded.synced_at, synced = excluded.synced, errors = 0
             RETURNING user_email`,
          [sesion.email, almacen || 'todos', resultado?.sincronizados ?? 0],
        ).catch((e) => console.warn('[sync-api] no se pudo registrar el sync:', e.message))

        return responder(res, 200, resultado)
      }

      return responder(res, 404, { error: 'No encontrado' })
    } catch (error) {
      console.error('[sync-api] error:', error)
      return responder(res, 500, { error: 'Error al sincronizar' })
    }
  }
}
