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
const ENDPOINT_EXISTENCIA = '/api/tkc/existencia'
const ENDPOINT_EXISTENCIAS = '/api/tkc/existencias'

/** Almacenes disponibles (catálogo estático de TKC), como claves de la app. */
export const TKC_ALMACENES = WAREHOUSES.map((w) => w.key)

/** Access token de la sesión actual, o error si ya no hay sesión. */
async function requireToken() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('Sesión expirada. Vuelve a iniciar sesión.')
  return token
}

/** POST autenticado a uno de los endpoints locales de TKC. */
async function postTkc(endpoint, payload) {
  const token = await requireToken()

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })

  const data = await res.json().catch(() => null)
  return { res, data }
}

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

  const { res, data } = await postTkc(ENDPOINT, {
    almacen, page, limit, search, sortBy, sortDir, existencia,
  })

  if (!res.ok) {
    throw new Error(data?.error ?? `Error ${res.status} al consultar TKC`)
  }
  return data
}

/**
 * Existencias desglosadas de varios productos de un almacén, para las columnas
 * EF / A / T de la tabla.
 *
 * El servidor mantiene un mapa del almacén completo (ver
 * `services/tkc/existencias.js`), así que esta llamada casi nunca golpea TKC: la
 * primera de cada almacén espera a la primera página del submayor y las demás
 * salen del caché. Mientras el mapa se completa en segundo plano,
 * `progreso.listo` es false y faltan ids en la respuesta — el llamador debe
 * volver a preguntar.
 *
 * @param {{ almacen: string, ids: string[], refrescar?: boolean }} params
 *        `ids` son los `idOnline` de las filas visibles.
 * @returns {Promise<{ existencias: Record<string, {fisica: number, enAlmacen: number, enTienda: number}>,
 *   progreso: { cargadas: number, total: number, listo: boolean, error: string|null } }>}
 */
export async function fetchExistenciasTkc({ almacen, ids, refrescar = false }) {
  const vacio = { existencias: {}, progreso: { cargadas: 0, total: 0, listo: true, error: null } }
  if (!almacen || !ids?.length) return vacio

  const { res, data } = await postTkc(ENDPOINT_EXISTENCIAS, { almacen, ids, refrescar })

  if (!res.ok) {
    throw new Error(data?.error ?? `Error ${res.status} al consultar el submayor de TKC`)
  }
  return data
}

/**
 * Existencia desglosada de UN producto: física, en almacén y en tienda.
 *
 * El listado solo conoce el total (`cantidad`); el desglose únicamente lo
 * publica el submayor, y de producto en producto. Por eso se pide bajo demanda
 * (al hacer hover sobre la fila) y no para la tabla entera.
 *
 * @param {{ almacen: string, idTienda: string }} params
 *        `idTienda` es el campo `idOnline` de la fila del listado.
 * @returns {Promise<null | { idTienda: string, codigo: string, nombre: string,
 *   unidadMedida: string, precio: number,
 *   existencia: { fisica: number, enAlmacen: number, enTienda: number } }>}
 *   null si el submayor no tiene ese producto en ese almacén (no es un error).
 */
export async function fetchExistenciaTkc({ almacen, idTienda }) {
  if (!almacen || !idTienda) return null

  const { res, data } = await postTkc(ENDPOINT_EXISTENCIA, { almacen, idTienda })

  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(data?.error ?? `Error ${res.status} al consultar el submayor de TKC`)
  }
  return data
}
