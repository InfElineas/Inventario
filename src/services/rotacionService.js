/**
 * Rotación de venta de cada producto, por id de tienda.
 *
 * La calcula TKC en su informe diario y la sirve nuestro servidor, que es
 * quien tiene el JWT y quien cachea el informe entero: son decenas de miles
 * de filas y se recalcula una vez al día, así que pedirlo por usuario y por
 * visita sería gastar minutos para obtener lo mismo.
 *
 * El cruce con las existencias lo hace el servidor, no el navegador: la API
 * de datos devuelve 2 000 filas como mucho y un almacén tiene veinte mil
 * productos, así que pedirlas desde aquí dejaba fuera justo las de existencia
 * cero, que son las urgentes.
 *
 * @param {{ almacen: string, dias?: number, refrescar?: boolean }} opciones
 *        `refrescar` salta el caché del informe. Solo a petición de alguien.
 * @returns {Promise<Array<object>>} Lo que falta por reponer, de lo que menos
 *          aguanta a lo que más.
 */
export async function fetchCobertura({ almacen, dias = 15, refrescar = false }) {
  if (!almacen) return []
  const params = new URLSearchParams({ almacen, dias: String(dias) })
  if (refrescar) params.set('refrescar', 'true')

  const res = await fetch(`/api/rotacion?${params}`, { credentials: 'include' })
  const datos = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(datos?.error?.message ?? `Error ${res.status} al consultar la rotación de venta`)
  }
  return Array.isArray(datos?.filas) ? datos.filas : []
}
