import { useEffect, useRef, useState } from 'react';
import ColPicker, { loadColsWithOrder, saveColsWithOrder } from '@/components/shared/ColPicker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import KPICard from '@/components/shared/KPICard';
import LotBadge from '@/components/shared/LotBadge';
import { useSortable } from '@/lib/useSortable';
import ReadOnlyBlock, { ReadOnlyField } from '@/components/shared/ReadOnlyBlock';
import { Search, AlertTriangle, Clock, CheckCircle, HelpCircle, Send, MoreHorizontal,
  CalendarPlus, TrendingDown, RefreshCw, Thermometer, ArrowDownToLine, Download } from 'lucide-react';
import { format } from 'date-fns';
import { tieneRol } from '@/lib/roles';
import { ROLES_TIENDA } from '@/lib/ajustes';
import { accionesDeLote, resumenPorVencer, lotesACsv } from '@/lib/lotes';
import DialogosConteo from '@/components/inventario/AccionesConteo';
import { sugerirBajadaLote } from '@/components/productos/MoverTiendaDialog';
import { ALL_CLASIF_MERMA } from '@/lib/constants';
import { useAlmacen } from '@/lib/useAlmacen';
import { fetchLotes } from '@/services/lotesService';
import AlertBanner from '@/components/shared/AlertBanner';
import Pagination from '@/components/shared/Pagination';
import ListaResponsive from '@/components/shared/ListaResponsive';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { warehouseName } from '@/services/tkc/warehouses';
import { notifyJefeDepto } from '@/lib/notificationService';
import { FiltroIcono, SelectorAlmacen } from '@/components/shared/ControlesLista';
import CabeceraLista from '@/components/shared/CabeceraLista';

const LOTE_COL_DEFS = [
  { key: 'producto_nombre',   label: 'Producto',  defaultOn: true,  required: true  },
  { key: 'no_lote',           label: 'Lote',      defaultOn: true,  required: false },
  { key: 'temperatura',       label: 'Temp.',     defaultOn: true,  required: false },
  { key: 'fecha_vencimiento', label: 'FV',        defaultOn: true,  required: false },
  { key: 'cantidad',          label: 'Cant.',     defaultOn: true,  required: false },
  { key: 'estado_fv',         label: 'Estado',    defaultOn: true,  required: false },
  { key: 'accion',            label: 'Accion',    defaultOn: true,  required: true  },
]
const LOTE_COLS_KEY = 'lote_cols'

/** Un almacén tiene miles de lotes; pintarlos todos cuelga el navegador. */
const PAGE_SIZE = 50

/**
 * Las pestañas, de lo más urgente a lo que no corre prisa.
 *
 * «Sin fecha» va en una propia y no mezclado: no es un estado de vigencia,
 * es un dato que falta, y lo que hay que hacer con él —ir a mirar el envase—
 * no se parece en nada a lo que se hace con un lote que vence en diez días.
 */
const ESTADOS = [
  { clave: 'vencido',    label: 'Vencidos' },
  { clave: 'critico',    label: 'Críticos',   rango: '≤ 15 días' },
  { clave: 'por_vencer', label: 'Por vencer', rango: '16 a 30 días' },
  { clave: 'vigente',    label: 'Vigentes',   rango: '+ 30 días' },
  { clave: 'sin_fecha',  label: 'Sin fecha' },
]

/** Cómo se titula y alinea cada columna. La usan la cabecera y las celdas. */
const COL_TITULO = {
  producto_nombre:   { label: 'Producto' },
  no_lote:           { label: 'Lote' },
  temperatura:       { label: 'Temp.', align: 'center' },
  fecha_vencimiento: { label: 'FV' },
  cantidad:          { label: 'Cant.', align: 'right' },
  estado_fv:         { label: 'Estado', align: 'center' },
  accion:            { label: 'Accion', align: 'center' },
}

