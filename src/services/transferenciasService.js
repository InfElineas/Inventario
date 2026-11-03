/**
 * Acceso del navegador a las transferencias entre almacenes
 * (`/api/transferencias/*`, ver `src/server/transferenciasApi.js`). Mismo
 * contrato que `ajustesService.js`: devuelve `{ status, body, total }` aunque sea
 * un 4xx/5xx y solo lanza si no hubo respuesta (`ErrorDeRed`);
 * `interpretarTransferencia` de `lib/transferencias.js` decide qué significa.
 */

import { pedir } from '@/services/ajustesService'

const RUTA = '/api/transferencias'

/**
 * Listado de TKC. `origen` y `destino` son claves de almacén de la app ("789").
 * @param {{ origen?: string, destino?: string, from?: string, to?: string, status?: string, q?: string, limit?: number, offset?: number }} [filtros]
 */
export function listarTransferencias({ limit = 50, offset = 0, ...filtros } = {}) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...filtros, limit, offset })) {
    if (v !== undefined && v !== '' && v !== null) q.set(k, String(v))
  }
  return pedir(`${RUTA}?${q}`)
}

/** Productos de un documento: `{ headers, rows }` tal cual los muestra TKC. */
export function lineasTransferencia(id) {
  return pedir(`${RUTA}/${encodeURIComponent(id)}/lines`)
}

/**
 * Monta el documento («editada»). NO mueve existencia.
 * @param {{ origen: string, destino: string, lines: Array<{code: string, quantity: number}>,
 *           notes?: string, idempotencyKey: string }} datos
 */
export function crearTransferencia(datos) {
  return pedir(RUTA, { method: 'POST', body: datos })
}

/** Confirma el borrador: pasa a «en tránsito». */
export function confirmarTransferencia(id, { almacen, idempotencyKey }) {
  return pedir(`${RUTA}/${encodeURIComponent(id)}/confirm`, { method: 'POST', body: { almacen, idempotencyKey } })
}

/** Cancela el borrador. */
export function cancelarTransferencia(id, { almacen, idempotencyKey }) {
  return pedir(`${RUTA}/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: { almacen, idempotencyKey } })
}
