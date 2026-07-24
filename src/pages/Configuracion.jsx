import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabaseClient'
import { fetchAlmacenes, isExternaConfigured } from '@/services/syncService'
import { useAuth } from '@/lib/AuthContext'
import { useSyncManager } from '@/lib/SyncContext'
import { Check, Warehouse, RefreshCw, Clock, Plus, Trash2, AlertTriangle, Zap } from 'lucide-react'

const SYNC_ROLES = ['administrador', 'inv', 'superadmin']

const DEFAULT_TIMES = ['08:00', '12:00', '16:00', '20:00', '06:00', '10:00', '14:00', '18:00']

function initSyncConfig(raw) {
  const cfg = raw && typeof raw === 'object' ? raw : {}
  return {
    auto_sync:      cfg.auto_sync      ?? false,
    horarios:       Array.isArray(cfg.horarios) && cfg.horarios.length ? [...cfg.horarios] : ['08:00'],
    almacenes_sync: Array.isArray(cfg.almacenes_sync) ? [...cfg.almacenes_sync] : [],
  }
}

function Section({ title, description, icon: Icon, children }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 pl-[26px]">{description}</p>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── Toggle switch ─────────────────────────────────────────────
// Todo en inline styles para evitar conflictos con Tailwind.
// El círculo usa left+translateX en vez de solo translateX para
// garantizar posición inicial correcta sin depender de "static position".
function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      style={{
        position:     'relative',
        display:      'inline-block',
        flexShrink:   0,
        width:        44,
        height:       24,
        borderRadius: 12,
        background:   value ? '#4ade80' : 'hsl(var(--muted))',
        border:       value ? 'none' : '1px solid hsl(var(--border))',
        cursor:       'pointer',
        outline:      'none',
        overflow:     'hidden',          // evita que el círculo salga visualmente
        transition:   'background 0.2s',
      }}
    >
      <span
        style={{
          position:     'absolute',
          top:          2,
          left:         2,               // parte del borde izquierdo fijo
          width:        20,
          height:       20,
          borderRadius: '50%',
          background:   'white',
          boxShadow:    '0 1px 3px rgba(0,0,0,0.25)',
          transform:    `translateX(${value ? 18 : 0}px)`,  // 2+18=20 → termina en 40, cabe en 44
          transition:   'transform 0.2s',
        }}
      />
    </button>
  )
}

