/**
 * Pedidos de compra en camino, para recibir contra ellos.
 *
 * Los crea comercial en la API de reabastecimiento; aquí solo se leen. Quien
 * descarga el camión elige el pedido y las cantidades esperadas dejan de
 * teclearse a mano: son las que pidió comercial.
 */

async function pedir(params) {
  const res = await fetch(`/api/pedidos?${params}`, { credentials: 'include' })
  const datos = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(datos?.error?.message ?? `Error ${res.status} al consultar los pedidos`)
  }
  return datos
}

/**
 * Los pedidos de compra.
 *
 * Sin `estados` vienen los que están en camino (`enviado` y
 * `parcialmente_recibido`), que es con lo que se recibe casi siempre. Con
 * `estados: 'todos'` vienen todos, para cuando la mercancía llegó de un pedido
 * que se quedó en otro estado.
 *
 * @param {{ proveedor?: string, estados?: string }} [filtros]
 * @returns {Promise<Array<{id, numero, proveedor, oferta, estado, lineas, importe, moneda, llegadaEstimada}>>}
 */
export async function fetchPedidos({ proveedor, estados } = {}) {
  const params = new URLSearchParams()
  if (proveedor) params.set('proveedor', proveedor)
  if (estados) params.set('estados', estados)
  const datos = await pedir(params)
  return Array.isArray(datos?.pedidos) ? datos.pedidos : []
}

/**
 * Las líneas de un pedido: qué productos y cuántos se pidieron.
 *
 * @returns {Promise<Array<{codigo, nombre, cantidad, costo, idTienda}>>}
 */
export async function fetchLineasDePedido(id) {
  if (!id) return []
  const datos = await pedir(new URLSearchParams({ id }))
  return Array.isArray(datos?.lineas) ? datos.lineas : []
}
