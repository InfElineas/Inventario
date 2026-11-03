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

/** Los estados de un candidato (`status`), con lo que dice cada uno. Lo filtra la API. */
export const ESTADOS_CANDIDATO = [
  { valor: '', label: 'Todos' },
  { valor: 'ready', label: 'Procesables' },
  { valor: 'no-target', label: 'Sin destino' },
  { valor: 'ambiguous-target', label: 'Varios destinos posibles' },
  { valor: 'price-differs', label: 'Precio distinto' },
  { valor: 'target-inactive', label: 'Destino inactivo' },
  { valor: 'unit-differs', label: 'Unidad distinta' },
]

/** Los estados de un documento TKCP (`status`). */
export const ESTADOS_PROCESADO = [
  { valor: '', label: 'Todos' },
  { valor: 'procesada', label: 'Procesada' },
  { valor: 'proceso', label: 'A medias' },
  { valor: 'cancelada', label: 'Cancelada' },
]

/** Cómo se dice el estado de un documento. */
export const etiquetaProcesado = (estado) =>
  ESTADOS_PROCESADO.find((e) => e.valor && e.valor === String(estado ?? '').toLowerCase())?.label ?? estado ?? ''

/** Etiqueta de una línea ya procesada. */
export const ETIQUETA_LINEA = {
  done: 'Procesada',
  failed: 'No se procesó',
  unverified: 'Sin confirmar',
}

/**
 * Las líneas que se mandan a procesar, a partir de lo que se escribió y de lo
 * que dijo el análisis.
 *
 * El análisis dice qué línea se puede procesar, pero una línea de intercambio
 * (`ORIGEN>DESTINO`) puede volver con solo el origen en `code` y el destino en
 * `targetCode`. Mandar lo que vuelve perdería el destino y procesaría otra
 * cosa, así que se manda lo que se ESCRIBIÓ y se usa el análisis solo para
 * decidir cuáles pasan y con qué cantidad.
 *
 * @param {Array<{ code: string, quantity: number }>} escritas
 * @param {Array<{ code: string, targetCode?: string, processable?: boolean, requested?: number }>} analizadas
 */
export function lineasParaEnviar(escritas, analizadas) {
  const enviar = []
  for (const l of escritas) {
    const [origen, destino] = String(l.code).split('>')
    const a = analizadas.find((x) =>
      x.code === l.code || (destino !== undefined && x.code === origen && x.targetCode === destino))
    if (a && a.processable === true && Number.isInteger(a.requested) && a.requested > 0) {
      enviar.push({ code: l.code, quantity: a.requested })
    }
  }
  return enviar
}

/**
 * Los pares que salieron bien, de lo que devuelve `POST /process`.
 *
 * Una línea hecha puede traer `code` de dos maneras —`ORIGEN>DESTINO` o solo el
 * origen con `targetCode`—, y se reconocen las dos.
 *
 * @param {Array<{ origen: object, destino: object }>} pares
 * @param {Array<{ code: string, targetCode?: string|null, status: string }>} lineas  Las de un grupo.
 */
export function paresHechos(pares, lineas) {
  const hechas = lineas.filter((l) => l.status === 'done')
  return pares.filter(({ origen, destino }) => hechas.some((l) =>
    l.code === `${origen.producto_codigo}>${destino.producto_codigo}`
    || (l.code === origen.producto_codigo && l.targetCode === destino.producto_codigo)))
}
