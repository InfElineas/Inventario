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

import { query } from './db.js'

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
 * El índice: ventas diarias contando SOLO los días en que hubo venta.
 *
 * El informe trae una docena de promedios y hasta ahora se cogía el primero
 * que no fuera cero, empezando por el del último mes. Eso mezclaba criterios
 * de una fila a otra —uno salía del último mes, otro del semestre— y hacía
 * que dos productos con la misma demanda dieran mínimos distintos según
 * cuándo se hubieran vendido.
 *
 * `promMayor0` es «promedio de ventas diario > 0»: reparte lo vendido entre
 * los días en que se vendió algo, no entre todos los del calendario. Esa es
 * la medida que pedimos, porque un día sin existencia vende cero y meterlo en
 * el promedio hace parecer que el producto se vende menos de lo que la gente
 * pide. Lo que se quiere saber es a qué ritmo sale cuando SE PUEDE vender.
 *
 * Tiene un sesgo que conviene conocer: un día en que el producto estaba
 * disponible y simplemente nadie lo compró también queda fuera, así que el
 * ritmo sale algo alto y el mínimo, algo generoso. Es el lado correcto por el
 * que equivocarse —se queda uno corto de mercancía menos veces— pero no es
 * neutro, y el informe no publica los días de disponibilidad reales, que es
 * lo único que lo arreglaría del todo.
 */
const INDICE = 'promMayor0'

/**
 * Un índice de hace años no es rotación: es historia.
 *
 * `promMayor0` promedia toda la vida del producto. Sin este corte, algo que
 * se vendía bien en 2024 y no se vende desde entonces seguiría pidiendo
 * reposición para siempre, con un ritmo que ya no existe.
 */
const DIAS_SIN_VENDER_MAX = 90

/** Sus numéricos llegan como texto desde Postgres. */
function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Días desde la última venta, o `null` si nunca se vendió o no consta. */
export function diasSinVender(fecha, ahora = Date.now()) {
  if (!fecha) return null
  const t = new Date(fecha).getTime()
  if (!Number.isFinite(t)) return null
  return Math.floor((ahora - t) / 86400000)
}

/**
 * Ventas diarias de una fila, y de cuál de los promedios salió.
 *
 * Devuelve 0 cuando el producto no se vende o lleva demasiado sin venderse:
 * en los dos casos no hay nada que reponer.
 */
export function ventaDiaria(fila, ahora = Date.now()) {
  const diaria = num(fila?.[INDICE])
  if (diaria <= 0) return { diaria: 0, segun: null }

  const dias = diasSinVender(fila?.fechaUltimaVenta, ahora)
  if (dias !== null && dias > DIAS_SIN_VENDER_MAX) {
    return { diaria: 0, segun: null, paradoHace: dias }
  }
  return { diaria, segun: INDICE }
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

/**
 * Qué hay que reponer en un almacén, ya cruzado con las existencias.
 *
 * Se calcula aquí y no en el navegador por una razón de corrección, no de
 * velocidad: la API de datos devuelve 2 000 filas como mucho, y un almacén
 * tiene veinte mil productos. Al pedir las 2 000 con más existencia se caían
 * justo las de existencia cero, que son las urgentes. Aquí se recorre la
 * tabla entera.
 *
 * Lo que no se vende no sale: no es que falte, es que no rota. Lo que no
 * tiene id de tienda tampoco, porque el informe va por ese id.
 *
 * @param {{ jwt: string }} ctx
 * @param {{ almacen: string, dias: number, refrescar?: boolean }} params
 */
export async function cobertura(ctx, { almacen, dias, refrescar = false }) {
  const mapa = await rotacion(ctx, { refrescar })

  const { rows } = await query(
    `SELECT id, nombre, codigo_producto, id_tienda, suministrador,
            COALESCE(exist_fisica, 0) AS exist_fisica,
            COALESCE(almacen, 0) AS almacen, COALESCE(tienda, 0) AS tienda,
            estado_tienda, prioridad_tienda, estado_anuncio_tkc
       FROM productos
      WHERE activo AND almacen_num = $1 AND id_tienda IS NOT NULL AND btrim(id_tienda) <> ''`,
    [String(almacen)],
  )

  const filas = []
  for (const p of rows) {
    const r = mapa.get(String(p.id_tienda).trim())
    const diaria = r?.diaria ?? 0
    if (!diaria) continue

    const existencia = Number(p.exist_fisica) || 0
    const minimo = Math.ceil(diaria * dias)
    const faltan = Math.max(0, minimo - existencia)
    if (faltan === 0) continue

    filas.push({
      id: p.id,
      nombre: p.nombre,
      codigo: p.codigo_producto,
      idTienda: p.id_tienda,
      suministrador: p.suministrador ?? '',
      existencia,
      enAlmacen: Number(p.almacen) || 0,
      enTienda: Number(p.tienda) || 0,
      estadoTienda: p.estado_tienda ?? 'SIN DATOS',
      // Comprar para un anuncio muerto o desactivado no tiene sentido, pero
      // esconderlo tampoco: puede ser justo el que conviene reactivar. Se
      // devuelve y la pantalla decide.
      estadoAnuncio: p.estado_anuncio_tkc ?? '',
      diaria,
      segun: r.segun,
      ultimaVenta: r.ultimaVenta,
      // Cuántos días aguanta lo que hay al ritmo al que se vende.
      cobertura: existencia / diaria,
      minimo,
      faltan,
    })
  }

  // Lo que menos aguanta, primero: es el orden en que hay que comprar.
  filas.sort((a, b) => a.cobertura - b.cobertura)
  return filas
}
