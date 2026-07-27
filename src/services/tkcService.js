/**
 * Acceso del navegador al inventario de TKC.
 *
 * Único punto de entrada que usa la UI. No toca Supabase para los datos: llama
 * al endpoint local `/api/tkc/inventario` (middleware de Vite en dev/preview,
 * `server/index.js` en producción), que es quien hace el login en TKC y consulta
 * su DataTables. Supabase solo aporta el access token que autentica la llamada.
 */

import { supabase } from '@/api/supabaseClient'
import { WAREHOUSES } from '@/services/tkc/warehouses'

const ENDPOINT = '/api/tkc/inventario'

/** Almacenes disponibles (catálogo estático de TKC), como claves de la app. */
export const TKC_ALMACENES = WAREHOUSES.map((w) => w.key)

/**
 * Pide una página del inventario. El servidor resuelve búsqueda, orden y
 * paginación contra TKC, así que cada cambio de filtro es una petición nueva.
 *
 * @param {{ almacen: string, page?: number, limit?: number, search?: string,
 *           sortBy?: string, sortDir?: 'asc'|'desc',
 *           existencia?: 'todos'|'existencia'|'no-existencia' }} params
 * @returns {Promise<{ rows: object[], pagination: { page: number, limit: number, total: number, totalPages: number } }>}
 */
export async function fetchInventarioTkc({
  almacen,
  page = 1,
  limit = 50,
  search = '',
  sortBy = 'nombre',
  sortDir = 'asc',
  existencia = 'existencia',
}) {
  if (!almacen) return { rows: [], pagination: { page: 1, limit, total: 0, totalPages: 1 } }

  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('Sesión expirada. Vuelve a iniciar sesión.')

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ almacen, page, limit, search, sortBy, sortDir, existencia }),
  })

  const payload = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(payload?.error ?? `Error ${res.status} al consultar TKC`)
  }
  return payload
}
