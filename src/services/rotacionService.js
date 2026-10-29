/**
 * Rotación de venta de cada producto, por id de tienda.
 *
 * La calcula TKC en su informe diario y la sirve nuestro servidor, que es
 * quien tiene el JWT y quien cachea el informe entero: son decenas de miles
 * de filas y se recalcula una vez al día, así que pedirlo por usuario y por
 * visita sería gastar minutos para obtener lo mismo.
 *
 * @param {{ refrescar?: boolean }} [opciones] `refrescar` salta el caché del
 *        servidor. Solo cuando alguien lo pide a mano.
 * @returns {Promise<Record<string, { diaria: number, segun: string|null, ultimaVenta: string|null }>>}
 */
export async function fetchRotacion({ refrescar = false } = {}) {
  const res = await fetch(`/api/rotacion${refrescar ? '?refrescar=true' : ''}`, {
    credentials: 'include',
  })
  const datos = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(datos?.error?.message ?? `Error ${res.status} al consultar la rotación de venta`)
  }
  return datos?.rotacion ?? {}
}
