/**
 * Rotación de venta de cada producto, para saber cuánto dura la existencia.
 *
 * Sale del informe `GET /api/reports/rdp-ind-general-diario` de
 * api.mercadoelineas.com: una fila por `idTienda` con las ventas diarias
 * promediadas de varias maneras. Es el mismo número que un script de Google
 * Sheets venía volcando a mano en una hoja de cálculo.
 *
 * Con él, «qué hay que reabastecer» deja de depender de un stock mínimo que
 * nadie rellena —por eso la pantalla salía vacía— y pasa a ser una cuenta:
 * cuántos días aguanta lo que hay al ritmo al que se vende.
 *
 * Va por el JWT de quien está usando la web, como los ajustes: no hace falta
 * una cuenta de servicio y cada quien ve lo que su rol le permite.
 *
 * Se cachea en el proceso porque el informe se recalcula UNA VEZ AL DÍA (su
 * `updatedAt` marca las 11:00). Pedir cincuenta mil filas en cada visita
 * sería gastar minutos para obtener lo mismo.
 */

const RUTA = '/api/reports/rdp-ind-general-diario'

/**
 * Base de elineas-api, que NO es la de transferencias.
 *
 * Son dos aplicaciones distintas en dos contenedores distintos: una sirve
 * transferencias, ajustes y tienda, y la otra los informes. Apuntar el informe
 * a la primera devolvía un 406 —la ruta no existe allí— que desde fuera
 * parecía un problema de permisos.
 */
export function baseReportes() {
  return (process.env.REPORTES_API_URL ?? '').replace(/\/+$/, '')
}

const POR_PAGINA = 500
/** Tope de páginas: 50 000 filas. Más que eso es que algo va mal. */
const MAX_PAGINAS = 100
const TTL_MS = 60 * 60 * 1000

/**
 * De más reciente a más antiguo. Se usa el primero que no sea cero: un
 * producto que no se vendió el último mes pero sí el trimestre pasado tiene
 * rotación, solo que más lenta, y decir que no se vende nunca lo dejaría
 * fuera del reabastecimiento para siempre.
 */
const PROMEDIOS = ['promUlt1Mes', 'promUlt3Mes', 'promUlt6Mes', 'promMayor0', 'promTodos']

/** Sus numéricos llegan como texto desde Postgres. */
function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Ventas diarias de una fila, y de cuál de los promedios salió. */
export function ventaDiaria(fila) {
  for (const clave of PROMEDIOS) {
    const v = num(fila?.[clave])
    if (v > 0) return { diaria: v, segun: clave }
  }
  return { diaria: 0, segun: null }
}

let cache = null        // { mapa, ts }
let cargando = null

async function descargar(ctx, base) {
  const mapa = new Map()

  for (let page = 1; page <= MAX_PAGINAS; page += 1) {
    const url = new URL(`${base}${RUTA}`)
    url.searchParams.set('page', String(page))
    url.searchParams.set('pageSize', String(POR_PAGINA))
    // El total solo hace falta en la primera: desde la segunda se ahorra el
    // count(*), que en su tabla se nota.
    if (page > 1) url.searchParams.set('withTotal', 'false')

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${ctx.jwt}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    })
    const datos = await res.json().catch(() => null)
    if (!res.ok || !Array.isArray(datos?.data)) {
      throw new Error(datos?.error?.message ?? `El informe de rotación respondió HTTP ${res.status}`)
    }

    for (const fila of datos.data) {
      const id = String(fila?.idTienda ?? '').trim()
      if (!id) continue
      const { diaria, segun } = ventaDiaria(fila)
      mapa.set(id, { diaria, segun, ultimaVenta: fila.fechaUltimaVenta ?? null })
    }

    const hayMas = datos.pagination?.hasNextPage ?? (datos.data.length === POR_PAGINA)
    if (!hayMas || datos.data.length === 0) break
  }

  return mapa
}

/**
 * `idTienda` → ventas diarias. Compartido entre usuarios y revalidado por TTL.
 *
 * @param {{ jwt: string }} ctx
 * @param {{ refrescar?: boolean }} [opciones]
 */
export async function rotacion(ctx, { refrescar = false } = {}) {
  const base = baseReportes()
  if (!base) {
    throw new Error('Falta REPORTES_API_URL: la API de informes no está configurada.')
  }
  if (!refrescar && cache && Date.now() - cache.ts < TTL_MS) return cache.mapa
  // Una descarga en curso se comparte en vez de duplicarse: con varias
  // personas entrando a la vez serían cien peticiones por cabeza.
  if (!cargando) {
    cargando = descargar(ctx, base)
      .then((mapa) => { cache = { mapa, ts: Date.now() }; return mapa })
      .finally(() => { cargando = null })
  }
  return cargando
}

/** Solo para las pruebas. */
export function _olvidarRotacion() {
  cache = null
  cargando = null
}
