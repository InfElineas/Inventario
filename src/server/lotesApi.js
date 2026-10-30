/**
 * Lotes y fechas de vencimiento, desde el informe central.
 *
 * La pantalla de Vencimientos leía `inventario.lotes`, una tabla que no
 * llenaba nadie: salía vacía desde el primer día. Los lotes los publica ahora
 * la API central en `GET /api/reports/lot-latest`, que es la vista
 * `lot_rows_latest` que mantiene su cron —una fila por almacén, producto y
 * número de lote—.
 *
 * No se copia a una tabla nuestra. Una copia envejece por su cuenta y habría
 * que decidir cada cuánto refrescarla; así lo que se ve es lo que publicó su
 * última corrida, y el estado de vigencia se calcula contra la fecha de hoy
 * en el momento de mirar, que es justo lo que no puede estar precalculado.
 *
 * Va con el JWT de quien usa la web, igual que la rotación: ni cuenta de
 * servicio ni credenciales nuevas.
 */

import { query } from './db.js'
import { baseReportes } from './rotacionApi.js'

const RUTA = '/api/reports/lot-latest'
const POR_PAGINA = 500
/** Tope: 100 000 filas. Más que eso es que algo va mal en el informe. */
const MAX_PAGINAS = 200
const TTL_MS = 30 * 60 * 1000

/**
 * Los mismos cortes que hacía la vista `lotes_vigencia`, para que la pantalla
 * y sus KPI sigan diciendo lo mismo.
 */
export function estadoDeVigencia(dias) {
  if (dias === null) return 'sin_fecha'
  if (dias <= 0) return 'vencido'
  if (dias <= 15) return 'critico'
  if (dias <= 30) return 'por_vencer'
  return 'vigente'
}

/** Días hasta la fecha, contando desde hoy. `null` si no hay fecha legible. */
export function diasHasta(fecha, hoy = new Date()) {
  if (!fecha) return null
  const t = Date.parse(`${String(fecha).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(t)) return null
  const base = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  return Math.round((t - base) / 86400000)
}

/**
 * Su `clasificacion` en el vocabulario que ya usa la pantalla.
 *
 * El informe trae texto libre ('REFRIGERADO', 'Congelado', 'Seco'…). Lo único
 * que la pantalla distingue es frío o no.
 */
export function temperaturaDe(clasificacion) {
  const t = String(clasificacion ?? '').toLowerCase()
  return /refriger|congel|frio|frío|chill|fresc/.test(t) ? 'chilled' : 'ambient'
}

let cache = null        // { filas, ts }
let cargando = null

async function descargar(ctx, base) {
  const filas = []

  for (let page = 1; page <= MAX_PAGINAS; page += 1) {
    const url = new URL(`${base}${RUTA}`)
    url.searchParams.set('page', String(page))
    url.searchParams.set('pageSize', String(POR_PAGINA))
    if (page > 1) url.searchParams.set('withTotal', 'false')

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${ctx.jwt}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    })
    const datos = await res.json().catch(() => null)
    if (!res.ok || !Array.isArray(datos?.data)) {
      throw new Error(datos?.error?.message ?? `El informe de lotes respondió HTTP ${res.status}`)
    }

    filas.push(...datos.data)

    const hayMas = datos.pagination?.hasNextPage ?? (datos.data.length === POR_PAGINA)
    if (!hayMas || datos.data.length === 0) break
  }

  return filas
}

/** El informe entero, compartido entre usuarios y revalidado por TTL. */
async function informe(ctx, refrescar) {
  const base = baseReportes()
  if (!base) {
    throw new Error('Falta REPORTES_API_URL: la API de informes no está configurada.')
  }
  if (!refrescar && cache && Date.now() - cache.ts < TTL_MS) return cache.filas
  // Una descarga en curso se comparte en vez de duplicarse.
  if (!cargando) {
    cargando = descargar(ctx, base)
      .then((filas) => { cache = { filas, ts: Date.now() }; return filas })
      .finally(() => { cargando = null })
  }
  return cargando
}

/** Solo para las pruebas. */
export function _olvidarLotes() {
  cache = null
  cargando = null
}

/**
 * Los lotes de un almacén, en el vocabulario de la pantalla.
 *
 * El precio de costo no viene en el informe y la intervención comercial lo
 * necesita —sin él no se puede calcular el descuento ni la pérdida—, así que
 * se cruza con nuestro catálogo por código.
 *
 * `estados` y `limite` existen para quien solo necesita una parte —el panel
 * pinta cinco lotes críticos, el menú cuenta pendientes— y no tiene por qué
 * descargarse el almacén entero para eso.
 *
 * @param {{ jwt: string }} ctx
 * @param {{ almacen?: string, estados?: string[], limite?: number, refrescar?: boolean }} params
 */
export async function lotesDe(ctx, { almacen, estados, limite, refrescar = false } = {}) {
  const filas = await informe(ctx, refrescar)
  const suyas = almacen
    ? filas.filter((f) => String(f.warehouseKey ?? '').trim() === String(almacen).trim())
    : filas

  const costos = await preciosDe(suyas.map((f) => String(f.codigo ?? '').trim()), almacen)
  const hoy = new Date()

  let lotes = suyas.map((f) => {
    const codigo = String(f.codigo ?? '').trim()
    const noLote = String(f.noLote ?? '').trim()
    const dias = diasHasta(f.fechaVenc, hoy)

    return {
      // El informe no trae id. Almacén, producto y lote identifican la fila y
      // se mantienen entre corridas, así que sirve de clave en React y para
      // apuntar de qué lote salió una intervención comercial.
      id: `${f.warehouseKey ?? ''}|${codigo}|${noLote}`,
      almacen_num: String(f.warehouseKey ?? '').trim(),
      almacen_nombre: f.warehouseName ?? '',
      producto_nombre: f.producto ?? '',
      producto_codigo: codigo,
      suministrador: f.suministrador ?? '',
      no_lote: noLote,
      fecha_fabricacion: f.fechaFab ?? null,
      fecha_vencimiento: f.fechaVenc ? String(f.fechaVenc).slice(0, 10) : null,
      cantidad: Number(f.cantidad) || 0,
      referencia: f.referencia ?? '',
      temperatura: temperaturaDe(f.clasificacion),
      clasificacion: f.clasificacion ?? '',
      vigencia_dias: dias,
      estado_fv: estadoDeVigencia(dias),
      precio_costo: costos.get(codigo) ?? 0,
    }
  })

  if (estados?.length) {
    const quiere = new Set(estados)
    lotes = lotes.filter((l) => quiere.has(l.estado_fv))
  }

  // Lo que vence antes, primero: así un `limite` corta por la cola y no por
  // una fila cualquiera.
  lotes.sort((a, b) => (a.vigencia_dias ?? Infinity) - (b.vigencia_dias ?? Infinity))

  return limite > 0 ? lotes.slice(0, limite) : lotes
}

/** `codigo_producto` → `precio_costo`, de nuestro catálogo. */
async function preciosDe(codigos, almacen) {
  const unicos = [...new Set(codigos.filter(Boolean))]
  if (unicos.length === 0) return new Map()

  const valores = [unicos]
  let sql = `SELECT codigo_producto, MAX(precio_costo) AS precio_costo
               FROM productos
              WHERE codigo_producto = ANY($1)`
  if (almacen) {
    valores.push(String(almacen))
    sql += ` AND almacen_num = $2`
  }
  sql += ' GROUP BY codigo_producto'

  const { rows } = await query(sql, valores)
  return new Map(rows.map((r) => [r.codigo_producto, Number(r.precio_costo) || 0]))
}