export default function Configuracion() {
  const { user }    = useAuth()
  const queryClient = useQueryClient()
  const role        = user?.role || 'inv'
  const canSync     = isExternaConfigured && SYNC_ROLES.includes(role)
  const { syncOne, syncAll, isRunning, syncState, lastResults } = useSyncManager()

  const [almacenesConfig, setAlmacenesConfig] = useState([])
  const [syncCfg,         setSyncCfg]         = useState(initSyncConfig(null))
  const [saved,           setSaved]           = useState(false)
  const [saveError,       setSaveError]       = useState('')

  // Sincronizar estado local cuando el usuario carga desde la DB
  useEffect(() => {
    if (!user) return
    setAlmacenesConfig(Array.isArray(user.almacenes_config) ? user.almacenes_config : [])
    setSyncCfg(initSyncConfig(user.sync_config))
  }, [user?.email]) // solo re-sync cuando cambia el usuario, no en cada render

  const {
    data:    allAlmacenes = [],
    isLoading: loadingAlmacenes,
    isError:   errorAlmacenes,
    refetch:   refetchAlmacenes,
  } = useQuery({
    queryKey:  ['almacenes_externos'],
    queryFn:   fetchAlmacenes,
    enabled:   isExternaConfigured,
    staleTime: 5 * 60 * 1000,
    retry:     1,
    select:    d => Array.isArray(d) ? d : [],
  })

  // ── Almacenes ────────────────────────────────────────────────
  const toggleAlmacen = (a) =>
    setAlmacenesConfig(prev =>
      prev.includes(a)
        ? prev.filter(x => x !== a)
        : [...prev, a].sort((x, y) => {
            const nx = parseInt(x, 10), ny = parseInt(y, 10)
            return (!isNaN(nx) && !isNaN(ny)) ? nx - ny : x.localeCompare(y)
          })
    )

  // ── Horarios ─────────────────────────────────────────────────
  const addHorario = () => {
    if (syncCfg.horarios.length >= 8) return
    const used  = new Set(syncCfg.horarios)
    const spare = DEFAULT_TIMES.find(t => !used.has(t)) ?? '00:00'
    setSyncCfg(c => ({ ...c, horarios: [...c.horarios, spare] }))
  }

  const removeHorario = (idx) =>
    setSyncCfg(c => ({ ...c, horarios: c.horarios.filter((_, i) => i !== idx) }))

  const setHorario = (idx, val) =>
    setSyncCfg(c => {
      const next = [...c.horarios]; next[idx] = val; return { ...c, horarios: next }
    })

  const toggleAlmacenSync = (a) =>
    setSyncCfg(c => ({
      ...c,
      almacenes_sync: c.almacenes_sync.includes(a)
        ? c.almacenes_sync.filter(x => x !== a)
        : [...c.almacenes_sync, a],
    }))

  const syncAlmacenes    = almacenesConfig.length ? almacenesConfig : allAlmacenes
  const manualAlmacenes  = syncAlmacenes  // alias for sync section

  const { data: syncLogs = [], refetch: refetchLogs } = useQuery({
    queryKey: ['sync_auto_log_cfg', user?.email],
    queryFn: async () => {
      const { data } = await supabase
        .from('sync_auto_log')
        .select('almacen, synced_at, synced, errors')
        .eq('user_email', user.email)
      return data ?? []
    },
    enabled: canSync && !!user?.email,
    staleTime: 30_000,
  })
  const syncByAlmacen = Object.fromEntries(syncLogs.map(r => [String(r.almacen), r]))

  // ── Save ─────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: async () => {
      if (!user?.email) throw new Error('Sin usuario')
      setSaveError('')

      const payload = {
        almacenes_config: almacenesConfig,
        almacen_num:      almacenesConfig[0] || user.almacen_num || '',
        sync_config:      { ...syncCfg, timezone_offset: new Date().getTimezoneOffset() },
      }

      const { error } = await supabase.from('usuarios').update(payload).eq('email', user.email)
      if (error) throw error
    },
    onSuccess: () => {
      setSaved(true)
      setSaveError('')
      setTimeout(() => setSaved(false), 2500)
      queryClient.invalidateQueries({ queryKey: ['currentUser'] })
    },
    onError: (err) => {
      const msg = err?.message || ''
      if (msg.includes('sync_config') || msg.includes('almacenes_config')) {
        setSaveError('Ejecuta migration_v8.sql y migration_v9.sql en Supabase SQL Editor primero.')
      } else {
        setSaveError(msg || 'Error al guardar. Intenta de nuevo.')
      }
    },
  })

  const fmtSync = iso => iso
    ? new Date(iso).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })
    : 'Nunca'

  return (
    <div className="space-y-5 pb-8">

      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-medium">Configuración</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Preferencias de tu cuenta y módulos</p>
      </div>

      {/* ── Grid 2 columnas en pantallas grandes ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5 items-start">

        {/* ══ COLUMNA IZQUIERDA: configuración ══ */}
        <div className="space-y-5">

          {/* Almacenes */}
          <Section
            icon={Warehouse}
            title="Mis almacenes de trabajo"
            description="Solo verás información de los almacenes que selecciones. Sin selección = acceso a todos."
          >
            {!isExternaConfigured && (
              <p className="text-xs text-muted-foreground italic">
                La base de datos externa no está configurada. Contacta al administrador.
              </p>
            )}
            {isExternaConfigured && loadingAlmacenes && (
              <p className="text-xs text-muted-foreground italic flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Escaneando almacenes en BD TKC…
              </p>
            )}
            {isExternaConfigured && errorAlmacenes && !loadingAlmacenes && (
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#e24b4a]/5 border border-[#e24b4a]/20">
                <p className="text-xs text-[#e24b4a]">
                  No se pudo conectar a la BD externa. Verifica las credenciales y que <code className="bg-muted px-1 rounded text-[10px]">invGlobal</code> sea accesible.
                </p>
                <button type="button" onClick={() => refetchAlmacenes()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-card border border-border text-muted-foreground hover:text-foreground whitespace-nowrap flex-shrink-0">
                  <RefreshCw className="w-3 h-3" /> Reintentar
                </button>
              </div>
            )}
            {isExternaConfigured && !loadingAlmacenes && !errorAlmacenes && allAlmacenes.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Sin almacenes en la BD externa.</p>
            )}
            {allAlmacenes.length > 0 && (
              <div className="space-y-3">
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                  {allAlmacenes.map(a => {
                    const active = almacenesConfig.includes(a)
                    return (
                      <button key={a} type="button" onClick={() => toggleAlmacen(a)}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium border transition-colors
                          ${active
                            ? 'bg-[#4ade80]/10 border-[#4ade80]/40 text-[#4ade80]'
                            : 'bg-background border-border text-muted-foreground hover:border-[#4ade80]/30 hover:text-foreground'}`}
                      >
                        <span className="truncate">{a}</span>
                        {active && <Check className="w-3 h-3 flex-shrink-0 ml-1" />}
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">
                    {almacenesConfig.length === 0
                      ? 'Sin restricción — se muestran todos los almacenes'
                      : almacenesConfig.length === 1
                      ? `Almacén ${almacenesConfig[0]} — se auto-selecciona al entrar`
                      : `${almacenesConfig.length} almacenes configurados`}
                  </p>
                  {almacenesConfig.length > 0 && (
                    <button type="button" onClick={() => setAlmacenesConfig([])}
                      className="text-[11px] text-muted-foreground hover:text-[#e24b4a] transition-colors">
                      Limpiar
                    </button>
                  )}
                </div>
              </div>
            )}
          </Section>

          {/* Sincronización automática */}
          {isExternaConfigured && (
            <Section
              icon={RefreshCw}
              title="Sincronización automática — BD TKC"
              description="La app sincronizará tus almacenes automáticamente cada 15 minutos."
            >
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Activar sincronización automática</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Se ejecuta cada 15 min y al volver a la pestaña</p>
                  </div>
                  <Toggle value={syncCfg.auto_sync} onChange={v => setSyncCfg(c => ({ ...c, auto_sync: v }))} />
                </div>

                {syncCfg.auto_sync && (
                  <div className="space-y-4 pt-2 border-t border-border">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          <p className="text-xs font-medium text-foreground">
                            Horarios adicionales
                            <span className="ml-1.5 text-muted-foreground font-normal">({syncCfg.horarios.length})</span>
                          </p>
                        </div>
                        <button type="button" onClick={addHorario} disabled={syncCfg.horarios.length >= 8}
                          className="flex items-center gap-1 text-xs text-[#4ade80] hover:opacity-80 disabled:opacity-40 transition-opacity">
                          <Plus className="w-3 h-3" /> Añadir
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {syncCfg.horarios.map((h, idx) => (
                          <div key={idx} className="flex items-center gap-1.5">
                            <input type="time" value={h} onChange={e => setHorario(idx, e.target.value)}
                              className="px-2.5 py-1.5 text-sm rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-[#4ade80]/50" />
                            {syncCfg.horarios.length > 1 && (
                              <button type="button" onClick={() => removeHorario(idx)}
                                className="p-1 text-muted-foreground hover:text-[#e24b4a] transition-colors rounded">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {syncAlmacenes.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-foreground">Almacenes a sincronizar</p>
                        <div className="flex flex-wrap gap-1.5">
                          {syncAlmacenes.map(a => {
                            const active = syncCfg.almacenes_sync.length === 0 || syncCfg.almacenes_sync.includes(a)
                            return (
                              <button key={a} type="button" onClick={() => toggleAlmacenSync(a)}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border transition-colors
                                  ${active
                                    ? 'bg-[#4ade80]/10 border-[#4ade80]/40 text-[#4ade80]'
                                    : 'bg-background border-border text-muted-foreground hover:border-[#4ade80]/20'}`}>
                                {active && <Check className="w-2.5 h-2.5" />}
                                {a}
                              </button>
                            )
                          })}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {syncCfg.almacenes_sync.length === 0 ? 'Todos los almacenes' : `${syncCfg.almacenes_sync.length} seleccionados`}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Error migración */}
          {saveError && saveError.includes('migration') && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-[#BA7517]/10 border border-[#BA7517]/30">
              <AlertTriangle className="w-4 h-4 text-[#BA7517] flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-medium text-[#BA7517]">Migraciones pendientes en Supabase</p>
                <p className="text-xs text-muted-foreground">
                  Ejecuta <code className="bg-muted px-1 rounded text-[10px]">migration_v8.sql</code> y{' '}
                  <code className="bg-muted px-1 rounded text-[10px]">migration_v9.sql</code> en el <strong>SQL Editor</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Guardar */}
          <div className="flex items-center gap-3">
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
              className="px-6 py-2.5 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              style={{ background: '#4ade80', color: '#000' }}>
              {saveMut.isPending ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar configuración'}
            </button>
            {saveError && !saveError.includes('migration') && (
              <p className="text-xs text-[#e24b4a]">{saveError}</p>
            )}
          </div>
        </div>

        {/* ══ COLUMNA DERECHA: sync manual ══ */}
        {canSync && manualAlmacenes.length > 0 && (
          <div className="sticky top-4">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Zap className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Sincronizar ahora</h2>
                </div>
                {manualAlmacenes.length > 1 && (
                  <button type="button"
                    onClick={() => { syncAll(manualAlmacenes.map(String)); setTimeout(() => refetchLogs(), 5000) }}
                    disabled={isRunning}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/20 hover:bg-[#4ade80]/20 disabled:opacity-50 transition-colors font-medium whitespace-nowrap">
                    <RefreshCw className={`w-3 h-3 ${isRunning ? 'animate-spin' : ''}`} />
                    {isRunning
                      ? `${(syncState?.idx ?? 0) + 1}/${syncState?.total ?? manualAlmacenes.length}`
                      : `Todos (${manualAlmacenes.length})`}
                  </button>
                )}
              </div>
              <div className="divide-y divide-border">
                {manualAlmacenes.map(alm => {
                  const log     = syncByAlmacen[String(alm)]
                  const result  = lastResults[alm]
                  const syncing = syncState?.current === String(alm)
                  return (
                    <div key={alm} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Almacén {alm}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {result?.ok === true  && <span className="text-[#4ade80]">{result.synced} prods · {result.errors} err</span>}
                          {result?.ok === false && <span className="text-[#e24b4a] truncate block max-w-[180px]">{result.msg}</span>}
                          {result === undefined && <>Sync: {fmtSync(log?.synced_at)}</>}
                        </p>
                      </div>
                      <button type="button"
                        onClick={() => { syncOne(String(alm)); setTimeout(() => refetchLogs(), 3000) }}
                        disabled={isRunning}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/20 hover:bg-[#4ade80]/20 disabled:opacity-50 transition-colors whitespace-nowrap flex-shrink-0">
                        <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
                        {syncing ? '…' : 'Sync'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
