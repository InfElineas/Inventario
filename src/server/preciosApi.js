/**
 * Los precios de un producto: /api/productos/precios
 *
 * Un producto tiene más de un precio y cada uno viene de un sitio distinto:
 * el catálogo enseña uno solo —el que TKC guarda como precio— y los demás
 * viven en tablas del informe central. Esto los junta, uno por fuente, para
 * poder compararlos.
 *
 * Cada fuente va aparte y falla aparte: si una tabla no se puede leer (un
 * permiso, una columna que cambió), las demás se siguen viendo y esa dice qué
 * le pasó, en lugar de que no salga nada.
 *
 * Solo lectura, y de nuestra propia base.
 */

import { query } from './db.js'
import { resolverSesion } from './session.js'

const ALMACEN = /^[A-Za-z0-9_-]{1,20}$/

export class ErrorParametro extends Error {}

/** Almacén y código, validados. Lo que no cuadra es un 400, no un error de SQL. */
export function leerParametros(consulta) {
  const almacen = consulta.get('almacen') ?? ''
  if (!ALMACEN.test(almacen)) throw new ErrorParametro('Falta el almacén.')
  const codigo = (consulta.get('codigo') ?? '').trim()
  if (!codigo || codigo.length > 64) throw new ErrorParametro('Falta el código del producto.')
  return { almacen, codigo }
}

/** Un precio, o `null` si la fuente no lo trae: no es lo mismo que cero. */
const precio = (v) => (v === null || v === undefined ? null : Number(v))

/**
 * Lee una fuente sin que su fallo tumbe a las demás.
 *
 * @param {string} clave
 * @param {string} titulo
 * @param {string} nota   De dónde sale y qué significa, para no tener que adivinarlo.
 * @param {() => Promise<Array<{ etiqueta: string, valor: number|null }>>} leer
 */
async function fuente(clave, titulo, nota, leer) {
  try {
    return { clave, titulo, nota, precios: await leer() }
  } catch (error) {
    console.warn(`[precios-api] ${clave}:`, error.message)
    return {
      clave, titulo, nota, precios: [],
      error: error?.code === '42501'
        ? 'La base no deja leer esta fuente (permiso).'
        : 'No se pudo leer esta fuente.',
    }
  }
}

/**
 * Todos los precios que la base tiene de un producto en un almacén.
 *
 * Las etiquetas de la lista VD son los nombres de sus columnas: no se ha
 * confirmado con Facturación qué significa cada una, así que no se les pone un
 * nombre más bonito que pueda estar equivocado.
 */
export async function preciosDeProducto({ almacen, codigo }) {
  let nombre = ''

  const catalogo = await fuente(
    'catalogo', 'Catálogo',
    'Lo que guarda nuestro catálogo, sincronizado desde TKC. «Precio costo» es el que enseña la pantalla del catálogo.',
    async () => {
      const { rows } = await query(
        `SELECT nombre, precio_costo, precio
           FROM productos
          WHERE almacen_num = $1 AND codigo_producto = $2
          LIMIT 1`,
        [almacen, codigo],
      )
      const f = rows[0]
      if (!f) return []
      nombre = f.nombre ?? ''
      const lista = [{ etiqueta: 'Precio costo', valor: precio(f.precio_costo) }]
      // El precio propio de la aplicación casi nunca se rellena: cero no es un
      // precio, es «sin poner».
      if (precio(f.precio) > 0) lista.push({ etiqueta: 'Precio (campo propio)', valor: precio(f.precio) })
      return lista
    },
  )

  const listaVd = await fuente(
    'lista_vd', 'Lista de precios (VD)',
    'La lista de precios del informe central, por producto y almacén. Los nombres son los de sus columnas.',
    async () => {
      const { rows } = await query(
        `SELECT costo, venta, directa, precio_tienda
           FROM public.vd_rows_latest
          WHERE warehouse_key = $1 AND codigo = $2
          LIMIT 1`,
        [almacen, codigo],
      )
      const f = rows[0]
      if (!f) return []
      return [
        { etiqueta: 'Costo', valor: precio(f.costo) },
        { etiqueta: 'Venta', valor: precio(f.venta) },
        { etiqueta: 'Directa', valor: precio(f.directa) },
        { etiqueta: 'Precio tienda', valor: precio(f.precio_tienda) },
      ]
    },
  )

  return { almacen, codigo, nombre, fuentes: [catalogo, listaVd] }
}

function responder(res, status, cuerpo) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(cuerpo))
}

export function createPreciosApiMiddleware() {
  return async function preciosApiMiddleware(req, res, next) {
    const ruta = (req.url ?? '/').split('?')[0]
    if (ruta !== '/api/productos/precios') return next()
    if (req.method !== 'GET') return responder(res, 405, { error: { message: 'Método no permitido' } })

    try {
      // Cualquiera con sesión: el catálogo ya enseña el precio costo a todos
      // los roles, y esto es el mismo dato con sus hermanos al lado.
      const sesion = await resolverSesion(req, res)
      if (!sesion) return responder(res, 401, { error: { message: 'Sin sesión' } })

      const params = leerParametros(new URL(req.url, 'http://local').searchParams)
      return responder(res, 200, await preciosDeProducto(params))
    } catch (error) {
      if (error instanceof ErrorParametro) return responder(res, 400, { error: { message: error.message } })
      console.error('[precios-api] error:', error)
      return responder(res, 500, { error: { message: 'No se pudieron consultar los precios.' } })
    }
  }
}
