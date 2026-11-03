/**
 * Resumen de ventas por período: /api/ventas/resumen
 *
 * Lo que vendió la plataforma en un almacén entre dos fechas, por producto y
 * por día. Sale de `public.rdp_rows_latest`, la vista del informe RDP que
 * deja la última corrida de cada día.
 *
 * Es la vista y no la tabla `rdp_rows` por una razón que no se ve a simple
 * vista: la tabla guarda TODAS las corridas (1316 para 649 días). Sumar sobre
 * ella cuenta cada día varias veces.
 *
 * Solo lectura, y de nuestra propia base: no toca TKC ni necesita sus
 * credenciales.
 */

import { query } from './db.js'
import { resolverSesion } from './session.js'
import { rolesDe } from '../lib/roles.js'
import { ROLES_VENTAS } from '../lib/ajustes.js'

/** Un año: más allá, el reporte tarda y deja de ser un resumen. */
export const MAX_DIAS = 366
/** Productos que se devuelven. Con más, se avisa de que hay recorte. */
export const MAX_PRODUCTOS = 20000

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const ALMACEN = /^[A-Za-z0-9_-]{1,20}$/
const CODIGO = /^[A-Za-z0-9._-]{1,64}$/

export class ErrorParametro extends Error {}

/** `AAAA-MM-DD` que de verdad existe: el 31 de febrero no. */
function fechaValida(texto) {
  if (!FECHA.test(texto ?? '')) return null
  const t = Date.parse(`${texto}T00:00:00Z`)
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== texto) return null
  return t
}

/**
 * Los parámetros de la petición, validados. Lo que no cuadra es un 400 con
 * un mensaje que dice qué falta, no un error de SQL.
 */
export function leerParametros(consulta) {
  const almacen = consulta.get('almacen') ?? ''
  if (!ALMACEN.test(almacen)) throw new ErrorParametro('Falta el almacén.')

  const desde = consulta.get('desde')
  const hasta = consulta.get('hasta')
  const d = fechaValida(desde)
  const h = fechaValida(hasta)
  if (d === null || h === null) throw new ErrorParametro('Las fechas son AAAA-MM-DD.')
  if (d > h) throw new ErrorParametro('La fecha de inicio es posterior a la final.')

  const dias = Math.round((h - d) / 86400000) + 1
  if (dias > MAX_DIAS) throw new ErrorParametro(`El período máximo es de ${MAX_DIAS} días (pediste ${dias}).`)

  // Un solo producto: lo pide el análisis de una diferencia. Sin él, todos.
  const codigo = consulta.get('codigo')
  if (codigo) {
    if (!CODIGO.test(codigo)) throw new ErrorParametro('El código del producto no es válido.')
    return { almacen, desde, hasta, dias, codigo }
  }
  return { almacen, desde, hasta, dias }
}

const num = (v) => Number(v) || 0

/**
 * Lo vendido en el período, por producto y por día, y hasta cuándo llegan los
 * datos.
 *
 * El nombre sale del catálogo: el informe solo trae el código.
 */
