/**
 * Historial de movimientos de un producto en el submayor de TKC.
 *
 * Es lo que TKC enseña al pulsar «Submayor» en el menú de una fila: cada
 * entrada y salida con su documento, su saldo antes y después, y quién la
 * hizo. Responde a la pregunta que más se repite cuando una existencia no
 * cuadra — «¿y esto por qué bajó?» —, que ni el listado ni nuestra copia
 * pueden contestar.
 *
 * Dos detalles de su API que condicionan todo esto:
 *
 *  - La ruta lleva el `id` de la FILA DEL SUBMAYOR, no el id de tienda. Son
 *    números distintos para el mismo producto (141831 vs 141473), así que hay
 *    que buscar la fila primero. Son dos peticiones, no una.
 *  - La respuesta es HTML, un trozo de modal con una tabla, no JSON. Se
 *    extraen las celdas tal cual: no hay nada mejor disponible.
 */

import { tkcGetHtml } from './client.js'
import { fetchSubmayorPage, pickRow } from './submayor.js'

const REFERER = '/reportes/update/submayor/inventario'

/** Las columnas de su tabla, en orden. */
const COLUMNAS = [
  'fecha', 'fechaValor', 'documento', 'saldoInicial',
  'entrada', 'salida', 'saldoFinal', 'usuario', 'confirmacion',
]

/** Quita etiquetas y normaliza los espacios de una celda. */
function texto(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Número o null: una celda vacía significa «no hubo», no «cero». */
function cifra(valor) {
  if (valor === '') return null
  const n = Number(valor.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * Saca las filas de la tabla del HTML.
 *
 * Con expresiones regulares y no con un analizador de HTML: es una tabla
 * generada por ellos, sin celdas anidadas, y añadir una dependencia para esto
 * costaría más de lo que resuelve. Si algún día meten etiquetas dentro de las
 * celdas, `texto()` las quita.
 *
 * @returns {Array<{fecha, fechaValor, documento, saldoInicial, entrada, salida, saldoFinal, usuario, confirmacion}>}
 */
export function parsearHistorial(html) {
  const cuerpo = String(html ?? '').match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)
  if (!cuerpo) return []

  const filas = []
  for (const tr of cuerpo[1].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
    const celdas = (tr.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? []).map(texto)
    if (celdas.length < COLUMNAS.length) continue

    const fila = {}
    COLUMNAS.forEach((col, i) => { fila[col] = celdas[i] ?? '' })
    fila.saldoInicial = cifra(fila.saldoInicial)
    fila.saldoFinal = cifra(fila.saldoFinal)
    fila.entrada = cifra(fila.entrada)
    fila.salida = cifra(fila.salida)
    filas.push(fila)
  }
  return filas
}

/** El título del modal trae el nombre y los dos identificadores. */
export function parsearCabecera(html) {
  const titulo = String(html ?? '').match(/<h5[^>]*>([\s\S]*?)<\/h5>/i)
  return titulo ? texto(titulo[1]) : ''
}

/**
 * Historial de un producto entre dos fechas.
 *
 * @param {{ tkcBase: string, tkcUser: string, tkcPass: string }} config
 * @param {{ idTienda: string, almacen: string, desde: string, hasta: string }} params
 *        `almacen` es el id TKC; las fechas, `YYYY-MM-DD`.
 * @returns {Promise<{ encontrado: boolean, titulo: string, movimientos: object[] }>}
 */
export async function fetchHistorial(config, { idTienda, almacen, desde, hasta }) {
  const buscado = String(idTienda ?? '').trim()
  if (!buscado || !almacen) return { encontrado: false, titulo: '', movimientos: [] }

  // Primero la fila, porque la ruta del historial quiere SU id, no el de
  // tienda. La búsqueda de TKC es un «contiene», de ahí `pickRow`.
  const pagina = await fetchSubmayorPage(config, {
    start: 0, length: 25, search: buscado, almacen, soloConExistencia: false,
  })
  const fila = pickRow(pagina?.data, buscado)
  if (!fila?.id) return { encontrado: false, titulo: '', movimientos: [] }

  const html = await tkcGetHtml(config, {
    path: `/reportes/update/submayor/${encodeURIComponent(fila.id)}/${desde}/${hasta}/historial`,
    referer: REFERER,
    label: 'historial de submayor',
  })

  return {
    encontrado: true,
    titulo: parsearCabecera(html),
    movimientos: parsearHistorial(html),
  }
}
