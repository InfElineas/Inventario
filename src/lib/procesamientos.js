/**
 * Procesamientos de facturación (API de elineas-transferencia, `/api/v1/process`):
 * pasar la existencia de un producto `NoMT…` a su código normal, en el mismo
 * almacén. Lógica pura: sin red ni React, para probarla sola.
 *
 * La entrada (`CODIGO*CANTIDAD`) y la clave de idempotencia son las de los
 * ajustes; aquí solo está lo que es propio de procesar.
 */

import { ROLES_AJUSTES } from '@/lib/ajustes'

export { parseLineas, nuevaClave, MAX_LINEAS } from '@/lib/ajustes'

/** Quién puede analizar y procesar. Mismos roles que los ajustes: es el mismo trabajo de facturación. */
export const ROLES_PROCESAMIENTOS = ROLES_AJUSTES

/** Líneas por documento TKCP: más se reparten en otro documento del mismo almacén. */
export const LINEAS_POR_DOCUMENTO = 50

const NOMT = /^nomt/i

/** `NoMT123` y `123` son el mismo producto para la API; sirve para avisar de un repetido. */
export const codigoBase = (code) => String(code ?? '').trim().replace(NOMT, '')

/**
 * Qué significa la respuesta de `POST /process` para la pantalla.
 *
 *   procesado      — todas las líneas pasaron (`created`).
 *   parcial        — unas pasaron y otras no (`partial`).
 *   rechazado      — nada se envió a TKC; `rechazadas` dice por qué (`rejected`).
 *   fallo          — TKC no lo aceptó (`failed`).
 *   sin_verificar  — se envió y NO se sabe si TKC lo aplicó: no repetir, mirar TKC.
 *   error          — la petición no llegó a hacer nada (permisos, validación, caída).
 *
 * @param {number} status
 * @param {any} body
 */
export function interpretarProceso(status, body) {
  const err = body?.error
  if (err && typeof err === 'object') {
    if (err.code === 'unverified' || status === 504) {
      return { tipo: 'sin_verificar', mensaje: err.message, grupos: [], rechazadas: [] }
    }
    return { tipo: 'error', codigo: err.code, mensaje: err.message, status }
  }

  const base = {
    grupos: Array.isArray(body?.groups) ? body.groups : [],
    rechazadas: Array.isArray(body?.rejected) ? body.rejected : [],
    hechas: body?.done ?? 0,
    falladas: body?.failed ?? 0,
    sinVerificar: body?.unverified ?? 0,
  }
  const mensaje = typeof body?.error === 'string' ? body.error : undefined

  switch (body?.status) {
    case 'created':
      return { tipo: 'procesado', ...base }
    case 'partial':
      return { tipo: 'parcial', ...base }
    case 'rejected':
      return { tipo: 'rechazado', mensaje, ...base }
    case 'failed':
      return { tipo: 'fallo', mensaje: mensaje ?? 'TKC no lo aceptó.', ...base }
    case 'unverified':
      return { tipo: 'sin_verificar', mensaje: body.message ?? mensaje, ...base }
    default:
      return { tipo: 'error', mensaje: 'Respuesta inesperada de la API de transferencias.', status }
  }
}

/**
 * Qué significa la respuesta de `POST /process/analyze`. Es lectura: nunca hay
 * `sin_verificar`. `lineas` trae por línea `processable` y, si no, `reason`.
 */
export function interpretarAnalisis(status, body) {
  const err = body?.error
  if (err && typeof err === 'object') {
    return { tipo: 'error', codigo: err.code, mensaje: err.message, status }
  }
  if (!Array.isArray(body?.lines)) {
    return { tipo: 'error', mensaje: 'Respuesta inesperada de la API de transferencias.', status }
  }
  const lineas = body.lines
  return {
    tipo: 'analizado',
    lineas,
    rechazadas: Array.isArray(body.rejected) ? body.rejected : [],
    procesables: lineas.filter((l) => l.processable).length,
  }
}

/** Etiqueta de una línea ya procesada. */
export const ETIQUETA_LINEA = {
  done: 'Procesada',
  failed: 'No se procesó',
  unverified: 'Sin confirmar',
}
