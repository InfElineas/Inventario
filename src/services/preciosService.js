/**
 * Todos los precios que hay de un producto en un almacén, uno por fuente.
 * Ver src/server/preciosApi.js.
 *
 * @returns {Promise<{
 *   almacen: string, codigo: string, nombre: string,
 *   fuentes: Array<{
 *     clave: string, titulo: string, nota: string, error?: string,
 *     precios: Array<{ etiqueta: string, valor: number|null }>,
 *   }>,
 * }>}
 */
export async function fetchPrecios({ almacen, codigo }) {
  const params = new URLSearchParams({ almacen, codigo })
  const res = await fetch(`/api/productos/precios?${params}`, { credentials: 'include' })
  const datos = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(datos?.error?.message ?? `Error ${res.status} al consultar los precios`)
  }
  return datos
}
