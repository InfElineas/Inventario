import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabaseClient'
import { useAlmacen, filterAlmacenesByConfig } from '@/lib/useAlmacen'
import { fetchAllProductos } from '@/lib/supabaseUtils'
import { isExternaConfigured, fetchAlmacenes } from '@/services/syncService'
import { ChevronDown, Clock, CalendarDays, X } from 'lucide-react'

const PERIODS = [
  { key: '7D',  label: '7D',  days: 7   },
  { key: '30D', label: '30D', days: 30  },
  { key: '3M',  label: '3M',  days: 90  },
  { key: '6M',  label: '6M',  days: 180 },
]

function calcEst(idTienda, ef, a, t) {
  const hasId = idTienda && String(idTienda).trim() !== ''
  if (!hasId && ef === 0)          return 'SIN ID'
  if (hasId  && ef === 0)          return 'AGOTADO'
  if (a === 0 && t > 6)            return 'SIN RESERVA'
  if (t === 0 && ef > 10)          return 'NO TIENDA'
  if (t === 0 && ef <= 10)         return 'NO TIENDA'
  if (t > 1 && t < a && a <= 10)  return 'ULTIMAS PIEZAS'
  if (a >= 0 && a < t && t <= 10) return 'ULTIMAS PIEZAS'
  if (t <= 10)                     return 'PROXIMO'
  return 'DISPONIBLE'
}

const EST_ORDER = ['SIN RESERVA','NO TIENDA','ULTIMAS PIEZAS','PROXIMO','DISPONIBLE','AGOTADO','SIN ID']
const EST_COLOR = {
  'SIN RESERVA':   '#e24b4a',
  'NO TIENDA':     '#fb923c',
  'ULTIMAS PIEZAS':'#facc15',
  'PROXIMO':       '#60a5fa',
  'DISPONIBLE':    '#4ade80',
  'AGOTADO':       '#e24b4a',
  'SIN ID':        '#64748b',
}

const TAREA_COLOR = {
  completado:   '#4ade80',
  pend_fact:    '#facc15',
  en_auditoria: '#fb923c',
  en_curso:     '#60a5fa',
  devuelto:     '#e24b4a',
}

function fmtDate(raw) {
  if (!raw) return null
  try {
    return new Date(raw).toLocaleString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return null }
}

