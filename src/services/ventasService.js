/**
 * Lo vendido en un almacén entre dos fechas. Ver src/server/ventasApi.js.
 *
 * @returns {Promise<{
 *   total: { cantidad: number, ordenes: number, importe: number, costo: number },
 *   productos: Array<{ codigo: string, nombre: string, cantidad: number, ordenes: number, importe: number, costo: number }>,
 *   recortado: boolean,
 *   dias: Array<{ fecha: string, cantidad: number, ordenes: number, importe: number, costo: number }>,
 *   cobertura: { diasPedidos: number, diasConDatos: number, primera: string|null, ultima: string|null },
 * }>}
 */
export async function fetchResumenVentas({ almacen, desde, hasta }) {
  const params = new URLSearchParams({ almacen, desde, hasta })
  const res = await fetch(`/api/ventas/resumen?${params}`, { credentials: 'include' })
  const datos = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(datos?.error?.message ?? `Error ${res.status} al consultar las ventas`)
  }
  return datos
}
