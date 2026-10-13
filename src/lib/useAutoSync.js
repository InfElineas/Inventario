import { useEffect, useRef } from 'react'
import { base44 } from '@/api/base44Client'

const ONE_HOUR_MS = 15 * 60 * 1000

export async function getLastSync(email, almacen) {
  const filas = await base44.entities.SyncAutoLog.filter(
    { user_email: email, almacen }, undefined, 1,
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
        const lastSyncISO = await getLastSync(user.email, alm)
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
