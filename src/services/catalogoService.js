/**
 * El catálogo, servido desde nuestra base.
 *
 * Antes la pantalla pedía cada página al listado de TKC en vivo. Eso daba el
 * dato más fresco posible, pero ataba los filtros a lo que TKC sabe filtrar, y
 * TKC no sabe filtrar por lo que hacía falta: su filtro de anuncio es un sí/no
 * (`activado`) sin «Muerto», y su `tienda` es un binario almacén/tienda, no los
 * siete estados que calcula la aplicación.
 *
 * Al leer de `productos` los tres filtros funcionan completos y la paginación
 * la hace Postgres sobre el conjunto filtrado, que es la única forma de que el
 * recuento y las páginas sean correctos.
 *
 * Lo que se pierde: frescura. `productos` se sincroniza cada hora, y su origen
 * —el submayor— solo se recarga dos veces al día, así que las existencias
 * pueden ir hasta 18 horas por detrás de TKC. Por eso el formulario de
 * inventario sigue consultando el submayor en vivo: ahí el número importa.
 */

import { base44 } from '@/api/base44Client'

/** Columnas de `productos` que alimentan la tabla. */
const CAMPOS = [
  'id', 'id_tienda', 'codigo_producto', 'codigo_pyme', 'nombre',
  'suministrador', 'proveedor', 'marca', 'categoria_elineas', 'clasificacion',
  'categoria_almacen', 'unidad_compra', 'unidad_medida', 'locaciones', 'canal',
  'peso', 'volumen', 'cantidad_um', 'tasa', 'precio_costo',
  'fecha_vencimiento_tkc', 'catalogo_nombre', 'fotos',
  'exist_fisica', 'almacen', 'tienda',
  'estado_tienda', 'estado_anuncio_tkc',
]

/** Columnas en las que busca la caja de búsqueda. */
const CAMPOS_BUSQUEDA = ['nombre', 'codigo_producto', 'suministrador', 'proveedor', 'marca']

/** Clave de orden de la pantalla → columna real. */
const ORDEN = {
  codigo: 'codigo_producto',
  nombre: 'nombre',
  suministrador: 'suministrador',
  proveedor: 'proveedor',
  marca: 'marca',
  precio: 'precio_costo',
  categoriaOnline: 'categoria_elineas',
  idOnline: 'id_tienda',
  codigoPyme: 'codigo_pyme',
  clasificacion: 'clasificacion',
  categoriaAlmacen: 'categoria_almacen',
  unidadCompra: 'unidad_compra',
  unidadMedida: 'unidad_medida',
  locaciones: 'locaciones',
  canal: 'canal',
  peso: 'peso',
  volumen: 'volumen',
  cantidadUm: 'cantidad_um',
  tasa: 'tasa',
  fechaVencimiento: 'fecha_vencimiento_tkc',
  catalogo: 'catalogo_nombre',
  // Estas tres vienen de nuestra copia, así que aquí SÍ son ordenables —
  // contra TKC no lo eran, porque salían del submayor y no del listado.
  ef: 'exist_fisica',
  enAlmacen: 'almacen',
  enTienda: 'tienda',
}

/** Fila de `productos` → la forma que espera la tabla. */
function aFila(p) {
  const fotos = Array.isArray(p.fotos) ? p.fotos : []
  return {
    rowId: p.id,
    id: p.id,
    idOnline: p.id_tienda ?? '',
    codigo: p.codigo_producto ?? '',
    codigoPyme: p.codigo_pyme ?? '',
    nombre: p.nombre ?? '',
    suministrador: p.suministrador ?? '',
    proveedor: p.proveedor ?? '',
    marca: p.marca ?? '',
    categoriaOnline: p.categoria_elineas ?? '',
    clasificacion: p.clasificacion ?? '',
    categoriaAlmacen: p.categoria_almacen ?? '',
    unidadCompra: p.unidad_compra ?? '',
    unidadMedida: p.unidad_medida ?? '',
    locaciones: p.locaciones ?? '',
    canal: p.canal ?? '',
    peso: Number(p.peso ?? 0),
    volumen: Number(p.volumen ?? 0),
    cantidadUm: Number(p.cantidad_um ?? 0),
    tasa: Number(p.tasa ?? 0),
    precio: Number(p.precio_costo ?? 0),
    fechaVencimiento: p.fecha_vencimiento_tkc ?? '',
    catalogo: p.catalogo_nombre ?? '',
    imagenes: fotos,
    imagen: fotos[0] ?? '',
    // El desglose ya no hace falta pedirlo al submayor: está en la fila.
    ef: Number(p.exist_fisica ?? 0),
    enAlmacen: Number(p.almacen ?? 0),
    enTienda: Number(p.tienda ?? 0),
    estadoTienda: p.estado_tienda ?? '',
    estadoAnuncioTkc: p.estado_anuncio_tkc ?? '',
  }
}

/**
 * Condiciones para la API de datos a partir de los filtros de la pantalla.
 * Lo que no está puesto no filtra.
 */
function condiciones({ almacen, filtros }) {
  const c = { activo: true, almacen_num: almacen }

  if (filtros.existencia === 'con_ef')  c.exist_fisica = { gt: 0 }
  if (filtros.existencia === 'sin_ef')  c.exist_fisica = 0
  if (filtros.existencia === 'critico') c.exist_fisica = { gt: 0, lt: 5 }

  if (filtros.estadoTienda  && filtros.estadoTienda  !== 'all') c.estado_tienda = filtros.estadoTienda
  if (filtros.estadoAnuncio && filtros.estadoAnuncio !== 'all') c.estado_anuncio_tkc = filtros.estadoAnuncio
  if (filtros.suministrador) c.suministrador = filtros.suministrador
  if (filtros.categoria)     c.categoria_elineas = filtros.categoria

  return c
}

/**
 * Una página del catálogo, ya filtrada y contada por Postgres.
 *
 * @returns {Promise<{ rows: object[], pagination: { total: number, page: number, limit: number, pages: number } }>}
 */
export async function fetchCatalogo({ almacen, page = 1, limit = 50, search = '', sortBy = 'nombre', sortDir = 'asc', filtros = {} }) {
  if (!almacen) return { rows: [], pagination: { total: 0, page: 1, limit, pages: 0 } }

  const cond = condiciones({ almacen, filtros })
  const col = ORDEN[sortBy] ?? 'nombre'
  const orderBy = sortDir === 'desc' ? `-${col}` : col
  const offset = (page - 1) * limit
  const texto = search.trim()

  // El recuento va en paralelo: la pantalla necesita el total de la selección
  // para paginar, no solo las filas de esta página.
  const [filas, total] = await Promise.all([
    texto
      ? base44.entities.Producto.buscar(texto, CAMPOS_BUSQUEDA, cond, orderBy, limit, offset, CAMPOS)
      : base44.entities.Producto.filter(cond, orderBy, limit, offset, CAMPOS),
    base44.entities.Producto.count(cond, texto ? { texto, campos: CAMPOS_BUSQUEDA } : undefined),
  ])

  return {
    rows: filas.map(aFila),
    pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
  }
}
