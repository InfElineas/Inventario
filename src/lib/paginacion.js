import { base44 } from '@/api/base44Client'

/**
 * Recorre una entidad por páginas hasta agotarla.
 *
 * La API tope a 2000 filas por petición; `productos` tiene 55.000, así que una
 * sola llamada las truncaría en silencio. Antes el límite lo ponía PostgREST y
 * esto paginaba con `range()`.
 *
 * @param {string} entidad  nombre de la entidad (Producto, Merma…)
 * @param {object} condiciones
 * @param {string} orden
 * @param {number} tamañoPagina
 */
export async function fetchAllRows(entidad, condiciones = {}, orden = undefined, tamañoPagina = 1000) {
  const todas = []
  let desde = 0
  for (;;) {
    const pagina = await base44.entities[entidad].filter(condiciones, orden, tamañoPagina, desde)
    todas.push(...pagina)
    if (pagina.length < tamañoPagina) break
    desde += tamañoPagina
  }
  return todas
}

/** Todos los productos activos. Si almacen viene vacío, de todos los almacenes. */
export async function fetchAllProductos(almacen) {
  return fetchAllRows(
    'Producto',
    { activo: true, ...(almacen ? { almacen_num: almacen } : {}) },
    'nombre',
  )
}
