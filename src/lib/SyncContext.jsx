import { createContext, useContext, useState, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/AuthContext'
import { supabase } from '@/api/supabaseClient'
import { syncFromExternal } from '@/services/syncService'
import { setLastSync } from '@/lib/useAutoSync'
import { notifToast } from '@/lib/notifToast'

const SyncCtx = createContext(null)

async function notifyFailures(almacen, failures, userEmail) {
  if (!failures?.length) return
  const resumen = failures.slice(0, 3).map(f => `• ${f.nombre || f.codigo}: ${f.msg}`).join('\n')
  const extra = failures.length > 3 ? `\n… y ${failures.length - 3} más` : ''
  // Store full failures as JSON in mensaje so TabLogsSinc can parse and retry
  const mensajeJson = JSON.stringify({
    _type:    'sync_errors',
    almacen,
    fallidos: failures.length,
    muestra:  failures.slice(0, 5),
    failures: failures.slice(0, 500),
    resumen:  resumen + extra,
  })
  try {
    await supabase.from('notificaciones').insert({
      usuario_id: userEmail || 'soporte@mercadoelineas.com',
      tipo:       'sistema',
      titulo:     `${failures.length} productos fallaron en sync — Almacén ${almacen}`,
      mensaje:    mensajeJson,
      leida:      false,
      link:       '/bd-tkc',
      es_error:   true,
    })
  } catch {}
}

export function SyncProvider({ children }) {
  const queryClient = useQueryClient()
  const { user }    = useAuth()

  const [syncState,   setSyncState]   = useState(null)
  const [lastResults, setLastResults] = useState({})

  // Refs so async functions always see the latest values without stale closures
  const runningRef     = useRef(false)
  const userEmailRef   = useRef(user?.email)
  const queryClientRef = useRef(queryClient)
  userEmailRef.current   = user?.email
  queryClientRef.current = queryClient

  const syncOne = useCallback(async (almacen) => {
    if (runningRef.current) return
    runningRef.current = true
    setLastResults(r => ({ ...r, [almacen]: undefined }))
    setSyncState({ type: 'single', current: almacen, idx: 0, total: 1, progress: null })
    try {
      const result = await syncFromExternal(
        almacen,
        p => setSyncState(s => s ? { ...s, progress: p } : null),
        userEmailRef.current
      )
      const qc = queryClientRef.current
      setLastResults(r => ({
        ...r,
        [almacen]: { ok: true, synced: result.synced, errors: result.errors, failures: result.failures ?? [], changes: result.changes },
      }))
      qc.invalidateQueries({ queryKey: ['bd_tkc',       almacen] })
      qc.invalidateQueries({ queryKey: ['productos',    almacen] })
      qc.invalidateQueries({ queryKey: ['dash_prods'] })
      qc.invalidateQueries({ queryKey: ['last_sync_tkc'] })
      qc.invalidateQueries({ queryKey: ['sa-sync-log'] })
      if (userEmailRef.current && almacen) setLastSync(userEmailRef.current, almacen, result.synced, result.errors)
      if ((result.failures ?? []).length > 0) notifyFailures(almacen, result.failures, userEmailRef.current)
      const errMsg    = result.errors  > 0 ? `, ${result.errors} errores`          : ''
      const changeMsg = result.changes > 0 ? ` · ${result.changes} campos cambiados` : ''
      notifToast({
        titulo:    `Almacén ${almacen} sincronizado`,
        mensaje:   `${result.synced} productos${errMsg}${changeMsg}`,
        tipo:      'sistema',
        userEmail: userEmailRef.current,
        queryClient: qc,
        variant:   result.errors > 0 ? 'destructive' : 'default',
      })
      return result
    } catch (e) {
      setLastResults(r => ({ ...r, [almacen]: { ok: false, msg: e.message } }))
      notifToast({
        titulo:    'Error en sincronización',
        mensaje:   e.message,
        tipo:      'sistema',
        userEmail: userEmailRef.current,
        queryClient: queryClientRef.current,
        variant:   'destructive',
      })
      throw e
    } finally {
      setSyncState(null)
      runningRef.current = false
    }
  }, [])

  const syncAll = useCallback(async (almacenes) => {
    if (runningRef.current || !almacenes.length) return
    runningRef.current = true
    setLastResults({})
    let totalSynced = 0, totalErrors = 0
    const allFailures = []
    const qc = queryClientRef.current
    try {
      for (let i = 0; i < almacenes.length; i++) {
        const alm = almacenes[i]
        setSyncState({ type: 'all', current: alm, idx: i, total: almacenes.length, progress: null, totalSynced, totalErrors })
        try {
          const result = await syncFromExternal(
            alm,
            p => setSyncState(s => s ? { ...s, progress: p } : null),
            userEmailRef.current
          )
          totalSynced += result.synced ?? 0
          totalErrors += result.errors ?? 0
          allFailures.push(...(result.failures ?? []))
          setLastResults(r => ({ ...r, [alm]: { ok: true, synced: result.synced, errors: result.errors } }))
          if (userEmailRef.current) setLastSync(userEmailRef.current, alm, result.synced, result.errors)
          qc.invalidateQueries({ queryKey: ['bd_tkc',    alm] })
          qc.invalidateQueries({ queryKey: ['productos', alm] })
        } catch (e) {
          totalErrors++
          setLastResults(r => ({ ...r, [alm]: { ok: false, msg: e.message } }))
        }
      }
    } finally {
      setSyncState(null)
      runningRef.current = false
    }
    qc.invalidateQueries({ queryKey: ['dash_prods'] })
    qc.invalidateQueries({ queryKey: ['last_sync_tkc'] })
    qc.invalidateQueries({ queryKey: ['sa-sync-log'] })
    if (allFailures.length > 0) notifyFailures('todos los almacenes', allFailures, userEmailRef.current)
    notifToast({
      titulo:    'Sincronización completa',
      mensaje:   `${almacenes.length} almacenes · ${totalSynced} productos${totalErrors > 0 ? `, ${totalErrors} errores` : ''}`,
      tipo:      'sistema',
      userEmail: userEmailRef.current,
      queryClient: qc,
      variant:   totalErrors > 0 ? 'destructive' : 'default',
    })
  }, [])

  return (
    <SyncCtx.Provider value={{ syncState, isRunning: syncState !== null, syncOne, syncAll, lastResults }}>
      {children}
    </SyncCtx.Provider>
  )
}

export function useSyncManager() {
  return useContext(SyncCtx)
}
