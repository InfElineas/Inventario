/**
 * El cierre de despachos de TKC: la lógica del workflow, sin red ni HTTP.
 *
 * Un despacho por pasada, el más antiguo (TKC solo habilita el formulario del
 * primero de la cola), pausa entre peticiones, y vuelta a pedir la página para
 * que TKC libere el siguiente. Las dependencias de red entran por `api`, así que
 * se prueba entera sin TKC.
 *
 * Las barreras (poka-yoke), porque cerrar en TKC no se puede deshacer:
 *  · solo los despachos ACTIVOS hasta ayer, nunca los de hoy ni los cerrados;
 *  · uno por pasada, sin saltarse la cola;
 *  · un despacho que falla o se omite no se vuelve a intentar en la misma corrida;
 *  · tres fallos seguidos paran todo: algo pasa en TKC y seguir sería insistir;
 *  · si TKC cambió la estructura de la página, se para y se dice, no se adivina;
 *  · se puede cancelar entre un despacho y el siguiente.
 */

import {
  cerrarDespacho, cierreExitoso, fechaLimite, iniciarSesion, leerDespacho, leerPagina,
  parsearActivos, parsearDespacho, sesionActiva,
} from '../services/tkc/despachos.js'

/** Freno de emergencia: un backlog de más de esto se cierra en varias corridas. */
export const MAX_DESPACHOS = 200
/** Fallos seguidos que paran la corrida. */
export const MAX_FALLOS_SEGUIDOS = 3
/** Lo que TKC aguanta entre peticiones sin quejarse, como en el workflow. */
export const PAUSA_MS = 5000

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

const API = { iniciarSesion, leerPagina, leerDespacho, cerrarDespacho }

/**
 * @param {object} p
 * @param {{ tkcBase: string, tkcUser: string, tkcPass: string }} p.config  Credenciales de quien lo pide.
 * @param {string} p.proveedorId
 * @param {number} [p.maximo]        Cuántos despachos como mucho (los más antiguos).
 * @param {number} [p.pausaMs]
 * @param {Date}   [p.hoy]
 * @param {(fila: object) => void} [p.alFila]   Cada despacho tratado, según se trata.
 * @param {() => boolean} [p.cancelado]
 * @param {typeof API} [p.api]
 * @param {(ms: number) => Promise<void>} [p.esperar]
 * @returns {Promise<{ estado: 'terminado'|'cancelado'|'fallido', error?: string, filas: object[], limite: string }>}
 */
export async function ejecutarCierre({
  config, proveedorId, maximo = MAX_DESPACHOS, pausaMs = PAUSA_MS, hoy = new Date(),
  alFila = () => {}, cancelado = () => false, api = API, esperar = dormir,
}) {
  const limite = fechaLimite(hoy)
  const filas = []
  const excluidos = new Set()
  let seguidos = 0

  const registrar = (fila) => { filas.push(fila); alFila(fila) }
  const parar = (estado, error) => ({ estado, error, filas, limite })

  let cookie
  try {
    cookie = await api.iniciarSesion(config)
  } catch (e) {
    return parar('fallido', `No se pudo iniciar sesión en TKC: ${e.message}`)
  }

  const tope = Math.min(Math.max(1, Math.floor(maximo)), MAX_DESPACHOS)
  for (let pasada = 0; pasada < tope; pasada += 1) {
    if (cancelado()) return parar('cancelado')

    let pagina = await api.leerPagina(config, cookie)
    if (!sesionActiva(pagina)) {
      // La sesión caducó a mitad de la corrida: se inicia una vez más, no en bucle.
      try { cookie = await api.iniciarSesion(config) } catch (e) { return parar('fallido', `La sesión de TKC caducó y no se pudo renovar: ${e.message}`) }
      pagina = await api.leerPagina(config, cookie)
      if (!sesionActiva(pagina)) return parar('fallido', 'TKC no devuelve la página de despachos: la sesión no es válida o la cuenta no tiene acceso a ella.')
    }

    const { estructuraOk, despachos } = parsearActivos(pagina.html, { limite })
    if (!estructuraOk) return parar('fallido', 'No se encuentra la sección de despachos activos: TKC pudo cambiar la página. No se cierra nada a ciegas.')

    const siguiente = despachos.find((d) => !excluidos.has(d.despachoId))
    if (!siguiente) break

    const detalle = await api.leerDespacho(config, cookie, proveedorId, siguiente.despachoId)
    const datos = parsearDespacho(detalle.html, detalle.status)
    const base = { despachoId: siguiente.despachoId, fecha: siguiente.fecha }

    if (datos.omitir) {
      excluidos.add(siguiente.despachoId)
      registrar({ ...base, estado: 'omitido', motivo: datos.motivo })
      await esperar(pausaMs)
      continue
    }

    let respuesta
    try {
      respuesta = await api.cerrarDespacho(config, cookie, siguiente.despachoId, datos.csrf)
    } catch (e) {
      respuesta = { status: 0, error: e.message }
    }

    if (cierreExitoso(respuesta.status)) {
      seguidos = 0
      registrar({ ...base, numInterno: datos.numInterno, numDespacho: datos.numDespacho, estado: 'cerrado' })
    } else {
      seguidos += 1
      excluidos.add(siguiente.despachoId)
      registrar({
        ...base, numInterno: datos.numInterno, numDespacho: datos.numDespacho, estado: 'fallido',
        motivo: respuesta.error ? `No se pudo contactar con TKC: ${respuesta.error}` : `TKC respondió ${respuesta.status}.`,
      })
      if (seguidos >= MAX_FALLOS_SEGUIDOS) return parar('fallido', `${MAX_FALLOS_SEGUIDOS} fallos seguidos: se para para no insistir. Revisa TKC.`)
    }
    await esperar(pausaMs)
  }

  return { estado: 'terminado', filas, limite }
}

/** Cuenta lo que pasó, para el resumen. */
export function resumirFilas(filas) {
  const cuenta = (e) => filas.filter((f) => f.estado === e).length
  return { cerrados: cuenta('cerrado'), omitidos: cuenta('omitido'), fallidos: cuenta('fallido'), total: filas.length }
}
