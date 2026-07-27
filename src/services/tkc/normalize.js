/**
 * Normalización de la respuesta cruda de TKC a las filas que consume la tabla.
 *
 * Portado de `elineas-vd` (`src/modules/inventory/services/inventory.ts`). Los
 * nombres de campo se mantienen en camelCase idénticos a los de allí, para que
 * la tabla muestre exactamente los mismos datos.
 *
 * Por qué hace falta: TKC devuelve **HTML dentro de las celdas** y números con
 * separador de millares. Sin `str()`/`num()` la tabla renderizaría etiquetas y
 * los importes saldrían NaN.
 */

import { fetchInventoryPage } from './client.js'
import { sortColumnIndex } from './columns.js'

const HTML_TAG_RE = /<[^>]*>/g

/** Texto plano: serializa objetos, quita etiquetas HTML y recorta. */
function str(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value).replace(HTML_TAG_RE, '').trim()
}

/** Número o null: quita etiquetas HTML y separadores de millares. */
function num(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(String(value).replace(HTML_TAG_RE, '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

/** Origen (esquema+host) del backend de TKC, para resolver rutas de imagen relativas. */
function originOf(tkcBase) {
  try {
    return new URL(tkcBase).origin
  } catch {
    return ''
  }
}

/** Convierte la ruta de una foto del catálogo en una URL absoluta cargable. */
function resolveImageUrl(foto, origin) {
  const value = foto.trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  if (!origin) return value
  return value.startsWith('/') ? `${origin}${value}` : `${origin}/${value}`
}

/**
 * Una fila cruda de TKC → fila de UI.
 * @param {object} raw   Producto tal como lo devuelve el DataTables.
 * @param {number} index Índice global dentro del resultado (para la key de React).
 * @param {string} origin Origen de TKC, para las imágenes.
 */
export function normalizeRow(raw, index, origin = '') {
  const fotos = raw.catalogo?.fotos ?? []
  const imagenes = fotos
    .map((f) => resolveImageUrl(str(f?.foto), origin))
    .filter((url) => url !== '')

  return {
    rowId: `${str(raw.codigo)}|${str(raw.id)}|${index}`,
    id: str(raw.id),
    clasificacion: str(raw.clasificacion),
    categoriaOnline: str(raw.categoria_online),
    idOnline: str(raw.id_online),
    codigo: str(raw.codigo),
    codigoPyme: str(raw.codigo_pyme),
    nombre: str(raw.nombre),
    proveedor: str(raw.proveedor),
    suministrador: str(raw.suministrador),
    unidadCompra: str(raw.unidad_compra),
    locaciones: Array.isArray(raw.locaciones)
      ? raw.locaciones.map((l) => str(l)).join(', ')
      : str(raw.locaciones),
    peso: num(raw.peso),
    cantidad: num(raw.cantidad),
    cantidadSalidas: num(raw.cantidad_salidas),
    precio: num(raw.precio),
    cantidadUm: num(raw.cantidad_um),
    unidadMedida: str(raw.unidad_medida),
    tasa: num(raw.tasa),
    fechaVencimiento: str(raw.fecha_vencimiento),
    categoriaAlmacen: str(raw.categoria_almacen),
    volumen: num(raw.volumen),
    canal: str(raw.canal),
    marca: str(raw.marca),
    catalogo: str(raw.catalogo?.productName),
    tienda: num(raw.tienda),
    controlaExistencia: Boolean(raw.controla_existencia),
    imagen: imagenes[0] ?? '',
    imagenes,
    descripcion: str(raw.catalogo?.productDescription),
    gtin: str(raw.catalogo?.gtin),
  }
}

/**
 * Lista una página del inventario de TKC.
 *
 * La paginación, la búsqueda y el orden los resuelve **TKC**: `page`/`limit` se
 * traducen a `start`/`length`, y `sortBy` al índice de columna del DataTables.
 * El total sale de `recordsFiltered`.
 *
 * @param {{ tkcBase: string, tkcUser: string, tkcPass: string }} config
 * @param {{ page?: number, limit?: number, almacenes?: string[], search?: string,
 *           sortBy?: string, sortDir?: 'asc'|'desc', existencia?: 'todos'|'existencia'|'no-existencia' }} query
 *        `almacenes` son valores TKC (ver `keyToTkcValue`). Sin almacén el
 *        endpoint devuelve 0 filas, así que el llamador debe garantizarlo.
 * @returns {Promise<{ rows: object[], pagination: { page: number, limit: number, total: number, totalPages: number } }>}
 */
export async function listInventory(config, query) {
  const page = Math.max(1, query.page ?? 1)
  const limit = Math.min(500, Math.max(1, query.limit ?? 50))
  const start = (page - 1) * limit

  const response = await fetchInventoryPage(config, {
    start,
    length: limit,
    search: query.search,
    orderColumn: sortColumnIndex(query.sortBy),
    orderDir: query.sortDir === 'desc' ? 'desc' : 'asc',
    almacenes: query.almacenes,
    existencia: query.existencia,
    draw: page,
  })

  const origin = originOf(config.tkcBase)
  const rawRows = response.data ?? []
  const rows = rawRows.map((raw, i) => normalizeRow(raw, start + i, origin))
  // recordsFiltered/recordsTotal siempre vienen en la respuesta; el ?? es defensivo.
  const total = response.recordsFiltered ?? response.recordsTotal ?? rows.length

  return {
    rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  }
}
