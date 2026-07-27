/**
 * Mapa `idTienda → existencia desglosada` de un almacén, cacheado en el proceso
 * del servidor.
 *
 * Por qué en bloque y no producto a producto: el desglose (física / almacén /
 * tienda) solo lo publica el submayor, y medido contra TKC real una búsqueda
 * individual tarda ~1,1 s mientras que una página de 500 filas tarda ~4,5 s.
 * Llenar las columnas de una página de 50 filas costaría 50 peticiones; recorrer
 * el almacén entero cuesta 19 (9 056 productos en 37 s con concurrencia 3) y
 * deja resueltas TODAS las páginas, la búsqueda y el hover. Los almacenes
 * pequeños caben en una sola petición (31 productos en 0,7 s).
 *
 * El recorrido no bloquea la respuesta HTTP: se espera solo a la PRIMERA página
 * y el resto se rellena en segundo plano, así que el cliente pinta enseguida y
 * va completando mientras sondea. Cada entrada se comparte entre usuarios y se
 * revalida por TTL.
 */

import { fetchSubmayorPage } from './submayor.js'

/** Filas por petición. Medido: 500 filas ≈ 4,5 s; subirlo no acelera TKC. */
const PAGE_SIZE = 500
/** Peticiones simultáneas. TKC es un backend de producción compartido. */
const CONCURRENCY = 3
/** Cuánto se reutiliza un mapa antes de reconstruirlo. */
const TTL_MS = 10 * 60 * 1000
/** Tope de almacenes cacheados a la vez (~175 KB cada uno en el peor caso). */
const MAX_ENTRIES = 8

/** almacen (id TKC) → entrada del caché. */
const cache = new Map()

/** Número o 0: quita HTML y separadores de millares, como el resto de la capa. */
function num(value) {
  if (value === null || value === undefined || value === '') return 0
  const n = Number(String(value).replace(/<[^>]*>/g, '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

function absorb(entry, rows) {
  for (const row of rows ?? []) {
    const id = String(row?.idTienda ?? '').trim()
    if (!id) continue
    entry.map.set(id, {
      fisica: num(row.existencia_fisica),
      enAlmacen: num(row.almacen),
      enTienda: num(row.tienda),
    })
  }
  entry.cargadas = entry.map.size
}

/** Descarta entradas caducadas y, si aún sobran, las más antiguas. */
function prune() {
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (now - entry.ts > TTL_MS && !entry.pendiente) cache.delete(key)
  }
  while (cache.size > MAX_ENTRIES) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0]
    if (!oldest) break
    cache.delete(oldest[0])
  }
}

/**
 * Recorre las páginas que faltan con concurrencia limitada. Se ejecuta en
 * segundo plano: los errores se guardan en la entrada (mapa parcial) en vez de
 * propagarse, para no dejar una promesa rechazada sin dueño.
 */
async function walkRest(config, almacen, entry) {
  const offsets = []
  for (let start = PAGE_SIZE; start < entry.total; start += PAGE_SIZE) offsets.push(start)

  let next = 0
  const worker = async () => {
    while (next < offsets.length) {
      const start = offsets[next++]
      const page = await fetchSubmayorPage(config, { start, length: PAGE_SIZE, almacen })
      absorb(entry, page.data)
    }
  }

  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  } catch (error) {
    // Mapa parcial: las filas ya absorbidas siguen sirviendo.
    entry.error = error instanceof Error ? error.message : String(error)
  } finally {
    entry.listo = true
    entry.pendiente = null
  }
}

/**
 * Entrada viva del caché para un almacén, esperando solo a su primera página.
 *
 * @param {{ tkcBase: string, tkcUser: string, tkcPass: string }} config
 * @param {string} almacen Id TKC del almacén (no la clave de la app).
 * @param {{ refrescar?: boolean }} [options] `refrescar` ignora el TTL y reconstruye.
 */
async function ensureEntry(config, almacen, { refrescar = false } = {}) {
  const cached = cache.get(almacen)
  if (cached && !refrescar) {
    // Una construcción en curso se comparte en vez de duplicarse.
    if (cached.pendiente) return cached
    if (Date.now() - cached.ts < TTL_MS) return cached
  }

  const entry = {
    map: new Map(),
    total: 0,
    cargadas: 0,
    listo: false,
    error: null,
    ts: Date.now(),
    pendiente: null,
  }
  cache.set(almacen, entry)
  prune()

  const first = await fetchSubmayorPage(config, { start: 0, length: PAGE_SIZE, almacen })
  absorb(entry, first.data)
  entry.total = first.recordsTotal ?? entry.map.size

  if (entry.cargadas >= entry.total || (first.data ?? []).length === 0) {
    entry.listo = true
    return entry
  }

  entry.pendiente = walkRest(config, almacen, entry)
  return entry
}

/**
 * Existencias de un almacén, filtradas a los ids pedidos.
 *
 * @param {{ tkcBase: string, tkcUser: string, tkcPass: string }} config
 * @param {{ almacen: string, ids?: string[], refrescar?: boolean }} params
 *        `ids` son `idTienda` (el `idOnline` del listado). Sin `ids` devuelve el
 *        mapa entero, que en un almacén grande son ~9 000 entradas.
 * @returns {Promise<{ existencias: Record<string, {fisica: number, enAlmacen: number, enTienda: number}>,
 *   progreso: { cargadas: number, total: number, listo: boolean, error: string|null } }>}
 */
export async function getExistencias(config, { almacen, ids, refrescar = false }) {
  const entry = await ensureEntry(config, almacen, { refrescar })

  const existencias = {}
  if (Array.isArray(ids) && ids.length > 0) {
    for (const raw of ids) {
      const id = String(raw ?? '').trim()
      const hit = id && entry.map.get(id)
      if (hit) existencias[id] = hit
    }
  } else {
    for (const [id, value] of entry.map) existencias[id] = value
  }

  return {
    existencias,
    progreso: {
      cargadas: entry.cargadas,
      total: entry.total,
      listo: entry.listo,
      error: entry.error,
    },
  }
}

/** Vacía el caché (tests y rotación de credenciales). */
export function resetExistenciasCache() {
  cache.clear()
}
