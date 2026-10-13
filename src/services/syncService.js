/**
 * Sincronización del catálogo, desde el navegador.
 *
 * Antes este archivo hacía el trabajo entero: leía `invGlobal` del segundo
 * proyecto de Supabase por REST, paginaba 55.000 productos, los deduplicaba y
 * los mandaba en lotes a un RPC. Ahora `invGlobal` vive en la misma base que
 * `productos`, así que todo eso es una sentencia SQL en el servidor y aquí solo
 * queda dispararla.
 *
 * Lo que desapareció con ello: la BD externa, la paginación, la deduplicación
 * por código —que resultó estar colapsando anuncios distintos, ver
 * fix_clave_producto.sql— y el reintento de fallos por lote.
 */

import { base44 } from '@/api/base44Client'

/**
 * Se conserva por compatibilidad con las pantallas que lo consultan. El sync ya
 * no depende de una base externa configurada en el navegador: lo resuelve el
 * servidor contra su propia base.
 */
export const isExternaConfigured = true

/** Mensajes de error en castellano llano, para la UI. */
export function humanizeSyncError(msg) {
  if (!msg) return 'Error desconocido'
  const m = String(msg).toLowerCase()
  if (m.includes('sin sesión') || m.includes('401')) return 'Sesión expirada. Vuelve a iniciar sesión.'
  if (m.includes('sin permiso') || m.includes('403')) return 'Tu rol no puede sincronizar el catálogo.'
  if (m.includes('fetch') || m.includes('network')) return 'Error de conexión con el servidor.'
  return msg
}

/** Almacenes disponibles, a partir de los productos ya sincronizados. */
export async function fetchAlmacenes() {
  const productos = await base44.entities.Producto.filter({ activo: true }, 'almacen_num', 2000)
  const vistos = new Set(productos.map((p) => p.almacen_num).filter(Boolean))
  return [...vistos].sort((a, b) => {
    const na = parseInt(a, 10)
    const nb = parseInt(b, 10)
    return (!isNaN(na) && !isNaN(nb)) ? na - nb : String(a).localeCompare(String(b))
  })
}

/**
 * Lanza la sincronización en el servidor.
 *
 * @param {string} almacenNum almacén concreto, o vacío para todos
 * @returns {Promise<{ sincronizados: number, desactivados: number, almacen: string }>}
 */
export async function syncFromExternal(almacenNum) {
  const res = await fetch('/api/sync/productos', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ almacen: almacenNum || null }),
  })

  const datos = await res.json().catch(() => null)
  if (!res.ok) throw new Error(humanizeSyncError(datos?.error ?? `Error ${res.status}`))
  return datos
}
