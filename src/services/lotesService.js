/**
 * Los lotes de un almacén, con su vigencia ya calculada.
 *
 * Salen de la vista que publica el cron central, no de una tabla nuestra:
 * ver src/server/lotesApi.js. Aquí solo se pide y se desenvuelve.
 */

/**
 * @param {{ almacen?: string, estados?: string[], limite?: number }} [opciones]
 *   `estados` y `limite` para quien solo necesita una parte: el panel pinta
 *   unos pocos críticos y no tiene por qué bajarse el almacén entero.
 */
export async function fetchLotes({ almacen, estados, limite } = {}) {
  const params = new URLSearchParams()
  if (almacen) params.set('almacen', almacen)
  if (estados?.length) params.set('estados', estados.join(','))
  if (limite > 0) params.set('limite', String(limite))

  const res = await fetch(`/api/lotes?${params}`, { credentials: 'include' })
  const datos = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(datos?.error?.message ?? `Error ${res.status} al consultar los vencimientos`)
  }
  return Array.isArray(datos?.lotes) ? datos.lotes : []
}

/**
 * Recuentos por estado y los primeros lotes de cada uno.
 *
 * Para quien solo necesita saber cuántos hay y enseñar unos pocos: el panel,
 * el menú y los avisos. Pedir la lista con un tope no sirve para eso, porque
 * el tope lo llenan los vencidos y los demás estados no llegan a salir.
 *
 * @returns {Promise<{ conteos: Record<string, number>, lotes: object[] }>}
 */
export async function fetchResumenLotes({ almacen, porEstado = 6 } = {}) {
  const params = new URLSearchParams({ resumen: '1', porEstado: String(porEstado) })
  if (almacen) params.set('almacen', almacen)

  const res = await fetch(`/api/lotes?${params}`, { credentials: 'include' })
  const datos = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(datos?.error?.message ?? `Error ${res.status} al consultar los vencimientos`)
  }
  return {
    conteos: datos?.conteos ?? {},
    lotes: Array.isArray(datos?.lotes) ? datos.lotes : [],
  }
}
