import { base44 } from '@/api/base44Client'

/**
 * Recorre una entidad por páginas hasta agotarla.
 *
 * La API tope a 2000 filas por petición; `productos` tiene 55.000, así que una
 * sola llamada las truncaría en silencio. Antes el límite lo ponía PostgREST y
 * esto paginaba con `range()`.
 *
 * El tamaño de página va al tope que admite la API: cada petición arrastra una
 * verificación de sesión y una consulta con OFFSET, cuyo coste en Postgres
 * crece con la profundidad. Menos páginas es menos de ambas cosas.
 *
 * @param {string} entidad  nombre de la entidad (Producto, Merma…)
 * @param {object} condiciones
 * @param {string} orden
 * @param {number} tamañoPagina
 * @param {string[]} [campos] columnas a traer; por defecto, todas
 */
export async function fetchAllRows(entidad, condiciones = {}, orden = undefined, tamañoPagina = 2000, campos = undefined) {
  const todas = []
  let desde = 0
  for (;;) {
    const pagina = await base44.entities[entidad].filter(condiciones, orden, tamañoPagina, desde, campos)
    todas.push(...pagina)
    if (pagina.length < tamañoPagina) break
    desde += tamañoPagina
  }
  return todas
}

/**
 * Todos los productos activos. Si almacen viene vacío, de todos los almacenes.
 *
 * @param {string} almacen
 * @param {string[]} [campos] columnas a traer. Quien no pinta las fotos no
 *   debería descargarlas: son un jsonb en cada una de 55.000 filas.
 */
export async function fetchAllProductos(almacen, campos = undefined) {
  return fetchAllRows(
    'Producto',
    { activo: true, ...(almacen ? { almacen_num: almacen } : {}) },
    'nombre',
    2000,
    campos,
  )
}
