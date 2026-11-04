/**
 * Despachos de proveedor de TKC: leer los activos y cerrarlos.
 *
 * Portado del workflow de n8n «Cierre despachos TKC». Solo corre en el servidor
 * (maneja cookies y CSRF) y con las credenciales de QUIEN lo pide.
 *
 * Cómo trabaja TKC, tal como lo reproduce el workflow:
 *
 *  · La página `/admin/shop-provider-dispatch/` tiene dos secciones: «Despachos
 *    Activos» (`#scrollableDespachos`) y «Cerrados» (`#scrollableDespachosCerrados`).
 *    Los activos van agrupados por día (`id="heading2026-07-01"`) y cada uno es un
 *    elemento `despacho_item` con su `data-id`.
 *  · Es una COLA POR PROVEEDOR: solo el despacho más antiguo pendiente trae el
 *    formulario de cierre. Pedir varios a la vez devuelve 200 sin formulario en
 *    todos menos el primero, y eso no significa «ya cerrado». Por eso se cierra
 *    UNO por pasada y se vuelve a pedir la página para que TKC libere el siguiente.
 *  · Cerrar es `POST despacho-submit/{id}` con el token del formulario. Éxito es un
 *    302 (redirige) o un 200.
 *  · Un despacho con «Productos a despachar x/y» incompleto no se puede cerrar: hay
 *    que confirmar los productos que faltan en TKC.
 *
 * Los analizadores son funciones puras, para probarlos sin red.
 */

import { login } from './auth.js'

export const RUTA_DESPACHOS = '/admin/shop-provider-dispatch/'
/** Los despachos de hoy no se cierran: el día no ha terminado. Hasta ayer. */
export const DIAS_MARGEN = 1

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

const aIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** El último día cuyos despachos se pueden cerrar: hoy menos el margen, en hora local. */
export function fechaLimite(hoy = new Date(), margen = DIAS_MARGEN) {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - margen)
  return aIso(d)
}

/**
 * ¿Es la página de despachos, o TKC nos devolvió otra cosa (el login, un error)?
 * La sesión caducada redirige al login y la página ya no dice «Despachos Activos».
 */
export const sesionActiva = ({ status, html }) => status === 200 && String(html ?? '').includes('Despachos Activos')

/**
 * Los despachos ACTIVOS que se pueden cerrar, del más antiguo al más nuevo.
 *
 * Aísla la sección de activos —nunca la de cerrados— y se queda con los de fecha
 * hasta `limite` incluida.
 *
 * @param {string} html
 * @param {{ limite: string }} opciones  `AAAA-MM-DD`.
 * @returns {{ estructuraOk: boolean, despachos: Array<{ despachoId: string, fecha: string }> }}
 *   `estructuraOk: false` si no se encuentra la sección de activos: TKC pudo
 *   cambiar la página, y seguir adelante sería adivinar.
 */
export function parsearActivos(html, { limite }) {
  const pagina = String(html ?? '')
  const inicioActivos = pagina.indexOf('id="scrollableDespachos"')
  const inicioCerrados = pagina.indexOf('id="scrollableDespachosCerrados"')
  if (inicioActivos === -1) return { estructuraOk: false, despachos: [] }

  const finActivos = inicioCerrados > inicioActivos ? inicioCerrados : pagina.length
  const activos = pagina.slice(inicioActivos, finActivos)

  const bloques = [...activos.matchAll(/id="heading(\d{4}-\d{2}-\d{2})"/g)]
  const despachos = []
  bloques.forEach((b, i) => {
    const fecha = b[1]
    if (fecha > limite) return
    const fin = i + 1 < bloques.length ? bloques[i + 1].index : activos.length
    const bloque = activos.slice(b.index, fin)
    const re = /class="[^"]*kt-widget4__item[^"]*despacho_item[^"]*"[^>]*data-id="(\d+)"/g
    let m
    while ((m = re.exec(bloque)) !== null) despachos.push({ despachoId: m[1], fecha })
  })

  const vistos = new Set()
  const unicos = despachos.filter((d) => {
    if (vistos.has(d.despachoId)) return false
    vistos.add(d.despachoId)
    return true
  })
  unicos.sort((a, b) => a.fecha.localeCompare(b.fecha) || Number(a.despachoId) - Number(b.despachoId))
  return { estructuraOk: true, despachos: unicos }
}