// ── KPI card ─────────────────────────────────────────────────
function DashKPI({ title, value, sub, color, alert, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-4 bg-card transition-colors select-none
        ${onClick ? 'cursor-pointer hover:bg-accent/40 active:scale-[.98]' : ''}`}
      style={{ borderColor: alert ? `${color}44` : undefined, background: alert ? `${color}0d` : undefined }}
    >
      <p className="text-xs text-muted-foreground mb-1 truncate">{title}</p>
      <p className="text-2xl font-bold tabular-nums leading-none" style={{ color }}>{value ?? '—'}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{sub}</p>}
      {onClick && <p className="text-[9px] text-muted-foreground/60 mt-1">↗ ver detalle</p>}
    </div>
  )
}

// ── Modal genérico de breakdown por almacén ───────────────────
const KPI_MODAL_CFG = {
  conStock:   { title: 'Con stock',     subtitle: 'Productos con EF > 0',                          color: '#4ade80', metric: 'conStock'  },
  enTienda:   { title: 'En tienda',     subtitle: 'Productos con T > 0 (visibles en tienda)',       color: '#60a5fa', metric: 'enTienda'  },
  sinTienda:  { title: 'No en Tienda',  subtitle: 'EF > 0 pero T = 0 (stock invisible en tienda)', color: '#fb923c', metric: 'sinTienda' },
  sinReserva: { title: 'Sin Reserva',   subtitle: 'A = 0 y T > 6 — urgente',                       color: '#e24b4a', metric: 'sinReserva'},
  agotados:   { title: 'Agotados',      subtitle: 'Con ID en TKC · EF = 0',                        color: '#e24b4a', metric: 'agotados'  },
  total:      { title: 'Total SKUs',    subtitle: 'Todos los productos en catálogo',                color: '#64748b', metric: 'total'     },
}

function KPIBreakdownModal({ metricKey, breakdown, onClose }) {
  const cfg = KPI_MODAL_CFG[metricKey]
  if (!cfg) return null
  const rows = [...breakdown]
    .filter(r => (r[cfg.metric] ?? 0) > 0)
    .sort((a, b) => (b[cfg.metric] ?? 0) - (a[cfg.metric] ?? 0))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: cfg.color }}>{cfg.title}</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">{cfg.subtitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="divide-y divide-border max-h-[26rem] overflow-y-auto">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
          ) : rows.map(row => {
            const val   = row[cfg.metric] ?? 0
            const total = row.total ?? 1
            const pct   = total > 0 ? (val / total) * 100 : 0
            return (
              <div key={row.almacen} className="flex items-center justify-between px-5 py-3 hover:bg-accent/20">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Almacén {row.almacen}</p>
                  <div className="w-full h-1 bg-muted rounded-full mt-1.5 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 1)}%`, background: cfg.color }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{pct.toFixed(1)}% del total de su almacén</p>
                </div>
                <p className="ml-4 text-xl font-bold tabular-nums flex-shrink-0" style={{ color: cfg.color }}>
                  {val.toLocaleString()}
                </p>
              </div>
            )
          })}
        </div>
        <div className="px-5 py-3 border-t border-border bg-muted/30">
          <Link to="/bd-tkc" onClick={onClose} className="text-xs text-[#4ade80] hover:underline">
            Ver catálogo completo →
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── Filtro de período (flotante) ──────────────────────────────
function PeriodSelector({ period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, showCustom, setShowCustom }) {
  const ref = useRef(null)
  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setShowCustom(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [setShowCustom])

  return (
    <div className="flex items-center gap-1.5 flex-wrap relative">
      {PERIODS.map(p => (
        <button key={p.key}
          onClick={() => { setPeriod(p.key); setShowCustom(false) }}
          className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors
            ${period === p.key && !showCustom
              ? 'bg-[#4ade80]/15 text-[#4ade80] border border-[#4ade80]/30'
              : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}
        >
          {p.label}
        </button>
      ))}

      {/* Botón personalizado + dropdown flotante */}
      <div ref={ref} className="relative">
        <button
          onClick={() => setShowCustom(v => !v)}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors border
            ${showCustom
              ? 'bg-[#60a5fa]/15 text-[#60a5fa] border-[#60a5fa]/30'
              : 'bg-card border-border text-muted-foreground hover:text-foreground'}`}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          {showCustom && (customFrom || customTo)
            ? `${customFrom || '?'} → ${customTo || 'hoy'}`
            : 'Personalizado'}
        </button>

        {showCustom && (
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 bg-card border border-border rounded-xl shadow-2xl p-3 flex items-center gap-2 whitespace-nowrap">
            <input
              type="date" value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="px-2 py-1 text-xs rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-[#60a5fa]/50"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <input
              type="date" value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="px-2 py-1 text-xs rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-[#60a5fa]/50"
            />
            {(customFrom || customTo) && (
              <button onClick={() => { setCustomFrom(''); setCustomTo('') }}
                className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Estado de Tienda (tabla interna del almacén) ──────────────
function EstadoTiendaTable({ breakdown, total }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-medium">Estado de Tienda</h3>
        <Link to="/bd-tkc" className="text-xs text-[#4ade80] hover:underline">Ver catálogo →</Link>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Estado</th>
            <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground w-16">Cant.</th>
            <th className="px-4 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Distribución</th>
            <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground w-12">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {EST_ORDER.map(est => {
            const n = breakdown[est] ?? 0
            if (n === 0) return null
            const pct   = total > 0 ? (n / total * 100) : 0
            const color = EST_COLOR[est] ?? '#888'
            return (
              <tr key={est} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="text-xs font-medium">{est}</span>
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sm font-semibold">{n.toLocaleString()}</td>
                <td className="px-4 py-2.5 hidden sm:table-cell">
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 1)}%`, background: color }} />
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">{pct.toFixed(1)}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function VencimientosWidget({ lotes }) {
  const [tab, setTab] = useState('vencido')
  const filtered = lotes.filter(l => l.estado_fv === tab).slice(0, 6)
  const counts = {
    vencido:    lotes.filter(l => l.estado_fv === 'vencido').length,
    critico:    lotes.filter(l => l.estado_fv === 'critico').length,
    por_vencer: lotes.filter(l => l.estado_fv === 'por_vencer').length,
  }
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-medium">Vencimientos</h3>
        <Link to="/lotes" className="text-xs text-[#4ade80] hover:underline">Ver todos →</Link>
      </div>
      <div className="flex border-b border-border">
        {[['vencido','Vencidos','#e24b4a'],['critico','Críticos','#fb923c'],['por_vencer','Por vencer','#facc15']].map(([key, label, color]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${tab === key ? 'border-b-2' : 'text-muted-foreground hover:text-foreground'}`}
            style={{ borderColor: tab === key ? color : 'transparent', color: tab === key ? color : undefined }}
          >
            {label} {counts[key] > 0 && <span>({counts[key]})</span>}
          </button>
        ))}
      </div>
      <div className="divide-y divide-border">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Sin registros</p>
        ) : filtered.map(l => (
          <div key={l.id} className="px-4 py-2.5 flex items-start justify-between gap-2">
            <p className="text-xs line-clamp-2 text-foreground flex-1">{l.producto_nombre}</p>
            <div className="text-right flex-shrink-0">
              <p className="text-xs font-mono">{l.fecha_vencimiento}</p>
              <p className="text-[10px] text-muted-foreground">EF: {l.cantidad}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MermasTable({ mermas, period }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-medium">Mermas <span className="text-xs text-muted-foreground">({period})</span></h3>
        <Link to="/mermas" className="text-xs text-[#4ade80] hover:underline">Ver todas →</Link>
      </div>
      {mermas.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">Sin mermas en el período</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Producto</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Monto</th>
              <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mermas.map(m => (
              <tr key={m.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5">
                  <p className="text-xs font-medium line-clamp-1">{m.producto_nombre}</p>
                  <p className="text-[10px] text-muted-foreground">{m.clasif_merma || m.producto_codigo}</p>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs hidden sm:table-cell">
                  {m.total_perdida > 0 ? `$${Number(m.total_perdida).toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{ color: TAREA_COLOR[m.estado_tarea] ?? '#888', background: (TAREA_COLOR[m.estado_tarea] ?? '#888') + '18' }}>
                    {m.estado_tarea}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function InventariosTable({ inventarios, period }) {
  const difColor = d => d === 0 ? '#4ade80' : d > 0 ? '#facc15' : '#e24b4a'
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-medium">Inventarios <span className="text-xs text-muted-foreground">({period})</span></h3>
        <Link to="/inventario" className="text-xs text-[#4ade80] hover:underline">Ver todos →</Link>
      </div>
      {inventarios.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">Sin inventarios en el período</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Producto</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Diferencia</th>
              <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {inventarios.map(i => (
              <tr key={i.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5">
                  <p className="text-xs font-medium line-clamp-1">{i.producto_nombre}</p>
                  <p className="text-[10px] text-muted-foreground">{i.clasif_ajuste || '—'}</p>
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold text-sm" style={{ color: difColor(i.diferencia) }}>
                  {i.diferencia > 0 ? '+' : ''}{i.diferencia}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{ color: TAREA_COLOR[i.estado_tarea] ?? '#888', background: (TAREA_COLOR[i.estado_tarea] ?? '#888') + '18' }}>
                    {i.estado_tarea}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────
export default function Dashboard() {
  const [period, setPeriod]           = useState('30D')
  const [customFrom, setCustomFrom]   = useState('')
  const [customTo, setCustomTo]       = useState('')
  const [showCustom, setShowCustom]   = useState(false)
  const [kpiModal, setKpiModal]       = useState(null)   // null | 'conStock' | 'enTienda' | ...
  const { almacen, setAlmacen, almacenesConfig } = useAlmacen()

  const { data: allAlmacenes = [] } = useQuery({
    queryKey: ['almacenes_externos'],
    queryFn:  fetchAlmacenes,
    staleTime: 10 * 60 * 1000,
    enabled:  isExternaConfigured,
    select:   d => Array.isArray(d) ? d : [],
  })
  const almacenes = useMemo(
    () => filterAlmacenesByConfig(allAlmacenes, almacenesConfig),
    [allAlmacenes, almacenesConfig]
  )

  // ── Última sincronización TKC ─────────────────────────────
  const { data: lastSync } = useQuery({
    queryKey: ['last_sync_tkc'],
    queryFn: async () => {
      const { data } = await supabase
        .from('historial_movimientos')
        .select('fecha, valor_nuevo')
        .eq('tipo_cambio', 'importacion')
        .eq('campo', 'sync_externo')
        .not('fecha', 'is', null)
        .order('fecha', { ascending: false })
        .limit(1)
      return data?.[0] ?? null
    },
    staleTime: 60 * 1000,
  })

  // ── Rango de fechas activo ────────────────────────────────
  const isCustomActive = showCustom && (customFrom || customTo)
  const startDate = isCustomActive
    ? new Date(customFrom ? customFrom + 'T00:00:00' : Date.now() - 30 * 86400000)
    : new Date(Date.now() - (PERIODS.find(p => p.key === period)?.days ?? 30) * 86400000)
  const endDate = isCustomActive && customTo ? new Date(customTo + 'T23:59:59') : new Date()
  const periodLabel = isCustomActive ? `${customFrom || '?'} → ${customTo || 'hoy'}` : period

  const isGlobalMode = !almacen

  // ── Productos ────────────────────────────────────────────
  const { data: prodRows = [], isLoading: loadingProds } = useQuery({
    queryKey: ['dash_prods', almacen],
    queryFn:  () => fetchAllProductos(almacen, 'almacen_num, id_tienda, exist_fisica, almacen, tienda'),
    select:   d => Array.isArray(d) ? d : [],
  })

  // ── Breakdown por almacén (modo global) ──────────────────
  const almacenBreakdown = useMemo(() => {
    if (!isGlobalMode || !prodRows.length) return []
    const map = {}
    for (const p of prodRows) {
      const key = p.almacen_num || 'Sin asignar'
      if (!map[key]) map[key] = { almacen: key, total: 0, conStock: 0, enTienda: 0, sinTienda: 0, sinId: 0, sinReserva: 0, agotados: 0 }
      map[key].total++
      const ef = Number(p.exist_fisica ?? 0)
      const a  = Number(p.almacen ?? 0)
      const t  = Number(p.tienda  ?? 0)
      if (ef > 0) map[key].conStock++
      if (t > 0)  map[key].enTienda++
      if (ef > 0 && t === 0)  map[key].sinTienda++
      if (!p.id_tienda && ef > 0) map[key].sinId++
      if (ef > 0 && a === 0 && t > 6) map[key].sinReserva++
      if (p.id_tienda && ef === 0)    map[key].agotados++
    }
    return Object.values(map).sort((a, b) => {
      const na = parseInt(a.almacen, 10), nb = parseInt(b.almacen, 10)
      return (!isNaN(na) && !isNaN(nb)) ? na - nb : a.almacen.localeCompare(b.almacen)
    })
  }, [prodRows, isGlobalMode])

  // ── Mermas ───────────────────────────────────────────────
  const { data: mermas = [] } = useQuery({
    queryKey: ['dash_mermas', period, customFrom, customTo, almacen],
    queryFn: async () => {
      let q = supabase.from('mermas')
        .select('id,producto_nombre,producto_codigo,cantidad,total_perdida,estado_tarea,clasif_merma,created_date')
        .gte('created_date', startDate.toISOString())
      if (almacen) q = q.eq('almacen_num', almacen)
      if (isCustomActive && customTo) q = q.lte('created_date', endDate.toISOString())
      const { data } = await q.order('created_date', { ascending: false }).limit(100)
      return data ?? []
    },
    select: d => Array.isArray(d) ? d : [],
  })

  // ── Inventarios ──────────────────────────────────────────
  const { data: inventarios = [] } = useQuery({
    queryKey: ['dash_inventarios', period, customFrom, customTo, almacen],
    queryFn: async () => {
      let q = supabase.from('inventarios')
        .select('id,producto_nombre,diferencia,estado_tarea,clasif_ajuste,created_date')
        .gte('created_date', startDate.toISOString())
      if (almacen) q = q.eq('almacen_num', almacen)
      if (isCustomActive && customTo) q = q.lte('created_date', endDate.toISOString())
      const { data } = await q.order('created_date', { ascending: false }).limit(100)
      return data ?? []
    },
    select: d => Array.isArray(d) ? d : [],
  })

  // ── Lotes ────────────────────────────────────────────────
  const { data: lotes = [] } = useQuery({
    queryKey: ['dash_lotes'],
    queryFn: async () => {
      const { data } = await supabase.from('lotes_vigencia')
        .select('id,producto_nombre,estado_fv,fecha_vencimiento,cantidad')
        .in('estado_fv', ['vencido','critico','por_vencer'])
        .order('fecha_vencimiento', { ascending: true }).limit(50)
      return data ?? []
    },
    select: d => Array.isArray(d) ? d : [],
  })

  // ── Stats del almacén / globales ─────────────────────────
  const stats = useMemo(() => {
    const breakdown = {}
    let conStock = 0, agotados = 0, sinReserva = 0, noTienda = 0, sinId = 0, enTienda = 0, sinIdEf0 = 0
    for (const p of prodRows) {
      const ef  = Number(p.exist_fisica ?? 0)
      const a   = Number(p.almacen ?? 0)
      const t   = Number(p.tienda  ?? 0)
      const est = calcEst(p.id_tienda, ef, a, t)
      breakdown[est] = (breakdown[est] ?? 0) + 1
      if (ef > 0) conStock++
      if (t > 0)  enTienda++
      if (p.id_tienda && ef === 0) agotados++
      if (!p.id_tienda && ef === 0) sinIdEf0++
      if (est === 'SIN RESERVA') sinReserva++
      if (est === 'NO TIENDA')   noTienda++
      if (!p.id_tienda && ef > 0) sinId++
    }
    return { total: prodRows.length, conStock, agotados, sinReserva, noTienda, sinId, enTienda, sinIdEf0, breakdown }
  }, [prodRows])

  const mermaStats = useMemo(() => ({
    total:    mermas.length,
    monto:    mermas.filter(m => m.estado_tarea === 'completado').reduce((s, m) => s + (m.total_perdida || 0), 0),
    pendFact: mermas.filter(m => m.estado_tarea === 'pend_fact').length,
  }), [mermas])

  const invStats = useMemo(() => ({
    total:    inventarios.length,
    enAudit:  inventarios.filter(i => i.estado_tarea === 'en_auditoria').length,
    pendFact: inventarios.filter(i => i.estado_tarea === 'pend_fact').length,
  }), [inventarios])

  const syncLabel = fmtDate(lastSync?.fecha)
  const openModal = key => setKpiModal(key)

  return (
    <div className="space-y-5 p-4 lg:p-6">

      {/* ── Modal KPI ── */}
      {kpiModal && (
        <KPIBreakdownModal
          metricKey={kpiModal}
          breakdown={almacenBreakdown}
          onClose={() => setKpiModal(null)}
        />
      )}

      {/* ── Header ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-medium text-foreground">Panel de Control General</h1>
            {syncLabel && (
              <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Sync TKC: {syncLabel}
              </p>
            )}
          </div>
          <div className="relative">
            <select
              value={almacen}
              onChange={e => setAlmacen(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 text-sm rounded-lg bg-muted border border-border text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-[#4ade80]/50 cursor-pointer"
            >
              <option value="">— Todos los almacenes —</option>
              {almacenes.map(a => <option key={a} value={a}>Almacén {a}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        <PeriodSelector
          period={period} setPeriod={setPeriod}
          customFrom={customFrom} setCustomFrom={setCustomFrom}
          customTo={customTo} setCustomTo={setCustomTo}
          showCustom={showCustom} setShowCustom={setShowCustom}
        />
      </div>

      {/* ══════════════════ VISTA GLOBAL ══════════════════ */}
      {isGlobalMode && (
        <>
          {/* KPIs — todos clickeables, Total al último */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <DashKPI title="Con stock"    value={stats.conStock}   sub="EF > 0"                color="#4ade80" onClick={() => openModal('conStock')} />
            <DashKPI title="En tienda"    value={stats.enTienda}   sub="T > 0 · visibles"       color="#60a5fa" onClick={() => openModal('enTienda')} />
            <DashKPI title="No en Tienda" value={stats.noTienda}   sub="EF>0 · T=0"             color="#fb923c" alert={stats.noTienda > 0}   onClick={() => openModal('sinTienda')} />
            <DashKPI title="Sin Reserva"  value={stats.sinReserva} sub="urgente · A=0 y T>6"    color="#e24b4a" alert={stats.sinReserva > 0} onClick={() => openModal('sinReserva')} />
            <DashKPI title="Agotados"     value={stats.agotados}   sub={`con ID · EF=0${stats.sinIdEf0 > 0 ? ` (+${stats.sinIdEf0.toLocaleString()} sin ID)` : ''}`}
              color="#e24b4a" alert={stats.agotados > 0} onClick={() => openModal('agotados')} />
            <DashKPI title="Total SKUs"   value={stats.total}      sub="todos los almacenes"   color="#64748b" onClick={() => openModal('total')} />
          </div>

          {/* Breakdown por almacén */}
          {almacenBreakdown.length > 0 && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-medium">Estado por almacén</h3>
                <span className="text-xs text-muted-foreground">{almacenBreakdown.length} almacenes sincronizados</span>
              </div>
              {/* Cabecera */}
              <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                <span className="col-span-2">Almacén</span>
                <span className="col-span-4">Distribución EF / En Tienda</span>
                <span className="text-right col-span-1">Total</span>
                <span className="text-right col-span-1 text-[#4ade80]">c/EF</span>
                <span className="text-right col-span-1 text-[#60a5fa]">Tienda</span>
                <span className="text-right col-span-1 text-[#fb923c]">No T.</span>
                <span className="text-right col-span-1 text-[#ba7517]">Sin ID</span>
                <span className="text-right col-span-1">Cob. %</span>
              </div>
              <div className="divide-y divide-border">
                {almacenBreakdown.map(row => {
                  const stockPct  = row.total > 0 ? (row.conStock / row.total) * 100 : 0
                  const tiendaAbs = row.total > 0 ? (row.enTienda / row.total) * 100 : 0
                  const tiendaCov = row.conStock > 0 ? (row.enTienda / row.conStock) * 100 : 0
                  return (
                    <div key={row.almacen} className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center hover:bg-accent/30 transition-colors">
                      <button
                        onClick={() => setAlmacen(row.almacen)}
                        className="col-span-2 text-sm font-semibold text-foreground hover:text-[#4ade80] transition-colors text-left truncate"
                      >
                        {row.almacen}
                      </button>
                      <div className="col-span-4">
                        {/* Barra doble: verde=conStock, azul=enTienda */}
                        <div className="relative w-full h-2 bg-muted rounded-full overflow-hidden">
                          {/* Verde: proporción con stock */}
                          <div className="absolute left-0 top-0 h-full rounded-full bg-[#4ade80]"
                            style={{ width: `${Math.max(stockPct, 0.3)}%` }} />
                          {/* Azul (encima): proporción en tienda */}
                          <div className="absolute left-0 top-0 h-full rounded-full bg-[#60a5fa]"
                            style={{ width: `${Math.max(tiendaAbs, tiendaAbs > 0 ? 0.3 : 0)}%` }} />
                        </div>
                        <div className="text-[9px] text-muted-foreground mt-0.5">
                          {stockPct.toFixed(1)}% c/EF · {tiendaCov.toFixed(0)}% en tienda
                        </div>
                      </div>
                      <span className="col-span-1 text-right font-mono text-sm font-semibold">{row.total.toLocaleString()}</span>
                      <span className="col-span-1 text-right font-mono text-xs text-[#4ade80]">{row.conStock.toLocaleString()}</span>
                      <span className="col-span-1 text-right font-mono text-xs text-[#60a5fa]">{row.enTienda.toLocaleString()}</span>
                      <span className="col-span-1 text-right font-mono text-xs" style={{ color: row.sinTienda > 0 ? '#fb923c' : 'hsl(var(--muted-foreground))' }}>
                        {row.sinTienda.toLocaleString()}
                      </span>
                      <span className="col-span-1 text-right font-mono text-xs" style={{ color: row.sinId > 0 ? '#ba7517' : 'hsl(var(--muted-foreground))' }}>
                        {row.sinId.toLocaleString()}
                      </span>
                      <span className="col-span-1 text-right font-mono text-xs" style={{ color: tiendaCov >= 80 ? '#4ade80' : tiendaCov >= 50 ? '#facc15' : '#e24b4a' }}>
                        {tiendaCov.toFixed(0)}%
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="px-4 py-2.5 border-t border-border flex flex-wrap items-center gap-4 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded bg-[#4ade80] inline-block"/> Con EF (% local del almacén)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded bg-[#60a5fa] inline-block"/> En Tienda (dentro del EF)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded bg-[#fb923c] inline-block"/> No en Tienda</span>
                <span className="ml-auto font-medium">Cob. % = de los que tienen EF, cuántos están en Tienda</span>
              </div>
            </div>
          )}
          {loadingProds && (
            <p className="text-center text-sm text-muted-foreground py-4">Cargando datos…</p>
          )}
        </>
      )}

      {/* ══════════════════ VISTA POR ALMACÉN ══════════════════ */}
      {almacen && (
        <>
          {/* KPI Row 1 — 6 tarjetas igual que global */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <DashKPI title="Con stock"    value={stats.conStock}   sub={`EF > 0 · ${stats.enTienda.toLocaleString()} en tienda`} color="#4ade80" />
            <DashKPI title="En tienda"    value={stats.enTienda}   sub={`T > 0 · ${stats.total > 0 ? ((stats.enTienda/stats.total)*100).toFixed(0) : 0}% del catálogo`} color="#60a5fa" />
            <DashKPI title="No en Tienda" value={stats.noTienda}   sub="EF>0 · T=0"            color="#fb923c" alert={stats.noTienda > 0} />
            <DashKPI title="Sin Reserva"  value={stats.sinReserva} sub="urgente · A=0 y T>6"   color="#e24b4a" alert={stats.sinReserva > 0} />
            <DashKPI title="Sin ID c/EF"  value={stats.sinId}      sub="sin anuncio TKC"       color="#ba7517" alert={stats.sinId > 0} />
            <DashKPI title="Total SKUs"   value={stats.total}      sub={`${stats.agotados.toLocaleString()} agotados · ${stats.sinIdEf0.toLocaleString()} sin ID/EF`} color="#64748b" />
          </div>

          {/* KPI Row 2 — Workflow */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <DashKPI title={`Inventarios (${periodLabel})`}  value={invStats.total}    sub={`${invStats.pendFact} pend. FACT`}   color="#378add" />
            <DashKPI title="En auditoría"                    value={mermas.filter(m => m.estado_tarea === 'en_auditoria').length + invStats.enAudit} sub="total pendiente" color="#ba7517" />
            <DashKPI title={`Mermas (${periodLabel})`}       value={mermaStats.total}  sub={`${mermaStats.pendFact} pend. FACT`} color="#fb923c" />
            <DashKPI title="Monto mermas"                    value={`$${mermaStats.monto.toFixed(2)}`} sub="período completado"  color="#7f77dd" />
          </div>

          {/* Row 3 — Estado Tienda + Vencimientos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <EstadoTiendaTable breakdown={stats.breakdown} total={stats.total} />
            </div>
            <VencimientosWidget lotes={lotes} />
          </div>

          {/* Row 4 — Tablas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <InventariosTable inventarios={inventarios.slice(0, 8)} period={periodLabel} />
            <MermasTable mermas={mermas.slice(0, 8)} period={periodLabel} />
          </div>
        </>
      )}
    </div>
  )
}
