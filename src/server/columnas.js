/**
 * Columnas reales de cada tabla, leídas del catálogo de Postgres.
 *
 * Con Supabase, PostgREST validaba los nombres de columna por nosotros. Ahora
 * el SQL lo construye este servidor, así que cualquier nombre que venga del
 * cliente —una condición de filtro, una columna a escribir— es un identificador
 * que acabaría dentro de la consulta. Los identificadores no se pueden
 * parametrizar como los valores, así que la única defensa es comprobarlos
 * contra las columnas que la tabla tiene de verdad.
 */

import { query } from './db.js'

const cache = new Map()

/** Nombres de columna de una tabla del esquema `inventario`. */
export async function columnasDe(tabla) {
  if (cache.has(tabla)) return cache.get(tabla)

  const { rows } = await query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'inventario' AND table_name = $1`,
    [tabla],
  )

  const set = new Set(rows.map((r) => r.column_name))
  if (set.size === 0) throw new Error(`Tabla desconocida: ${tabla}`)

  cache.set(tabla, set)
  return set
}

/**
 * Comprueba un identificador y lo devuelve entrecomillado para la consulta.
 * @throws si la columna no existe en esa tabla
 */
export async function columnaSegura(tabla, nombre) {
  const columnas = await columnasDe(tabla)
  if (!columnas.has(nombre)) {
    throw new Error(`Columna desconocida en ${tabla}: ${nombre}`)
  }
  return `"${nombre}"`
}

/** Filtra un objeto dejando solo las claves que son columnas de la tabla. */
export async function soloColumnas(tabla, datos) {
  const columnas = await columnasDe(tabla)
  const salida = {}
  for (const [clave, valor] of Object.entries(datos ?? {})) {
    if (columnas.has(clave)) salida[clave] = valor
  }
  return salida
}

/** Solo para las pruebas. */
export function _limpiarCache() {
  cache.clear()
}