const PATRONES_CSRF = [
  /name="form\[_token\]"\s+value="([^"]+)"/,
  /value="([^"]+)"\s+name="form\[_token\]"/,
  /id="form__token"[^>]+value="([^"]+)"/,
  /form\[_token\][^>]+value="([^"]+)"/,
]

/**
 * Lo que dice la página de UN despacho: si tiene formulario de cierre y su token.
 *
 * @param {string} html
 * @param {number} status
 * @returns {{ omitir: true, motivo: string } | { omitir: false, csrf: string, numInterno: string, numDespacho: string }}
 */
export function parsearDespacho(html, status) {
  if (status !== 200) return { omitir: true, motivo: `TKC respondió ${status} al pedir el despacho.` }
  const pagina = String(html ?? '')

  let csrf = null
  for (const p of PATRONES_CSRF) {
    const m = pagina.match(p)
    if (m) { csrf = m[1]; break }
  }

  if (!csrf) {
    const incompleto = pagina.match(/Productos a despachar\s*(\d+)\s*\/\s*(\d+)/)
    if (incompleto && incompleto[1] !== incompleto[2]) {
      return {
        omitir: true,
        motivo: `Incompleto: faltan productos por confirmar (${incompleto[1]} de ${incompleto[2]}). Hay que confirmarlos en TKC.`,
      }
    }
    return { omitir: true, motivo: 'Sin formulario de cierre: ya está cerrado, o TKC aún no lo habilita (no es el más antiguo).' }
  }

  const titulo = pagina.match(/#(\d+)\s*-\s*Despacho\s*#(\d+)/)
  return { omitir: false, csrf, numInterno: titulo ? titulo[1] : '?', numDespacho: titulo ? titulo[2] : '?' }
}

/** ¿Cerró? TKC contesta con un 302 (redirige) o un 200. */
export const cierreExitoso = (status) => status === 302 || status === 200

// ── Red ──────────────────────────────────────────────────────────────

/** Inicia sesión en TKC con las credenciales de quien lo pide. Devuelve la cookie. */
export const iniciarSesion = (config) => login(config)

const cabeceras = (config, cookie, extra = {}) => ({
  Cookie: cookie,
  'User-Agent': USER_AGENT,
  Referer: `${config.tkcBase}${RUTA_DESPACHOS}`,
  ...extra,
})

/** La página de despachos. */
export async function leerPagina(config, cookie) {
  const res = await fetch(`${config.tkcBase}${RUTA_DESPACHOS}`, {
    headers: cabeceras(config, cookie, { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }),
    redirect: 'manual',
  })
  return { status: res.status, html: res.status === 200 ? await res.text() : '' }
}

/** Los datos de un despacho: aquí viene el formulario de cierre, si está habilitado. */
export async function leerDespacho(config, cookie, proveedorId, despachoId) {
  const res = await fetch(
    `${config.tkcBase}${RUTA_DESPACHOS}despacho-data/${encodeURIComponent(proveedorId)}/${encodeURIComponent(despachoId)}`,
    { headers: cabeceras(config, cookie, { Accept: 'text/html, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' }), redirect: 'manual' },
  )
  return { status: res.status, html: await res.text() }
}

/** Cierra el despacho en TKC. **No se puede deshacer.** */
export async function cerrarDespacho(config, cookie, despachoId, csrf) {
  const res = await fetch(`${config.tkcBase}${RUTA_DESPACHOS}despacho-submit/${encodeURIComponent(despachoId)}`, {
    method: 'POST',
    headers: cabeceras(config, cookie, {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: new URL(config.tkcBase).origin,
      'Upgrade-Insecure-Requests': '1',
    }),
    body: `form%5B_token%5D=${encodeURIComponent(csrf)}`,
    redirect: 'manual',
  })
  return { status: res.status }
}
