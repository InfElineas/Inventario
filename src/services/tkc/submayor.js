/**
 * Submayor de TKC (`/reportes/load/products/update`): el único endpoint que
 * **desglosa** la existencia de un producto en almacén y tienda.
 *
 * Portado de `@elineas/ap-api` (`src/tkc/submayor.ts` + el `getProductDetail`
 * de `src/services/inventory.service.ts`), que es lo que hay detrás de
 * `GET /api/inventory/{idTienda}?almacen=`. Aquí se replica su contrato en vez
 * de llamarla por HTTP porque esa API exige un JWT del Identity Server y esta
 * app se autentica con Supabase.
 *
 * Diferencias con `/provider/invetario/productos` (el listado de `body.js`),
 * todas verificadas contra el backend real:
 *
 *  - `almacen` es SINGULAR, de valor único y OBLIGATORIO. No hay comodín `all`:
 *    omitirlo, mandarlo vacío o mandar `all` devuelve 0 filas.
 *  - `existencia` es un booleano, no el enum `todos|existencia|no-existencia`:
 *    `true` deja solo filas con stock y `false` significa «sin filtrar».
 *  - Trae un rango `fechaInicio`/`fechaFin` que el listado no tiene.
 *
 * ⚠️ El campo `tienda` significa cosas DISTINTAS en los dos endpoints: aquí es
 * una CANTIDAD de unidades en las tiendas; en el listado es un id de tienda. No
 * son intercambiables.
 */

import { tkcPost } from './client.js'

const FETCH_PATH = '/reportes/load/products/update'
const REFERER = '/reportes/update/submayor/inventario'

/**
 * Orden de columnas del DataTables de este endpoint. `nombre` y `precio`
 * aparecen dos veces de verdad (posiciones 4/13 y 10/14): es la configuración
 * del propio TKC, reproducida tal cual.
 */
export const SUBMAYOR_COLS = [
  'selected',
  'categoria_online',
  'idTienda',
  'codigo',
  'nombre',
  'suministrador',
  'unidad_medida',
  'existencia_fisica',
  'almacen',
  'tienda',
  'precio',
  'categoria_almacen',
  'action',
  'nombre',
  'precio',
]

/** `k=v` con el valor URL-encoded. */
const pair = (key, value) => `${key}=${encodeURIComponent(value)}`

/**
 * Cuerpo URL-encoded del submayor. Mismas reglas que `body.js`: `%5B`/`%5D` van
 * pre-codificados y la cadena se manda cruda, nunca por `URLSearchParams`.
 *
 * @param {object}  params
 * @param {number}  params.start                Offset de filas.
 * @param {number}  params.length               Filas por página.
 * @param {string}  params.almacen              Id TKC del almacén. Obligatorio.
 * @param {string}  [params.search]             Búsqueda global; casa `idTienda` y `codigo`.
 * @param {boolean} [params.soloConExistencia]  `false` (por defecto) = sin filtrar.
 * @param {boolean} [params.soloTienda]         Filtro `tienda` de TKC.
 * @param {string}  [params.fechaInicio]
 * @param {string}  [params.fechaFin]
 * @param {number}  [params.draw]
 */
export function buildSubmayorBody({
  start,
  length,
  almacen,
  search = '',
  soloConExistencia = false,
  soloTienda = false,
  fechaInicio = '',
  fechaFin = '',
  draw = 1,
}) {
  const parts = [`draw=${draw}`]

  SUBMAYOR_COLS.forEach((col, i) => {
    parts.push(
      `columns%5B${i}%5D%5Bdata%5D=${col}`,
      `columns%5B${i}%5D%5Bname%5D=`,
      `columns%5B${i}%5D%5Bsearchable%5D=true`,
      // La columna 0 ("selected") es un checkbox: TKC la marca no ordenable.
      `columns%5B${i}%5D%5Borderable%5D=${i === 0 ? 'false' : 'true'}`,
      `columns%5B${i}%5D%5Bsearch%5D%5Bvalue%5D=`,
      `columns%5B${i}%5D%5Bsearch%5D%5Bregex%5D=false`,
    )
  })

  parts.push(
    'order%5B0%5D%5Bcolumn%5D=1',
    'order%5B0%5D%5Bdir%5D=asc',
    `start=${start}`,
    `length=${length}`,
    pair('search%5Bvalue%5D', search),
    'search%5Bregex%5D=false',
    pair('almacen', almacen),
    pair('fechaInicio', fechaInicio),
    pair('fechaFin', fechaFin),
    `existencia=${soloConExistencia ? 'true' : 'false'}`,
    `tienda=${soloTienda ? 'true' : 'false'}`,
    'temperatura%5B%5D=all',
  )

  return parts.join('&')
}

