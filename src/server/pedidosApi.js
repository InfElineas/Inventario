/**
 * Los pedidos de compra que vienen en camino, para recibirlos contra ellos.
 *
 * Salen de la API de reabastecimiento, donde los crea el área comercial. Hasta
 * ahora inventario recibía a ciegas: quien descargaba el camión tecleaba a
 * mano cuánto esperaba que viniera, que es justo el número que no puede
 * inventarse. Ahora se elige el pedido y las cantidades esperadas son las que
 * pidió comercial.
 *
 * «En camino» son dos estados suyos: `enviado` y `parcialmente_recibido` —el
 * segundo es un envío que llegó en tandas—. Los anteriores todavía se están
 * negociando y los posteriores ya se recibieron.
 *
 * Esos dos son lo normal al descargar un camión, pero no lo único: en la
 * práctica llega mercancía de un pedido que comercial dejó en `confirmado` sin
 * marcarlo enviado, y hay que poder encontrarlo. Por eso se puede pedir
 * cualquier estado; «en camino» es solo el que viene puesto.
 */

import { pedirReab, pedirTodoReab, configReab } from './reabApi.js'

export const ESTADOS_EN_CAMINO = ['enviado', 'parcialmente_recibido']

/** Los siete estados de su `purchase_order_status`, en orden de avance. */
export const ESTADOS_PEDIDO = [
  'borrador',
  'pendiente_revision',
  'confirmado',
  'enviado',
  'parcialmente_recibido',
  'recibido',
  'cancelado',
]

/** ¿Está configurada la API? La pantalla lo dice en vez de fallar sin más. */
export const hayPedidos = () => configReab().configurada

/**
 * Pedidos de compra, opcionalmente de un proveedor y de ciertos estados.
 *
 * El filtrado se hace aquí y no en la consulta: su API no documenta ningún
 * parámetro para ello y el que se le pasaba —`status_in`— se lo tragaba sin
 * filtrar nada. Son unos pocos pedidos abiertos a la vez, así que traerlos
 * todos y quedarse con los que interesan no cuesta nada y no depende de
 * adivinar cómo se llama su filtro.
 *
 * @param {{ proveedor?: string, estados?: string[] }} [filtros]
 *   `estados` sin dar son los de en camino; una lista vacía, todos.
 */
export async function listarPedidos({ proveedor, estados = ESTADOS_EN_CAMINO } = {}) {
  const quiere = estados.filter((e) => ESTADOS_PEDIDO.includes(e))
  const busca = (proveedor ?? '').trim().toLowerCase()

  const { datos } = await pedirReab('purchase-orders', {
    sortBy: 'created_at',
    sortOrder: 'desc',
    pageSize: 200,
    count: 'none',
  })

  return datos.filter((p) => (
    (quiere.length === 0 || quiere.includes(p.status))
    && (!busca || String(p.supplier_name ?? '').toLowerCase().includes(busca))
  )).map((p) => ({
    id: p.id,
    numero: p.order_number ?? p.id.slice(0, 8),
    proveedor: p.supplier_name ?? '',
    oferta: p.offer_name ?? '',
    estado: p.status,
    lineas: p.total_items ?? 0,
    importe: p.total_amount ?? 0,
    moneda: p.currency ?? '',
    llegadaEstimada: p.fecha_estimada_llegada ?? null,
    creado: p.created_at,
  }))
}

/**
 * Las líneas de un pedido, ya en el vocabulario de una recepción.
 *
 * Solo las `included`: las excluidas se quitaron del pedido a propósito y
 * esperarlas sería contar algo que nadie compró.
 *
 * El producto se identifica por `internal_product_code`, que es el mismo
 * código de barras que tenemos nosotros. Su tabla de productos está vacía, así
 * que el código es lo único con lo que se puede cruzar.
 */
export async function lineasDePedido(id) {
  const items = await pedirTodoReab(`purchase-orders/${encodeURIComponent(id)}/items`, {}, { porPagina: 200 })

  return items
    .filter((l) => (l.status ?? 'included') === 'included')
    .map((l) => ({
      codigo: String(l.internal_product_code ?? '').trim(),
      nombre: l.product_name ?? l.supplier_product_name ?? '',
      // Lo que de verdad se pidió: `final_qty` es lo que quedó tras los
      // ajustes de comercial, `suggested_qty` era solo la propuesta.
      cantidad: Number(l.final_qty ?? l.suggested_qty) || 0,
      costo: Number(l.unit_cost) || 0,
      idTienda: String(l.internal_offer_id ?? '').trim(),
    }))
    .filter((l) => l.codigo && l.cantidad > 0)
}
