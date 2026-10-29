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
 * Los que están `enviado` o `parcialmente_recibido`.
 *
 * @param {{ proveedor?: string }} [filtros]
 * @returns {Promise<Array<{id, numero, proveedor, oferta, estado, lineas, importe, moneda, llegadaEstimada}>>}
 */
export async function fetchPedidosEnCamino({ proveedor } = {}) {
  const params = new URLSearchParams()
  if (proveedor) params.set('proveedor', proveedor)
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
