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
  puedeLeer, puedeCrear, puedeActualizar, puedeBorrar, filtroPropias, esAdmin,
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
  WorkflowEvento:      'workflow_eventos',
  ComentarioSupervision: 'comentarios_supervision',
  AdminAuditLog:       'admin_audit_log',
  SyncAutoLog:         'sync_auto_log',
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
    } else if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
      // Rango: { gte, lte, gt, lt }. Lo necesita el panel para acotar por
      // periodo; sin esto habría que traerse todo y filtrar en el navegador.
      const OPERADORES = { gte: '>=', lte: '<=', gt: '>', lt: '<' }
      for (const [clave2, op] of Object.entries(OPERADORES)) {
        if (valor[clave2] !== undefined) {
          partes.push(`${col} ${op} $${valores.push(valor[clave2])}`)
        }
      }
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
        let clausula = await where(tabla, condiciones, valores)

        if (accion === 'count') {
          const { rows } = await query(`SELECT count(*)::int AS total FROM ${tabla} ${clausula}`, valores)
          return responder(res, 200, { count: rows[0]?.total ?? 0 })
        }

        // Búsqueda de texto: { campos: ['nombre','codigo'], texto: 'x' }.
        // Va aparte de las condiciones porque es un OR entre columnas, no un
        // AND de igualdades. Los campos se validan como cualquier otro
        // identificador y el texto va parametrizado.
        if (cuerpo.search?.texto && Array.isArray(cuerpo.search.campos)) {
          const patron = `%${String(cuerpo.search.texto)}%`
          const marcador = `$${valores.push(patron)}`
          const cols = await Promise.all(
            cuerpo.search.campos.map((c) => columnaSegura(tabla, c)),
          )
          const or = cols.map((c) => `${c} ILIKE ${marcador}`).join(' OR ')
          clausula = clausula ? `${clausula} AND (${or})` : `WHERE (${or})`
        }

        // Solo las columnas pedidas. `fotos` es jsonb y pesa; traerla cuando
        // nadie la mira multiplica el tamaño de la respuesta por varias veces.
        let proyeccion = '*'
        if (Array.isArray(cuerpo.campos) && cuerpo.campos.length > 0) {
          const cols = await Promise.all(cuerpo.campos.map((c) => columnaSegura(tabla, c)))
          proyeccion = cols.join(', ')
        }

        const orderBy = await orden(tabla, cuerpo.orderBy)
        const lim = limite(cuerpo.limit)
        // Desplazamiento para recorrer tablas grandes por páginas: `productos`
        // tiene 55.000 filas y el tope por petición las truncaría en silencio.
        const desde = Math.max(0, Math.floor(Number(cuerpo.offset) || 0))
        const { rows } = await query(
          `SELECT ${proyeccion} FROM ${tabla} ${clausula} ORDER BY ${orderBy} LIMIT ${lim} OFFSET ${desde}`,
          valores,
        )
        return responder(res, 200, { data: rows })
      }

      // ── Marcar notificaciones como leídas ────────────────────
      // El servidor acota el UPDATE a las filas del propio usuario, así que
      // mandar ids ajenos no sirve de nada.
      if (accion === 'marcarLeidas' && tabla === 'notificaciones') {
        const ids = Array.isArray(cuerpo.ids) ? cuerpo.ids : []
        if (ids.length === 0) return responder(res, 200, { actualizadas: 0 })

        const marcadores = ids.map((_, i) => `$${i + 2}`)
        const { rowCount } = await query(
          `UPDATE notificaciones SET leida = true
            WHERE usuario_id = $1 AND id IN (${marcadores.join(', ')})`,
          [ctx.email, ...ids],
        )
        return responder(res, 200, { actualizadas: rowCount })
      }

      // ── Purga (solo administración) ──────────────────────────
      // Vacía una tabla de registro. Acotada a las tres que el panel ofrece
      // limpiar: son históricos que crecen sin parar, no datos del negocio.
      if (accion === 'purgar') {
        const PURGABLES = ['notificaciones', 'workflow_eventos', 'historial_movimientos']
        if (!esAdmin(ctx.rol)) return responder(res, 403, { error: 'Sin permiso' })
        if (!PURGABLES.includes(tabla)) {
          return responder(res, 400, { error: `${entidad} no se puede purgar` })
        }
        // Las condiciones son obligatorias: estas tareas limpian lo viejo
        // (más de 30 o 90 días), no vacían la tabla. Sin este requisito, un
        // cuerpo vacío borraría el histórico entero.
        const condiciones = cuerpo.conditions ?? {}
        if (Object.keys(condiciones).length === 0) {
          return responder(res, 400, { error: 'La purga exige condiciones' })
        }
        const valores = []
        const clausula = await where(tabla, condiciones, valores)
        const { rowCount } = await query(`DELETE FROM ${tabla} ${clausula}`, valores)
        return responder(res, 200, { borradas: rowCount })
      }

      // ── Valores distintos de una columna ─────────────────────
      // Para los desplegables de filtro. Antes la pantalla se descargaba los
      // 55.000 productos solo para quedarse con los suministradores únicos.
      if (accion === 'distinct') {
        if (!puedeLeer(ctx, tablaPerm)) return responder(res, 403, { error: 'Sin permiso' })
        const col = await columnaSegura(tabla, cuerpo.campo)

        const condiciones = { ...(cuerpo.conditions ?? {}) }
        const propio = filtroPropias(ctx, tablaPerm)
        if (propio) condiciones[propio.campo] = propio.valor

        const valores = []
        const clausula = await where(tabla, condiciones, valores)
        // Los vacíos no son una opción de filtro: ensucian el desplegable.
        const noVacio = `${col} IS NOT NULL AND ${col}::text <> ''`

        const { rows } = await query(
          `SELECT DISTINCT ${col} AS valor FROM ${tabla}
            ${clausula ? `${clausula} AND ${noVacio}` : `WHERE ${noVacio}`}
            ORDER BY ${col}`,
          valores,
        )
        return responder(res, 200, { data: rows.map((r) => r.valor) })
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

      // ── Creación por lotes ───────────────────────────────────
      // La importación de productos y el registro de movimientos insertan
      // cientos de filas de golpe; una petición por fila sería inviable.
      if (accion === 'createMany') {
        const filas = Array.isArray(cuerpo.data) ? cuerpo.data : []
        if (filas.length === 0) return responder(res, 200, { creadas: 0 })
        if (filas.length > 1000) return responder(res, 400, { error: 'Máximo 1000 filas por lote' })

        const limpias = await Promise.all(filas.map((f) => soloColumnas(tabla, f)))
        for (const fila of limpias) {
          if (!puedeCrear(ctx, tablaPerm, fila)) {
            return responder(res, 403, { error: 'Sin permiso' })
          }
        }

        // Todas las filas comparten columnas: se toman las de la primera.
        const claves = Object.keys(limpias[0])
        if (claves.length === 0) return responder(res, 400, { error: 'Sin datos' })
        const cols = await Promise.all(claves.map((c) => columnaSegura(tabla, c)))

        const valores = []
        const grupos = limpias.map((fila) =>
          `(${claves.map((c) => `$${valores.push(fila[c] ?? null)}`).join(', ')})`,
        )

        const { rowCount } = await query(
          `INSERT INTO ${tabla} (${cols.join(', ')}) VALUES ${grupos.join(', ')}`,
          valores,
        )
        return responder(res, 201, { creadas: rowCount })
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
