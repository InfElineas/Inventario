/**
 * Construye el cuerpo URL-encoded (estilo DataTables server-side) para el
 * endpoint `/provider/invetario/productos` del backend de TKC.
 *
 * Portado literal de `elineas-vd` (`src/modules/inventory/tkc/body.ts`).
 * `%5B`/`%5D` son `[`/`]` pre-codificados, como en el payload original, para que
 * el cuerpo sea idéntico al que TKC espera.
 */

/**
 * Columnas del DataTables, en el orden exacto del endpoint. El índice se usa en
 * `order[0][column]` — ver TKC_SORT_COLUMNS en `columns.js`.
 */
/** Valores válidos del filtro `existencia` de TKC (ver select `#existencia` en el README de elineas-vd). */
export const EXISTENCIA_FILTERS = ['todos', 'existencia', 'no-existencia']

export const COLS = [
  'clasificacion',
  'categoria_online',
  'id_online',
  'codigo',
  'codigo_pyme',
  'nombre',
  'proveedor',
  'suministrador',
  'unidad_compra',
  'locaciones',
  'peso',
  'cantidad',
  'precio',
  'cantidad_um',
  'unidad_medida',
  'tasa',
  'fecha_vencimiento',
  'categoria_almacen',
  'volumen',
  'canal',
  'store_min_kontrol',
  'marca',
  'catalogo',
  'action',
]

/**
 * @param {object}   params
 * @param {number}   params.start          Offset de filas (DataTables `start`).
 * @param {number}   params.length         Filas por página (DataTables `length`).
 * @param {string}   [params.search]       Búsqueda global (`search[value]`).
 * @param {number}   [params.orderColumn]  Índice de columna por la que ordenar.
 * @param {'asc'|'desc'} [params.orderDir] Dirección de orden.
 * @param {string[]} [params.almacenes]    Almacenes seleccionados (valores TKC).
 * @param {string[]} [params.locaciones]   Localizaciones; por defecto ["all"].
 * @param {string}   [params.existencia]   Filtro de existencia; por defecto "existencia".
 * @param {string}   [params.tienda]       Filtro de tienda; por defecto "todos".
 * @param {string}   [params.inventario]   Filtro de inventario; por defecto "todos".
 * @param {string[]} [params.temperatura]  Temperatura; por defecto ["all"].
 * @param {number}   [params.draw]         Contador DataTables; solo se refleja en la respuesta.
 */
export function buildBody({
  start,
  length,
  search = '',
  orderColumn = 1,
  orderDir = 'asc',
  almacenes = [],
  locaciones = ['all'],
  existencia = 'existencia',
  tienda = 'todos',
  inventario = 'todos',
  temperatura = ['all'],
  draw = 1,
}) {
  const parts = [`draw=${draw}`]

  COLS.forEach((col, i) => {
    parts.push(`columns%5B${i}%5D%5Bdata%5D=${col}`)
    parts.push(`columns%5B${i}%5D%5Bname%5D=`)
    parts.push(`columns%5B${i}%5D%5Bsearchable%5D=true`)
    parts.push(`columns%5B${i}%5D%5Borderable%5D=true`)
    parts.push(`columns%5B${i}%5D%5Bsearch%5D%5Bvalue%5D=`)
    parts.push(`columns%5B${i}%5D%5Bsearch%5D%5Bregex%5D=false`)
  })

  parts.push(`order%5B0%5D%5Bcolumn%5D=${orderColumn}`)
  parts.push(`order%5B0%5D%5Bdir%5D=${orderDir}`)
  parts.push(`start=${start}`, `length=${length}`)
  parts.push(`search%5Bvalue%5D=${encodeURIComponent(search)}`)
  parts.push('search%5Bregex%5D=false')

  for (const value of almacenes) parts.push(`almacenes%5B%5D=${encodeURIComponent(value)}`)
  for (const value of locaciones) parts.push(`locaciones%5B%5D=${encodeURIComponent(value)}`)
  parts.push(`existencia=${encodeURIComponent(existencia)}`)
  parts.push(`tienda=${encodeURIComponent(tienda)}`)
  parts.push(`inventario=${encodeURIComponent(inventario)}`)
  for (const value of temperatura) parts.push(`temperatura%5B%5D=${encodeURIComponent(value)}`)

  // Filtros restantes del payload original, vacíos por defecto.
  parts.push(
    'reabastece=',
    'activado=',
    'habilitado=',
    'controlado=',
    'storeMinKontrol=',
    'tiene_codigo_pyme=',
    'codigos_pyme=',
    'publico_temporal=',
  )

  return parts.join('&')
}
