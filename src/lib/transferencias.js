import { interpretar } from '@/lib/ajustes'

/**
 * Transferencias entre almacenes de facturación (API de elineas-transferencia,
 * `/api/v1/transfers`). Lógica pura: sin red ni React.
 *
 * Montar crea el documento en «editada» y no mueve nada; confirmarlo lo pasa a
 * «en tránsito»; cancelarlo lo anula mientras es un borrador. Las líneas son
 * `CODIGO*CANTIDAD`, igual que en los ajustes (`parseLineas` de `lib/ajustes.js`).
 */

export { ROLES_AJUSTES as ROLES_TRANSFERENCIAS, parseLineas, nuevaClave, mensajeDeError } from '@/lib/ajustes'

/** La clasificación de un conteo que se resuelve con una transferencia. */
export const esDeTransferencia = (conteo) => /transferencia/i.test(String(conteo?.clasif_ajuste ?? ''))

/** Lo que dice el estado que TKC da a un documento, sin importar mayúsculas. */
const estadoDe = (e) => String(e ?? '').trim().toLowerCase()

/** Solo un borrador («editada») se confirma o se cancela. */
export const esBorrador = (estado) => estadoDe(estado) === 'editada'

/** Los estados que se pueden filtrar. Los demás los pone TKC y se ven en la lista. */
export const ESTADOS_TRANSFERENCIA = [
  { valor: '', label: 'Todos los estados' },
  { valor: 'editada', label: 'Editada (borrador)' },
  { valor: 'en tránsito', label: 'En tránsito' },
  { valor: 'recibida', label: 'Recibida' },
  { valor: 'cancelada', label: 'Cancelada' },
]

/** De dónde mira la lista el almacén elegido: lo que sale de él o lo que le llega. */
export const SENTIDOS = [
  { valor: 'salidas', label: 'Salen de este almacén' },
  { valor: 'entradas', label: 'Llegan a este almacén' },
]

/** Los filtros de la lista, como los entiende `listarTransferencias`. Lo vacío no se manda. */
export function filtrosDeTransferencias({ almacen, sentido, desde, hasta, status, q }) {
  const f = {}
  if (almacen) f[sentido === 'entradas' ? 'destino' : 'origen'] = almacen
  if (desde) f.from = desde
  if (hasta) f.to = hasta
  if (status) f.status = status
  if (q && q.trim()) f.q = q.trim()
  return f
}

/**
 * Qué significa la respuesta de la API para la pantalla. Lo que no es propio de
 * las transferencias lo decide `interpretar` de los ajustes: `creado`,
 * `confirmado`, `rechazado`, `fallo`, `sin_verificar` y `error`.
 *
 * Una transferencia montada trae su documento en `draft` (los ajustes, en
 * `document`), y cancelar contesta `cancelled`.
 */
export function interpretarTransferencia(status, body) {
  if (body?.status === 'cancelled') return { tipo: 'cancelado', mensaje: body.message }
  const r = interpretar(status, body)
  if (r.tipo !== 'creado') return r
  const doc = body.draft ?? body.document ?? null
  const documento = doc && typeof doc === 'object' ? doc : doc ? { id: doc } : null
  return { ...r, documento }
}

// TKC no fija un nombre único para los extremos: se aceptan los habituales.
export const origenDe = (f) => f?.originName ?? f?.origin ?? f?.warehouse ?? ''
export const destinoDe = (f) => f?.destinationName ?? f?.destination ?? ''

/** El historial, en CSV. Sin el BOM: lo pone quien lo descarga. */
export function transferenciasACsv(filas, celda) {
  const cabecera = ['Documento', 'Estado', 'Fecha', 'Origen', 'Destino', 'Observaciones']
  const cuerpo = filas.map((f) => [
    f.code, f.status, f.date, origenDe(f), destinoDe(f), f.notes ?? f.observations,
  ].map(celda).join(','))
  return [cabecera.map(celda).join(','), ...cuerpo].join('\n')
}
