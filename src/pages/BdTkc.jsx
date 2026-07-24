import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isExternaConfigured, retryFailed, fetchAlmacenes, fetchProductosExterno } from '@/services/syncService'
import { supabase } from '@/api/supabaseClient'
import Pagination from '@/components/shared/Pagination'

const PAGE_SIZE = 50
import { useAuth } from '@/lib/AuthContext'
import { useAlmacen, filterAlmacenesByConfig } from '@/lib/useAlmacen'
import { notifToast } from '@/lib/notifToast'
import { RefreshCw, AlertTriangle, Search, Database, ChevronDown, Package, History } from 'lucide-react'
import ProductHoverCard from '@/components/shared/ProductHoverCard'

// ── Estado Anuncio ──────────────────────────────────────────
function calcEstadoAnuncio(idTienda, ef, a, t) {
  const hasId = idTienda && String(idTienda).trim() !== ''
  if (!hasId && ef === 0)           return 'SIN ID EF=0'
  if (!hasId && ef > 0)             return 'SIN ID EF>0'
  if (hasId && a === 0 && t > 6)   return 'DESACTIVADO MUERTO EF=0'
  if (hasId && t === 0 && ef > 10) return 'DESACTIVADO MUERTO EF>0'
  if (hasId && ef === 0)           return 'DESACTIVADO EF=0'
  if (hasId && ef > 0)             return 'ACTIVADO'
  return 'DESACTIVADO'
}

function calcEstadoTienda(idTienda, ef, a, t) {
  const hasId = idTienda && String(idTienda).trim() !== ''
  if (!hasId && ef === 0)         return { estado: 'SIN ID',         prio: 10 }
  if (hasId  && ef === 0)         return { estado: 'AGOTADO',        prio: 11 }
  if (a === 0 && t > 6)          return { estado: 'SIN RESERVA',    prio: 1  }
  if (t === 0 && ef > 10)        return { estado: 'NO TIENDA',      prio: 2  }
  if (t === 0 && ef <= 10)       return { estado: 'NO TIENDA',      prio: 3  }
  if (t > 1 && t < a && a <= 10) return { estado: 'ULTIMAS PIEZAS', prio: 4  }
  if (a >= 0 && a < t && t <= 10)return { estado: 'ULTIMAS PIEZAS', prio: 6  }
  if (t <= 10)                   return { estado: 'PROXIMO',        prio: 5  }
  if (t <= a)                    return { estado: 'DISPONIBLE',     prio: 7  }
  if (a < t)                     return { estado: 'DISPONIBLE',     prio: 8  }
  return { estado: 'SIN DATOS', prio: 99 }
}

const EA_COLOR = {
  'ACTIVADO':                'text-[#4ade80] bg-[#4ade80]/10',
  'DESACTIVADO EF=0':        'text-[#facc15] bg-[#facc15]/10',
  'DESACTIVADO EF>0':        'text-[#fb923c] bg-[#fb923c]/10',
  'DESACTIVADO MUERTO EF=0': 'text-[#e24b4a] bg-[#e24b4a]/10',
  'DESACTIVADO MUERTO EF>0': 'text-[#e24b4a] bg-[#e24b4a]/10',
  'SIN ID EF=0':             'text-[#64748b] bg-[#64748b]/10',
  'SIN ID EF>0':             'text-[#94a3b8] bg-[#94a3b8]/10',
}
const ET_COLOR = {
  'SIN RESERVA':   'text-[#e24b4a] bg-[#e24b4a]/10 border-[#e24b4a]/30',
  'NO TIENDA':     'text-[#fb923c] bg-[#fb923c]/10 border-[#fb923c]/30',
  'ULTIMAS PIEZAS':'text-[#facc15] bg-[#facc15]/10 border-[#facc15]/30',
  'PROXIMO':       'text-[#60a5fa] bg-[#60a5fa]/10 border-[#60a5fa]/30',
  'DISPONIBLE':    'text-[#4ade80] bg-[#4ade80]/10 border-[#4ade80]/30',
  'AGOTADO':       'text-[#e24b4a] bg-[#e24b4a]/10 border-[#e24b4a]/30',
  'SIN ID':        'text-[#64748b] bg-[#64748b]/10 border-[#64748b]/30',
}

