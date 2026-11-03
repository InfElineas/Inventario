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
const CUERPO_SQL = `
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
         p.precio_costo,
         u.seq                                AS corrida_seq,
         to_char(u.started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS corrida_inicio
    FROM ultima u
    JOIN public.lot_rows l ON l.run_id = u.run_id AND l.warehouse_key = u.warehouse_key
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
 * De QUÉ corrida se lee cada almacén.
 *
 * La vista `lot_rows_latest` toma la última corrida del cron sin más, esté
 * completa o no. Un día la última salió con 15 000 filas en vez de 47 000 y sin
 * el almacén 789 —el mayor—, y Vencimientos se quedó en cero aunque el informe
 * del día anterior estaba entero.
 *
 * Por eso se lee, de cada almacén, **la corrida más reciente que lo trae**: si
 * la de hoy lo omite, se usa la anterior y la pantalla dice de qué día es. Es
 * mejor enseñar lotes de ayer, avisando, que ninguno.
 *
 * Con un almacén se prueba corrida a corrida desde la más reciente, que son
 * pocas; para todos a la vez hay que recorrer las filas.
 */
const CORRIDA_DE_UN_ALMACEN = `
  SELECT $1::text AS warehouse_key, r.id AS run_id, r.seq, r.started_at
    FROM public.lot_runs r
   WHERE EXISTS (SELECT 1 FROM public.lot_rows x WHERE x.run_id = r.id AND x.warehouse_key = $1)
   ORDER BY r.seq DESC
   LIMIT 1`

const CORRIDA_DE_CADA_ALMACEN = `
  SELECT DISTINCT ON (x.warehouse_key) x.warehouse_key, r.id AS run_id, r.seq, r.started_at
    FROM public.lot_rows x
    JOIN public.lot_runs r ON r.id = x.run_id
   ORDER BY x.warehouse_key, r.seq DESC`

/** El SQL de los lotes, para un almacén o para todos. */
export const sqlLotes = (conAlmacen) =>
  `WITH ultima AS (${conAlmacen ? CORRIDA_DE_UN_ALMACEN : CORRIDA_DE_CADA_ALMACEN})\n${CUERPO_SQL}`

/**
 * Las filas de un almacén, guardadas un minuto.
 *
 * La consulta cruza la vista del cron con las correcciones y con el costo del
 * catálogo para cada lote, y la piden a la vez el menú, el panel y la propia
 * pantalla: tres veces lo mismo cada vez que alguien entra. El informe lo
 * refresca un cron, así que un minuto de retraso no se nota. Lo que sí se
 * nota es una corrección recién guardada que no aparece: por eso quien las
 * escribe llama a `olvidarLotes`.
 *
 * Se guarda la promesa, no el resultado: tres peticiones a la vez hacen UNA
 * consulta, no tres. Y lo guardado son las filas crudas: los días y el estado
 * se calculan al leer, contra la fecha de hoy.
 */
const VIDA_CACHE_MS = 60_000
const cacheFilas = new Map()

function filasDe(almacen) {
  const clave = almacen ? String(almacen).trim() : ''
  const guardada = cacheFilas.get(clave)
  if (guardada && Date.now() - guardada.en < VIDA_CACHE_MS) return guardada.promesa

  const promesa = Promise.all([
    query(sqlLotes(Boolean(clave)), [clave || null]),
    // La última corrida que existe, para saber si lo que se lee es de ella.
    query('SELECT MAX(seq) AS ultima FROM public.lot_runs'),
  ]).then(([lotes, ultima]) => ({
    rows: lotes.rows,
    ultimaSeq: Number(ultima.rows[0]?.ultima ?? 0),
  }))
  cacheFilas.set(clave, { en: Date.now(), promesa })
  // Un fallo no se recuerda: el siguiente intento tiene que volver a probar.
  promesa.catch(() => { if (cacheFilas.get(clave)?.promesa === promesa) cacheFilas.delete(clave) })
  return promesa
}

/** Descarta lo guardado: se llama al escribir una corrección de lote. */
export function olvidarLotes() {
  cacheFilas.clear()
}

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
  const { rows, ultimaSeq } = await filasDe(almacen)
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
      // De qué informe sale. Si no es el último, ese almacén no venía en él y se
      // enseña el anterior: la pantalla tiene que decirlo.
      informe_fecha: f.corrida_inicio ?? null,
      informe_actual: f.corrida_seq === undefined || f.corrida_seq === null || Number(f.corrida_seq) === ultimaSeq,
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

/**
 * Cuántos lotes hay en cada estado y los primeros de cada uno.
 *
 * Existe para el panel y el menú. Antes pedían «vencidos, críticos y por
 * vencer» con un tope, y como la lista sale ordenada por lo que vence antes,
 * los vencidos —que van con días negativos— se comían el tope entero: no
 * llegaba ni un crítico, ni un por vencer, y los avisos y los contadores
 * calculaban sobre lo que había cabido. Con un tope por estado y el recuento
 * aparte, cada uno cuenta y se ve por separado.
 *
 * Los que no tienen fecha van por existencia, de más a menos: ordenarlos por
 * días no dice nada, no tienen.
 */
export async function resumenLotes({ almacen, porEstado = 6 } = {}) {
  const todos = await lotesDe({ almacen })

  const conteos = { vencido: 0, critico: 0, por_vencer: 0, vigente: 0, sin_fecha: 0 }
  for (const l of todos) conteos[l.estado_fv] += 1

  const lotes = []
  for (const estado of ['vencido', 'critico', 'por_vencer', 'sin_fecha']) {
    const grupo = todos.filter((l) => l.estado_fv === estado)
    if (estado === 'sin_fecha') grupo.sort((a, b) => b.cantidad - a.cantidad)
    lotes.push(...grupo.slice(0, Math.max(0, porEstado)))
  }
  return { conteos, lotes }
}
