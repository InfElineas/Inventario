import { supabase } from '@/api/supabaseClient'

/**
 * Descarga TODAS las filas de una tabla superando el límite de 1000 de PostgREST.
 * @param {Function} queryFn - (from: number, to: number) => SupabaseQueryBuilder
 * @param {number} batchSize - filas por página (default 1000)
 */
export async function fetchAllRows(queryFn, batchSize = 1000) {
  const all = []
  let from  = 0
  while (true) {
    const { data, error } = await queryFn(from, from + batchSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < batchSize) break
    from += batchSize
  }
  return all
}

/** Todos los productos activos. Si almacen='', devuelve todos los almacenes. */
export async function fetchAllProductos(almacen, selectFields = '*') {
  return fetchAllRows(
    (from, to) => {
      let q = supabase
        .from('productos')
        .select(selectFields)
        .eq('activo', true)
        .order('nombre', { ascending: true })
        .range(from, to)
      if (almacen) q = q.eq('almacen_num', almacen)
      return q
    }
  )
}
