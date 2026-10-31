/**
 * Lotes y fechas de vencimiento.
 *
 * La pantalla de Vencimientos leía `inventario.lotes`, una tabla que no
 * llenaba nadie: salía vacía desde el primer día. Los lotes los publica el
 * cron central en la vista `lot_rows_latest` —una fila por almacén, producto
 * y número de lote—, que vive en esta misma base.
 *
 * Se lee de ahí directamente y no por la API de informes. La API expone la
 * misma vista, pero pasar por HTTP obligaba a paginar de quinientas en
 * quinientas, a cachear el resultado entero en el proceso y a llevar el JWT
 * de quien mira; con SQL se cruza de una vez con las correcciones de
 * inventario y con el costo del catálogo, y lo que se ve siempre es la última
 * corrida.
 *
 * Nada se copia a una tabla nuestra. El estado de vigencia se calcula contra
 * la fecha de hoy en el momento de mirar, que es justo lo que no puede estar
 * precalculado.
 */

import { query } from './db.js'

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

/**
 * Las fechas se piden ya formateadas y no como `timestamp`.
 *
 * `fecha_venc` es un timestamp sin zona: node-pg lo convierte a un Date en la
 * hora local del servidor, y pasarlo a ISO ahí puede restarle un día. Un lote
 * que vence el 1 de mayo no vence el 30 de abril porque el contenedor esté en
 * Caracas.
 */
const SQL = `
  SELECT l.id                                 AS fila_id,
         l.warehouse_key                      AS almacen_num,
         l.warehouse_name                     AS almacen_nombre,
         l.clasificacion,
         l.producto,
         l.codigo,
         l.suministrador,
         COALESCE(l.no_lote, '')              AS no_lote,
         to_char(l.fecha_fab,  'YYYY-MM-DD')  AS fecha_fab,
         to_char(l.fecha_venc, 'YYYY-MM-DD')  AS fecha_venc,
         l.cantidad,
         l.referencia,
         to_char(r.fecha_vencimiento, 'YYYY-MM-DD') AS rev_fecha,
         r.nota                               AS rev_nota,
         r.revisado_por                       AS rev_por,
         p.precio_costo
    FROM lot_rows_latest l
    -- La última corrección de inventario sobre este lote, si la hay. Cada
    -- corrección es una fila nueva; gana la más reciente.
    LEFT JOIN LATERAL (
      SELECT rv.fecha_vencimiento, rv.nota, rv.revisado_por
        FROM lote_revisiones rv
       WHERE rv.almacen_num     = l.warehouse_key
         AND rv.producto_codigo = l.codigo
         AND rv.no_lote         = COALESCE(l.no_lote, '')
       ORDER BY rv.created_date DESC
       LIMIT 1
    ) r ON true
    -- El costo no viene en el informe y la intervención comercial lo
    -- necesita: sin él no hay descuento ni pérdida que calcular.
    LEFT JOIN LATERAL (
      SELECT MAX(pp.precio_costo) AS precio_costo
        FROM productos pp
       WHERE pp.codigo_producto = l.codigo
         AND ($1::text IS NULL OR pp.almacen_num = $1)
    ) p ON true
   WHERE ($1::text IS NULL OR l.warehouse_key = $1)
     -- Un lote sin existencia no es una tarea: ya no hay nada que rebajar ni
     -- que devolver. Eran más de la mitad de las filas y tapaban los pocos
     -- que de verdad están por vencer.
     AND l.cantidad > 0
`

/**
 * Los lotes de un almacén, en el vocabulario de la pantalla.
 *
 * `estados` y `limite` existen para quien solo necesita una parte —el panel
 * pinta unos pocos críticos, el menú cuenta pendientes— y no tiene por qué
 * traerse el almacén entero para eso.
 *
 * @param {{ almacen?: string, estados?: string[], limite?: number }} params
 */
export async function lotesDe({ almacen, estados, limite } = {}) {
  const { rows } = await query(SQL, [almacen ? String(almacen).trim() : null])
  const hoy = new Date()

  let lotes = rows.map((f) => {
    // Lo que inventario corrigió pisa al informe: la fecha falta a menudo en
    // el origen y es la que hace que el lote se pueda gestionar.
    const vence = f.rev_fecha ?? f.fecha_venc ?? null
    const dias = diasHasta(vence, hoy)

    return {
      // El id de la fila de la vista. Hace falta uno PROPIO DE LA FILA
      // porque el mismo producto y lote aparecen varias veces en un almacén
      // —cada una con su cantidad—, y con la clave compuesta React recibía
      // claves repetidas: reutilizaba nodos y al filtrar seguían viéndose
      // las filas de antes, como si el filtro no hiciera nada.
      id: f.fila_id,
      // Lo que identifica al LOTE, no a la fila: con esto se enlazan las
      // revisiones y los casos de intervención comercial, y se mantiene
      // entre corridas (el id de arriba no).
      clave: `${f.almacen_num ?? ''}|${f.codigo ?? ''}|${f.no_lote ?? ''}`,
      almacen_num: f.almacen_num ?? '',
      almacen_nombre: f.almacen_nombre ?? '',
      producto_nombre: f.producto ?? '',
      producto_codigo: f.codigo ?? '',
      suministrador: f.suministrador ?? '',
      no_lote: f.no_lote ?? '',
      fecha_fabricacion: f.fecha_fab,
      fecha_vencimiento: vence,
      // De dónde salió la fecha: sin esto nadie distingue la que publicó el
      // informe de la que alguien leyó del envase.
      fecha_corregida: Boolean(f.rev_fecha),
      nota_revision: f.rev_nota ?? '',
      revisado_por: f.rev_por ?? '',
      cantidad: Number(f.cantidad) || 0,
      referencia: f.referencia ?? '',
      temperatura: temperaturaDe(f.clasificacion),
      clasificacion: f.clasificacion ?? '',
      vigencia_dias: dias,
      estado_fv: estadoDeVigencia(dias),
      precio_costo: Number(f.precio_costo) || 0,
    }
  })

  if (estados?.length) {
    const quiere = new Set(estados)
    lotes = lotes.filter((l) => quiere.has(l.estado_fv))
  }

  // Lo que vence antes, primero, y lo que no tiene fecha al final: así un
  // `limite` corta por la cola y no se lleva por delante lo urgente.
  lotes.sort((a, b) => (a.vigencia_dias ?? Infinity) - (b.vigencia_dias ?? Infinity))

  return limite > 0 ? lotes.slice(0, limite) : lotes
}
