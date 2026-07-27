/**
 * Columnas de la tabla de inventario TKC.
 *
 * Réplica de `elineas-vd` (`config/columns.ts` + `SORT_COLUMNS` de
 * `shared/types.ts`), adaptada al formato que espera `ColPicker`
 * (`{ key, label, defaultOn, required }`).
 *
 * Este módulo es isomorfo: lo usan el middleware (para traducir `sortBy` al
 * índice de columna del DataTables) y la tabla en el navegador.
 */

/**
 * Mapa campo de la fila → índice de columna en el DataTables de TKC (para el
 * `order[0][column]`). Solo estas columnas son ordenables: el orden lo resuelve
 * TKC, no el cliente.
 *
 * Los huecos son intencionales y vienen del endpoint: 20 es `store_min_kontrol`
 * y 23 es `action`, que no se muestran.
 */
export const TKC_SORT_COLUMNS = {
  clasificacion: 0,
  categoriaOnline: 1,
  idOnline: 2,
  codigo: 3,
  codigoPyme: 4,
  nombre: 5,
  proveedor: 6,
  suministrador: 7,
  unidadCompra: 8,
  locaciones: 9,
  peso: 10,
  cantidad: 11,
  precio: 12,
  cantidadUm: 13,
  unidadMedida: 14,
  tasa: 15,
  fechaVencimiento: 16,
  categoriaAlmacen: 17,
  volumen: 18,
  canal: 19,
  marca: 21,
  catalogo: 22,
}

export const TKC_SORT_KEYS = Object.keys(TKC_SORT_COLUMNS)

/** Clave de la columna de imagen: no ordenable, no forma parte de TKC_SORT_COLUMNS. */
export const IMAGE_COL = 'imagen'

/**
 * Columnas mostrables, en el orden por defecto de elineas-vd.
 *
 * - `defaultOn` / `required`: los consume `ColPicker`.
 * - `numeric`  : alineación a la derecha + formato con `Intl.NumberFormat`.
 * - `currency` : dos decimales fijos (precio).
 */
export const TKC_COLUMN_DEFS = [
  { key: IMAGE_COL,         label: 'Imagen',        defaultOn: true,  required: false },
  { key: 'codigo',          label: 'Código',        defaultOn: true,  required: true  },
  { key: 'nombre',          label: 'Nombre',        defaultOn: true,  required: true  },
  { key: 'categoriaOnline', label: 'Categoría',     defaultOn: true,  required: false },
  { key: 'proveedor',       label: 'Proveedor',     defaultOn: true,  required: false },
  { key: 'suministrador',   label: 'Suministrador', defaultOn: false, required: false },
  { key: 'marca',           label: 'Marca',         defaultOn: true,  required: false },
  { key: 'unidadMedida',    label: 'U/M',           defaultOn: true,  required: false },
  { key: 'cantidad',        label: 'Cantidad',      defaultOn: true,  required: false, numeric: true },
  { key: 'precio',          label: 'Precio',        defaultOn: true,  required: false, numeric: true, currency: true },
  { key: 'fechaVencimiento',label: 'Vence',         defaultOn: true,  required: false },
  { key: 'categoriaAlmacen',label: 'Cat. almacén',  defaultOn: false, required: false },
  { key: 'locaciones',      label: 'Locaciones',    defaultOn: false, required: false },
  { key: 'peso',            label: 'Peso',          defaultOn: false, required: false, numeric: true },
  { key: 'volumen',         label: 'Volumen',       defaultOn: false, required: false, numeric: true },
  { key: 'idOnline',        label: 'ID online',     defaultOn: false, required: false },
  { key: 'codigoPyme',      label: 'Código PYME',   defaultOn: false, required: false },
  { key: 'clasificacion',   label: 'Clasificación', defaultOn: false, required: false },
  { key: 'canal',           label: 'Canal',         defaultOn: false, required: false },
  { key: 'catalogo',        label: 'Catálogo',      defaultOn: false, required: false },
]

/** Índice `key → def`, para no recorrer el array en cada celda. */
export const TKC_COLUMN_BY_KEY = Object.fromEntries(TKC_COLUMN_DEFS.map((d) => [d.key, d]))

/** Traduce una clave de orden de la UI al índice de columna de TKC (5 = nombre). */
export function sortColumnIndex(sortBy) {
  return TKC_SORT_COLUMNS[sortBy] ?? TKC_SORT_COLUMNS.nombre
}
