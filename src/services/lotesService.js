/**
 * Los lotes de un almacén, con su vigencia ya calculada.
 *
 * Salen del informe central (`lot-latest`), no de una tabla nuestra: ver
 * src/server/lotesApi.js. Aquí solo se pide y se desenvuelve.
 */

/**
 * @param {{ almacen?: string, estados?: string[], limite?: number, refrescar?: boolean }} [opciones]
 *   `estados` y `limite` para quien solo necesita una parte: el panel pinta
 *   unos pocos críticos y no tiene por qué bajarse el almacén entero.
 */
export async function fetchLotes({ almacen, estados, limite, refrescar = false } = {}) {
  const params = new URLSearchParams()
  if (almacen) params.set('almacen', almacen)
  if (estados?.length) params.set('estados', estados.join(','))
  if (limite > 0) params.set('limite', String(limite))
  if (refrescar) params.set('refrescar', 'true')

  const res = await fetch(`/api/lotes?${params}`, { credentials: 'include' })
  const datos = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(datos?.error?.message ?? `Error ${res.status} al consultar los vencimientos`)
  }
  return Array.isArray(datos?.lotes) ? datos.lotes : []
}