export async function resumenVentas({ almacen, desde, hasta, dias, codigo }) {
  // El mismo informe, acotado a un producto cuando se pide: el parámetro $4 solo existe entonces.
  const soloProducto = codigo ? 'AND r.codigo = $4' : ''
  const parametros = codigo ? [almacen, desde, hasta, codigo] : [almacen, desde, hasta]
  const [porProducto, porDia, cobertura] = await Promise.all([
    query(
      `SELECT r.codigo,
              MAX(p.nombre)                 AS nombre,
              SUM(r.cantidad)               AS cantidad,
              SUM(r.cant_ordenes)           AS ordenes,
              SUM(r.importe)                AS importe,
              SUM(r.costo_total)            AS costo
         FROM public.rdp_rows_latest r
         LEFT JOIN productos p
                ON p.almacen_num = r.almacen_key AND p.codigo_producto = r.codigo
        WHERE r.almacen_key = $1 AND r.report_date BETWEEN $2 AND $3 ${soloProducto}
        GROUP BY r.codigo
        ORDER BY SUM(r.cantidad) DESC, r.codigo
        LIMIT ${MAX_PRODUCTOS + 1}`,
      parametros,
    ),
    query(
      `SELECT r.report_date::text          AS fecha,
              SUM(r.cantidad)              AS cantidad,
              SUM(r.cant_ordenes)          AS ordenes,
              SUM(r.importe)               AS importe,
              SUM(r.costo_total)           AS costo
         FROM public.rdp_rows_latest r
        WHERE r.almacen_key = $1 AND r.report_date BETWEEN $2 AND $3 ${soloProducto}
        GROUP BY r.report_date
        ORDER BY r.report_date`,
      parametros,
    ),
    query(
      `SELECT MIN(report_date)::text AS primera, MAX(report_date)::text AS ultima
         FROM public.rdp_rows_latest WHERE almacen_key = $1`,
      [almacen],
    ),
  ])

  const productos = porProducto.rows.slice(0, MAX_PRODUCTOS).map((f) => ({
    codigo: f.codigo,
    nombre: f.nombre ?? '',
    cantidad: num(f.cantidad),
    ordenes: num(f.ordenes),
    importe: num(f.importe),
    costo: num(f.costo),
  }))
  const dia = porDia.rows.map((f) => ({
    fecha: f.fecha,
    cantidad: num(f.cantidad),
    ordenes: num(f.ordenes),
    importe: num(f.importe),
    costo: num(f.costo),
  }))

  const total = dia.reduce(
    (t, d) => ({
      cantidad: t.cantidad + d.cantidad,
      ordenes: t.ordenes + d.ordenes,
      importe: t.importe + d.importe,
      costo: t.costo + d.costo,
    }),
    { cantidad: 0, ordenes: 0, importe: 0, costo: 0 },
  )

  return {
    almacen, desde, hasta,
    total,
    productos,
    // Más de los que caben: quien lo mira tiene que saber que la lista es parcial.
    recortado: porProducto.rows.length > MAX_PRODUCTOS,
    dias: dia,
    cobertura: {
      diasPedidos: dias,
      diasConDatos: dia.length,
      primera: cobertura.rows[0]?.primera ?? null,
      ultima: cobertura.rows[0]?.ultima ?? null,
    },
  }
}

function responder(res, status, cuerpo) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(cuerpo))
}

export function createVentasApiMiddleware() {
  return async function ventasApiMiddleware(req, res, next) {
    const ruta = (req.url ?? '/').split('?')[0]
    if (ruta !== '/api/ventas/resumen') return next()
    if (req.method !== 'GET') return responder(res, 405, { error: { message: 'Método no permitido' } })

    try {
      const sesion = await resolverSesion(req, res)
      if (!sesion) return responder(res, 401, { error: { message: 'Sin sesión' } })

      const suyos = rolesDe(sesion.usuario)
      if (!suyos.includes('superadmin') && !ROLES_VENTAS.some((r) => suyos.includes(r))) {
        return responder(res, 403, { error: { message: 'Tu rol no puede ver el resumen de ventas.' } })
      }

      const params = leerParametros(new URL(req.url, 'http://local').searchParams)
      return responder(res, 200, await resumenVentas(params))
    } catch (error) {
      if (error instanceof ErrorParametro) return responder(res, 400, { error: { message: error.message } })
      console.error('[ventas-api] error:', error)
      // El permiso sobre la vista es lo que más probablemente falte: decirlo.
      if (error?.code === '42501') {
        return responder(res, 500, { error: { message: 'La base no deja leer el informe de ventas (permiso sobre rdp_rows_latest).' } })
      }
      return responder(res, 500, { error: { message: 'No se pudo calcular el resumen de ventas.' } })
    }
  }
}
