/**
 * Subir y bajar de tienda, contra la API de elineas-transferencia.
 *
 * Se hace desde aquí y no abriendo su herramienta porque los inventaristas no
 * tienen cuenta en ella —es de cardistas—, y darles una sería peor que llamar
 * a su API.
 *
 * Dos pasos a propósito, como en su pantalla: `planear` analiza y NO escribe;
 * `ejecutar` mueve la existencia. Nunca van encadenados sin que una persona
 * mire el plan en medio.
 *
 * Los dos son trabajos asíncronos: responden 202 con un id y hay que esperar
 * el resultado aparte. `esperarTrabajo` usa la espera larga de su API —la
 * petición se queda colgada hasta que el trabajo avanza— en lugar de sondear:
 * menos peticiones y el resultado llega antes.
 */

const BASE = '/api/tienda'

async function pedir(ruta, opciones = {}) {
  const res = await fetch(`${BASE}${ruta}`, { credentials: 'include', ...opciones })
  const datos = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(datos?.error?.message ?? `Error ${res.status}`)
  }
  return datos
}

const conCuerpo = (cuerpo) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(cuerpo),
})

/**
 * Analiza qué pasaría. No escribe nada en TKC.
 *
 * @param {'subir'|'bajar'} modulo
 * @param {{ almacen: string, lineas: Array<{code: string, quantity: number}>, modo?: string }} datos
 */
export const planearTienda = (modulo, datos) =>
  pedir(`/${modulo}/plan`, conCuerpo(datos))

/**
 * Ejecuta el movimiento. MUEVE EXISTENCIA en TKC.
 *
 * La clave de idempotencia la pone quien llama y debe repetirse en un
 * reintento del mismo envío: es lo que impide bajar dos veces la misma
 * mercancía si la respuesta se pierde por el camino.
 */
export const ejecutarTienda = (modulo, datos) =>
  pedir(`/${modulo}/ejecutar`, conCuerpo(datos))

/**
 * Espera a que el trabajo termine.
 *
 * @param {string} id
 * @param {{ señal?: AbortSignal, maxSegundos?: number }} [opciones]
 */
export async function esperarTrabajo(id, { señal, maxSegundos = 300 } = {}) {
  const limite = Date.now() + maxSegundos * 1000

  for (;;) {
    if (señal?.aborted) throw new Error('Cancelado')
    const trabajo = await pedir(`/trabajo?id=${encodeURIComponent(id)}&wait=20`)
    const estado = trabajo?.status ?? trabajo?.estado

    if (estado && !['running', 'queued', 'pending'].includes(estado)) return trabajo
    if (Date.now() > limite) {
      // Ni se da por bueno ni por fallido: sigue corriendo en su servidor y
      // decirle a la persona que falló la empujaría a repetirlo.
      throw new Error('El trabajo sigue en curso en TKC. Vuelve a consultarlo en unos minutos antes de repetirlo.')
    }
  }
}
