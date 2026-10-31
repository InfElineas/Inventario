import { useState, useEffect, useRef, useMemo, useDeferredValue, lazy, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { useAlmacen, filterAlmacenesByConfig } from '@/lib/useAlmacen';
import { isExternaConfigured, syncFromExternal } from '@/services/syncService';
import { fetchExistenciaTkc, refrescarSubmayor, TKC_ALMACENES } from '@/services/tkcService';
import { useAccesoTkc } from '@/lib/useAccesoTkc';
import TkcBloqueoAviso from '@/components/shared/TkcBloqueoAviso';
import { fetchCatalogo } from '@/services/catalogoService';
import { TKC_COLUMN_DEFS, TKC_COLUMN_BY_KEY, TKC_SORT_COLUMNS, IMAGE_COL, ACCIONES_COL, isStockCol, esOrdenablePropia } from '@/services/tkc/columns';
import { EXISTENCIA_FILTERS } from '@/services/tkc/body';
import { warehouseName } from '@/services/tkc/warehouses';
import { getLastSync } from '@/lib/useAutoSync';
import MoverTiendaDialog from '@/components/productos/MoverTiendaDialog';
import HistorialSubmayorDialog from '@/components/productos/HistorialSubmayorDialog';
import HistorialInventarioDialog from '@/components/productos/HistorialInventarioDialog';
import { ROLES_TIENDA } from '@/lib/ajustes';
import { fetchAllProductos } from '@/lib/paginacion';
import { notifToast } from '@/lib/notifToast';
import { Card } from '@/components/ui/card';
import KPICard from '@/components/shared/KPICard';
import ColPicker, { loadColsWithOrder, saveColsWithOrder } from '@/components/shared/ColPicker';
import FiltrosPlegables from '@/components/shared/FiltrosPlegables';
import ProductHoverCard from '@/components/shared/ProductHoverCard';
import CatalogoHoverCard from '@/components/productos/CatalogoHoverCard';
import Pagination from '@/components/shared/Pagination';
import ProductoModal from '@/components/productos/ProductoModal';
// Solo se necesita al abrir el modal de importación — se carga bajo demanda.
const ImportarProductos = lazy(() => import('@/components/productos/ImportarProductos'));
import {
  Search, Package, AlertTriangle, Hash, ToggleLeft, Upload, ChevronDown, X,
  Database, RefreshCw, Clock, ArrowUpFromLine, ArrowDownToLine, MoreHorizontal, History, ClipboardList,
} from 'lucide-react';
import SortTh from '@/components/shared/SortTh';
import { useSortable } from '@/lib/useSortable';
import { base44 } from '@/api/base44Client';
import { SIN_SONDEO } from '@/lib/query-client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { tieneRol } from '@/lib/roles';

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

/**
 * Los siete estados de public."apGlobalV2", siempre ofrecidos.
 *
 * «Desactivado» hoy no devuelve nada, y no porque no existan: las hojas de
 * inventario sí los ven (en el almacén 480, 184 con existencia). Lo que pasa es
 * que `ap_rows` no está capturando el campo que los distingue —solo guarda
 * `is_dead` y `status_provider`, que son complementarios—, así que el dato no
 * llega ni a la API del monorepo ni a nosotros. El fallo está en `update-ap`.
 *
 * Por eso la lista es fija y no se deduce de lo que hay: deducirla escondería
 * la opción y, con ella, el problema. El día que se arregle aguas arriba, el
 * filtro empieza a devolver sin tocar nada aquí.
 */
const ESTADOS_ANUNCIO_TKC = [
  'ACTIVADO',
  'DESACTIVADO EF>0',
  'DESACTIVADO EF=0',
  'DESACTIVADO MUERTO EF>0',
  'DESACTIVADO MUERTO EF=0',
  'SIN ID EF>0',
  'SIN ID EF=0',
];

const DEFAULT_FILTERS = {
  existencia: 'all', suministrador: '', categoria: '',
  estadoTienda: 'all', estadoAnuncio: 'all', precioMin: '', precioMax: '',
};

// ── TKC (lectura directa del DataTables de TKC) ───────────────
// v2: se quitó "Cantidad" (era el mismo valor que EF) y el desglose EF/A/T pasó
// justo detrás del nombre. Sin cambiar la clave, quien ya abrió la tabla
// conservaría el orden viejo con las tres columnas pegadas al final.
const TKC_COLS_KEY   = 'tkc_cols_v2';
const TKC_PAGE_SIZES = [50, 100, 250];
const TKC_EXISTENCIA_DEFAULT = 'existencia';
const TKC_EXISTENCIA_LABELS = { todos: 'Todos', existencia: 'Con existencia', 'no-existencia': 'Sin existencia' };
const TKC_EXISTENCIA_OPTIONS = EXISTENCIA_FILTERS.map((value) => ({ value, label: TKC_EXISTENCIA_LABELS[value] }));

/**
 * Espera antes de pedir la existencia de una fila. El desglose sale del
 * submayor de TKC, una petición por producto: sin esta pausa, arrastrar el
 * ratón por la tabla lanzaría una consulta por cada fila que roza.
 */
const TKC_HOVER_DELAY = 300;

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
//
// Los dos estados y la prioridad se leen de la fila; aquí no se calcula nada.
//
// Antes había dos fórmulas en JavaScript que los deducían de EF/A/T. Ninguna
// coincidía con la base: la del anuncio daba ACTIVADO a cualquier cosa con
// existencia —no sabe si el anuncio está activado, eso lo dice TKC— y la de
// tienda era una copia de la columna generada que podía quedarse atrás sin que
// nadie lo notara. El mismo producto se veía distinto en esta pestaña y en la
// de TKC.
//
// `estado_tienda` y `prioridad_tienda` son columnas GENERADAS (ver
// supabase/estado_tienda_columna.sql) y `estado_anuncio_tkc` lo publica TKC.
// Son el mismo dato por el que filtra y ordena la pestaña de TKC.

const estadoAnuncioDe = (p) => p.estado_anuncio_tkc ?? '';
const estadoTiendaDe  = (p) => p.estado_tienda ?? 'SIN DATOS';
const prioridadDe     = (p) => p.prioridad_tienda ?? 99;

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
/**
 * Las acciones de una fila del catálogo.
 *
 * Un menú y no botones sueltos: empezó con subir y bajar de tienda, y la lista
 * va a seguir creciendo. Dos iconos caben en la columna; seis no, y acabarían
 * compitiendo por el sitio con los datos.
 *
 * Lo que una persona no puede hacer no se le enseña apagado: se le quita.
 */
function MenuAcciones({ producto, puedeMoverTienda, onMover, onHistorial, onConteos }) {
  const [abierto, setAbierto] = useState(false);

  const acciones = [];
  if (puedeMoverTienda) {
    acciones.push(
      { clave: 'subir', etiqueta: 'Subir a tienda', Icono: ArrowUpFromLine, color: 'text-[#4ade80]', al: () => onMover('subir') },
      { clave: 'bajar', etiqueta: 'Bajar de tienda', Icono: ArrowDownToLine, color: 'text-[#BA7517]', al: () => onMover('bajar') },
    );
  }

  // El historial lo puede mirar cualquiera: es leer, no mover nada.
  acciones.push({
    clave: 'historial', etiqueta: 'Historial del submayor', Icono: History,
    color: 'text-[#60a5fa]', al: onHistorial,
  });
  // Qué le ha contado inventario a este producto: si aparece cada semana con
  // diferencia, no es el mismo caso que si falló una vez.
  acciones.push({
    clave: 'conteos', etiqueta: 'Conteos de inventario', Icono: ClipboardList,
    color: 'text-[#a78bfa]', al: onConteos,
  });

  if (acciones.length === 0) return <span className="text-muted-foreground/40 text-xs">—</span>;

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Acciones: ${producto.nombre}`}
          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1">
        {acciones.map(({ clave, etiqueta, Icono, color, al }) => (
          <button
            key={clave} type="button"
            onClick={() => { setAbierto(false); al(); }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left hover:bg-secondary transition-colors"
          >
            <Icono className={`w-3.5 h-3.5 ${color}`} />
            {etiqueta}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function ProductImg({ fotos, nombre }) {
  const [err, setErr] = useState(false);
  const src = Array.isArray(fotos) && fotos.length > 0 ? fotos[0] : null;
  if (!src || err) {
    return (
      <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
        <Package className="w-4 h-4 text-muted-foreground/30" />
      </div>
    );
  }
  return (
    <img src={src} alt={nombre} onError={() => setErr(true)}
      className="w-10 h-10 rounded-lg object-cover shrink-0 bg-muted border border-border" />
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
        <div className="flex items-center gap-1.5 shrink-0">
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
              <span className="text-[#e24b4a] shrink-0 text-[10px] max-w-[55%] text-right">{f.msg}</span>
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

function SearchableSelect({ value, onChange, options, placeholder, maxWidth: maxWidthRaw }) {
  const maxWidth = maxWidthRaw ?? 'max-w-[160px]';
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
        className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:border-[#4ade80]/30 transition-colors cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-[#4ade80]/50 ${maxWidth}`}>
        <span className="truncate flex-1 min-w-0 text-left">{label}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 rounded-xl shadow-2xl overflow-hidden"
          style={{ width: '240px', background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar…"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-[#4ade80]/50" />
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
export default function Productos({ initialSource: initialSourceRaw }) {
  const initialSource = initialSourceRaw ?? 'tkc';
  const { user } = useAuth();
  const { tiene: conTkc, cargando: cargandoUsuario } = useAccesoTkc();
  const { almacen, setAlmacen, almacenesConfig } = useAlmacen();
  const queryClient = useQueryClient();
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
  // Fila de TKC bajo el ratón, ya pasado el debounce → dispara la consulta de existencia.
  const [hoveredTkc, setHoveredTkc] = useState(null);
  const [mover, setMover] = useState(null);   // { modulo, producto }
  const [historial, setHistorial] = useState(null);  // producto del catálogo
  const [conteos, setConteos] = useState(null);      // producto del catálogo
  // Solo decide si se ven los botones. El permiso de verdad lo comprueba la
  // API de transferencias contra el Identity Server (`up-shop:execute`).
  const puedeMoverTienda = tieneRol(user, ROLES_TIENDA);
  const hoverTimer = useRef(null);

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
  const { data: productosRaw, isLoading: loadingEL } = useQuery({
    queryKey: ['productos', almacen],
    queryFn: () => almacen ? fetchAllProductos(almacen) : [],
    select: (d) => Array.isArray(d) ? d : [],
    enabled: Boolean(almacen),
  });
  const productos = productosRaw ?? [];

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
    // El catálogo se sirve de nuestra base, no del listado de TKC en vivo.
    // TKC no sabe filtrar por lo que hace falta —su filtro de anuncio es un
    // sí/no sin «Muerto», y su `tienda` un binario almacén/tienda, no los
    // siete estados— y filtrar en el navegador sobre páginas suyas daría
    // resultados falsos. Ver src/services/catalogoService.js.
    queryKey: ['catalogo', almacen, page, tkcLimit, debouncedSearch.trim(), tkcSort.key, tkcSort.dir, tkcExistencia, advFilters.estadoTienda, advFilters.estadoAnuncio, advFilters.suministrador],
    queryFn: () => fetchCatalogo({
      almacen,
      page,
      limit: tkcLimit,
      search: debouncedSearch.trim(),
      sortBy: tkcSort.key,
      sortDir: tkcSort.dir,
      filtros: {
        existencia:    tkcExistencia,
        estadoTienda:  advFilters.estadoTienda,
        estadoAnuncio: advFilters.estadoAnuncio,
        suministrador: advFilters.suministrador,
      },
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

  // El desglose EF/A/T ya no se pide al submayor: viene en cada fila, porque
  // el catálogo se sirve de `productos`. Antes había que recorrer el almacén
  // entero —9.000 productos, unos 19 s— y las celdas giraban mientras tanto.
  //
  // El popover al pasar el ratón sí sigue preguntando en vivo, producto a
  // producto: ahí el número importa y nuestra copia puede ir hasta 18 h por
  // detrás (ver docs/migracion-supabase.md).

  // ── Existencia de la fila bajo el ratón ────────────────────────
  // Consulta individual al submayor, ~1 s. Es el dato en vivo de TKC, frente
  // al de la fila, que es nuestra copia.

  const {
    data: existenciaTkc,
    isLoading: loadingExistencia,
    error: existenciaError,
  } = useQuery({
    queryKey: ['tkc_existencia', almacen, hoveredTkc?.fila?.idOnline],
    queryFn: () => fetchExistenciaTkc({ almacen, idTienda: hoveredTkc.fila.idOnline }),
    enabled: conTkc && source === 'tkc' && Boolean(almacen) && Boolean(hoveredTkc?.fila?.idOnline),
    staleTime: 5 * 60 * 1000,
    ...SIN_SONDEO,
    gcTime: 5 * 60 * 1000,
    retry: false,
  });

  /** "Actualizar vista": relee el catálogo desde nuestra base. */
  const refrescarVistaTkc = () => {
    queryClient.invalidateQueries({ queryKey: ['catalogo', almacen] });
    queryClient.invalidateQueries({ queryKey: ['productos', almacen] });
  };

  // ── Existencias al día al abrir el catálogo ────────────────
  //
  // Las que trae la fila vienen de una foto del submayor que el cron de
  // elineas-transferencia saca dos veces al día: podían ir hasta dieciocho
  // horas por detrás, y de esos números salen el estado de tienda y la
  // prioridad del trabajo. Al entrar se le pregunta al submayor de verdad.
  //
  // No bloquea nada: la tabla se pinta con lo que hay y se corrige cuando
  // llega, que en un almacén de 9.000 productos son unos 19 s. Una vez por
  // almacén y sesión; el servidor además comparte el recorrido diez minutos,
  // así que varias personas en el mismo almacén cuestan uno.
  const submayorPedido = useRef(new Set());
  const ponerAlDiaSubmayor = useMutation({
    mutationFn: (clave) => refrescarSubmayor({ almacen: clave }),
    onSuccess: (r) => { if (r?.actualizados > 0) refrescarVistaTkc(); },
    // Que falle no rompe la pantalla: se sigue viendo la copia, que es lo que
    // se veía antes de esto.
    onError: () => {},
  });

  useEffect(() => {
    if (source !== 'tkc' || !almacen || !conTkc) return;
    if (submayorPedido.current.has(almacen)) return;
    submayorPedido.current.add(almacen);
    ponerAlDiaSubmayor.mutate(almacen);
    // `ponerAlDiaSubmayor` cambia en cada render; el guard del Set es lo que
    // impide que se repita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, almacen, conTkc]);

  /** Abre el popover tras el debounce; el rect se captura ya (luego el <tr> puede irse). */
  const onTkcRowEnter = (row, el) => {
    clearTimeout(hoverTimer.current);
    // La ficha se abre siempre, también sin ID de tienda. Antes se salía en
    // silencio y el usuario veía que «no cargaba»; ahora la tarjeta explica
    // que sin ID el submayor no puede buscarlo.
    const rect = el.getBoundingClientRect();
    hoverTimer.current = setTimeout(() => setHoveredTkc({ fila: row, rect }), TKC_HOVER_DELAY);
  };

  const onTkcRowLeave = () => {
    clearTimeout(hoverTimer.current);
    setHoveredTkc(null);
  };

  // Un temporizador vivo tras desmontar dejaría un setState huérfano.
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  // Al cambiar de página (o de filtro) las filas se sustituyen: el popover
  // quedaría anclado a una que ya no está. Solo se consulta lo visible.
  useEffect(() => {
    clearTimeout(hoverTimer.current);
    setHoveredTkc(null);
  }, [page, almacen, tkcLimit, debouncedSearch, tkcSort, tkcExistencia]);

  // ── Last sync time (partial key so SyncContext invalidation propagates) ──
  const { data: lastSyncAt } = useQuery({
    queryKey: ['last_sync_tkc', user?.email, almacen],
    queryFn: () => getLastSync(almacen),
    enabled: !!user?.email && !!almacen,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // ── Failure history ────────────────────────────────────────
  const { data: failureHistoryRaw } = useQuery({
    queryKey: ['sync_failures_history', almacen],
    queryFn: async () => {
      const data = await base44.entities.HistorialMovimiento.filter(
        { campo: 'sync_errores' }, '-fecha', 100,
      );
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
  const failureHistory = failureHistoryRaw ?? [];

  // ── Suministradores y categorías ──────────────────────────
  const { data: suministradoresRaw } = useQuery({
    queryKey: ['filter-suministradores', almacen],
    // Lo resuelve la base con un DISTINCT. Antes esto se descargaba los 55.000
    // productos —con sus 31 columnas— para quedarse con una lista de nombres.
    // Acotado al almacén: ofrecer suministradores que no tienen nada aquí
    // deja al usuario con una tabla vacía y sin saber por qué.
    queryFn: () => base44.entities.Producto.distinct('suministrador', { activo: true, ...(almacen ? { almacen_num: almacen } : {}) }),
    staleTime: 15 * 60 * 1000,
    select: d => Array.isArray(d) ? d : [],
  });
  const suministradores = suministradoresRaw ?? [];

  const { data: categoriasRaw } = useQuery({
    queryKey: ['filter-categorias'],
    queryFn: () => base44.entities.Producto.distinct('categoria_elineas', { activo: true }),
    staleTime: 15 * 60 * 1000,
    select: d => Array.isArray(d) ? d : [],
  });
  const categorias = categoriasRaw ?? [];

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
      // Mismo criterio que la pestaña de TKC: el valor completo, no un grupo.
      // Antes esto comparaba contra 'ACTIVADO' | 'MUERTO' | 'DESACTIVADO' |
      // 'SIN ID' mientras el desplegable ofrecía los siete valores enteros, así
      // que elegir cualquiera de ellos no devolvía nunca nada.
      if (advFilters.estadoTienda !== 'all'   && estadoTiendaDe(p) !== advFilters.estadoTienda) return false;
      if (advFilters.estadoAnuncio !== 'all'  && estadoAnuncioDe(p) !== advFilters.estadoAnuncio) return false;
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
      case 'estado_anuncio':return arr.sort((a, b) => mul * estadoAnuncioDe(a).localeCompare(estadoAnuncioDe(b)));
      // Por prioridad, no por nombre: ese número es el orden en que se trabaja.
      case 'estado_tienda': return arr.sort((a, b) => mul * (prioridadDe(a) - prioridadDe(b)));
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
      await base44.entities.Producto.update(id, data);
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
        if (registros.length) await base44.entities.HistorialMovimiento.createMany(registros);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos', almacen] });
      setSelectedId(null);
    },
  });

  const retryMut = useMutation({
    // Ya no hay lotes fallidos que reintentar: el sync es una sola sentencia
    // SQL en el servidor, así que "reintentar" es volver a lanzarlo.
    mutationFn: () => syncFromExternal(almacen),
    onSuccess: () => {
      setSyncFailures([]);
      setShowFailures(false);
      queryClient.invalidateQueries({ queryKey: ['productos', almacen] });
      queryClient.invalidateQueries({ queryKey: ['sync_failures_history', almacen] });
    },
    onError: (err) => notifToast({
      titulo: 'Error en reintento', mensaje: err.message, tipo: 'sistema',
      userEmail: user?.email, queryClient, variant: 'destructive',
    }),
  });

  // ── Shared helpers ─────────────────────────────────────────
  const FILTER_CLS = "appearance-none w-full sm:w-auto pl-3 pr-8 py-2 text-sm rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:border-[#4ade80]/30 transition-colors cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-[#4ade80]/50";
  const FILTER_INPUT_CLS = "pl-3 pr-3 py-2 text-sm rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:border-[#4ade80]/30 transition-colors focus:outline-hidden focus:ring-1 focus:ring-[#4ade80]/50 w-24";
  const SET_FILTER = (key) => (e) => { setAdvFilters(f => ({ ...f, [key]: e.target.value })); resetPage(); };

  const hayFiltrosEL  = search || Object.values(advFilters).some(v => v && v !== 'all');
  // Para el boton de «Filtros» del movil: un filtro puesto que no se ve es la
  // forma mas rapida de no entender por que falta algo en la lista.
  const filtrosPuestos = Object.values(advFilters).filter(v => v && v !== 'all').length;
  const hayFiltrosTKC = search || tkcSort.key !== 'nombre' || tkcSort.dir !== 'asc'
    || advFilters.estadoTienda !== 'all' || advFilters.estadoAnuncio !== 'all' || advFilters.suministrador
    || tkcExistencia !== TKC_EXISTENCIA_DEFAULT;

  const resetFiltros = () => {
    setSearch(''); setAdvFilters(DEFAULT_FILTERS); setSort({ key: 'nombre', dir: 'asc' });
    setTkcSort({ key: 'nombre', dir: 'asc' }); setTkcExistencia(TKC_EXISTENCIA_DEFAULT); resetPage();
  };

  const formatSync = (iso) => iso
    ? new Date(iso).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })
    : null;

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
                    {/* Es el total de LO FILTRADO, no lo que hay en el
                        almacén. Decía «en TKC», que se leía como «el almacén
                        tiene esto» y hacía parecer vacío un almacén con 20.000
                        productos en cuanto un filtro no dejaba pasar nada. */}
                    <span className="text-foreground font-medium">{tkcPagination?.total ?? '—'}</span> resultados
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
          {/* Fuente: solo TKC */}
          {isExternaConfigured && (
            <div className="flex rounded-lg border border-border overflow-hidden text-sm">
              <button onClick={() => switchSource('tkc')}
                className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${source === 'tkc' ? 'bg-[#4ade80]/10 text-[#4ade80]' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
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

          {/* Import (ELíneas view) */}
          {source === 'elineas' && tieneRol(user, ['administrador', 'inv']) && (
            <button onClick={() => setShowImport(v => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
              <Upload className="w-4 h-4" />
              Importar
            </button>
          )}
        </div>
      </div>

      {source === 'tkc' && !cargandoUsuario && !conTkc && (
        <TkcBloqueoAviso funcion="ver la existencia en vivo de TKC" />
      )}

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
          <div className="flex items-center gap-4">
            {ponerAlDiaSubmayor.isPending && (
              <span className="flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Poniendo al día las existencias con el submayor…
              </span>
            )}
            <button
              onClick={refrescarVistaTkc}
              disabled={fetchingTKC}
              className="flex items-center gap-1 hover:text-foreground transition-colors disabled:opacity-50">
              <RefreshCw className={`w-3 h-3 ${fetchingTKC ? 'animate-spin' : ''}`} />
              Actualizar vista
            </button>
          </div>
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
                    className="w-full pl-9 pr-9 py-2 text-sm rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground hover:border-[#4ade80]/30 transition-colors focus:outline-hidden focus:ring-1 focus:ring-[#4ade80]/50" />
                  {search && (
                    <button onClick={() => { setSearch(''); resetPage(); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <FiltrosPlegables activos={filtrosPuestos} onLimpiar={resetFiltros}>
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
                </FiltrosPlegables>
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
                        const eaFull  = estadoAnuncioDe(p);
                        const eaLabel = EA_LABEL[eaFull] ?? eaFull;
                        const eaCls   = (EA_STYLE[eaFull] ?? { cls: 'text-muted-foreground bg-muted' }).cls;
                        const etLabel = estadoTiendaDe(p);
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
                        <span className="text-[#e24b4a] shrink-0 text-[10px] max-w-[50%] text-right">{f.msg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Historial de fallidos: oculto de UI, lógica intacta (failureHistory, showFailureHistory, FailureHistoryRecord) */}

              {/* Búsqueda + columnas + tamaño de página.
                  Todo va al servidor: la búsqueda es `search[value]` del DataTables
                  de TKC, no un filtro en memoria. Por eso lleva debounce. */}
              <div className="rounded-xl border border-border bg-card p-3 space-y-2.5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input value={search} onChange={e => { setSearch(e.target.value); resetPage(); }}
                    placeholder="Buscar por nombre, código, proveedor…"
                    className="w-full pl-9 pr-9 py-2 text-sm rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground hover:border-[#4ade80]/30 transition-colors focus:outline-hidden focus:ring-1 focus:ring-[#4ade80]/50" />
                  {search && (
                    <button onClick={() => { setSearch(''); resetPage(); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <FiltrosPlegables activos={filtrosPuestos} onLimpiar={resetFiltros}>
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

                  {/* Estado de tienda: los siete que calcula la columna
                      generada `estado_tienda`. TKC no sabe filtrar por esto —su
                      filtro es un binario almacén/tienda—, por eso el catálogo
                      se sirve de nuestra base. */}
                  <div className="relative">
                    <select value={advFilters.estadoTienda} onChange={SET_FILTER('estadoTienda')} className={FILTER_CLS}>
                      <option value="all">Estado tienda: todos</option>
                      <option value="SIN RESERVA">Sin Reserva</option>
                      <option value="NO TIENDA">No Tienda</option>
                      <option value="ULTIMAS PIEZAS">Últimas Piezas</option>
                      <option value="PROXIMO">Próximo</option>
                      <option value="DISPONIBLE">Disponible</option>
                      <option value="AGOTADO">Agotado</option>
                      <option value="SIN ID">Sin ID</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  </div>

                  {/* Estado de anuncio: el de TKC (is_dead / status_provider),
                      no el que deducíamos del stock. Son cosas distintas. */}
                  <div className="relative">
                    <select value={advFilters.estadoAnuncio} onChange={SET_FILTER('estadoAnuncio')} className={FILTER_CLS}>
                      <option value="all">Anuncio: todos</option>
                      {ESTADOS_ANUNCIO_TKC.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  </div>

                  <SearchableSelect
                    value={advFilters.suministrador}
                    onChange={v => { setAdvFilters(f => ({ ...f, suministrador: v })); resetPage(); }}
                    placeholder="Suministrador"
                    maxWidth="max-w-[200px]"
                    options={[
                      { value: '', label: 'Suministrador: todos' },
                      ...suministradores.map(sx => ({ value: sx, label: sx })),
                    ]}
                  />

                  <ColPicker cols={TKC_COLUMN_DEFS} visible={tkcCols}
                    onChange={(next) => { setTkcCols(next); saveColsWithOrder(TKC_COLS_KEY, next, tkcColOrder); }}
                    storageKey={TKC_COLS_KEY} order={tkcColOrder}
                    onOrderChange={(next) => { setTkcColOrder(next); saveColsWithOrder(TKC_COLS_KEY, tkcCols, next); }} />

                  <div className="flex items-center gap-2 ml-auto">
                    {fetchingTKC && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />}
                    {tkcPagination && (
                      <span className="text-xs text-muted-foreground">
                        {tkcPagination.total} resultados · pág. {tkcPagination.page}/{tkcPagination.pages}
                      </span>
                    )}
                    {hayFiltrosTKC && (
                      <button onClick={resetFiltros}
                        className="flex items-center gap-1 text-xs text-[#e24b4a] hover:text-[#e24b4a]/80 transition-colors">
                        <X className="w-3 h-3" /> Limpiar
                      </button>
                    )}
                  </div>
                </FiltrosPlegables>
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
                  {/* Distinguir «el almacén no tiene nada» de «tus filtros no
                      dejan pasar nada» importa: lo segundo tiene arreglo y lo
                      primero no, y antes las dos cosas decían lo mismo. */}
                  {hayFiltrosTKC ? (
                    <>
                      <p className="text-sm">Ningún producto cumple los filtros</p>
                      <button onClick={resetFiltros}
                        className="flex items-center gap-1 text-xs text-[#4ade80] hover:text-[#4ade80]/80 transition-colors">
                        <X className="w-3 h-3" /> Quitar los filtros
                      </button>
                    </>
                  ) : (
                    <p className="text-sm">{warehouseName(almacen)} no tiene productos</p>
                  )}
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
                            // Ni la imagen ni EF/A/T son columnas del DataTables de TKC,
                            // así que no se pueden ordenar en el servidor.
                            // EF/A/T pasan a ser ordenables: ya no salen del
                            // submayor sino de columnas nuestras, y Postgres
                            // ordena sobre el conjunto filtrado entero.
                            if (TKC_SORT_COLUMNS[key] === undefined && !esOrdenablePropia(key)) {
                              return (
                                <th key={key}
                                  className={`px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap ${
                                    def.numeric ? 'text-right' : 'w-14 text-left'
                                  }`}>
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
                                  <td key={key} className="px-3 py-2 min-w-[220px]"
                                    onMouseEnter={e => onTkcRowEnter(p, e.currentTarget)}
                                    onMouseLeave={onTkcRowLeave}>
                                    <p className="font-medium leading-snug line-clamp-2">{p.nombre || '—'}</p>
                                  </td>
                                );
                              }
                              if (key === ACCIONES_COL) {
                                return (
                                  <td key={key} className="px-3 py-2 whitespace-nowrap">
                                    <MenuAcciones
                                      producto={p}
                                      puedeMoverTienda={puedeMoverTienda}
                                      onMover={(modulo) => setMover({ modulo, producto: p })}
                                      onHistorial={() => setHistorial(p)}
                                      onConteos={() => setConteos(p)}
                                    />
                                  </td>
                                );
                              }

                              // EF / A / T vienen en la propia fila: el catálogo
                              // se sirve de nuestra base, que ya las guarda.
                              // Antes había que esperar al recorrido completo
                              // del submayor para llenarlas.
                              if (isStockCol(key)) {
                                const value = p[key] ?? 0;
                                return (
                                  <td key={key} className="px-3 py-2 text-right tabular-nums font-mono whitespace-nowrap">
                                    <span className={key === 'ef' && value === 0 ? 'text-[#e24b4a]' : ''}>
                                      {numberFmt.format(value)}
                                    </span>
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

              {mover && (
                <MoverTiendaDialog
                  modulo={mover.modulo}
                  producto={mover.producto}
                  almacen={almacen}
                  onHecho={refrescarVistaTkc}
                  onClose={() => setMover(null)}
                />
              )}

              {conteos && (
                <HistorialInventarioDialog
                  producto={conteos}
                  almacen={almacen}
                  onClose={() => setConteos(null)}
                />
              )}

              {historial && (
                <HistorialSubmayorDialog
                  producto={historial}
                  almacen={almacen}
                  onClose={() => setHistorial(null)}
                />
              )}

              {hoveredTkc && (
                <CatalogoHoverCard
                  producto={hoveredTkc.fila}
                  rect={hoveredTkc.rect}
                  enVivo={existenciaTkc}
                  cargando={loadingExistencia}
                  error={existenciaError}
                  sinAccesoTkc={!conTkc}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
