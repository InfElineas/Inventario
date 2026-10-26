/**
 * Acceso del navegador a los ajustes de aumento y de disminución.
 *
 * Llama a `/api/ajustes/*` (ver `src/server/transferenciasApi.js`), que habla con
 * la API de elineas-transferencia como la persona: la sesión y sus credenciales
 * de TKC viajan en cookies httpOnly, no desde aquí.
 *
 * Devuelve `{ status, body, total }` SIEMPRE que haya respuesta HTTP, aunque sea
 * un 4xx/5xx: lo que significa cada una (`rechazado`, `sin_verificar`…) lo decide
 * `interpretar` de `lib/ajustes.js`. Solo lanza si no hubo respuesta, y entonces
 * en una ESCRITURA no se sabe si llegó: ver `ErrorDeRed.escritura`.
 */

import { TIPOS_AJUSTE } from '@/lib/ajustes'
import { conCredencialesTkc } from '@/lib/tkcCredenciales'

export class ErrorDeRed extends Error {
  constructor(escritura) {
    super(
      escritura
        ? 'Se perdió la conexión y no se sabe si el documento llegó a TKC. Revisa TKC antes de repetir.'
        : 'No se pudo conectar con el servidor.',
    )
    this.name = 'ErrorDeRed'
    this.escritura = escritura
  }
}

const ruta = (tipo) => `/api/ajustes/${TIPOS_AJUSTE[tipo].segmento}`

/** @param {string} url @param {{ method?: string, body?: object }} [opciones] */
async function pedir(url, { method = 'GET', body } = {}) {
  const escritura = method !== 'GET'
  const intentar = async () => {
    let res
    try {
      res = await fetch(url, {
        method,
        credentials: 'include',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new ErrorDeRed(escritura)
    }
    const datos = await res.json().catch(() => null)
    const total = res.headers.get('X-Total-Count')
    return { status: res.status, body: datos, total: total === null ? null : Number(total) }
  }
  // Sin credenciales de TKC el servidor corta antes de enviar nada (ni siquiera
  // una escritura llegó a TKC), así que pedirlas y repetir es seguro.
  return conCredencialesTkc(intentar)
}

/**
 * Listado de documentos de un almacén (clave de la app, p. ej. "789").
 * @param {string} tipo
 * @param {{ almacen?: string, from?: string, to?: string, status?: string, limit?: number, offset?: number }} [filtros]
 */
export function listarAjustes(tipo, { almacen, from, to, status, limit = 50, offset = 0 } = {}) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries({ almacen, from, to, status, limit, offset })) {
    if (v !== undefined && v !== '' && v !== null) q.set(k, String(v))
  }
  return pedir(`${ruta(tipo)}?${q}`)
}

/** Productos de un documento: `{ headers, rows }` tal cual los muestra TKC. */
export function lineasAjuste(tipo, id) {
  return pedir(`${ruta(tipo)}/${encodeURIComponent(id)}/lines`)
}

/**
 * Monta el documento («editada»). NO mueve existencia.
 * @param {{ almacen: string, lines: Array<{code: string, quantity: number}>,
 *           date?: string, notes?: string, classification?: string,
 *           idempotencyKey: string }} datos
 */
export function crearAjuste(tipo, datos) {
  return pedir(ruta(tipo), { method: 'POST', body: datos })
}

/**
 * Confirma el documento: **mueve la existencia** en TKC.
 * @param {string} tipo
 * @param {string|number} id
 * @param {{ almacen: string, code?: string, date?: string, idempotencyKey: string }} datos
 */
export function confirmarAjuste(tipo, id, { almacen, code, date, idempotencyKey }) {
  return pedir(`${ruta(tipo)}/${encodeURIComponent(id)}/confirm`, {
    method: 'POST',
    body: { almacen, code, date, idempotencyKey },
  })
}
