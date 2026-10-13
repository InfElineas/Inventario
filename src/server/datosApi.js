/**
 * Endpoints de datos: /api/datos/:entidad/:accion
 *
 * Reproduce la interfaz que ya usaba `base44Client` (list, filter, count,
 * create, update, delete), de modo que el frontend cambie solo por dentro y
 * las páginas no se toquen.
 *
 * Todo va por POST: las condiciones de filtro son objetos y codificarlas en la
 * URL no aporta nada, y así ninguna respuesta queda en cachés intermedias.
 */

import { query, queryOne, transaction } from './db.js'
import { columnaSegura, soloColumnas } from './columnas.js'
import { resolverSesion } from './session.js'
import {
  puedeLeer, puedeCrear, puedeActualizar, puedeBorrar, filtroPropias,
} from './permisos.js'

// Mismo mapeo que tenía base44Client.
const TABLA = {
  Producto:            'productos',
  AnuncioDesact:       'anuncios_desact',
  Merma:               'mermas',
  // lotes_vigencia recalcula estado_fv/vigencia_dias contra la fecha actual.
  Lote:                'lotes_vigencia',
  LoteIC:              'lotes_ic',
  Inventario:          'inventarios',
  Recepcion:           'recepciones',
  Notificacion:        'notificaciones',
  HistorialMovimiento: 'historial_movimientos',
  Usuario:             'usuarios',
}

// Las vistas no se escriben; `productos` lo llena el sync.
const SOLO_LECTURA = new Set(['lotes_vigencia', 'bd_tkc'])

// Para las comprobaciones de permiso, la vista cuenta como su tabla.
const TABLA_PERMISOS = { lotes_vigencia: 'lotes' }

const ORDEN_POR_DEFECTO = 'created_date'
const LIMITE_MAXIMO = 2000
const LIMITE_CUERPO = 1024 * 1024

function responder(res, status, cuerpo) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(cuerpo))
}

async function leerJson(req) {
  return new Promise((resolve, reject) => {
    let datos = ''
    req.on('data', (t) => {
      datos += t
      if (datos.length > LIMITE_CUERPO) { reject(new Error('Cuerpo demasiado grande')); req.destroy() }
    })
    req.on('end', () => {
      try { resolve(datos ? JSON.parse(datos) : {}) } catch { reject(new Error('JSON inválido')) }
    })
    req.on('error', reject)
  })
}

/** "-created_date" → ORDER BY "created_date" DESC */
async function orden(tabla, orderBy) {
  const asc = !String(orderBy ?? '').startsWith('-')
  const nombre = asc ? (orderBy || ORDEN_POR_DEFECTO) : String(orderBy).slice(1)
  let col
  try {
    col = await columnaSegura(tabla, nombre)
  } catch {
    // Una columna desconocida no es motivo para romper la pantalla: se cae al
    // orden por defecto, igual que hacía base44Client.
    col = await columnaSegura(tabla, ORDEN_POR_DEFECTO)
    return `${col} DESC`
  }
  return `${col} ${asc ? 'ASC' : 'DESC'}`
}

/**
 * Construye el WHERE. Los valores van siempre parametrizados; los nombres de
 * columna se comprueban contra el catálogo. Un array se traduce a IN, como
 * hacía `count` en base44Client.
 */
async function where(tabla, condiciones, valores) {
  const partes = []
  for (const [clave, valor] of Object.entries(condiciones ?? {})) {
    const col = await columnaSegura(tabla, clave)
    if (Array.isArray(valor)) {
      if (valor.length === 0) { partes.push('false'); continue }
      const marcadores = valor.map((v) => `$${valores.push(v)}`)
      partes.push(`${col} IN (${marcadores.join(', ')})`)
    } else if (valor === null) {
      partes.push(`${col} IS NULL`)
    } else {
      partes.push(`${col} = $${valores.push(valor)}`)
    }
  }
  return partes.length ? `WHERE ${partes.join(' AND ')}` : ''
}

function limite(valor) {
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) return LIMITE_MAXIMO
  return Math.min(Math.floor(n), LIMITE_MAXIMO)
}

