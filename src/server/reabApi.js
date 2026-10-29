/**
 * Cliente de la API de reabastecimiento (`apireab.mercadoelineas.com`).
 *
 * De ahí salen los pedidos de compra —lo que viene en camino— y el índice de
 * ventas, que es lo que permite decir cuántos días de cobertura queda de un
 * producto en vez de comparar contra un stock mínimo que nadie rellena.
 *
 * Se habla desde el servidor y no desde el navegador por lo de siempre: las
 * credenciales de servicio no pueden viajar al cliente, y así la sesión se
 * comparte entre todos los usuarios en vez de abrir una por persona.
 *
 * Autenticación propia, distinta de la del inventario: su `/auth/login`
 * devuelve un JWT del mismo identity server pero para el sistema
 * `reabastecimiento`, donde esta cuenta tiene su rol. El token se guarda en
 * memoria y se renueva solo cuando caduca.
 */

const SYSTEM_SLUG = 'reabastecimiento'
/** Margen antes de que caduque, para no usar un token que expira en vuelo. */
const MARGEN_MS = 60 * 1000

export function configReab() {
  const base = (process.env.REAB_API_URL ?? '').replace(/\/+$/, '')
  return {
    base,
    email: process.env.REAB_USER ?? '',
    password: process.env.REAB_PASS ?? '',
    configurada: Boolean(base && process.env.REAB_USER && process.env.REAB_PASS),
  }
}

// Sesión compartida por el proceso, con candado para no lanzar varios logins
// en paralelo cuando llegan peticiones a la vez.
let sesion = null        // { token, expira }
let entrando = null

async function cuerpo(res) {
  const datos = await res.json().catch(() => null)
  return datos
}

async function entrar(cfg) {
  const res = await fetch(`${cfg.base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: cfg.email,
      password: cfg.password,
      system_slug: SYSTEM_SLUG,
      remember_me: false,
    }),
  })

  const datos = await cuerpo(res)
  if (!res.ok || !datos?.success) {
    throw new Error(
      `La API de reabastecimiento no aceptó las credenciales: ${datos?.error?.message ?? `HTTP ${res.status}`}`,
    )
  }

  const d = datos.data ?? {}
  const token = d.access_token ?? d.accessToken ?? d.token
  if (!token) throw new Error('La API de reabastecimiento no devolvió un token de acceso.')

  // `expires_in` viene en segundos cuando viene; si no, una hora, que es lo
  // habitual. Un token caducado se detecta igual por el 401 y se renueva.
  const segundos = Number(d.expires_in ?? d.expiresIn ?? 3600)
  return { token, expira: Date.now() + segundos * 1000 - MARGEN_MS }
}

async function token(cfg, forzar = false) {
  if (!forzar && sesion && Date.now() < sesion.expira) return sesion.token
  if (!entrando) {
    entrando = entrar(cfg)
      .then((s) => { sesion = s; return s.token })
      .finally(() => { entrando = null })
  }
  return entrando
}

/** Solo para las pruebas: olvida la sesión cacheada. */
export function _olvidarSesion() {
  sesion = null
  entrando = null
}

/**
 * GET autenticado, con un reintento si el token había caducado.
 *
 * @param {string} ruta      Sin `/api/v1` delante: 'sales-index', 'purchase-orders'…
 * @param {object} [consulta] Parámetros; los `undefined` no se mandan.
 * @returns {Promise<{ datos: any[], paginacion: object|null }>}
 */
export async function pedirReab(ruta, consulta = {}) {
  const cfg = configReab()
  if (!cfg.configurada) {
    throw new Error('Falta REAB_API_URL, REAB_USER o REAB_PASS: la API de reabastecimiento no está configurada.')
  }

  const url = new URL(`${cfg.base}/api/v1/${ruta}`)
  for (const [k, v] of Object.entries(consulta)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }

  const llamar = async (t) => fetch(url, { headers: { Authorization: `Bearer ${t}` } })

  let res = await llamar(await token(cfg))
  if (res.status === 401) res = await llamar(await token(cfg, true))

  const datos = await cuerpo(res)
  if (!res.ok || !datos?.success) {
    throw new Error(
      `Reabastecimiento ${ruta}: ${datos?.error?.message ?? `HTTP ${res.status}`}`,
    )
  }

  return {
    datos: Array.isArray(datos.data) ? datos.data : (datos.data ? [datos.data] : []),
    paginacion: datos.pagination ?? null,
  }
}

/**
 * Todas las páginas de un listado.
 *
 * `count=none` ahorra el COUNT(*) —que en sus tablas grandes se nota— a cambio
 * de no saber el total: se para cuando una página viene incompleta.
 */
export async function pedirTodoReab(ruta, consulta = {}, { porPagina = 200, maxPaginas = 50 } = {}) {
  const todo = []
  for (let page = 1; page <= maxPaginas; page += 1) {
    const { datos } = await pedirReab(ruta, { ...consulta, page, pageSize: porPagina, count: 'none' })
    todo.push(...datos)
    if (datos.length < porPagina) break
  }
  return todo
}