export default function Lotes() {
  const [cols, setCols] = useState(() => loadColsWithOrder(LOTE_COLS_KEY, LOTE_COL_DEFS).visible);
  const [colOrder, setColOrder] = useState(() => loadColsWithOrder(LOTE_COLS_KEY, LOTE_COL_DEFS).order);
  const [estado, setEstado] = useState('all');
  const [filterTemp, setFilterTemp] = useState('all');
  const [searchQ, setSearchQ] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [accion, setAccion] = useState(null);   // 'ic' | 'editar' | 'merma'
  const [bajando, setBajando] = useState(null);   // lote que se baja de tienda
  const [page, setPage] = useState(1);
  const [icForm, setIcForm] = useState({ cant_x_vencer: '', clasif_inv: '', nota_inv: '', propuesta_precio_ic: '', precio_restaurar: '', notas_ic: '' });
  const { sort, onSort } = useSortable('fecha_vencimiento', 'asc');
  const queryClient = useQueryClient();

  const { almacen, setAlmacen, almacenesConfig } = useAlmacen();

  // Mismo patrón que Inventario, Mermas y Reabastecimiento, y con el ALMACÉN
  // dentro: antes, al cambiar de almacén te quedabas en la página cuarenta
  // del nuevo, que casi siempre está vacía.
  const firmaFiltros = `${almacen}|${estado}|${filterTemp}|${searchQ.trim()}|${sort.key}|${sort.dir}`;
  const firmaPrevia = useRef(firmaFiltros);
  useEffect(() => {
    if (firmaPrevia.current !== firmaFiltros) { firmaPrevia.current = firmaFiltros; setPage(1); }
  }, [firmaFiltros]);

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

  // Del informe central, no de `inventario.lotes`: esa tabla no la llenaba
  // nadie y la pantalla llevaba vacía desde el principio.
  const { data: lotesRaw, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['lotes', almacen],
    queryFn: () => fetchLotes({ almacen }),
    enabled: Boolean(almacen),
    retry: false,
  });
  const lotes = lotesRaw ?? [];

  const cerrar = () => { setSelectedId(null); setAccion(null); };

  const createIcMut = useMutation({
    mutationFn: (data) => base44.entities.LoteIC.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lotes'] }); cerrar(); },
    onError: (e) => alert(e.message),
  });

  /**
   * La fecha que inventario leyó del envase.
   *
   * No se puede escribir en el informe central, así que se guarda aparte y se
   * superpone al leer: el estado de vigencia pasa a calcularse con ella.
   */
  const createRevisionMut = useMutation({
    mutationFn: (data) => base44.entities.LoteRevision.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lotes'] });
      // Una fecha corregida cambia el estado del lote: el panel y el menú
      // cuentan de este resumen, no de la lista de arriba.
      queryClient.invalidateQueries({ queryKey: ['lotes-resumen'] });
      cerrar();
    },
    onError: (e) => alert(e.message),
  });

  /** Un lote vencido con existencia no es un aviso: es una merma. */
  const createMermaMut = useMutation({
    mutationFn: (data) => base44.entities.Merma.create(data),
    onSuccess: (_r, v) => {
      queryClient.invalidateQueries({ queryKey: ['mermas'] });
      notifyJefeDepto(
        'inventario', 'merma', 'Merma por lote vencido',
        `${v.producto_nombre} — ${v.cantidad} u. del lote ${v.notas ? '' : ''}por ${user?.full_name || user?.email || '—'}`,
      ).catch(() => {});
      cerrar();
    },
    onError: (e) => alert(e.message),
  });

  const counts = {
    vencido: lotes.filter(l => l.estado_fv === 'vencido').length,
    critico: lotes.filter(l => l.estado_fv === 'critico').length,
    por_vencer: lotes.filter(l => l.estado_fv === 'por_vencer').length,
    vigente: lotes.filter(l => l.estado_fv === 'vigente').length,
    sin_fecha: lotes.filter(l => l.estado_fv === 'sin_fecha').length,
  };

  const filtered = lotes.filter(l => {
    if (estado !== 'all' && l.estado_fv !== estado) return false;
    if (filterTemp !== 'all' && l.temperatura !== filterTemp) return false;
    // También por código: es lo que deja el escáner en el buscador.
    if (searchQ) {
      const q = searchQ.toLowerCase();
      const hay = [l.producto_nombre, l.no_lote, l.producto_codigo]
        .some((c) => String(c ?? '').toLowerCase().includes(q));
      if (!hay) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    // Un lote sin fecha no es un lote que vence el año cero. Con la cadena
    // vacía por delante, lo que falta se ponía primero y tapaba lo urgente.
    const av = a[sort.key];
    const bv = b[sort.key];
    const vacio = (v) => v === null || v === undefined || v === '';
    if (vacio(av) && vacio(bv)) return 0;
    if (vacio(av)) return 1;
    if (vacio(bv)) return -1;
    return av < bv ? -dir : av > bv ? dir : 0;
  });

  const pagina = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const irA = (n) => setPage(Math.max(1, n));
  const reiniciar = (aplicar) => (v) => aplicar(v);

  const selected = lotes.find(l => l.id === selectedId);

  // El resumen es de todo el almacén, no de la pestaña: el aviso dice qué
  // viene aunque se esté mirando otra cosa.
  const porVencer = resumenPorVencer(lotes);

  // Lo que se ve, completo: no solo la página. Quien lo exporta quiere la
  // lista, y en la pestaña «Por vencer» eso es el reporte de lo que vence.
  const exportar = () => {
    const csv = lotesACsv(sorted);
    // BOM al principio: sin él Excel abre el CSV en latin-1 y parte los acentos.
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vencimientos_${almacen}_${estado}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <CabeceraLista
        titulo="Vencimientos"
        subtitulo={almacen ? `Lotes de ${warehouseName(almacen)}` : 'Control de fechas de vencimiento por lote'}
        recuento={`${sorted.length} ${sorted.length === 1 ? 'lote' : 'lotes'}`}
        buscador={(
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Buscar por producto, código o lote..." className="pl-10" style={{ borderRadius: 'var(--r-ctl)' }} />
          </div>
        )}
        filtros={(
          <>
          {/* Qué almacén se está mirando, a la vista y cambiable aquí: los
              lotes vienen por almacén y antes no se decía cuál. */}
          <SelectorAlmacen almacen={almacen} setAlmacen={setAlmacen} almacenesConfig={almacenesConfig} />
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching || !almacen}
            style={{ borderRadius: 'var(--r-ctl)' }} title="Volver a pedir el informe de lotes">
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          {/* El unico filtro de la pantalla, junto al de columnas: un
              plegable para un solo desplegable era mas clic que filtro. */}
          <Button variant="outline" onClick={exportar} disabled={sorted.length === 0}
            style={{ borderRadius: 'var(--r-ctl)' }} title="Exportar a CSV los lotes que se ven">
            <Download className="w-4 h-4 lg:mr-1.5" />
            <span className="hidden lg:inline">Exportar</span>
          </Button>
          <FiltroIcono
            icono={Thermometer}
            etiqueta="Temperatura"
            valor={filterTemp}
            porDefecto="all"
            onChange={setFilterTemp}
            opciones={[
              { valor: 'all', label: 'Todas las temperaturas' },
              { valor: 'ambient', label: 'Ambiente' },
              { valor: 'chilled', label: 'Frio' },
            ]}
          />
          <ColPicker cols={LOTE_COL_DEFS} visible={cols}
            onChange={(next) => { setCols(next); saveColsWithOrder(LOTE_COLS_KEY, next, colOrder); }}
            storageKey={LOTE_COLS_KEY} order={colOrder}
            onOrderChange={(next) => { setColOrder(next); saveColsWithOrder(LOTE_COLS_KEY, cols, next); }} />
          </>
        )}
      />

      {!almacen && (
        <AlertBanner variant="info"
          message="Elige un almacén arriba: los lotes vienen por almacén, no todos juntos." />
      )}
      {error && (
        <AlertBanner variant="warning" message={`No se pudieron cargar los vencimientos: ${error.message}`} />
      )}
      {/* La alerta de lo que viene: es lo único que da tiempo a rebajar o
          devolver antes de que pase a crítico. */}
      {porVencer && (estado === 'all' || estado === 'por_vencer') && (
        <AlertBanner variant="warning"
          message={`${porVencer.lotes} ${porVencer.lotes === 1 ? 'lote vence' : 'lotes vencen'} en los próximos 30 días `
            + `(${porVencer.unidades} unidades, $${porVencer.valor.toFixed(2)} a costo)`
            + `${porVencer.primero ? `; el primero el ${porVencer.primero.fecha}, en ${porVencer.primero.dias} días` : ''}. `
            + 'Rebájalos o devuélvelos a tiempo; el botón Exportar baja el reporte.'} />
      )}

      {/* En el movil no van: las pestanas de abajo dicen los mismos cinco
          numeros, y cinco tarjetas a dos columnas se comian la pantalla
          entera antes de que apareciera un solo lote. */}
      <div className="hidden sm:grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KPICard title="Vencidos" value={counts.vencido} icon={AlertTriangle} color="text-[var(--c-bad)]" bgColor="bg-[var(--c-bad)]/10" />
        <KPICard title="Críticos" value={counts.critico} icon={AlertTriangle} color="text-[var(--c-bad)]" bgColor="bg-[var(--c-bad)]/5" />
        <KPICard title="Por vencer" value={counts.por_vencer} icon={Clock} color="text-[var(--c-warn)]" bgColor="bg-[var(--c-warn)]/10" />
        <KPICard title="Vigentes" value={counts.vigente} icon={CheckCircle} color="text-[var(--c-ok-dim)]" bgColor="bg-[var(--c-ok-dim)]/10" />
        <KPICard title="Sin fecha" value={counts.sin_fecha} icon={HelpCircle} color="text-[var(--c-gray)]" bgColor="bg-[var(--c-gray)]/10" />
      </div>

      {/* Pestañas y no un desplegable: con un desplegable hay que abrirlo
          para saber en qué filtro estás, y los números no se ven. */}
      {/* Una sola fila que se desliza, en vez de envolver en tres: asi la
          pestana activa no cambia de sitio al elegir otra. */}
      <Tabs value={estado} onValueChange={reiniciar(setEstado)}>
        <TabsList className="w-full">
          <TabsTrigger value="all" className="shrink-0">Todos ({lotes.length})</TabsTrigger>
          {ESTADOS.map((e) => (
            <TabsTrigger key={e.clave} value={e.clave} className="shrink-0"
              title={e.rango ? `Vence en ${e.rango}` : undefined}>
              {e.label} ({counts[e.clave]})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {ESTADOS.find((e) => e.clave === estado)?.rango && (
        <p className="text-xs text-muted-foreground -mt-2">
          «{ESTADOS.find((e) => e.clave === estado).label}» son los lotes que
          vencen en {ESTADOS.find((e) => e.clave === estado).rango}.
          {estado === 'critico' && ' Conviene bajarlos de tienda cuanto antes: el menú de cada lote lo ofrece.'}
        </p>
      )}



      <ListaResponsive
        columnas={colOrder.filter((k) => cols[k])}
        titulos={COL_TITULO}
        filas={pagina}
        cargando={isLoading}
        vacio={almacen ? 'Ningun lote con estos filtros.' : 'Elige un almacen para ver sus lotes.'}
        claveDe={(l) => l.id}
        encabezado="producto_nombre"
        accion="accion"
        orden={{ sort, onSort }}
        alPulsar={(l) => { setSelectedId(l.id); setAccion('editar'); }}
        celda={(l, k, enTabla) => celdaLote({
          lote: l, clave: k, enTabla, user,
          onAccion: (a) => {
            // Bajar de tienda no abre uno de los diálogos de la página.
            if (a === 'bajar') { setBajando(l); return; }
            setSelectedId(l.id); setAccion(a);
          },
        })}
      />

      <DialogosConteo
        accion={bajando ? { tipo: 'bajar', inv: bajando } : null}
        sugerir={(enTienda) => sugerirBajadaLote(bajando, enTienda)}
        onHecho={() => queryClient.invalidateQueries({ queryKey: ['submayor-producto'] })}
        onClose={() => setBajando(null)}
      />

      <Pagination page={page} total={sorted.length} pageSize={PAGE_SIZE} onPage={irA} />

      {/* Corregir el lote: la fecha del envase y una nota. Vale para
          cualquier estado, porque la fecha también puede venir mal. */}
      <Dialog open={accion === 'editar' && !!selected} onOpenChange={(o) => { if (!o) cerrar(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Revisar el lote</DialogTitle></DialogHeader>
          {selected && (
            <EditarLote lote={selected} guardando={createRevisionMut.isPending}
              onGuardar={(datos) => createRevisionMut.mutate({
                almacen_num: selected.almacen_num,
                producto_codigo: selected.producto_codigo,
                no_lote: selected.no_lote,
                revisado_por: user?.email,
                ...datos,
              })}
              onCancelar={cerrar} />
          )}
        </DialogContent>
      </Dialog>

      {/* Lo vencido con existencia es una merma, no un aviso. */}
      <Dialog open={accion === 'merma' && !!selected} onOpenChange={(o) => { if (!o) cerrar(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Mandar a merma</DialogTitle></DialogHeader>
          {selected && (
            <MermaDeLote lote={selected} guardando={createMermaMut.isPending}
              onGuardar={({ cantidad, clasif, notas }) => createMermaMut.mutate({
                producto_nombre: selected.producto_nombre,
                producto_codigo: selected.producto_codigo,
                suministrador: selected.suministrador,
                almacen_num: selected.almacen_num,
                cantidad,
                clasif_merma: clasif,
                notas: [`Lote ${selected.no_lote || 's/n'}`, notas].filter(Boolean).join('. '),
                fecha_inv: format(new Date(), 'yyyy-MM-dd'),
                fecha_vencimiento_lote: selected.fecha_vencimiento,
                precio_unitario: selected.precio_costo || 0,
                total_perdida: cantidad * (selected.precio_costo || 0),
                estado_tarea: 'en_curso',
                especialista_id: user?.email,
                especialista_nombre: user?.full_name,
              })}
              onCancelar={cerrar} />
          )}
        </DialogContent>
      </Dialog>

      {/* IC Panel */}
      <Dialog
        open={accion === 'ic' && !!selected}
        onOpenChange={(o) => { if (!o) cerrar(); }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Intervención Comercial</DialogTitle>
          </DialogHeader>
          {selected && (
          <div className="space-y-4">
            <ReadOnlyBlock title="Datos del lote">
              <ReadOnlyField label="Producto" value={selected.producto_nombre} />
              <ReadOnlyField label="Lote" value={selected.no_lote} />
              <ReadOnlyField label="FV" value={selected.fecha_vencimiento} />
              <ReadOnlyField label="Cantidad" value={selected.cantidad} />
              <ReadOnlyField label="Vigencia" value={`${selected.vigencia_dias} días`} />
              <ReadOnlyField label="Precio costo" value={`$${selected.precio_costo || 0}`} />
            </ReadOnlyBlock>
            <div className="space-y-3">
              <Input type="number" placeholder="Cantidad por vencer" value={icForm.cant_x_vencer}
                onChange={(e) => setIcForm({ ...icForm, cant_x_vencer: e.target.value })} style={{ borderRadius: 'var(--r-ctl)' }} />
              <Input placeholder="Clasificación INV" value={icForm.clasif_inv}
                onChange={(e) => setIcForm({ ...icForm, clasif_inv: e.target.value })} style={{ borderRadius: 'var(--r-ctl)' }} />
              <Textarea placeholder="Nota INV" value={icForm.nota_inv}
                onChange={(e) => setIcForm({ ...icForm, nota_inv: e.target.value })} style={{ borderRadius: 'var(--r-ctl)' }} />
              <Input type="number" placeholder="Precio propuesto IC" value={icForm.propuesta_precio_ic}
                onChange={(e) => setIcForm({ ...icForm, propuesta_precio_ic: e.target.value })} style={{ borderRadius: 'var(--r-ctl)' }} />
              <Input type="number" placeholder="Precio a restaurar" value={icForm.precio_restaurar}
                onChange={(e) => setIcForm({ ...icForm, precio_restaurar: e.target.value })} style={{ borderRadius: 'var(--r-ctl)' }} />

              {icForm.propuesta_precio_ic && selected.precio_costo && (
                <div className="bg-secondary/50 p-3 rounded-lg space-y-1" style={{ borderRadius: 'var(--r-ctl)' }}>
                  <p className="text-xs text-muted-foreground">Descuento: <span className="font-medium text-foreground">
                    {(((selected.precio_costo - Number(icForm.propuesta_precio_ic)) / selected.precio_costo) * 100).toFixed(1)}%
                  </span></p>
                  <p className="text-xs text-muted-foreground">Recaudación estimada: <span className="font-medium text-[var(--c-ok-dim)]">
                    ${(Number(icForm.cant_x_vencer || 0) * Number(icForm.propuesta_precio_ic || 0)).toFixed(2)}
                  </span></p>
                  <p className="text-xs text-muted-foreground">Pérdida si merma: <span className="font-medium text-[var(--c-bad)]">
                    ${(Number(icForm.cant_x_vencer || 0) * (selected.precio_costo || 0)).toFixed(2)}
                  </span></p>
                </div>
              )}

              {icForm.cant_x_vencer && Number(icForm.cant_x_vencer) > (selected.cantidad || 0) && (
                <p className="text-xs text-[var(--c-bad)]">
                  Cantidad por vencer ({icForm.cant_x_vencer}) supera el total del lote ({selected.cantidad})
                </p>
              )}

              <Button className="w-full" onClick={() => createIcMut.mutate({
                // El lote ya no es una fila nuestra: su id es almacén, código
                // y número de lote, que es lo que lo identifica en el informe.
                lote_id: selected.clave,
                no_lote: selected.no_lote,
                almacen_num: selected.almacen_num,
                producto_nombre: selected.producto_nombre,
                producto_codigo: selected.producto_codigo,
                fecha_deteccion: format(new Date(), 'yyyy-MM-dd'),
                especialista_inv_id: user?.email,
                especialista_inv_nombre: user?.full_name,
                cant_x_vencer: Number(icForm.cant_x_vencer),
                precio_costo: selected.precio_costo,
                precio_actual: selected.precio_costo,
                fecha_vencimiento: selected.fecha_vencimiento,
                clasif_inv: icForm.clasif_inv,
                nota_inv: icForm.nota_inv,
                propuesta_precio_ic: Number(icForm.propuesta_precio_ic),
                precio_restaurar: Number(icForm.precio_restaurar),
                notas_ic: icForm.notas_ic,
                estado_tarea: 'pendiente',
              })} disabled={!icForm.cant_x_vencer || Number(icForm.cant_x_vencer) > (selected.cantidad || 0)} style={{ borderRadius: 'var(--r-ctl)' }}>
                <Send className="w-4 h-4 mr-1.5" /> Enviar a IC
              </Button>
            </div>
          </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
/**
 * Qué se puede hacer con un lote, según en qué estado esté.
 *
 * Antes solo había un botón «IC» y solo salía en dos estados: un lote
 * vencido o sin fecha no dejaba hacer nada, que son justo los dos casos
 * donde hay algo que hacer. Lo que corresponde no es lo mismo en cada uno:
 * al vencido se le da salida, al que no tiene fecha se le pone, y al que
 * está por vencer se le busca una rebaja antes de que sea tarde.
 */
function MenuLote({ lote, puedeGestionar, puedeMoverTienda, onAccion }) {
  const [abierto, setAbierto] = useState(false);

  /*
   * Las tres salidas, siempre a la vista.
   *
   * Antes se escondian las que «no tocaban» segun el estado, y en la pestana
   * de «sin fecha» eso dejaba el menu con una sola opcion: la de poner la
   * fecha. Pero sin fecha no significa que el lote este bien, significa que
   * no se sabe — y quien lo tiene delante puede ver perfectamente que esta
   * pasado y querer darle salida, o que queda poco y querer rebajarlo.
   * Esconder la accion no evita el error, solo obliga a inventarse una fecha
   * para desbloquear el menu.
   *
   * Lo unico que se deja fuera es lo que no tiene sentido: mandar a merma un
   * lote con dos anos por delante, o pedir rebaja de uno ya vencido.
   */
  const POR_CLAVE = {
    bajar: { etiqueta: 'Bajar de tienda', Icono: ArrowDownToLine, color: 'text-[var(--c-warn)]' },
    merma: { etiqueta: 'Mandar a merma', Icono: TrendingDown, color: 'text-[var(--c-bad)]' },
    ic: { etiqueta: 'Enviar a intervención comercial', Icono: Send, color: 'text-[var(--c-warn)]' },
    editar: {
      etiqueta: lote.fecha_vencimiento ? 'Corregir fecha o anotar' : 'Poner la fecha del envase',
      Icono: CalendarPlus, color: 'text-[var(--c-info-2)]',
    },
  };
  // Qué toca en cada estado lo decide `accionesDeLote`, que se prueba aparte.
  const acciones = accionesDeLote(lote, { puedeGestionar, puedeMoverTienda })
    .map(({ clave, nota }) => ({ clave, nota, ...POR_CLAVE[clave] }));

  if (acciones.length === 0) return <span className="text-muted-foreground/40 text-xs">—</span>;

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Acciones: ${lote.producto_nombre}`}
          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-1">
        {acciones.map(({ clave, etiqueta, Icono, color, nota }) => (
          <button key={clave} type="button"
            onClick={() => { setAbierto(false); onAccion(clave); }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left hover:bg-secondary transition-colors">
            <Icono className={`w-3.5 h-3.5 shrink-0 ${color}`} />
            <span className="min-w-0">
              {etiqueta}
              {nota && <span className="block text-[11px] text-muted-foreground">{nota}</span>}
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Corregir lo que el informe no trae o trae mal.
 *
 * Buena parte de los lotes llegan sin fecha, y sin fecha no se puede hacer
 * nada con ellos: ni avisan, ni entran en una intervención comercial, ni se
 * sabe si ya vencieron. La fecha está en el envase. Esto es donde se anota.
 *
 * No se escribe en el informe —ahí no se puede—, se guarda aparte y se
 * superpone al leer, así que la vigencia pasa a calcularse con ella.
 */
function EditarLote({ lote, guardando, onGuardar, onCancelar }) {
  const [fecha, setFecha] = useState(lote.fecha_vencimiento ?? '');
  const [nota, setNota] = useState('');

  return (
    <div className="space-y-4">
      <ReadOnlyBlock title="Datos del lote">
        <ReadOnlyField label="Producto" value={lote.producto_nombre} />
        <ReadOnlyField label="Código" value={lote.producto_codigo} />
        <ReadOnlyField label="Lote" value={lote.no_lote || '—'} />
        <ReadOnlyField label="Cantidad" value={lote.cantidad} />
        <ReadOnlyField label="Almacén" value={lote.almacen_nombre || lote.almacen_num} />
        <ReadOnlyField label="FV del informe" value={lote.fecha_corregida ? 'Sin fecha' : (lote.fecha_vencimiento || 'Sin fecha')} />
      </ReadOnlyBlock>

      {lote.nota_revision && (
        <AlertBanner variant="info"
          message={`Ya revisado por ${lote.revisado_por || 'alguien'}: ${lote.nota_revision}`} />
      )}

      <label className="block space-y-1 text-xs text-muted-foreground">
        Fecha de vencimiento del envase
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
          style={{ borderRadius: 'var(--r-ctl)' }} />
      </label>

      <label className="block space-y-1 text-xs text-muted-foreground">
        Nota
        <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2}
          placeholder="Qué se vio al revisar: el envase no la trae, está borrosa, el lote no aparece…"
          style={{ borderRadius: 'var(--r-ctl)' }} />
      </label>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onCancelar} style={{ borderRadius: 'var(--r-ctl)' }}>Cancelar</Button>
        <Button disabled={guardando || (!fecha && !nota.trim())}
          onClick={() => onGuardar({ fecha_vencimiento: fecha || null, nota: nota.trim() })}
          style={{ borderRadius: 'var(--r-ctl)' }}>
          Guardar revisión
        </Button>
      </div>
    </div>
  );
}

/** Dar salida a un lote vencido. La cantidad arranca en la del lote entero. */
function MermaDeLote({ lote, guardando, onGuardar, onCancelar }) {
  const [cantidad, setCantidad] = useState(String(lote.cantidad ?? ''));
  const [clasif, setClasif] = useState('Merma-FV — Vencido');
  const [notas, setNotas] = useState('');

  const n = Number(cantidad) || 0;
  const pasa = n > (lote.cantidad || 0);

  return (
    <div className="space-y-4">
      <ReadOnlyBlock title="Datos del lote">
        <ReadOnlyField label="Producto" value={lote.producto_nombre} />
        <ReadOnlyField label="Lote" value={lote.no_lote || '—'} />
        <ReadOnlyField label="Venció" value={lote.fecha_vencimiento || '—'} />
        <ReadOnlyField label="En existencia" value={lote.cantidad} />
      </ReadOnlyBlock>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          Cantidad a mermar
          <Input type="number" min="0" value={cantidad}
            onChange={(e) => setCantidad(e.target.value)} style={{ borderRadius: 'var(--r-ctl)' }} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Clasificación
          <Select value={clasif} onValueChange={setClasif}>
            <SelectTrigger style={{ borderRadius: 'var(--r-ctl)' }}><SelectValue /></SelectTrigger>
            <SelectContent>
              {ALL_CLASIF_MERMA.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
      </div>

      {pasa && (
        <p className="text-xs text-[var(--c-bad)]">
          {n} supera las {lote.cantidad} que hay en el lote.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Pérdida estimada: ${(n * (lote.precio_costo || 0)).toFixed(2)}
      </p>

      <label className="block space-y-1 text-xs text-muted-foreground">
        Notas
        <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2}
          style={{ borderRadius: 'var(--r-ctl)' }} />
      </label>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onCancelar} style={{ borderRadius: 'var(--r-ctl)' }}>Cancelar</Button>
        <Button disabled={guardando || n <= 0 || pasa}
          onClick={() => onGuardar({ cantidad: n, clasif, notas: notas.trim() })}
          style={{ borderRadius: 'var(--r-ctl)' }}>
          <TrendingDown className="w-4 h-4 mr-1.5" /> Registrar merma
        </Button>
      </div>
    </div>
  );
}

/**
 * Una celda del listado de lotes.
 *
 * La misma para la tabla y para la ficha del movil: con `enTabla` se envuelve
 * en `<td>` y sin el va suelta dentro de la ficha. Asi no hay dos
 * maquetaciones que mantener en paralelo, que es como se desincronizan.
 */
function celdaLote({ lote: l, clave, enTabla, user, onAccion }) {
  // `py-1.5`: la fila baja de 44 px a 32. En una pantalla de portátil eso
  // son seis filas más sin desplazar, que es de lo que va un listado de
  // trabajo. La ficha del teléfono no cambia: ahí el dedo manda.
  const env = (contenido, clases = '') => (enTabla
    ? <td key={clave} className={`px-2.5 py-1.5 ${clases}`}>{contenido}</td>
    : contenido);

  switch (clave) {
    case 'producto_nombre':
      return env(
        <>
          <p className="font-medium leading-snug">{l.producto_nombre}</p>
          <p className="text-xs text-muted-foreground font-mono">{l.producto_codigo}</p>
        </>,
      );
    case 'no_lote':
      return env(<span className="text-xs">{l.no_lote || '\u2014'}</span>);
    case 'temperatura':
      return env(
        <span className={`inline-block text-[10px] px-2 py-0.5 rounded ${
          l.temperatura === 'chilled' ? 'bg-[var(--c-info)]/10 text-[var(--c-info)]' : 'bg-secondary text-muted-foreground'
        }`} style={{ borderRadius: 'var(--r-chip)' }}>
          {l.temperatura === 'chilled' ? 'Frio' : 'Ambiente'}
        </span>,
        'text-center',
      );
    case 'fecha_vencimiento':
      return env(<span className="text-xs tabular-nums">{l.fecha_vencimiento || '\u2014'}</span>);
    case 'cantidad':
      return env(<span className="font-medium tabular-nums">{l.cantidad}</span>, 'text-right');
    case 'estado_fv':
      return env(<LotBadge estado={l.estado_fv} dias={l.vigencia_dias} />, 'text-center');
    case 'accion':
      return env(
        <MenuLote lote={l} puedeGestionar={tieneRol(user, ['inv', 'ca', 'administrador'])}
          puedeMoverTienda={tieneRol(user, ROLES_TIENDA)} onAccion={onAccion} />,
        'text-center',
      );
    default:
      return env(null);
  }
}
