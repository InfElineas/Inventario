/**
 * Acceso del navegador a los procesamientos (`/api/procesamientos/*`, ver
 * `src/server/transferenciasApi.js`). Mismo contrato que `ajustesService.js`:
 * devuelve `{ status, body, total }` aunque sea un 4xx/5xx y solo lanza si no
 * hubo respuesta (`ErrorDeRed`); `interpretarProceso` /`interpretarAnalisis`
 * de `lib/procesamientos.js` deciden qué significa.
 */

import { pedir } from '@/services/ajustesService'

const RUTA = '/api/procesamientos'

const consulta = (filtros) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(filtros)) {
    if (v !== undefined && v !== '' && v !== null) q.set(k, String(v))
  }
  return q
}

/**
 * Los `NoMT…` con existencia de un almacén y si se pueden procesar.
 * @param {{ almacen: string, status?: string, q?: string, refresh?: boolean, limit?: number, offset?: number }} filtros
 */
export function listarCandidatos({ almacen, status, q, refresh, limit = 100, offset = 0 }) {
  return pedir(`${RUTA}/candidatos?${consulta({ almacen, status, q, refresh: refresh ? 'true' : undefined, limit, offset })}`)
}

/**
 * Los procesamientos (TKCP) más recientes de un almacén. `recent` son los N más
 * recientes que se piden a TKC (por páginas de 100): sin acotar, un almacén
 * llega a mil documentos y la lectura tarda más de un minuto.
 * @param {{ almacen: string, status?: 'proceso'|'procesada'|'cancelada', q?: string, recent?: number, refresh?: boolean, limit?: number, offset?: number }} filtros
 */
export function listarProcesados({ almacen, status, q, recent = 100, refresh, limit = 50, offset = 0 }) {
  return pedir(`${RUTA}/documentos?${consulta({ almacen, status, q, recent, refresh: refresh ? 'true' : undefined, limit, offset })}`)
}

/**
 * Solo lectura: lo que haría `procesar` con esta entrada.
 * @param {{ almacen: string, lines: Array<{code: string, quantity: number}> }} datos
 */
export function analizarProceso(datos) {
  return pedir(`${RUTA}/analizar`, { method: 'POST', body: datos })
}

/**
 * **Mueve la existencia** en TKC: pasa cada `NoMT…` a su código normal.
 * @param {{ almacen: string, lines: Array<{code: string, quantity: number}>, idempotencyKey: string }} datos
 */
export function procesar(datos) {
  return pedir(RUTA, { method: 'POST', body: datos })
}
