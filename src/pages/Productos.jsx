import { useState, useEffect, useRef, useMemo, useDeferredValue, lazy, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useAlmacen, filterAlmacenesByConfig } from '@/lib/useAlmacen';
import { isExternaConfigured, retryFailed } from '@/services/syncService';
import { fetchInventarioTkc, TKC_ALMACENES } from '@/services/tkcService';
import { TKC_COLUMN_DEFS, TKC_COLUMN_BY_KEY, TKC_SORT_COLUMNS, IMAGE_COL } from '@/services/tkc/columns';
import { EXISTENCIA_FILTERS } from '@/services/tkc/body';
import { warehouseName } from '@/services/tkc/warehouses';
import { getLastSync } from '@/lib/useAutoSync';
import { useSyncManager } from '@/lib/SyncContext';
import { fetchAllProductos, fetchAllRows } from '@/lib/supabaseUtils';
import { notifToast } from '@/lib/notifToast';
import { Card } from '@/components/ui/card';
import KPICard from '@/components/shared/KPICard';
import ColPicker, { loadColsWithOrder, saveColsWithOrder } from '@/components/shared/ColPicker';
import ProductHoverCard from '@/components/shared/ProductHoverCard';
import Pagination from '@/components/shared/Pagination';
import ProductoModal from '@/components/productos/ProductoModal';
// Solo se necesita al abrir el modal de importación — se carga bajo demanda.
const ImportarProductos = lazy(() => import('@/components/productos/ImportarProductos'));
import {
  Search, Package, AlertTriangle, Hash, ToggleLeft, Upload, ChevronDown, X,
  Database, RefreshCw, Clock, History,
} from 'lucide-react';
import SortTh from '@/components/shared/SortTh';
import { useSortable } from '@/lib/useSortable';

// ── Constants ─────────────────────────────────────────────────
const PAGE_SIZE = 50;
const PROD_COLS_KEY = 'prod_cols';

const PROD_COL_DEFS = [
  { key: 'imagen',        label: 'Imagen',        defaultOn: true,  required: false },
  { key: 'nombre',        label: 'Nombre',         defaultOn: true,  required: true  },
  { key: 'codigo',        label: 'Código / ID',    defaultOn: true,  required: false },
  { key: 'id_tienda',     label: 'ID Tienda',      defaultOn: false, required: false },
  { key: 'suministrador', label: 'Suministrador',  defaultOn: false, required: false },
  { key: 'ef',            label: 'EF',             defaultOn: true,  required: true  },
  { key: 'a',             label: 'A (Reserva)',     defaultOn: true,  required: true  },
  { key: 't',             label: 'T (Tienda)',      defaultOn: true,  required: true  },
  { key: 'precio',        label: 'Precio',         defaultOn: true,  required: false },
  { key: 'estado_anuncio',label: 'Estado Anuncio', defaultOn: true,  required: false },
  { key: 'estado_tienda', label: 'Estado Tienda',  defaultOn: false, required: false },
  { key: 'categoria',     label: 'Categoría',      defaultOn: false, required: false },
];

const DEFAULT_FILTERS = {
  existencia: 'all', suministrador: '', categoria: '',
  estadoTienda: 'all', estadoAnuncio: 'all', precioMin: '', precioMax: '',
};

// ── TKC (lectura directa del DataTables de TKC) ───────────────
const TKC_COLS_KEY   = 'tkc_cols';
const TKC_PAGE_SIZES = [50, 100, 250];
const TKC_EXISTENCIA_DEFAULT = 'existencia';
const TKC_EXISTENCIA_LABELS = { todos: 'Todos', existencia: 'Con existencia', 'no-existencia': 'Sin existencia' };
const TKC_EXISTENCIA_OPTIONS = EXISTENCIA_FILTERS.map((value) => ({ value, label: TKC_EXISTENCIA_LABELS[value] }));

