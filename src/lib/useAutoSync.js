import { useEffect, useRef } from 'react'
import { base44 } from '@/api/base44Client'

const ONE_HOUR_MS = 15 * 60 * 1000

/**
 * Cuándo se sincronizó por última vez un almacén, lo haya lanzado quien lo
 * haya lanzado.
 *
 * Antes se preguntaba por (usuario, almacén), que tenía sentido cuando el
 * sync corría en el navegador de cada uno. Ya no: lo ejecuta el servidor y el
 * catálogo es compartido, así que «cuándo se sincronizó el 789» es una
 * pregunta del almacén. Con la clave antigua, un sync programado no aparecía
 * para nadie y cada navegador volvía a lanzar el suyo cada hora.
 */
export async function getLastSync(almacen) {
  const filas = await base44.entities.SyncAutoLog.filter(
    { almacen }, '-synced_at', 1,
  )
  return filas[0]?.synced_at ?? null
}

// El registro de la última sincronización lo escribe /api/sync/productos, que
// es quien la ejecuta. Antes lo hacía el navegador porque el sync corría aquí.

/**
 * Devuelve true si el almacén no se ha sincronizado en la última hora.
 */
function isHourDue(lastSyncISO) {
  if (!lastSyncISO) return true
  return Date.now() - new Date(lastSyncISO).getTime() >= ONE_HOUR_MS
}

/**
 * Hook: dispara onSync(almacen) si pasó más de 1 hora desde el último sync.
 * Revisa al montar, cada hora y cuando la pestaña vuelve a estar visible.
 */
export function useAutoSync({ user, onSync, enabled }) {
  const onSyncRef = useRef(onSync)
  onSyncRef.current = onSync

  useEffect(() => {
    if (!enabled || !user?.email) return

    const cfg = user.sync_config || {}
    if (!cfg.auto_sync) return

    const almacenes = Array.isArray(cfg.almacenes_sync) && cfg.almacenes_sync.length
      ? cfg.almacenes_sync
      : (Array.isArray(user.almacenes_config) ? user.almacenes_config : [])

    if (!almacenes.length) return

    const check = async () => {
      for (const alm of almacenes) {
        const lastSyncISO = await getLastSync(alm)
        if (isHourDue(lastSyncISO)) {
          onSyncRef.current(alm)
        }
      }
    }

    check()
    const interval = setInterval(check, ONE_HOUR_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user?.email, JSON.stringify(user?.sync_config), JSON.stringify(user?.almacenes_config)])
}