/**
 * Pide una página del submayor.
 *
 * @param {{ tkcBase: string, tkcUser: string, tkcPass: string }} config
 * @param {Parameters<typeof buildSubmayorBody>[0]} params
 * @returns {Promise<{ draw: number, recordsTotal: number, recordsFiltered: number, data: object[] }>}
 */
export function fetchSubmayorPage(config, params) {
  return tkcPost(config, {
    path: FETCH_PATH,
    referer: REFERER,
    body: buildSubmayorBody(params),
    label: 'submayor',
  })
}

/** Número o 0: quita separadores de millares y HTML, como en `normalize.js`. */
function num(value) {
  if (value === null || value === undefined || value === '') return 0
  const n = Number(String(value).replace(/<[^>]*>/g, '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

/**
 * Localiza una fila exacta por `idTienda` dentro de una respuesta del submayor.
 *
 * Hace falta porque la búsqueda de TKC es un «contiene»: buscar 139494 también
 * trae 1394940. Se separa de la petición para poder probarla sin red.
 */
export function pickRow(rows, idTienda) {
  const wanted = String(idTienda ?? '').trim()
  if (!wanted) return null
  return (rows ?? []).find((r) => String(r?.idTienda ?? '').trim() === wanted) ?? null
}

/**
 * Existencia desglosada de un producto en un almacén.
 *
 * Equivale a `GET /api/inventory/{idTienda}?almacen=` de ap-api, quitando el
 * enriquecimiento de catálogo: la tabla ya tiene esos campos del listado, así
 * que aquí solo interesan las tres cifras. Una petición a TKC, no dos.
 *
 * `soloConExistencia: false` es deliberado — en este endpoint significa «sin
 * filtro», así que un producto a cero también se encuentra en vez de dar null.
 *
 * @param {{ tkcBase: string, tkcUser: string, tkcPass: string }} config
 * @param {{ idTienda: string, almacen: string }} params `almacen` es el id TKC.
 * @returns {Promise<null | { idTienda: string, codigo: string, nombre: string,
 *   unidadMedida: string, precio: number,
 *   existencia: { fisica: number, enAlmacen: number, enTienda: number } }>}
 *   null si el submayor no tiene ese producto en ese almacén.
 */
export async function fetchExistencia(config, { idTienda, almacen }) {
  const wanted = String(idTienda ?? '').trim()
  if (!wanted || !almacen) return null

  const response = await fetchSubmayorPage(config, {
    start: 0,
    length: 25,
    search: wanted,
    almacen,
    soloConExistencia: false,
  })

  const row = pickRow(response?.data, wanted)
  if (!row) return null

  return {
    idTienda: String(row.idTienda ?? '').trim(),
    codigo: String(row.codigo ?? '').trim(),
    nombre: String(row.nombre ?? '').replace(/<[^>]*>/g, '').trim(),
    unidadMedida: String(row.unidad_medida ?? '').trim(),
    precio: num(row.precio),
    existencia: {
      // `fisica` es siempre `enAlmacen + enTienda` (verificado contra TKC).
      fisica: num(row.existencia_fisica),
      enAlmacen: num(row.almacen),
      enTienda: num(row.tienda),
    },
  }
}