export function createDatosApiMiddleware() {
  return async function datosApiMiddleware(req, res, next) {
    const ruta = (req.url ?? '/').split('?')[0]
    if (!ruta.startsWith('/api/datos/')) return next()

    const [, , , entidad, accion] = ruta.split('/')
    const tabla = TABLA[entidad]
    if (!tabla) return responder(res, 404, { error: `Entidad no mapeada: ${entidad}` })

    try {
      const sesion = await resolverSesion(req, res)
      if (!sesion) return responder(res, 401, { error: 'Sin sesión' })

      const ctx = { rol: sesion.usuario.role, email: sesion.email }
      const tablaPerm = TABLA_PERMISOS[tabla] ?? tabla
      const cuerpo = req.method === 'POST' ? await leerJson(req) : {}

      // ── Lectura ──────────────────────────────────────────────
      if (accion === 'list' || accion === 'filter' || accion === 'count') {
        if (!puedeLeer(ctx, tablaPerm)) return responder(res, 403, { error: 'Sin permiso' })

        const condiciones = { ...(cuerpo.conditions ?? {}) }

        // Las tablas de filas propias se filtran siempre en el servidor: que
        // el cliente mande o no la condición es irrelevante.
        const propio = filtroPropias(ctx, tablaPerm)
        if (propio) condiciones[propio.campo] = propio.valor

        const valores = []
        const clausula = await where(tabla, condiciones, valores)

        if (accion === 'count') {
          const { rows } = await query(`SELECT count(*)::int AS total FROM ${tabla} ${clausula}`, valores)
          return responder(res, 200, { count: rows[0]?.total ?? 0 })
        }

        const orderBy = await orden(tabla, cuerpo.orderBy)
        const lim = limite(cuerpo.limit)
        const { rows } = await query(
          `SELECT * FROM ${tabla} ${clausula} ORDER BY ${orderBy} LIMIT ${lim}`,
          valores,
        )
        return responder(res, 200, { data: rows })
      }

      if (SOLO_LECTURA.has(tabla)) {
        return responder(res, 405, { error: `${entidad} es de solo lectura` })
      }

      // ── Creación ─────────────────────────────────────────────
      if (accion === 'create') {
        const datos = await soloColumnas(tabla, cuerpo.data)
        if (!puedeCrear(ctx, tablaPerm, datos)) return responder(res, 403, { error: 'Sin permiso' })

        const claves = Object.keys(datos)
        if (claves.length === 0) return responder(res, 400, { error: 'Sin datos' })

        const cols = await Promise.all(claves.map((c) => columnaSegura(tabla, c)))
        const valores = claves.map((c) => datos[c])
        const marcadores = claves.map((_, i) => `$${i + 1}`)

        const fila = await queryOne(
          `INSERT INTO ${tabla} (${cols.join(', ')}) VALUES (${marcadores.join(', ')}) RETURNING *`,
          valores,
        )
        return responder(res, 201, { data: fila })
      }

      // ── Actualización ────────────────────────────────────────
      if (accion === 'update') {
        const { id } = cuerpo
        if (!id) return responder(res, 400, { error: 'Falta id' })
        const cambios = await soloColumnas(tabla, cuerpo.data)
        if (Object.keys(cambios).length === 0) return responder(res, 400, { error: 'Sin datos' })

        // Dentro de una transacción con FOR UPDATE: el permiso depende del
        // estado actual de la fila, y sin bloquearla dos transiciones
        // simultáneas podrían colarse las dos (RLS evaluaba el USING dentro
        // del propio UPDATE, de forma atómica).
        const resultado = await transaction(async (cliente) => {
          const { rows } = await cliente.query(`SELECT * FROM ${tabla} WHERE id = $1 FOR UPDATE`, [id])
          const fila = rows[0]
          if (!fila) return { status: 404, cuerpo: { error: 'No encontrado' } }

          if (!puedeActualizar(ctx, tablaPerm, fila, cambios)) {
            return { status: 403, cuerpo: { error: 'Sin permiso' } }
          }

          const claves = Object.keys(cambios)
          const cols = await Promise.all(claves.map((c) => columnaSegura(tabla, c)))
          const asignaciones = cols.map((c, i) => `${c} = $${i + 2}`)
          const { rows: actualizadas } = await cliente.query(
            `UPDATE ${tabla} SET ${asignaciones.join(', ')} WHERE id = $1 RETURNING *`,
            [id, ...claves.map((c) => cambios[c])],
          )
          return { status: 200, cuerpo: { data: actualizadas[0] } }
        })

        return responder(res, resultado.status, resultado.cuerpo)
      }

      // ── Borrado ──────────────────────────────────────────────
      if (accion === 'delete') {
        const { id } = cuerpo
        if (!id) return responder(res, 400, { error: 'Falta id' })

        const resultado = await transaction(async (cliente) => {
          const { rows } = await cliente.query(`SELECT * FROM ${tabla} WHERE id = $1 FOR UPDATE`, [id])
          const fila = rows[0]
          if (!fila) return { status: 404, cuerpo: { error: 'No encontrado' } }

          if (!puedeBorrar(ctx, tablaPerm, fila)) {
            return { status: 403, cuerpo: { error: 'Sin permiso' } }
          }

          await cliente.query(`DELETE FROM ${tabla} WHERE id = $1`, [id])
          return { status: 200, cuerpo: { ok: true } }
        })

        return responder(res, resultado.status, resultado.cuerpo)
      }

      return responder(res, 404, { error: `Acción desconocida: ${accion}` })
    } catch (error) {
      console.error('[datos-api] error:', error)
      // Los mensajes de columna desconocida son útiles y no exponen nada.
      const esValidacion = /Columna desconocida|Tabla desconocida|JSON inválido/.test(error.message)
      return responder(res, esValidacion ? 400 : 500, {
        error: esValidacion ? error.message : 'Error interno',
      })
    }
  }
}