// ── Chip de estado tienda ───────────────────────────────────
const FILTER_OPTS = [
  { value: 'all',            label: 'Todos' },
  { value: 'SIN RESERVA',   label: 'Sin Reserva' },
  { value: 'NO TIENDA',     label: 'No Tienda' },
  { value: 'ULTIMAS PIEZAS',label: 'Últ. Piezas' },
  { value: 'AGOTADO',       label: 'Agotado' },
  { value: 'PROXIMO',       label: 'Próximo' },
  { value: 'DISPONIBLE',    label: 'Disponible' },
  { value: 'SIN ID',        label: 'Sin ID' },
]

// ── Imagen con fallback ─────────────────────────────────────
function ProductImg({ fotos, nombre }) {
  const [err, setErr] = useState(false)
  const src = Array.isArray(fotos) && fotos.length > 0 ? fotos[0] : null
  if (!src || err) {
    return (
      <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center flex-shrink-0">
        <Package className="w-4 h-4 text-[#333]" />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={nombre}
      onError={() => setErr(true)}
      className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-muted border border-border"
    />
  )
}

// ── Registro individual de fallidos histórico ───────────────
function FailureHistoryRecord({ record, onRetry, isPending }) {
  const [expanded, setExpanded] = useState(false)
  const fmt = (iso) => iso ? new Date(iso).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '—'
  return (
    <div className="rounded-lg border border-[#e24b4a]/20 bg-[#e24b4a]/5 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 gap-2">
        <div className="flex items-center gap-2 text-xs min-w-0">
          <span className="text-[#e24b4a] font-medium whitespace-nowrap">{record.fallidos} fallidos</span>
          <span className="text-muted-foreground truncate">{fmt(record.fecha)}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {record.failures?.length > 0 && (
            <button
              onClick={() => onRetry(record.failures)}
              disabled={isPending}
              className="text-xs px-2.5 py-1 rounded-md bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/20 hover:bg-[#4ade80]/20 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Reintentando…' : 'Reintentar'}
            </button>
          )}
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            {expanded ? 'Ocultar' : 'Detalle'}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-[#e24b4a]/10 px-3 py-2 max-h-40 overflow-y-auto space-y-0.5">
          {!record.failures?.length ? (
            <p className="text-xs text-muted-foreground italic">Detalle no disponible en registros anteriores.</p>
          ) : record.failures.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-xs py-1 border-b border-[#e24b4a]/10 last:border-0">
              <span className="text-foreground font-medium min-w-0 flex-1 line-clamp-1">{f.nombre || f.id_tienda || f.codigo}</span>
              <span className="text-[#e24b4a] flex-shrink-0 text-[10px] max-w-[55%] text-right">{f.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Componente principal ────────────────────────────────────
export default function BdTkc() {
  const { user }    = useAuth()
  const { almacen: almacenSel, setAlmacen: setAlmacenSel, almacenesConfig } = useAlmacen()
  const queryClient = useQueryClient()
  const [search, setSearch]                     = useState('')
  const [filterEstado, setFilterEstado]         = useState('all')
  const [sortBy, setSortBy]                     = useState('prioridad')
  const [retryProgress, setRetryProgress]       = useState(null)
  const [hoveredProduct, setHoveredProduct]     = useState(null)
  const [syncFailures, setSyncFailures]         = useState([])
  const [showFailures, setShowFailures]         = useState(false)
  const [showFailureHistory, setShowFailureHistory] = useState(false)
  const [page, setPage]                         = useState(1)

  // Lista de almacenes — filtrada por la config del usuario
  const { data: allAlmacenes = [], isLoading: loadingAlmacenes } = useQuery({
    queryKey: ['almacenes_externos'],
    queryFn:  fetchAlmacenes,
    staleTime: 10 * 60 * 1000,
    enabled:  isExternaConfigured,
    select:   (d) => Array.isArray(d) ? d : [],
  })
  const almacenes = useMemo(
    () => filterAlmacenesByConfig(allAlmacenes, almacenesConfig),
    [allAlmacenes, almacenesConfig]
  )

  // Productos del almacén — consulta directa a BD externa, sin sync local
  const { data: productos = [], isLoading: loadingProductos } = useQuery({
    queryKey: ['bd_tkc_ext', almacenSel],
    queryFn: () => fetchProductosExterno(almacenSel),
    select:  (d) => Array.isArray(d) ? d : [],
    enabled: Boolean(almacenSel) && isExternaConfigured,
    staleTime: 5 * 60 * 1000,   // 5 min — no re-fetch automático
    gcTime:    10 * 60 * 1000,
  })

  // Historial de fallidos del almacén seleccionado
  const { data: failureHistory = [] } = useQuery({
    queryKey: ['sync_failures_history', almacenSel],
    queryFn: async () => {
      const { data } = await supabase
        .from('historial_movimientos')
        .select('id, valor_nuevo, fecha')
        .eq('campo', 'sync_errores')
        .order('fecha', { ascending: false })
        .limit(100)
      return (data ?? [])
        .map(r => {
          try {
            const p = JSON.parse(r.valor_nuevo)
            if (String(p.almacen) !== String(almacenSel)) return null
            return {
              id:       r.id,
              fecha:    r.fecha,
              fallidos: p.fallidos ?? p.muestra?.length ?? 0,
              failures: p.failures ?? p.muestra ?? [],
            }
          } catch { return null }
        })
        .filter(Boolean)
    },
    enabled: Boolean(almacenSel),
    staleTime: 30_000,
  })

  // Enriquecer
  const enriched = useMemo(() => productos.map(p => {
    const ef = Number(p.exist_fisica ?? 0)
    const a  = Number(p.almacen     ?? 0)
    const t  = Number(p.tienda      ?? 0)
    return {
      ...p, ef, a, t,
      estadoTienda:  calcEstadoTienda(p.id_tienda, ef, a, t),
      estadoAnuncio: calcEstadoAnuncio(p.id_tienda, ef, a, t),
    }
  }), [productos])

  // Reset page on filter change
  const resetPage = () => setPage(1)

  // Filtrar y ordenar
  const visible = useMemo(() => {
    let rows = enriched
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(p =>
        p.nombre?.toLowerCase().includes(q) ||
        p.codigo_producto?.toLowerCase().includes(q) ||
        p.suministrador?.toLowerCase().includes(q)
      )
    }
    if (filterEstado !== 'all') { rows = rows.filter(p => p.estadoTienda.estado === filterEstado) }
    if (sortBy === 'prioridad') return [...rows].sort((a, b) => a.estadoTienda.prio - b.estadoTienda.prio)
    if (sortBy === 'nombre')    return [...rows].sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''))
    if (sortBy === 'ef_desc')   return [...rows].sort((a, b) => b.ef - a.ef)
    return rows
  }, [enriched, search, filterEstado, sortBy])

  // Página actual
  const paginated = useMemo(() => {
    const from = (page - 1) * PAGE_SIZE
    return visible.slice(from, from + PAGE_SIZE)
  }, [visible, page])

  // Resumen
  const summary = useMemo(() => {
    const c = {}
    enriched.forEach(p => { const e = p.estadoTienda.estado; c[e] = (c[e] ?? 0) + 1 })
    return c
  }, [enriched])

  const retryMutation = useMutation({
    mutationFn: (customFailures) => {
      const toRetry = Array.isArray(customFailures) ? customFailures : syncFailures
      setRetryProgress({ stage: 'upsert', synced: 0, errors: 0, total: toRetry.length })
      return retryFailed(toRetry, almacenSel, (p) => setRetryProgress(p))
    },
    onSuccess: (result) => {
      setRetryProgress(null)
      setSyncFailures(result.failures ?? [])
      setShowFailures((result.failures ?? []).length > 0)
      queryClient.invalidateQueries({ queryKey: ['bd_tkc', almacenSel] })
      queryClient.invalidateQueries({ queryKey: ['productos', almacenSel] })
      queryClient.invalidateQueries({ queryKey: ['sync_failures_history', almacenSel] })
    },
    onError: (err) => {
      setRetryProgress(null)
      notifToast({ titulo: 'Error en reintento', mensaje: err.message, tipo: 'sistema', userEmail: user?.email, queryClient, variant: 'destructive' })
    },
  })

  const canSync = ['administrador', 'inv'].includes(user?.role)


  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">BD TKC</h1>
          <p className="text-sm text-muted-foreground">
            {almacenSel ? `${enriched.length} productos · Almacén ${almacenSel}` : 'Catálogo de productos TKC'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Selector almacén */}
          <div className="relative">
            <select
              value={almacenSel}
              onChange={e => { setAlmacenSel(e.target.value); setFilterEstado('all') }}
              disabled={loadingAlmacenes && almacenes.length === 0}
              className="appearance-none pl-3 pr-8 py-2 text-sm rounded-lg bg-card border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-[#4ade80]/50 cursor-pointer"
            >
              <option value="">— Seleccionar almacén —</option>
              {almacenes.map(a => <option key={a} value={a}>Almacén {a}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>

          {/* Actualizar — re-fetch directo desde BD externa */}
          {isExternaConfigured ? (
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['bd_tkc_ext', almacenSel] })}
              disabled={loadingProductos || !almacenSel}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#4ade80]/10 hover:bg-[#4ade80]/20 text-[#4ade80] text-sm font-medium border border-[#4ade80]/20 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loadingProductos ? 'animate-spin' : ''}`} />
              {loadingProductos ? 'Cargando…' : 'Actualizar'}
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#facc15]/10 border border-[#facc15]/20 text-[#facc15] text-xs">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="hidden sm:inline">DB externa no configurada</span>
            </div>
          )}
        </div>
      </div>

      {/* Progreso de carga directa */}
      {loadingProductos && almacenSel && (
        <div className="rounded-lg bg-card border border-border p-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Descargando productos del Almacén {almacenSel}…</span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-[#4ade80] animate-pulse w-1/3 rounded-full" />
          </div>
        </div>
      )}

      {/* Sin almacén */}
      {!almacenSel && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Database className="w-10 h-10 opacity-40" />
          <p className="text-sm">Selecciona un almacén para ver su catálogo</p>
        </div>
      )}

      {almacenSel && (
        <>
          {/* Panel de fallidos */}
          {showFailures && syncFailures.length > 0 && (
            <div className="rounded-lg border border-[#e24b4a]/30 bg-[#e24b4a]/5 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-[#e24b4a]">{syncFailures.length} productos fallidos</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => retryMutation.mutate()}
                    disabled={retryMutation.isPending}
                    className="text-xs px-3 py-1 rounded-md bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/20 hover:bg-[#4ade80]/20 transition-colors disabled:opacity-50"
                  >
                    {retryMutation.isPending ? 'Reintentando…' : 'Reintentar fallidos'}
                  </button>
                  <button onClick={() => setShowFailures(false)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
                </div>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {syncFailures.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs py-1 border-b border-[#e24b4a]/10 last:border-0">
                    <span className="text-foreground font-medium min-w-0 flex-1 line-clamp-1">{f.nombre || f.id_tienda}</span>
                    <span className="text-[#e24b4a] flex-shrink-0 text-[10px] max-w-[50%] text-right">{f.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Historial de fallidos */}
          <div>
            <button
              onClick={() => setShowFailureHistory(v => !v)}
              className={`flex items-center gap-1.5 text-xs transition-colors ${
                failureHistory.length > 0 ? 'text-[#e24b4a] hover:text-[#e24b4a]/80' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Historial de fallidos
              {failureHistory.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-[#e24b4a]/15 font-medium">
                  {failureHistory.length}
                </span>
              )}
              <ChevronDown className={`w-3 h-3 transition-transform ${showFailureHistory ? 'rotate-180' : ''}`} />
            </button>
            {showFailureHistory && (
              <div className="mt-2 space-y-2">
                {failureHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-1">Sin historial de fallidos para este almacén.</p>
                ) : (
                  failureHistory.map(record => (
                    <FailureHistoryRecord
                      key={record.id}
                      record={record}
                      onRetry={(fs) => retryMutation.mutate(fs)}
                      isPending={retryMutation.isPending}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* Chips de estado */}
          <div className="flex flex-wrap gap-2">
            {FILTER_OPTS.filter(f => f.value !== 'all').map(f =>
              summary[f.value] ? (
                <button
                  key={f.value}
                  onClick={() => { setFilterEstado(filterEstado === f.value ? 'all' : f.value); resetPage() }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                    ET_COLOR[f.value] ?? 'text-muted-foreground bg-muted border-border'
                  } ${filterEstado === f.value ? 'ring-1 ring-current' : ''}`}
                >
                  {f.label} <span className="opacity-70">({summary[f.value]})</span>
                </button>
              ) : null
            )}
          </div>

          {/* Búsqueda + orden */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); resetPage() }}
                placeholder="Buscar por nombre, código o suministrador…"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#4ade80]/50"
              />
            </div>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg bg-card border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-[#4ade80]/50"
            >
              <option value="prioridad">Por prioridad</option>
              <option value="nombre">Por nombre</option>
              <option value="ef_desc">Mayor EF primero</option>
            </select>
          </div>

          {/* Tabla */}
          {loadingProductos ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Cargando…</div>
          ) : enriched.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Database className="w-8 h-8 opacity-40" />
              <p className="text-sm">Sin datos para el almacén {almacenSel}</p>
              {isExternaConfigured && (
                <button onClick={() => queryClient.invalidateQueries({ queryKey: ['bd_tkc_ext', almacenSel] })} className="text-xs text-[#4ade80] underline underline-offset-2">
                  Reintentar carga
                </button>
              )}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Sin resultados</div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-card text-xs font-medium text-muted-foreground">
                      <th className="w-14 px-3 py-2.5 text-left">Img</th>
                      <th className="px-3 py-2.5 text-left min-w-[200px]">Nombre</th>
                      <th className="px-3 py-2.5 text-left whitespace-nowrap hidden sm:table-cell">Código</th>
                      <th className="px-3 py-2.5 text-left whitespace-nowrap hidden lg:table-cell">Suministrador</th>
                      <th className="px-3 py-2.5 text-center whitespace-nowrap w-12">EF</th>
                      <th className="px-3 py-2.5 text-center whitespace-nowrap w-12">A</th>
                      <th className="px-3 py-2.5 text-center whitespace-nowrap w-12">T</th>
                      <th className="px-3 py-2.5 text-right whitespace-nowrap hidden sm:table-cell">Precio</th>
                      <th className="px-3 py-2.5 text-center whitespace-nowrap hidden lg:table-cell">Est. Anuncio</th>
                      <th className="px-3 py-2.5 text-center whitespace-nowrap">Est. Tienda</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginated.map(p => (
                      <tr key={p.id}
                        className="hover:bg-card/60 transition-colors group"
                      >

                        <td className="px-3 py-2">
                          <ProductImg fotos={p.fotos} nombre={p.nombre} />
                        </td>
                        <td className="px-3 py-2 cursor-pointer"
                          onMouseEnter={e => setHoveredProduct({ p, rect: e.currentTarget.getBoundingClientRect() })}
                          onMouseLeave={() => setHoveredProduct(null)}
                        >
                          <p className="font-medium text-foreground leading-snug line-clamp-2 max-w-xs lg:max-w-sm hover:text-[#4ade80] transition-colors">{p.nombre}</p>
                          {p.id_tienda && <span className="text-[10px] text-muted-foreground font-mono">#{p.id_tienda}</span>}
                        </td>
                        <td className="px-3 py-2 hidden sm:table-cell">
                          <span className="font-mono text-xs text-muted-foreground">{p.codigo_producto || '—'}</span>
                        </td>
                        <td className="px-3 py-2 hidden lg:table-cell">
                          <span className="text-xs text-muted-foreground">{p.suministrador?.replace('SEL ', '') || '—'}</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`font-mono tabular-nums font-semibold ${p.ef === 0 ? 'text-[#e24b4a]' : 'text-foreground'}`}>{p.ef}</span>
                        </td>
                        <td className="px-3 py-2 text-center font-mono tabular-nums text-muted-foreground">{p.a}</td>
                        <td className="px-3 py-2 text-center font-mono tabular-nums text-muted-foreground">{p.t}</td>
                        <td className="px-3 py-2 text-right font-mono text-sm hidden sm:table-cell">
                          {p.precio_costo > 0 ? `$${Number(p.precio_costo).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-center hidden lg:table-cell">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${EA_COLOR[p.estadoAnuncio] ?? 'text-muted-foreground'}`}>
                            {p.estadoAnuncio}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border whitespace-nowrap ${ET_COLOR[p.estadoTienda.estado] ?? 'text-muted-foreground border-transparent'}`}>
                            {p.estadoTienda.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hoveredProduct && <ProductHoverCard producto={hoveredProduct.p} rect={hoveredProduct.rect} />}
              <Pagination
                page={page}
                total={visible.length}
                pageSize={PAGE_SIZE}
                onPage={setPage}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