// Mismo formato numérico que la tabla de elineas-vd.
const numberFmt   = new Intl.NumberFormat('es-CU');
const currencyFmt = new Intl.NumberFormat('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Formatea una celda TKC según su definición de columna. Vacío → "—". */
function formatTkcCell(value, def) {
  if (def?.numeric) {
    if (value === null || value === undefined || value === '') return '—';
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return def.currency ? currencyFmt.format(n) : numberFmt.format(n);
  }
  return value === '' || value === null || value === undefined ? '—' : String(value);
}

// ── Helpers ───────────────────────────────────────────────────
function calcEstadoAnuncio(idTienda, ef, a, t) {
  const hasId = idTienda && String(idTienda).trim() !== '';
  if (!hasId && ef === 0)           return 'SIN ID EF=0';
  if (!hasId && ef > 0)             return 'SIN ID EF>0';
  if (hasId && a === 0 && t > 6)   return 'DESACTIVADO MUERTO EF=0';
  if (hasId && t === 0 && ef > 10) return 'DESACTIVADO MUERTO EF>0';
  if (hasId && ef === 0)           return 'DESACTIVADO EF=0';
  if (hasId && ef > 0)             return 'ACTIVADO';
  return 'DESACTIVADO EF=0';
}

function calcEstadoTienda(idTienda, ef, a, t) {
  const hasId = idTienda && String(idTienda).trim() !== '';
  if (!hasId && ef === 0)          return { estado: 'SIN ID',         prio: 10 };
  if (hasId  && ef === 0)          return { estado: 'AGOTADO',        prio: 11 };
  if (a === 0 && t > 6)           return { estado: 'SIN RESERVA',    prio: 1  };
  if (t === 0 && ef > 10)         return { estado: 'NO TIENDA',      prio: 2  };
  if (t === 0 && ef <= 10)        return { estado: 'NO TIENDA',      prio: 3  };
  if (t > 1 && t < a && a <= 10)  return { estado: 'ULTIMAS PIEZAS', prio: 4  };
  if (a >= 0 && a < t && t <= 10) return { estado: 'ULTIMAS PIEZAS', prio: 6  };
  if (t <= 10)                    return { estado: 'PROXIMO',        prio: 5  };
  if (t <= a)                     return { estado: 'DISPONIBLE',     prio: 7  };
  if (a < t)                      return { estado: 'DISPONIBLE',     prio: 8  };
  return { estado: 'SIN DATOS', prio: 99 };
}

function calcEtLabel(idTienda, ef, a, t) {
  return calcEstadoTienda(idTienda, ef, a, t).estado;
}

function grupoAnuncio(idTienda, ef, a, t) {
  const full = calcEstadoAnuncio(idTienda, ef, a, t);
  if (full === 'ACTIVADO') return 'ACTIVADO';
  if (full.includes('MUERTO')) return 'MUERTO';
  if (full.startsWith('DESACTIVADO')) return 'DESACTIVADO';
  return 'SIN ID';
}

const EA_STYLE = {
  'ACTIVADO':                { cls: 'text-[#4ade80] bg-[#4ade80]/10' },
  'DESACTIVADO EF=0':        { cls: 'text-[#facc15] bg-[#facc15]/10' },
  'DESACTIVADO EF>0':        { cls: 'text-[#fb923c] bg-[#fb923c]/10' },
  'DESACTIVADO MUERTO EF=0': { cls: 'text-[#e24b4a] bg-[#e24b4a]/10' },
  'DESACTIVADO MUERTO EF>0': { cls: 'text-[#e24b4a] bg-[#e24b4a]/10' },
  'SIN ID EF=0':             { cls: 'text-[#64748b] bg-[#64748b]/10' },
  'SIN ID EF>0':             { cls: 'text-[#94a3b8] bg-[#94a3b8]/10' },
};
const EA_LABEL = {
  'ACTIVADO':                'ACTIVADO',
  'DESACTIVADO EF=0':        'DESACTIVADO',
  'DESACTIVADO EF>0':        'DESACT.',
  'DESACTIVADO MUERTO EF=0': 'MUERTO',
  'DESACTIVADO MUERTO EF>0': 'MUERTO EF>0',
  'SIN ID EF=0':             'SIN ID',
  'SIN ID EF>0':             'SIN ID c/EF',
};
const ET_LABEL_COLOR = {
  'SIN RESERVA':'#e24b4a','NO TIENDA':'#fb923c','ULTIMAS PIEZAS':'#facc15',
  'PROXIMO':'#60a5fa','DISPONIBLE':'#4ade80','AGOTADO':'#e24b4a','SIN ID':'#64748b',
};

// ── Sub-components ────────────────────────────────────────────
function ProductImg({ fotos, nombre }) {
  const [err, setErr] = useState(false);
  const src = Array.isArray(fotos) && fotos.length > 0 ? fotos[0] : null;
  if (!src || err) {
    return (
      <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center flex-shrink-0">
        <Package className="w-4 h-4 text-muted-foreground/30" />
      </div>
    );
  }
  return (
    <img src={src} alt={nombre} onError={() => setErr(true)}
      className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-muted border border-border" />
  );
}

function FailureHistoryRecord({ record, onRetry, isPending }) {
  const [expanded, setExpanded] = useState(false);
  const fmt = (iso) => iso ? new Date(iso).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  return (
    <div className="rounded-lg border border-[#e24b4a]/20 bg-[#e24b4a]/5 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 gap-2">
        <div className="flex items-center gap-2 text-xs min-w-0">
          <span className="text-[#e24b4a] font-medium whitespace-nowrap">{record.fallidos} fallidos</span>
          <span className="text-muted-foreground truncate">{fmt(record.fecha)}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {record.failures?.length > 0 && (
            <button onClick={() => onRetry(record.failures)} disabled={isPending}
              className="text-xs px-2.5 py-1 rounded-md bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/20 hover:bg-[#4ade80]/20 disabled:opacity-50">
              {isPending ? 'Reintentando…' : 'Reintentar'}
            </button>
          )}
          <button onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-1">
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            {expanded ? 'Ocultar' : 'Detalle'}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-[#e24b4a]/10 px-3 py-2 max-h-40 overflow-y-auto space-y-0.5">
          {!record.failures?.length ? (
            <p className="text-xs text-muted-foreground italic">Detalle no disponible.</p>
          ) : record.failures.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-xs py-1 border-b border-[#e24b4a]/10 last:border-0">
              <span className="text-foreground font-medium min-w-0 flex-1 line-clamp-1">{f.nombre || f.id_tienda || f.codigo}</span>
              <span className="text-[#e24b4a] flex-shrink-0 text-[10px] max-w-[55%] text-right">{f.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Valor retrasado hasta que deja de cambiar durante `delay` ms.
 *
 * La tabla TKC busca en el servidor: sin esto, cada tecla lanzaría una petición
 * al DataTables de TKC (~3 s cada una). `useDeferredValue` no sirve aquí —
 * solo retrasa el render, no la petición.
 */
function useDebounced(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function SearchableSelect({ value, onChange, options, placeholder, maxWidth = 'max-w-[160px]' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);

  const label = options.find(o => o.value === value)?.label ?? placeholder;
  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0); }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" title={label}
        onClick={() => { setOpen(v => !v); setQuery(''); }}
        className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:border-[#4ade80]/30 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#4ade80]/50 ${maxWidth}`}>
        <span className="truncate flex-1 min-w-0 text-left">{label}</span>
        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 rounded-xl shadow-2xl overflow-hidden"
          style={{ width: '240px', background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar…"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#4ade80]/50" />
            </div>
          </div>
          <div className="py-1 max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-xs text-muted-foreground text-center">Sin resultados</p>
            ) : filtered.map(o => (
              <button key={o.value} type="button"
                onClick={() => { onChange(o.value); setOpen(false); setQuery(''); }}
                className={`w-full text-left px-4 py-2 text-sm truncate transition-colors hover:bg-white/[0.04] ${value === o.value ? 'text-[#4ade80]' : 'text-muted-foreground hover:text-foreground'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function Productos({ initialSource = 'elineas' }) {
  const { user } = useAuth();
  const { almacen, setAlmacen, almacenesConfig } = useAlmacen();
  const queryClient = useQueryClient();
  const { syncOne, isRunning } = useSyncManager();
  const role = user?.role || 'inv';

  // ── Source toggle ──────────────────────────────────────────
  const [source, setSource] = useState(initialSource);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);   // ELíneas: filtra en memoria
  const debouncedSearch = useDebounced(search, 400); // TKC: filtra en el servidor
  const [page, setPage] = useState(1);
  const [hoveredProduct, setHoveredProduct] = useState(null);
  const resetPage = () => setPage(1);

  const switchSource = (s) => { setSource(s); setSearch(''); setPage(1); };

  // ── ELíneas state ──────────────────────────────────────────
  const [selectedId, setSelectedId] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [cols, setCols] = useState(() => loadColsWithOrder(PROD_COLS_KEY, PROD_COL_DEFS).visible);
  const [colOrder, setColOrder] = useState(() => loadColsWithOrder(PROD_COLS_KEY, PROD_COL_DEFS).order);
  const [advFilters, setAdvFilters] = useState(DEFAULT_FILTERS);
  const { sort, setSort, onSort } = useSortable('nombre');

  // ── TKC state ─────────────────────────────────────────────
  // La tabla TKC es "server-side": búsqueda, orden y página van en el queryKey y
  // los resuelve TKC, no un useMemo. Por eso lleva su propio estado de columnas
  // y su propio tamaño de página (el endpoint admite hasta 500).
  const [tkcLimit, setTkcLimit] = useState(TKC_PAGE_SIZES[0]);
  const [tkcCols, setTkcCols] = useState(() => loadColsWithOrder(TKC_COLS_KEY, TKC_COLUMN_DEFS).visible);
  const [tkcColOrder, setTkcColOrder] = useState(() => loadColsWithOrder(TKC_COLS_KEY, TKC_COLUMN_DEFS).order);
  const { sort: tkcSort, setSort: setTkcSort, onSort: onTkcSort } = useSortable('nombre');
  const [tkcExistencia, setTkcExistencia] = useState(TKC_EXISTENCIA_DEFAULT);
  const [syncFailures, setSyncFailures] = useState([]);
  const [showFailures, setShowFailures] = useState(false);
  const [showFailureHistory, setShowFailureHistory] = useState(false);

  // Auto-select from scanner (?scan=id)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scanId = params.get('scan');
    if (scanId) { setSelectedId(scanId); setSource('elineas'); }
  }, []);

  // ── Almacenes ──────────────────────────────────────────────
  // Catálogo estático de TKC (src/services/tkc/warehouses.js). Antes esta lista
  // se deducía paginando invGlobal hasta 500k filas solo para recoger los
  // "No. Almacén" únicos; las claves son las mismas, así que useAlmacen() y las
  // restricciones de almacenes_config por usuario siguen funcionando igual.
  const almacenes = useMemo(
    () => filterAlmacenesByConfig(TKC_ALMACENES, almacenesConfig),
    [almacenesConfig]
  );

  // ── ELíneas productos ──────────────────────────────────────
  const { data: productos = [], isLoading: loadingEL } = useQuery({
    queryKey: ['productos', almacen],
    queryFn: () => almacen ? fetchAllProductos(almacen) : [],
    select: (d) => Array.isArray(d) ? d : [],
    enabled: Boolean(almacen),
  });

  // ── TKC productos (lectura directa del DataTables de TKC) ──
  // Paginado en servidor: cada cambio de página, búsqueda u orden es una
  // petición nueva. placeholderData mantiene la página anterior en pantalla
  // mientras llega la siguiente, para que paginar no parpadee.
  const {
    data: tkcData,
    isLoading: loadingTKC,
    isFetching: fetchingTKC,
    error: tkcError,
  } = useQuery({
    queryKey: ['tkc_inv', almacen, page, tkcLimit, debouncedSearch.trim(), tkcSort.key, tkcSort.dir, tkcExistencia],
    queryFn: () => fetchInventarioTkc({
      almacen,
      page,
      limit: tkcLimit,
      search: debouncedSearch.trim(),
      sortBy: tkcSort.key,
      sortDir: tkcSort.dir,
      existencia: tkcExistencia,
    }),
    enabled: source === 'tkc' && Boolean(almacen),
    placeholderData: (prev) => prev,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: false,
  });

  const tkcRows       = tkcData?.rows ?? [];
  const tkcPagination = tkcData?.pagination;

  // Columnas visibles en el orden elegido por el usuario (ColPicker).
  const tkcVisibleCols = useMemo(
    () => tkcColOrder.filter(k => tkcCols[k]),
    [tkcColOrder, tkcCols]
  );

  // ── Last sync time (partial key so SyncContext invalidation propagates) ──
  const { data: lastSyncAt } = useQuery({
    queryKey: ['last_sync_tkc', user?.email, almacen],
    queryFn: () => getLastSync(user.email, almacen),
    enabled: !!user?.email && !!almacen,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // ── Failure history ────────────────────────────────────────
  const { data: failureHistory = [] } = useQuery({
    queryKey: ['sync_failures_history', almacen],
    queryFn: async () => {
      const { data } = await supabase
        .from('historial_movimientos')
        .select('id, valor_nuevo, fecha')
        .eq('campo', 'sync_errores')
        .order('fecha', { ascending: false })
        .limit(100);
      return (data ?? []).map(r => {
        try {
          const p = JSON.parse(r.valor_nuevo);
          if (String(p.almacen) !== String(almacen)) return null;
          return { id: r.id, fecha: r.fecha, fallidos: p.fallidos ?? p.muestra?.length ?? 0, failures: p.failures ?? p.muestra ?? [] };
        } catch { return null; }
      }).filter(Boolean);
    },
    enabled: Boolean(almacen),
    staleTime: 30_000,
  });

  // ── Suministradores y categorías ──────────────────────────
  const { data: suministradores = [] } = useQuery({
    queryKey: ['filter-suministradores'],
    queryFn: async () => {
      const rows = await fetchAllRows(
        (from, to) => supabase.from('productos').select('suministrador').eq('activo', true)
          .not('suministrador', 'is', null).neq('suministrador', '').range(from, to)
      );
      return [...new Set(rows.map(p => p.suministrador))].sort();
    },
    staleTime: 15 * 60 * 1000,
    select: d => Array.isArray(d) ? d : [],
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ['filter-categorias'],
    queryFn: async () => {
      const rows = await fetchAllRows(
        (from, to) => supabase.from('productos').select('categoria_elineas').eq('activo', true)
          .not('categoria_elineas', 'is', null).neq('categoria_elineas', '').range(from, to)
      );
      return [...new Set(rows.map(p => p.categoria_elineas))].sort();
    },
    staleTime: 15 * 60 * 1000,
    select: d => Array.isArray(d) ? d : [],
  });

  // ── ELíneas computed ───────────────────────────────────────
  const counts = useMemo(() => ({
    total:     productos.length,
    activados: productos.filter(p => p.exist_fisica > 0 && p.id_tienda).length,
    desact_ef: productos.filter(p => p.id_tienda && (p.exist_fisica ?? 0) === 0).length,
    sin_id:    productos.filter(p => !p.id_tienda && (p.exist_fisica ?? 0) > 0).length,
  }), [productos]);

  const filtered = useMemo(() => {
    return productos.filter(p => {
      const ef = p.exist_fisica ?? 0, a = p.almacen ?? 0, t = p.tienda ?? 0;
      if (deferredSearch) {
        const q = deferredSearch.toLowerCase();
        if (!p.nombre?.toLowerCase().includes(q) &&
            !p.codigo_producto?.toLowerCase().includes(q) &&
            !p.suministrador?.toLowerCase().includes(q)) return false;
      }
      if (advFilters.existencia === 'con_ef'  && ef <= 0) return false;
      if (advFilters.existencia === 'sin_ef'  && ef > 0)  return false;
      if (advFilters.existencia === 'critico' && ef >= 5) return false;
      if (advFilters.estadoTienda !== 'all'   && calcEtLabel(p.id_tienda, ef, a, t) !== advFilters.estadoTienda) return false;
      if (advFilters.estadoAnuncio !== 'all'  && grupoAnuncio(p.id_tienda, ef, a, t) !== advFilters.estadoAnuncio) return false;
      if (advFilters.suministrador && p.suministrador !== advFilters.suministrador) return false;
      if (advFilters.categoria     && p.categoria_elineas !== advFilters.categoria)  return false;
      if (advFilters.precioMin     && (p.precio_costo ?? 0) < Number(advFilters.precioMin)) return false;
      if (advFilters.precioMax     && (p.precio_costo ?? 0) > Number(advFilters.precioMax)) return false;
      return true;
    });
  }, [productos, deferredSearch, advFilters]);

  const sortedEL = useMemo(() => {
    const arr = [...filtered];
    const mul = sort.dir === 'asc' ? 1 : -1;
    switch (sort.key) {
      case 'nombre':        return arr.sort((a, b) => mul * (a.nombre ?? '').localeCompare(b.nombre ?? ''));
      case 'codigo':        return arr.sort((a, b) => mul * (a.codigo_producto ?? '').localeCompare(b.codigo_producto ?? ''));
      case 'id_tienda':     return arr.sort((a, b) => mul * String(a.id_tienda ?? '').localeCompare(String(b.id_tienda ?? '')));
      case 'suministrador': return arr.sort((a, b) => mul * (a.suministrador ?? '').localeCompare(b.suministrador ?? ''));
      case 'ef':            return arr.sort((a, b) => mul * ((a.exist_fisica ?? 0) - (b.exist_fisica ?? 0)));
      case 'a':             return arr.sort((a, b) => mul * ((a.almacen ?? 0) - (b.almacen ?? 0)));
      case 't':             return arr.sort((a, b) => mul * ((a.tienda ?? 0) - (b.tienda ?? 0)));
      case 'precio':        return arr.sort((a, b) => mul * ((a.precio_costo ?? 0) - (b.precio_costo ?? 0)));
      case 'estado_anuncio':return arr.sort((a, b) => { const ea = (p) => calcEstadoAnuncio(p.id_tienda, p.exist_fisica??0, p.almacen??0, p.tienda??0); return mul * ea(a).localeCompare(ea(b)); });
      case 'estado_tienda': return arr.sort((a, b) => { const et = (p) => calcEstadoTienda(p.id_tienda, p.exist_fisica??0, p.almacen??0, p.tienda??0).prio; return mul * (et(a) - et(b)); });
      case 'categoria':     return arr.sort((a, b) => mul * (a.categoria_elineas ?? '').localeCompare(b.categoria_elineas ?? ''));
      default:              return arr;
    }
  }, [filtered, sort]);

  // ── Paginated (solo ELíneas) ───────────────────────────────
  // La vista TKC ya recibe la página hecha del servidor (tkcRows).
  const paginated = useMemo(() => {
    const from = (page - 1) * PAGE_SIZE;
    return sortedEL.slice(from, from + PAGE_SIZE);
  }, [sortedEL, page]);

  // ── Mutations ──────────────────────────────────────────────
  const updateMut = useMutation({
    mutationFn: async ({ id, data }) => {
      const producto = productos.find(p => p.id === id);
      const { error } = await supabase.from('productos').update(data).eq('id', id);
      if (error) throw error;
      if (producto) {
        const CAMPOS_TIPO = {
          exist_fisica: 'stock', almacen: 'stock', tienda: 'stock',
          precio: 'precio', precio_costo: 'precio', estado_anuncio: 'estado_anuncio',
        };
        const registros = Object.entries(data).map(([campo, valor_nuevo]) => ({
          producto_id: producto.id, producto_nombre: producto.nombre,
          producto_codigo: producto.codigo_producto,
          usuario_id: user?.email || '', usuario_nombre: user?.full_name || user?.email || '',
          tipo_cambio: CAMPOS_TIPO[campo] || 'stock', campo,
          valor_anterior: String(producto[campo] ?? ''), valor_nuevo: String(valor_nuevo ?? ''),
          origen: 'manual',
        }));
        if (registros.length) await supabase.from('historial_movimientos').insert(registros);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos', almacen] });
      setSelectedId(null);
    },
  });

  const retryMut = useMutation({
    mutationFn: (customFailures) => {
      const toRetry = Array.isArray(customFailures) ? customFailures : syncFailures;
      return retryFailed(toRetry, almacen);
    },
    onSuccess: (result) => {
      setSyncFailures(result.failures ?? []);
      setShowFailures((result.failures ?? []).length > 0);
      queryClient.invalidateQueries({ queryKey: ['productos', almacen] });
      queryClient.invalidateQueries({ queryKey: ['sync_failures_history', almacen] });
    },
    onError: (err) => notifToast({
      titulo: 'Error en reintento', mensaje: err.message, tipo: 'sistema',
      userEmail: user?.email, queryClient, variant: 'destructive',
    }),
  });

  // ── Shared helpers ─────────────────────────────────────────
  const FILTER_CLS = "appearance-none pl-3 pr-8 py-2 text-sm rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:border-[#4ade80]/30 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#4ade80]/50";
  const FILTER_INPUT_CLS = "pl-3 pr-3 py-2 text-sm rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:border-[#4ade80]/30 transition-colors focus:outline-none focus:ring-1 focus:ring-[#4ade80]/50 w-24";
  const SET_FILTER = (key) => (e) => { setAdvFilters(f => ({ ...f, [key]: e.target.value })); resetPage(); };

  const hayFiltrosEL  = search || Object.values(advFilters).some(v => v && v !== 'all');
  const hayFiltrosTKC = search || tkcSort.key !== 'nombre' || tkcSort.dir !== 'asc'
    || tkcExistencia !== TKC_EXISTENCIA_DEFAULT;

  const resetFiltros = () => {
    setSearch(''); setAdvFilters(DEFAULT_FILTERS); setSort({ key: 'nombre', dir: 'asc' });
    setTkcSort({ key: 'nombre', dir: 'asc' }); setTkcExistencia(TKC_EXISTENCIA_DEFAULT); resetPage();
  };

  const formatSync = (iso) => iso
    ? new Date(iso).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })
    : null;

  const canSync = isExternaConfigured && ['administrador', 'inv', 'superadmin'].includes(role);

  const selected = productos.find(p => p.id === selectedId);

  // ── RENDER ─────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-medium">Catálogo de Productos</h1>
          <div className="flex flex-wrap items-center gap-2 mt-0.5">
            {almacen ? (
              <p className="text-sm text-muted-foreground">
                {source === 'tkc' ? (
                  <>
                    <span className="text-foreground font-medium">{tkcPagination?.total ?? '—'}</span> en TKC
                    {' · '}{warehouseName(almacen)}
                  </>
                ) : (
                  <><span className="text-foreground font-medium">{productos.length}</span> ELíneas</>
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Gestión del catálogo TKC / ELíneas</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Source toggle */}
          {isExternaConfigured && (
            <div className="flex rounded-lg border border-border overflow-hidden text-sm">
              <button onClick={() => switchSource('elineas')}
                className={`px-3 py-1.5 transition-colors ${source === 'elineas' ? 'bg-[#4ade80]/10 text-[#4ade80]' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
                ELíneas
              </button>
              <button onClick={() => switchSource('tkc')}
                className={`px-3 py-1.5 border-l border-border flex items-center gap-1.5 transition-colors ${source === 'tkc' ? 'bg-[#4ade80]/10 text-[#4ade80]' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
                <Database className="w-3.5 h-3.5" />
                TKC
              </button>
            </div>
          )}

          {/* Almacén selector */}
          <SearchableSelect
            value={almacen}
            onChange={v => { setAlmacen(v); setSelectedId(null); resetPage(); }}
            placeholder="— Almacén —"
            maxWidth="max-w-[180px]"
            options={[
              { value: '', label: '— Almacén —' },
              ...almacenes.map(a => ({ value: a, label: warehouseName(a) })),
            ]}
          />

          {/* Sync → ELíneas (TKC view) */}
          {source === 'tkc' && canSync && almacen && (
            <button onClick={() => syncOne(almacen)} disabled={isRunning || !almacen}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#4ade80]/10 hover:bg-[#4ade80]/20 text-[#4ade80] text-sm font-medium border border-[#4ade80]/20 transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
              {isRunning ? 'Sincronizando…' : 'Sincronizar → ELíneas'}
            </button>
          )}

          {/* Import (ELíneas view) */}
          {source === 'elineas' && (role === 'administrador' || role === 'inv') && (
            <button onClick={() => setShowImport(v => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
              <Upload className="w-4 h-4" />
              Importar
            </button>
          )}
        </div>
      </div>

      {/* ── Last sync row (TKC view) ── */}
      {source === 'tkc' && almacen && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {formatSync(lastSyncAt)
              ? <>Último sync: <span className="text-foreground">{formatSync(lastSyncAt)}</span></>
              : <span className="italic">Sin sync registrado para este almacén</span>
            }
          </span>
          <button
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['tkc_inv', almacen] })
              queryClient.invalidateQueries({ queryKey: ['productos', almacen] })
            }}
            disabled={fetchingTKC}
            className="flex items-center gap-1 hover:text-foreground transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 ${fetchingTKC ? 'animate-spin' : ''}`} />
            Actualizar vista
          </button>
        </div>
      )}

      {/* ── Sin almacén ── */}
      {!almacen && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Package className="w-10 h-10 opacity-30" />
          <p className="text-sm">Selecciona un almacén para ver el catálogo</p>
        </div>
      )}

      {almacen && (
        <>
          {/* ════════════ ELINEAS VIEW ════════════ */}
          {source === 'elineas' && (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <KPICard title="Total"          value={counts.total}     icon={Package}      color="text-[#378ADD]" bgColor="bg-[#378ADD]/10" />
                <KPICard title="Con stock"      value={counts.activados} icon={ToggleLeft}    color="text-[#1D9E75]" bgColor="bg-[#1D9E75]/10" />
                <KPICard title="Agotados (TKC)" value={counts.desact_ef} icon={AlertTriangle} color="text-[#E24B4A]" bgColor="bg-[#E24B4A]/10" />
                <KPICard title="Sin ID con EF"  value={counts.sin_id}    icon={Hash}          color="text-[#BA7517]" bgColor="bg-[#BA7517]/10" />
              </div>

              {showImport && (
                <Suspense fallback={null}>
                  <ImportarProductos
                    productos={productos}
                    user={user}
                    onClose={() => setShowImport(false)}
                    onImported={() => queryClient.invalidateQueries({ queryKey: ['productos', almacen] })}
                  />
                </Suspense>
              )}

              {/* Filtros */}
              <div className="rounded-xl border border-border bg-card p-3 space-y-2.5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input value={search} onChange={e => { setSearch(e.target.value); resetPage(); }}
                    placeholder="Buscar por nombre, código o suministrador…"
                    className="w-full pl-9 pr-9 py-2 text-sm rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground hover:border-[#4ade80]/30 transition-colors focus:outline-none focus:ring-1 focus:ring-[#4ade80]/50" />
                  {search && (
                    <button onClick={() => { setSearch(''); resetPage(); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  <div className="relative">
                    <select value={advFilters.existencia} onChange={SET_FILTER('existencia')} className={FILTER_CLS}>
                      <option value="all">Existencia: todos</option>
                      <option value="con_ef">Con stock (EF &gt; 0)</option>
                      <option value="sin_ef">Sin stock (EF = 0)</option>
                      <option value="critico">Bajo stock (EF &lt; 5)</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  </div>

                  <div className="relative">
                    <select value={advFilters.estadoTienda} onChange={SET_FILTER('estadoTienda')} className={FILTER_CLS}>
                      <option value="all">Estado tienda: todos</option>
                      <option value="SIN RESERVA">Sin Reserva</option>
                      <option value="NO TIENDA">No Tienda</option>
                      <option value="ULTIMAS PIEZAS">Últimas Piezas</option>
                      <option value="PROXIMO">Próximo</option>
                      <option value="DISPONIBLE">Disponible</option>
                      <option value="AGOTADO">Agotado</option>
                      <option value="SIN ID">Sin ID TKC</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  </div>

                  <div className="relative">
                    <select value={advFilters.estadoAnuncio} onChange={SET_FILTER('estadoAnuncio')} className={FILTER_CLS}>
                      <option value="all">Anuncio: todos</option>
                      <option value="ACTIVADO">Activado</option>
                      <option value="DESACTIVADO">Desactivado</option>
                      <option value="MUERTO">Muerto</option>
                      <option value="SIN ID">Sin ID</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  </div>

                  <SearchableSelect value={advFilters.suministrador}
                    onChange={v => { setAdvFilters(f => ({ ...f, suministrador: v })); resetPage(); }}
                    placeholder="Suministrador: todos"
                    options={[
                      { value: '', label: 'Suministrador: todos' },
                      ...suministradores.map(s => ({ value: s, label: s.replace('SEL ', '') })),
                    ]} />

                  <SearchableSelect value={advFilters.categoria}
                    onChange={v => { setAdvFilters(f => ({ ...f, categoria: v })); resetPage(); }}
                    placeholder="Categoría: todas"
                    options={[
                      { value: '', label: 'Categoría: todas' },
                      ...categorias.map(c => ({ value: c, label: c })),
                    ]} />

                  <div className="flex items-center gap-1">
                    <input type="number" min="0" placeholder="$ Min"
                      value={advFilters.precioMin} onChange={SET_FILTER('precioMin')} className={FILTER_INPUT_CLS} />
                    <span className="text-muted-foreground text-xs">–</span>
                    <input type="number" min="0" placeholder="$ Max"
                      value={advFilters.precioMax} onChange={SET_FILTER('precioMax')} className={FILTER_INPUT_CLS} />
                  </div>

                  <ColPicker cols={PROD_COL_DEFS} visible={cols}
                    onChange={(next) => { setCols(next); saveColsWithOrder(PROD_COLS_KEY, next, colOrder); }}
                    storageKey={PROD_COLS_KEY} order={colOrder}
                    onOrderChange={(next) => { setColOrder(next); saveColsWithOrder(PROD_COLS_KEY, cols, next); }} />

                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-muted-foreground">{filtered.length}/{productos.length}</span>
                    {(hayFiltrosEL || sort.key !== 'nombre' || sort.dir !== 'asc') && (
                      <button onClick={resetFiltros}
                        className="flex items-center gap-1 text-xs text-[#e24b4a] hover:text-[#e24b4a]/80 transition-colors">
                        <X className="w-3 h-3" /> Limpiar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* HoverCard + Modal */}
              {hoveredProduct && <ProductHoverCard producto={hoveredProduct.p} rect={hoveredProduct.rect} />}
              <ProductoModal producto={selected} role={role} open={Boolean(selectedId)}
                onClose={() => setSelectedId(null)}
                onUpdate={(data) => updateMut.mutate({ id: selected.id, data })} />

              {/* Tabla ELíneas */}
              <Card className="overflow-hidden" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        {colOrder.filter(k => cols[k]).map(k => {
                          const ST = ({ colKey, label, className, align }) => (
                            <SortTh key={colKey} colKey={colKey} label={label} sort={sort}
                              onSort={(ck) => { onSort(ck); resetPage(); }} className={className} align={align} />
                          );
                          const TH_MAP = {
                            imagen:        <th key={k} className="w-12 px-3 py-2.5 text-xs font-medium text-muted-foreground">Img</th>,
                            nombre:        <ST key={k} colKey="nombre"        label="Nombre"        className="min-w-[180px]" />,
                            codigo:        <ST key={k} colKey="codigo"        label="Código"        className="hidden sm:table-cell" />,
                            id_tienda:     <ST key={k} colKey="id_tienda"     label="ID Tienda"     className="hidden sm:table-cell" />,
                            suministrador: <ST key={k} colKey="suministrador" label="Suministrador" className="hidden md:table-cell" />,
                            ef:            <ST key={k} colKey="ef"            label="EF"            className="hidden sm:table-cell" align="right" />,
                            a:             <ST key={k} colKey="a"             label="A"             className="hidden sm:table-cell" align="right" />,
                            t:             <ST key={k} colKey="t"             label="T"             className="hidden sm:table-cell" align="right" />,
                            precio:        <ST key={k} colKey="precio"        label="Precio"        className="hidden sm:table-cell" align="right" />,
                            estado_anuncio:<ST key={k} colKey="estado_anuncio" label="Est. Anuncio" className="" align="center" />,
                            estado_tienda: <ST key={k} colKey="estado_tienda" label="Est. Tienda"   className="" align="center" />,
                            categoria:     <ST key={k} colKey="categoria" label="Categoría" className="hidden lg:table-cell" />,
                          };
                          return TH_MAP[k] ?? null;
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {loadingEL ? (
                        <tr><td colSpan={colOrder.filter(k => cols[k]).length || 5} className="p-8 text-center text-muted-foreground">Cargando…</td></tr>
                      ) : filtered.length === 0 ? (
                        <tr><td colSpan={colOrder.filter(k => cols[k]).length || 5} className="p-8 text-center text-muted-foreground">Sin registros</td></tr>
                      ) : paginated.map(p => {
                        const ef = p.exist_fisica ?? 0, a = p.almacen ?? 0, t = p.tienda ?? 0;
                        const eaFull  = calcEstadoAnuncio(p.id_tienda, ef, a, t);
                        const eaLabel = EA_LABEL[eaFull] ?? eaFull;
                        const eaCls   = (EA_STYLE[eaFull] ?? { cls: 'text-muted-foreground bg-muted' }).cls;
                        const etLabel = calcEtLabel(p.id_tienda, ef, a, t);
                        const etColor = ET_LABEL_COLOR[etLabel] ?? '#888';
                        const firstImg = Array.isArray(p.fotos) && p.fotos.length > 0 ? p.fotos[0] : null;

                        return (
                          <tr key={p.id}
                            className={`border-b hover:bg-accent/50 cursor-pointer transition-colors ${selectedId === p.id ? 'bg-accent' : ''}`}
                            onClick={() => setSelectedId(p.id)}>
                            {colOrder.filter(k => cols[k]).map(k => {
                              const TD_MAP = {
                                imagen: (
                                  <td key={k} className="p-2 text-center">
                                    {firstImg
                                      ? <img src={firstImg} alt="" onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                                          className="w-9 h-9 rounded-lg object-cover bg-muted border border-border" />
                                      : null}
                                    <div className={`w-9 h-9 rounded-lg bg-muted border border-border items-center justify-center ${firstImg ? 'hidden' : 'flex'}`}>
                                      <Package className="w-4 h-4 text-muted-foreground" />
                                    </div>
                                  </td>
                                ),
                                nombre: (
                                  <td key="nombre" className="p-3 cursor-pointer"
                                    onMouseEnter={e => setHoveredProduct({ p, rect: e.currentTarget.getBoundingClientRect() })}
                                    onMouseLeave={() => setHoveredProduct(null)}>
                                    <p className="font-medium line-clamp-2 leading-snug hover:text-[#4ade80] transition-colors">{p.nombre}</p>
                                  </td>
                                ),
                                codigo:        <td key={k} className="p-3 text-xs text-muted-foreground font-mono hidden sm:table-cell">{p.codigo_producto || '—'}</td>,
                                id_tienda:     <td key={k} className="p-3 text-xs font-mono text-muted-foreground hidden sm:table-cell">{p.id_tienda || '—'}</td>,
                                suministrador: <td key={k} className="p-3 text-xs hidden md:table-cell">{p.suministrador?.replace('SEL ', '') || '—'}</td>,
                                ef:            <td key={k} className={`p-3 text-right font-semibold tabular-nums ${ef === 0 ? 'text-[#E24B4A]' : ''}`}>{ef}</td>,
                                a:             <td key={k} className="p-3 text-right text-muted-foreground tabular-nums hidden sm:table-cell">{a}</td>,
                                t:             <td key={k} className="p-3 text-right text-muted-foreground tabular-nums hidden sm:table-cell">{t}</td>,
                                precio:        <td key={k} className="p-3 text-right hidden sm:table-cell font-mono text-sm">${(p.precio_costo ?? 0).toFixed(2)}</td>,
                                estado_anuncio:<td key={k} className="p-3 text-center"><span className={`text-[10px] px-2 py-0.5 rounded font-medium ${eaCls}`}>{eaLabel}</span></td>,
                                estado_tienda: <td key={k} className="p-3 text-center"><span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ color: etColor, background: etColor + '18' }}>{etLabel}</span></td>,
                                categoria:     <td key={k} className="p-3 text-xs text-muted-foreground hidden lg:table-cell">{p.categoria_elineas || '—'}</td>,
                              };
                              return TD_MAP[k] ?? null;
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
              </Card>
            </>
          )}

          {/* ════════════ TKC VIEW ════════════ */}
          {source === 'tkc' && (
            <>
              {/* Panel de fallidos (sesión actual) */}
              {showFailures && syncFailures.length > 0 && (
                <div className="rounded-lg border border-[#e24b4a]/30 bg-[#e24b4a]/5 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-[#e24b4a]">{syncFailures.length} productos fallidos</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => retryMut.mutate()} disabled={retryMut.isPending}
                        className="text-xs px-3 py-1 rounded-md bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/20 hover:bg-[#4ade80]/20 disabled:opacity-50">
                        {retryMut.isPending ? 'Reintentando…' : 'Reintentar fallidos'}
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
              {failureHistory.length > 0 && (
                <div>
                  <button onClick={() => setShowFailureHistory(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-[#e24b4a] hover:text-[#e24b4a]/80 transition-colors">
                    <History className="w-3.5 h-3.5" />
                    Historial de fallidos
                    <span className="px-1.5 py-0.5 rounded-full bg-[#e24b4a]/15 font-medium">{failureHistory.length}</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${showFailureHistory ? 'rotate-180' : ''}`} />
                  </button>
                  {showFailureHistory && (
                    <div className="mt-2 space-y-2">
                      {failureHistory.map(record => (
                        <FailureHistoryRecord key={record.id} record={record}
                          onRetry={(fs) => retryMut.mutate(fs)}
                          isPending={retryMut.isPending} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Búsqueda + columnas + tamaño de página.
                  Todo va al servidor: la búsqueda es `search[value]` del DataTables
                  de TKC, no un filtro en memoria. Por eso lleva debounce. */}
              <div className="rounded-xl border border-border bg-card p-3 space-y-2.5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input value={search} onChange={e => { setSearch(e.target.value); resetPage(); }}
                    placeholder="Buscar por nombre, código, proveedor…"
                    className="w-full pl-9 pr-9 py-2 text-sm rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground hover:border-[#4ade80]/30 transition-colors focus:outline-none focus:ring-1 focus:ring-[#4ade80]/50" />
                  {search && (
                    <button onClick={() => { setSearch(''); resetPage(); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  <div className="relative">
                    <select value={tkcLimit}
                      onChange={e => { setTkcLimit(Number(e.target.value)); resetPage(); }}
                      className={FILTER_CLS}>
                      {TKC_PAGE_SIZES.map(n => <option key={n} value={n}>{n} / página</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  </div>

                  <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                    {TKC_EXISTENCIA_OPTIONS.map(option => (
                      <button key={option.value} type="button"
                        onClick={() => { setTkcExistencia(option.value); resetPage(); }}
                        className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                          tkcExistencia === option.value
                            ? 'bg-[#4ade80]/10 text-[#4ade80]'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}>
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <ColPicker cols={TKC_COLUMN_DEFS} visible={tkcCols}
                    onChange={(next) => { setTkcCols(next); saveColsWithOrder(TKC_COLS_KEY, next, tkcColOrder); }}
                    storageKey={TKC_COLS_KEY} order={tkcColOrder}
                    onOrderChange={(next) => { setTkcColOrder(next); saveColsWithOrder(TKC_COLS_KEY, tkcCols, next); }} />

                  <div className="flex items-center gap-2 ml-auto">
                    {fetchingTKC && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />}
                    {tkcPagination && (
                      <span className="text-xs text-muted-foreground">
                        {tkcPagination.total} resultados · pág. {tkcPagination.page}/{tkcPagination.totalPages}
                      </span>
                    )}
                    {hayFiltrosTKC && (
                      <button onClick={resetFiltros}
                        className="flex items-center gap-1 text-xs text-[#e24b4a] hover:text-[#e24b4a]/80 transition-colors">
                        <X className="w-3 h-3" /> Limpiar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabla TKC — mismas columnas y mismos datos que elineas-vd.
                  Las filas llegan ya paginadas y ordenadas por TKC; aquí solo se
                  eligen y ordenan columnas (ColPicker) y se formatean celdas. */}
              {tkcError ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                  <AlertTriangle className="w-8 h-8 text-[#e24b4a] opacity-70" />
                  <p className="text-sm text-[#e24b4a]">No se pudo cargar el inventario de TKC</p>
                  <p className="text-xs text-muted-foreground max-w-md">{tkcError.message}</p>
                </div>
              ) : loadingTKC ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Consultando TKC…
                </div>
              ) : tkcRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <Database className="w-8 h-8 opacity-40" />
                  <p className="text-sm">
                    {search.trim()
                      ? 'Ningún producto coincide con la búsqueda'
                      : `Sin datos en TKC para ${warehouseName(almacen)}`}
                  </p>
                </div>
              ) : (
                <Card className="overflow-hidden" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-card">
                          {tkcVisibleCols.map(key => {
                            const def = TKC_COLUMN_BY_KEY[key];
                            if (!def) return null;
                            // La imagen no la ordena TKC: no es una columna del DataTables.
                            if (TKC_SORT_COLUMNS[key] === undefined) {
                              return (
                                <th key={key} className="w-14 px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                                  {def.label}
                                </th>
                              );
                            }
                            return (
                              <SortTh key={key} colKey={key} label={def.label} sort={tkcSort}
                                onSort={(k) => { onTkcSort(k); resetPage(); }}
                                align={def.numeric ? 'right' : 'left'}
                                className={key === 'nombre' ? 'min-w-[220px]' : ''} />
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {tkcRows.map(p => (
                          <tr key={p.rowId} className="hover:bg-card/60 transition-colors">
                            {tkcVisibleCols.map(key => {
                              const def = TKC_COLUMN_BY_KEY[key];
                              if (!def) return null;

                              if (key === IMAGE_COL) {
                                return (
                                  <td key={key} className="px-3 py-2">
                                    <ProductImg fotos={p.imagenes} nombre={p.nombre} />
                                  </td>
                                );
                              }
                              if (key === 'nombre') {
                                return (
                                  <td key={key} className="px-3 py-2 min-w-[220px]">
                                    <p className="font-medium leading-snug line-clamp-2">{p.nombre || '—'}</p>
                                  </td>
                                );
                              }

                              const mono = def.numeric || key === 'codigo' || key === 'codigoPyme'
                                || key === 'idOnline' || key === 'gtin';
                              return (
                                <td key={key}
                                  className={`px-3 py-2 whitespace-nowrap ${mono ? 'font-mono' : ''} ${
                                    def.numeric ? 'text-right tabular-nums' : 'text-muted-foreground'
                                  }`}>
                                  {formatTkcCell(p[key], def)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* total viene de recordsFiltered de TKC, no de rows.length */}
                  <Pagination page={page} total={tkcPagination?.total ?? 0} pageSize={tkcLimit} onPage={setPage} />
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
