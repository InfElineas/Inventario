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
import { columnaSegura, columnasDe, soloColumnas, tiposDe } from './columnas.js'
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
// Respaldos de orden, por preferencia, para las tablas sin `created_date`.
const RESPALDOS_ORDEN = ['created_date', 'synced_at', 'fecha', 'created_at', 'id']
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

/**
 * Valores de una fila listos para el driver, en el orden de `claves`.
 *
 * Lo que va a una columna `json`/`jsonb` se serializa aquí. El driver convierte
 * un array de JavaScript a la sintaxis de array de Postgres —`[]` se vuelve
 * `{}`—, que no es JSON válido: Postgres respondía «invalid input syntax for
 * type json: Expected ":", but found "}"» y la petición entera fallaba con un
 * 500. Pasó al guardar un conteo de inventario sin detalles de lote.
 *
 * Solo se tocan esas columnas: un `text[]` de verdad tiene que seguir yendo
 * como array para que el driver lo convierta.
 */
async function valoresDe(tabla, claves, fila) {
  const tipos = await tiposDe(tabla)
  return claves.map((clave) => {
    const valor = fila[clave]
    if (valor === undefined) return null
    const tipo = tipos.get(clave)
    if ((tipo === 'json' || tipo === 'jsonb') && valor !== null && typeof valor === 'object') {
      return JSON.stringify(valor)
    }
    return valor
  })
}

/** "-created_date" → ORDER BY "created_date" DESC */
async function orden(tabla, orderBy) {
  const columnas = await columnasDe(tabla)
  const asc = !String(orderBy ?? '').startsWith('-')
  const nombre = asc ? (orderBy || ORDEN_POR_DEFECTO) : String(orderBy).slice(1)

  if (columnas.has(nombre)) return `"${nombre}" ${asc ? 'ASC' : 'DESC'}`

  // Una columna desconocida no es motivo para romper la pantalla: se cae al
  // orden por defecto, igual que hacía base44Client. Pero no todas las tablas
  // tienen `created_date` —`sync_auto_log` marca el tiempo en `synced_at`—, y
  // antes el propio respaldo reventaba: leer esa tabla sin indicar orden daba
  // 500. Así que el respaldo se busca entre las columnas que la tabla sí
  // tiene, y si ninguna encaja vale cualquiera con tal de que el orden sea
  // estable: la paginación por OFFSET repite filas si el orden no es fijo.
  const respaldo = RESPALDOS_ORDEN.find((c) => columnas.has(c)) ?? [...columnas].sort()[0]
  return `"${respaldo}" DESC`
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

        // Búsqueda de texto: { campos: ['nombre','codigo'], texto: 'x' }.
        // Va aparte de las condiciones porque es un OR entre columnas, no un
        // AND de igualdades. Los campos se validan como cualquier otro
        // identificador y el texto va parametrizado.
        //
        // Se aplica ANTES del recuento. Antes `count` la ignoraba, de modo que
        // una pantalla que busca y pagina recibía el total sin filtrar: más
        // páginas de las que existen, y las últimas vacías.
        if (cuerpo.search?.texto && Array.isArray(cuerpo.search.campos)) {
          const patron = `%${String(cuerpo.search.texto)}%`
          const marcador = `$${valores.push(patron)}`
          const cols = await Promise.all(
            cuerpo.search.campos.map((c) => columnaSegura(tabla, c)),
          )
          // `::text` porque no todas las columnas buscables son de texto: el
          // id de tienda es un número, y `bigint ILIKE` no existe en Postgres
          // —la consulta entera fallaba—. Convertir deja buscar por ese id
          // igual que por un nombre.
          const or = cols.map((c) => `${c}::text ILIKE ${marcador}`).join(' OR ')
          clausula = clausula ? `${clausula} AND (${or})` : `WHERE (${or})`
        }

        if (accion === 'count') {
          const { rows } = await query(`SELECT count(*)::int AS total FROM ${tabla} ${clausula}`, valores)
          return responder(res, 200, { count: rows[0]?.total ?? 0 })
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

      // ── Resumen del catálogo, contado en la base ─────────────
      //
      // El panel de control no muestra productos: muestra ocho cifras y un
      // desglose por almacén. Antes se descargaba las 55.000 filas para
      // contarlas en el navegador, y en modo global eso son 28 peticiones
      // seguidas, cada una ordenando la tabla entera por `nombre` sin índice
      // que la cubra. De ahí la lentitud.
      //
      // Ahora vuelve una fila por (almacén, estado) —unas 140— y el navegador
      // solo suma. El estado es la columna generada `estado_tienda`: la regla
      // vive en su definición y no en un CASE repetido aquí.
      if (accion === 'resumen' && tabla === 'productos') {
        if (!puedeLeer(ctx, tablaPerm)) return responder(res, 403, { error: 'Sin permiso' })

        const valores = []
        const clausula = await where(tabla, { activo: true, ...(cuerpo.conditions ?? {}) }, valores)

        const ef = 'COALESCE(exist_fisica, 0)'
        const alm = 'COALESCE(almacen, 0)'
        const tnd = 'COALESCE(tienda, 0)'
        // Los contadores sueltos solo miran que el id no esté vacío, igual que
        // el `&&` de JavaScript; `estado_tienda` además le hace trim.
        const conId = `id_tienda IS NOT NULL AND id_tienda <> ''`

        const { rows } = await query(
          `SELECT almacen_num,
                  estado_tienda AS estado,
                  count(*)::int AS total,
                  count(*) FILTER (WHERE ${ef} > 0)::int AS con_stock,
                  count(*) FILTER (WHERE ${tnd} > 0)::int AS en_tienda,
                  count(*) FILTER (WHERE ${ef} > 0 AND ${tnd} = 0)::int AS sin_tienda,
                  count(*) FILTER (WHERE ${ef} > 0 AND ${alm} = 0 AND ${tnd} > 6)::int AS sin_reserva,
                  count(*) FILTER (WHERE NOT (${conId}) AND ${ef} > 0)::int AS sin_id,
                  count(*) FILTER (WHERE NOT (${conId}) AND ${ef} = 0)::int AS sin_id_ef0,
                  count(*) FILTER (WHERE (${conId}) AND ${ef} = 0)::int AS agotados
             FROM ${tabla} ${clausula}
            GROUP BY almacen_num, estado_tienda`,
          valores,
        )
        return responder(res, 200, { data: rows })
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
        const valores = await valoresDe(tabla, claves, datos)
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
        const grupos = []
        for (const fila of limpias) {
          const listos = await valoresDe(tabla, claves, fila)
          grupos.push(`(${listos.map((v) => `$${valores.push(v)}`).join(', ')})`)
        }

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
            [id, ...(await valoresDe(tabla, claves, cambios))],
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
