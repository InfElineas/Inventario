import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatusBadge from '@/components/shared/StatusBadge';
import AlertBanner from '@/components/shared/AlertBanner';
import SugerenciasNota from '@/components/shared/SugerenciasNota';
import InventarioForm from '@/components/inventario/InventarioForm';
import ReadOnlyBlock, { ReadOnlyField } from '@/components/shared/ReadOnlyBlock';
import Timeline from '@/components/shared/Timeline';
import { ClipboardList, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { ESTADOS_AMBITO, ETIQUETA_AMBITO } from '@/lib/ambito';
import { useTablaPaginada } from '@/lib/useTablaPaginada';
import { useAlmacen, filterAlmacenesByConfig } from '@/lib/useAlmacen';
import { warehouseName, WAREHOUSES } from '@/services/tkc/warehouses';
import { fetchExistenciaTkc } from '@/services/tkcService';
import { SIN_SONDEO } from '@/lib/query-client';
import { Textarea } from '@/components/ui/textarea';
import ColPicker, { loadColsWithOrder, saveColsWithOrder } from '@/components/shared/ColPicker';
import Pagination from '@/components/shared/Pagination';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { notifyJefeDepto } from '@/lib/notificationService';
import { logTransicion, logBorrado, notificarTransicion, avisarConteoReemplazado } from '@/lib/workflowService';
import { useConfirm } from '@/lib/useConfirm';
import { CLASIF_AJUSTE, CLASIF_FACT, ESTADO_FACT, conValorActual } from '@/lib/constants'
import { ESTADO_POR_RESULTADO, estadoContradictorio } from '@/lib/ajusteFact'
import SortTh from '@/components/shared/SortTh'
import { useSortable } from '@/lib/useSortable';
import { tieneRol } from '@/lib/roles';

const PAGE_SIZE = 50

/** Clave de orden de la pantalla → columna real, para que ordene Postgres. */
const ORDEN_COLUMNA = {
  producto:      'producto_nombre',
  almacen:       'almacen_num',
  ef_tkc:        'exist_fisica_tkc',
  conteo:        'conteo_real',
  diferencia:    'diferencia',
  clasificacion: 'clasif_ajuste',
  especialista:  'especialista_nombre',
  estado:        'estado_tarea',
  fecha:         'fecha_inv',
}


/**
 * Elegir el almacén que se está mirando.
 *
 * La lista va filtrada por él, así que sin este control la pantalla depende
 * de un almacén elegido en otro sitio: quien entrara directo a Inventario con
 * el almacén equivocado —o sin ninguno— veía una lista vacía y nada que
 * tocar para arreglarlo.
 */
function SelectorAlmacen({ almacen, setAlmacen, almacenesConfig }) {
  const almacenes = useMemo(
    () => WAREHOUSES.filter((w) => filterAlmacenesByConfig([w.key], almacenesConfig).length > 0),
    [almacenesConfig],
  );
  const valido = almacenes.some((w) => w.key === almacen);

  return (
    <Select value={valido ? almacen : ''} onValueChange={setAlmacen}>
      <SelectTrigger className="w-52" style={{ borderRadius: '8px' }}>
        <SelectValue placeholder="Elige un almacén" />
      </SelectTrigger>
      <SelectContent>
        {almacenes.map((w) => <SelectItem key={w.key} value={w.key}>{w.nombre}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/**
 * Quién ve los conteos de los demás.
 *
 * El inventarista, los suyos. El jefe de departamento sigue el trabajo de su
 * gente; facturación y auditoría los procesan, así que tienen que verlos.
 */
const VISTA_GLOBAL_INV = ['jefe_depto', 'fact', 'auditor', 'administrador', 'superadmin'];

const INV_COL_DEFS = [
  { key: 'producto',      label: 'Producto',       defaultOn: true,  required: true  },
  { key: 'almacen',       label: 'Almacén',        defaultOn: true,  required: false },
  { key: 'ef_tkc',        label: 'EF TKC',         defaultOn: true,  required: false },
  { key: 'conteo',        label: 'Conteo real',     defaultOn: true,  required: false },
  { key: 'diferencia',    label: 'Diferencia',      defaultOn: true,  required: false },
  { key: 'clasificacion', label: 'Clasificación',   defaultOn: false, required: false },
  { key: 'especialista',  label: 'Especialista',    defaultOn: false, required: false },
  { key: 'estado',        label: 'Estado',          defaultOn: true,  required: false },
  { key: 'fecha',         label: 'Fecha',           defaultOn: true,  required: false },
]
const INV_COLS_KEY = 'inv_cols'

/** Cómo se titula y alinea cada columna. La usan la cabecera y el ColPicker. */
const COL_TITULO = {
  producto:      { label: 'Producto',      className: 'hidden sm:table-cell' },
  almacen:       { label: 'Almacén',       className: 'hidden md:table-cell' },
  ef_tkc:        { label: 'EF TKC',        align: 'right', className: 'hidden sm:table-cell' },
  conteo:        { label: 'Conteo',        align: 'right', className: 'hidden sm:table-cell' },
  diferencia:    { label: 'Diferencia',    align: 'right' },
  clasificacion: { label: 'Clasificación', className: 'hidden lg:table-cell' },
  especialista:  { label: 'Especialista',  className: 'hidden lg:table-cell' },
  estado:        { label: 'Estado',        align: 'center' },
  fecha:         { label: 'Fecha',         className: 'hidden md:table-cell' },
}

export default function Inventario({ ambito = 'inventario' }) {
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  // Por defecto, lo que le toca a esta sección. Ver src/lib/ambito.js.
  const { almacen, setAlmacen, almacenesConfig } = useAlmacen();
  const [filterEstado, setFilterEstado] = useState('ambito');
  const [searchQ, setSearchQ] = useState('');
  const [cols, setCols] = useState(() => loadColsWithOrder(INV_COLS_KEY, INV_COL_DEFS).visible);
  const [colOrder, setColOrder] = useState(() => loadColsWithOrder(INV_COLS_KEY, INV_COL_DEFS).order);
  const [page, setPage] = useState(1);
  // Cambiar de almacén, de filtro o de búsqueda devuelve a la primera página:
  // seguir en la siete de un listado que ahora tiene dos deja la tabla vacía.
  const firmaFiltros = `${almacen}|${filterEstado}|${searchQ.trim()}`;
  const firmaPrevia = useRef(firmaFiltros);
  useEffect(() => {
    if (firmaPrevia.current !== firmaFiltros) { firmaPrevia.current = firmaFiltros; setPage(1); }
  }, [firmaFiltros]);
  const { sort, onSort } = useSortable('fecha_inv', 'desc')
  const queryClient = useQueryClient();

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const role = user?.role || 'inv';

  // Un inventarista ve SUS conteos, y solo los del almacén en el que está.
  // Antes la lista traía los últimos 200 de los treinta almacenes y de todo el
  // mundo, sin decir siquiera a cuál pertenecía cada uno: con eso no se puede
  // trabajar ni saber si falta algo por contar.
  //
  // La vista global es del jefe de departamento, que es quien sigue el trabajo
  // de los suyos; facturación y auditoría ven los de todos porque les toca
  // procesarlos.
  const vistaGlobal = tieneRol(user, VISTA_GLOBAL_INV);

  // Qué filas le tocan a esta pantalla. Va al WHERE, no al navegador: lo que
  // se filtra aquí tiene que contar para el total y para las páginas.
  const condiciones = {
    ...(almacen ? { almacen_num: almacen } : {}),
    ...(vistaGlobal || !user?.email ? {} : { especialista_id: user.email }),
    ...(filterEstado === 'all' ? {}
      : filterEstado === 'ambito' ? { estado_tarea: ESTADOS_AMBITO[ambito] }
      : { estado_tarea: filterEstado }),
  };

  const { filas: inventariosRaw, total, cargando: isLoading } = useTablaPaginada({
    entidad: 'Inventario',
    clave: ['inventarios', almacen, vistaGlobal ? 'todos' : user?.email, ambito, filterEstado],
    condiciones,
    texto: searchQ,
    campos: ['producto_nombre', 'producto_codigo'],
    orden: ORDEN_COLUMNA[sort.key] ? `${sort.dir === 'asc' ? '' : '-'}${ORDEN_COLUMNA[sort.key]}` : '-created_date',
    pagina: page,
    porPagina: PAGE_SIZE,
    activa: Boolean(user),
  });

  const inventarios = inventariosRaw ?? [];

  // Aquí se descargaban 500 productos en cada visita para marcar los que
  // están bajo su `stock_minimo`. Ese campo había que rellenarlo a mano
  // producto por producto y nunca se rellenó, así que el contador salía
  // siempre a cero y el punto rojo no aparecía jamás. Lo que de verdad
  // responde «qué hay que reponer» es la rotación de venta, y de eso se
  // encarga el panel de reabastecimiento.

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Inventario.create(data),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['inventarios'] });
      setShowForm(false);
      const registro = { ...variables, id: result?.id, estado_tarea: null }
      logTransicion('inventarios', registro, variables.estado_tarea, user, variables).catch(() => {})
      notificarTransicion('inventarios', registro, variables.estado_tarea, user).catch(() => {})
      notifyJefeDepto(
        'inventario', 'sistema',
        'Nuevo conteo registrado',
        `Producto: ${variables?.producto_nombre || '—'} — por ${user?.full_name || user?.email || '—'}`
      ).catch(() => {});
    },
    onError: (error) => alert(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      // La traza va ANTES del borrado: después ya no hay fila de la que
      // sacar el producto ni la diferencia.
      const fila = inventarios.find((x) => x.id === id);
      if (fila) await logBorrado('inventarios', fila, user);
      return base44.entities.Inventario.delete(id);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['inventarios'] }); setSelectedId(null); },
    onError: (error) => alert(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, hermanos = [] }) => {
      const r = await base44.entities.Inventario.update(id, data);

      // Los conteos anteriores del mismo producto se cierran sin ajuste: su
      // diferencia se midió contra la existencia de otro día. Se les deja
      // escrito el motivo y se avisa a quien los hizo, para que no se entere
      // por una bandeja que de pronto está vacía.
      for (const h of hermanos) {
        try {
          await base44.entities.Inventario.update(h.id, {
            estado_tarea: 'completado',
            fact_estado: 'No Procesar x Fact',
            fact_especialista_id: user?.email,
            fact_especialista_nombre: user?.full_name,
            fact_fecha: new Date().toISOString().slice(0, 10),
            fact_notas: `Cerrado sin ajuste: lo reemplaza el conteo del ${data.fecha_inv ?? 'más reciente'}. `
              + 'Su diferencia se midió contra otra existencia.'
              + (h.fact_notas ? ` — ${h.fact_notas}` : ''),
          });
          await avisarConteoReemplazado(h, user);
        } catch { /* no puede impedir el procesamiento del que sí vale */ }
      }
      return r;
    },
    onSuccess: (_, variables) => {
      if (variables.data?.estado_tarea) {
        const invAntes = inventarios.find(i => i.id === variables.id) || {}
        logTransicion('inventarios', invAntes, variables.data.estado_tarea, user, variables.data).catch(() => {})
        notificarTransicion('inventarios', { ...invAntes, ...variables.data }, variables.data.estado_tarea, user).catch(() => {})
      }
      queryClient.invalidateQueries({ queryKey: ['inventarios'] });
      setSelectedId(null);
    },
    onError: (error) => alert(error.message),
  });

  const selected = inventarios.find(i => i.id === selectedId);

  // Conteos ANTERIORES del mismo producto que siguen esperando a facturación.
  // Son los que quedarían con un ajuste pendiente que ya no corresponde.
  const hermanosPendientes = selected
    ? inventarios.filter(i =>
        i.id !== selected.id
        && i.estado_tarea === 'pend_fact'
        && i.almacen_num === selected.almacen_num
        && (i.producto_id ?? i.producto_codigo) === (selected.producto_id ?? selected.producto_codigo)
        && (i.fecha_inv ?? '') <= (selected.fecha_inv ?? ''))
    : [];

  // En facturación, un producto sale UNA vez: el conteo más reciente. Si
  // inventario cuenta el lunes, nadie lo procesa y el miércoles vuelve a
  // contar, antes salían los dos y se podían aplicar dos ajustes por la misma
  // mercancía.
  //
  // Se hace sobre la página que está a la vista, no sobre toda la tabla: para
  // lo segundo haría falta un DISTINCT ON que la API de datos no expone. En la
  // práctica alcanza —lo pendiente de facturar son decenas de filas, no
  // miles— y el detalle avisa igualmente antes de procesar.
  const { visibles: sorted, tapados } = useMemo(() => {
    if (ambito !== 'facturacion') return { visibles: inventarios, tapados: 0 };

    const ultimoPorProducto = new Map();
    for (const i of inventarios) {
      const clave = `${i.almacen_num}|${i.producto_id ?? i.producto_codigo}`;
      const previo = ultimoPorProducto.get(clave);
      if (!previo || (i.fecha_inv ?? '') > (previo.fecha_inv ?? '')
        || ((i.fecha_inv ?? '') === (previo.fecha_inv ?? '') && (i.created_date ?? '') > (previo.created_date ?? ''))) {
        ultimoPorProducto.set(clave, i);
      }
    }
    const visibles = [...ultimoPorProducto.values()];
    return { visibles, tapados: inventarios.length - visibles.length };
  }, [inventarios, ambito]);

  const difColor = (d) => d === 0 ? 'text-[#1D9E75]' : d > 0 ? 'text-[#BA7517]' : 'text-[#E24B4A]';


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium">Inventario</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {ambito === 'facturacion'
              ? 'Conteos con diferencia, a la espera de facturación'
              : 'Conteos y ajustes de inventario'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ColPicker cols={INV_COL_DEFS} visible={cols}
            onChange={(next) => { setCols(next); saveColsWithOrder(INV_COLS_KEY, next, colOrder); }}
            storageKey={INV_COLS_KEY} order={colOrder}
            onOrderChange={(next) => { setColOrder(next); saveColsWithOrder(INV_COLS_KEY, cols, next); }} />
          {/* Reabastecimiento tiene pantalla propia: comprar no es contar, y
              el panel incrustado aquí no daba sitio para pestañas ni filtros. */}
          <Button variant="outline" asChild style={{ borderRadius: '8px' }}>
            <Link to="/reabastecimiento">
              <ShoppingCart className="w-4 h-4 lg:mr-1.5" />
              <span className="hidden lg:inline">Reabastecimiento</span>
            </Link>
          </Button>
          {tieneRol(user, ['inv', 'administrador', 'superadmin']) && (
            <Button onClick={() => { setShowForm(true); setSelectedId(null); }} style={{ borderRadius: '8px' }}>
              <Plus className="w-4 h-4 lg:mr-1.5" /><span className="hidden lg:inline"> Nuevo conteo</span>
            </Button>
          )}
        </div>
      </div>

      <Dialog open={showForm} onOpenChange={(o) => { if (!o && !createMutation.isPending) setShowForm(false) }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo conteo de inventario</DialogTitle>
          </DialogHeader>
          <InventarioForm user={user} onSubmit={(d) => createMutation.mutate(d)} onCancel={() => setShowForm(false)} isPending={createMutation.isPending} />
        </DialogContent>
      </Dialog>

      {tapados > 0 && (
        <p className="text-xs text-muted-foreground px-1">
          {tapados} {tapados === 1 ? 'conteo anterior queda oculto' : 'conteos anteriores quedan ocultos'} porque
          hay uno más reciente del mismo producto. Procesa el último: es el que refleja lo que hay.
        </p>
      )}

      <MisPendientes
        inventarios={inventarios}
        email={user?.email}
        onAbrir={(id) => { setSelectedId(id); setShowForm(false); }}
      />

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Buscar..." className="pl-10" style={{ borderRadius: '8px' }} />
        </div>
        <SelectorAlmacen almacen={almacen} setAlmacen={setAlmacen} almacenesConfig={almacenesConfig} />
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-44" style={{ borderRadius: '8px' }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ambito">{ETIQUETA_AMBITO[ambito]}</SelectItem>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="en_curso">En curso</SelectItem>
            <SelectItem value="pend_fact">Pend. FACT</SelectItem>
            <SelectItem value="en_auditoria">En auditoría</SelectItem>
            <SelectItem value="completado">Completado</SelectItem>
            <SelectItem value="devuelto">Devuelto</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        {/* Table */}
        <Card className="overflow-hidden" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                {/* En el orden que haya elegido la persona, como en el
                    catálogo. Producto va siempre y va primero: sin él la fila
                    no se identifica. */}
                <tr className="border-b">
                  {colOrder.filter(k => cols[k]).map(k => (
                    <SortTh key={k} colKey={k} label={COL_TITULO[k].label}
                      align={COL_TITULO[k].align} className={COL_TITULO[k].className}
                      sort={sort} onSort={onSort} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={colOrder.filter(k => cols[k]).length || 5} className="p-8 text-center text-muted-foreground">Cargando...</td></tr>
                ) : sorted.length === 0 ? (
                  <tr><td colSpan={colOrder.filter(k => cols[k]).length || 5} className="p-8 text-center text-muted-foreground">Sin registros</td></tr>
                ) : sorted.map(inv => {
                  return (
                  <tr key={inv.id}
                    className={`border-b hover:bg-accent/50 cursor-pointer transition-colors
                      ${selectedId === inv.id ? 'bg-accent' : ''}
                    `}
                    onClick={() => { setSelectedId(inv.id); setShowForm(false); }}>
                    {colOrder.filter(k => cols[k]).map(k => {
                      const CELDAS = {
                        producto: (
                          <td key={k} className="p-3">
                            <p className="font-medium">{inv.producto_nombre}</p>
                            <p className="text-xs text-muted-foreground">{inv.producto_codigo}</p>
                          </td>
                        ),
                        almacen: <td key={k} className="p-3 text-xs text-muted-foreground hidden md:table-cell">{warehouseName(inv.almacen_num) || inv.almacen_num || '—'}</td>,
                        ef_tkc: <td key={k} className="p-3 text-right hidden sm:table-cell">{inv.exist_fisica_tkc ?? '—'}</td>,
                        conteo: <td key={k} className="p-3 text-right font-medium hidden sm:table-cell">{inv.conteo_real}</td>,
                        diferencia: <td key={k} className={`p-3 text-right font-medium ${difColor(inv.diferencia)}`}>{inv.diferencia > 0 ? '+' : ''}{inv.diferencia}</td>,
                        clasificacion: <td key={k} className="p-3 text-xs text-muted-foreground hidden lg:table-cell">{inv.clasif_ajuste || '—'}</td>,
                        especialista: <td key={k} className="p-3 text-xs text-muted-foreground hidden lg:table-cell">{inv.especialista_nombre || '—'}</td>,
                        estado: <td key={k} className="p-3 text-center"><StatusBadge status={inv.estado_tarea} /></td>,
                        fecha: <td key={k} className="p-3 text-muted-foreground hidden md:table-cell">{inv.fecha_inv?.slice(0, 10)}</td>,
                      };
                      return CELDAS[k] ?? <td key={k} className="p-3" />;
                    })}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
      </div>

      {/* Detail modal */}
      <Dialog open={!!selectedId} onOpenChange={(o) => { if (!o) setSelectedId(null) }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
          {selected && (
            <InventarioDetail
              inv={selected}
              role={role}
              user={user}
              onUpdate={(data, hermanos) => updateMutation.mutate({ id: selected.id, data, hermanos })}
              hermanos={hermanosPendientes}
              onDelete={() => { deleteMutation.mutate(selected.id); setSelectedId(null); }}
              onClose={() => setSelectedId(null)}
              isUpdating={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Los conteos propios sin enviar, arriba del todo.
 *
 * Un conteo en curso no está en la bandeja de nadie más: si quien lo contó no
 * lo recuerda, se queda ahí para siempre y la diferencia nunca llega a
 * facturación. Por eso sale primero y solo a quien lo tiene que terminar.
 */
function MisPendientes({ inventarios, email, onAbrir }) {
  const mios = email
    ? inventarios.filter((i) => i.estado_tarea === 'en_curso' && i.especialista_id === email)
    : [];
  if (mios.length === 0) return null;

  return (
    <div className="rounded-xl border border-[#BA7517]/30 bg-[#BA7517]/5 overflow-hidden" style={{ borderRadius: '12px' }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#BA7517]/20">
        <ClipboardList className="w-4 h-4 text-[#BA7517]" />
        <p className="text-sm font-medium">
          Tienes {mios.length} {mios.length === 1 ? 'conteo sin enviar' : 'conteos sin enviar'}
        </p>
        <span className="text-xs text-muted-foreground">
          — nadie más los ve hasta que los mandes a facturación
        </span>
      </div>
      <div className="max-h-56 overflow-y-auto divide-y divide-[#BA7517]/15">
        {mios.map((i) => (
          <button
            key={i.id} type="button" onClick={() => onAbrir(i.id)}
            className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-[#BA7517]/10 transition-colors"
          >
            <span className="flex-1 min-w-0">
              <span className="block text-sm line-clamp-1">{i.producto_nombre || '—'}</span>
              <span className="block text-[11px] text-muted-foreground font-mono">{i.producto_codigo || '—'}</span>
            </span>
            <span className="text-xs text-muted-foreground whitespace-nowrap">{i.fecha_inv || '—'}</span>
            <span className={`text-sm font-medium tabular-nums whitespace-nowrap ${
              (i.diferencia ?? 0) === 0 ? 'text-[#1D9E75]' : (i.diferencia ?? 0) > 0 ? 'text-[#BA7517]' : 'text-[#E24B4A]'
            }`}>
              {(i.diferencia ?? 0) > 0 ? '+' : ''}{i.diferencia ?? 0}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}


/** Ayer o hoy, en el formato que quiere <input type="date">. */
const aIso = (d) => d.toISOString().slice(0, 10);
export const HOY = () => aIso(new Date());
export const AYER = () => aIso(new Date(Date.now() - 86400000));

/**
 * Corregir un conteo que todavía es de inventario.
 *
 * Dos casos, el mismo formulario: el borrador propio sin enviar y el que
 * facturación o auditoría devolvieron. Antes solo se podía cambiar la
 * cantidad, y si lo que estaba mal era la clasificación o la fecha no había
 * forma de arreglarlo sin borrarlo y empezar de cero.
 */

/**
 * De cuándo es el conteo y cómo está la existencia ahora.
 *
 * El `EF TKC` del registro es una foto del momento de contar, y eso está
 * bien: es contra lo que se midió la diferencia. Pero quien lo procesa días
 * después lo lee como si fuera de hoy. Aquí se dicen los dos números y los
 * días que han pasado, para que nadie confunda uno con otro.
 */
function ExistenciaAhora({ inv }) {
  const { data: producto } = useQuery({
    queryKey: ['producto-de-conteo', inv.producto_id],
    queryFn: () => base44.entities.Producto.filter({ id: inv.producto_id }, '-updated_date', 1),
    enabled: Boolean(inv.producto_id),
    select: (d) => (Array.isArray(d) ? d[0] : null),
    ...SIN_SONDEO,
  });

  const idTienda = producto?.id_tienda;
  const { data: submayor, isLoading } = useQuery({
    queryKey: ['submayor-producto', inv.almacen_num, idTienda],
    queryFn: () => fetchExistenciaTkc({ almacen: inv.almacen_num, idTienda }),
    enabled: Boolean(inv.almacen_num && idTienda),
    retry: false,
    ...SIN_SONDEO,
  });

  const ahora = submayor?.existencia?.fisica;
  const entonces = inv.exist_fisica_tkc;
  const dias = inv.fecha_inv
    ? Math.round((Date.now() - new Date(inv.fecha_inv).getTime()) / 86400000)
    : null;
  const cambio = Number.isFinite(ahora) && Number.isFinite(entonces) && ahora !== entonces;

  return (
    <div className="px-4 py-3 rounded-lg border border-border bg-secondary/40 text-xs space-y-1" style={{ borderRadius: '8px' }}>
      <p className="font-medium text-foreground">
        Conteo del {inv.fecha_inv?.slice(0, 10) ?? '—'}
        {dias !== null && dias > 0 && <span className="text-muted-foreground font-normal"> — hace {dias} {dias === 1 ? 'día' : 'días'}</span>}
      </p>
      <p className="text-muted-foreground">
        Se midió contra una existencia de <span className="text-foreground">{entonces ?? '—'}</span>.
        {' '}Ahora TKC dice{' '}
        <span className="text-foreground">{isLoading ? '…' : Number.isFinite(ahora) ? ahora : '—'}</span>.
      </p>
      {cambio && (
        <p className="text-[#BA7517]">
          La existencia ha cambiado desde el conteo. La diferencia registrada sigue siendo la de
          aquel día; comprueba si el ajuste sigue teniendo sentido.
        </p>
      )}
    </div>
  );
}

function BloqueCorreccion({ inv, devuelto, isUpdating, onGuardar, confirmDialog }) {
  const [conteo, setConteo] = useState(String(inv.conteo_real ?? ''));
  const [clasif, setClasif] = useState(inv.clasif_ajuste ?? '');
  const [fecha, setFecha] = useState(inv.fecha_inv?.slice(0, 10) ?? HOY());
  const [notas, setNotas] = useState(inv.notas_inv ?? '');

  const n = Number(conteo);
  const conteoValido = conteo !== '' && !isNaN(n) && n >= 0;
  const diferencia = n - (inv.exist_fisica_tkc || 0);
  const resultado = diferencia === 0 ? 'ok' : diferencia > 0 ? 'sobrante' : 'faltante';
  // La clasificación solo hace falta si hay algo que clasificar.
  const faltaClasif = diferencia !== 0 && !clasif;
  const valido = conteoValido && !faltaClasif;

  const cambios = {
    conteo_real: n,
    diferencia,
    resultado,
    clasif_ajuste: diferencia === 0 ? '' : clasif,
    fecha_inv: fecha,
    notas_inv: notas,
  };

  const enviar = async () => {
    const destino = diferencia === 0 ? 'completado' : 'pend_fact';
    const aviso = diferencia === 0
      ? 'No hay diferencia, así que el conteo se cierra aquí mismo.'
      : 'Facturación lo verá en su bandeja y dejarás de poder editarlo.';
    if (!await confirmDialog(aviso, { title: '¿Enviar este conteo?' })) return;
    onGuardar({ ...cambios, estado_tarea: destino });
  };

  const borde = devuelto ? 'border-[#E24B4A]/40 bg-[#E24B4A08]' : 'border-border bg-secondary/40';

  return (
    <div className={`space-y-3 p-4 border rounded-lg ${borde}`} style={{ borderRadius: '8px' }}>
      <p className={`text-xs font-medium uppercase tracking-wider ${devuelto ? 'text-[#E24B4A]' : 'text-muted-foreground'}`}>
        {devuelto ? 'Devuelto — corrección requerida' : 'Sin enviar — puedes recontar'}
      </p>

      {devuelto && inv.nota_auditor && (
        <p className="text-xs text-muted-foreground"><span className="font-medium">Nota del auditor:</span> {inv.nota_auditor}</p>
      )}
      {devuelto && inv.fact_notas && (
        <p className="text-xs text-muted-foreground"><span className="font-medium">Nota de facturación:</span> {inv.fact_notas}</p>
      )}
      {!devuelto && (
        <p className="text-xs text-muted-foreground">
          Mientras no lo envíes, este conteo es tuyo y nadie más lo ve en su bandeja.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 text-xs text-muted-foreground">
          Conteo real
          <Input type="number" min="0" value={conteo} onChange={(e) => setConteo(e.target.value)} style={{ borderRadius: '8px' }} />
        </label>
        <label className="block space-y-1.5 text-xs text-muted-foreground">
          Fecha del conteo
          {/* Hoy o ayer: un conteo se hace en el día, y como mucho se registra
              a la mañana siguiente. */}
          <Input type="date" value={fecha} min={AYER()} max={HOY()}
            onChange={(e) => setFecha(e.target.value)} style={{ borderRadius: '8px' }} />
        </label>
      </div>

      {conteoValido && (
        <p className="text-xs text-muted-foreground">
          EF TKC del conteo: <span className="text-foreground">{inv.exist_fisica_tkc ?? 0}</span>
          {' · '}Diferencia: <span className="text-foreground font-medium">{diferencia > 0 ? '+' : ''}{diferencia}</span>
          {diferencia === 0 && ' — sin diferencia, al enviarlo queda completado.'}
        </p>
      )}

      {diferencia !== 0 && (
        <Select value={clasif} onValueChange={setClasif}>
          <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue placeholder="Clasificación de ajuste" /></SelectTrigger>
          <SelectContent>{conValorActual(CLASIF_AJUSTE, inv.clasif_ajuste).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      )}

      <Textarea value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)}
        placeholder="Notas del conteo…" style={{ borderRadius: '8px' }} />
      <SugerenciasNota valor={notas} onElegir={setNotas} />

      <div className="flex flex-wrap gap-2">
        {!devuelto && (
          <Button size="sm" variant="outline" disabled={!valido || isUpdating}
            onClick={() => onGuardar(cambios)} style={{ borderRadius: '8px' }}>
            {isUpdating ? 'Guardando…' : 'Guardar el nuevo conteo'}
          </Button>
        )}
        <Button size="sm" disabled={!valido || isUpdating} onClick={enviar} style={{ borderRadius: '8px' }}>
          {devuelto ? 'Reenviar conteo corregido' : 'Enviar a facturación'}
        </Button>
      </div>
      {faltaClasif && (
        <p className="text-xs text-[#BA7517]">Hay diferencia: elige una clasificación antes de guardar.</p>
      )}
    </div>
  );
}

function InventarioDetail({ inv, role, user, onUpdate, onDelete, onClose, isUpdating: isUpdatingRaw, hermanos = [] }) {
  const isUpdating = isUpdatingRaw ?? false;
  const [factData, setFactData] = useState({
    fact_no_factura: '', fact_clasif: '', fact_notas: '',
    // Propuesto a partir del conteo; facturación puede cambiarlo.
    fact_estado: ESTADO_POR_RESULTADO[inv.resultado] ?? '',
  });
  const [auditorNota, setAuditorNota] = useState('');
  const { confirmDialog, ConfirmDialogNode } = useConfirm();

  const steps = ['INV', 'FACT', 'Auditor', 'Completado'];
  const stepMap = { en_curso: 0, pend_fact: 1, en_auditoria: 2, completado: 3, devuelto: 0 };
  const currentStep = stepMap[inv.estado_tarea] ?? 0;

  const canProcessFact = tieneRol(user, ['fact', 'administrador']) && inv.estado_tarea === 'pend_fact';
  const canAudit       = tieneRol(user, ['auditor', 'administrador']) && inv.estado_tarea === 'en_auditoria';
  const canDevuelto    = tieneRol(user, ['inv', 'administrador']) && inv.estado_tarea === 'devuelto';
  // Un conteo propio sin enviar se puede seguir tocando: es el caso de contar,
  // dudar y volver a contar antes de pasárselo a facturación.
  // Mientras no lo haya enviado es suyo y lo puede corregir entero. Antes
  // faltaba `superadmin` en la lista, así que a un superadministrador el
  // bloque no le salía y su propio conteo se quedaba congelado.
  const canEditarBorrador = inv.estado_tarea === 'en_curso'
    && (tieneRol(user, ['administrador', 'superadmin']) || inv.especialista_id === user?.email);
  const canDelete = tieneRol(user, ['superadmin'])
    || (tieneRol(user, ['administrador']) && inv.estado_tarea !== 'completado')
    || (tieneRol(user, ['inv']) && inv.estado_tarea === 'en_curso' && inv.especialista_id === user?.email);

  // Mensaje contextual según estado + rol
  const statusHint = (() => {
    const e = inv.estado_tarea;
    if (e === 'completado') return { msg: 'Proceso completado y cerrado.', color: 'text-[#4ade80]' };
    if (e === 'pend_fact'  && !tieneRol(user, ['fact','administrador','superadmin']))
      return { msg: 'Esperando revisión de FACTURACIÓN.', color: 'text-[#60a5fa]' };
    if (e === 'en_auditoria' && !tieneRol(user, ['auditor','administrador','superadmin']))
      return { msg: 'En revisión por AUDITORÍA.', color: 'text-[#a78bfa]' };
    if (e === 'devuelto' && !tieneRol(user, ['inv','administrador','superadmin']))
      return { msg: 'Devuelto a INV para corrección.', color: 'text-[#E24B4A]' };
    return null;
  })();

  return (
    <>
    {ConfirmDialogNode}
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between pr-6">
        <DialogTitle className="text-sm font-semibold">Detalle de inventario</DialogTitle>
        {canDelete && (
          <Button
            variant="ghost" size="sm"
            className="text-[#E24B4A] hover:text-[#E24B4A] hover:bg-[#E24B4A]/10"
            onClick={async () => { if (await confirmDialog('Esta acción no se puede deshacer.', { title: '¿Eliminar este conteo?', destructive: true })) onDelete() }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      <Timeline steps={steps} currentStep={currentStep} />

      {statusHint && (
        <p className={`text-xs px-3 py-2 rounded-md bg-secondary/60 border border-border ${statusHint.color}`}>
          {statusHint.msg}
        </p>
      )}

      <ReadOnlyBlock title="Registro INV">
        <ReadOnlyField label="Fecha" value={inv.fecha_inv || '—'} />
        <ReadOnlyField label="Producto" value={inv.producto_nombre} />
        <ReadOnlyField label="Código" value={inv.producto_codigo} />
        <ReadOnlyField label="EF TKC" value={inv.exist_fisica_tkc} />
        <ReadOnlyField label="Conteo real" value={inv.conteo_real} />
        <ReadOnlyField label="Diferencia" value={inv.diferencia} />
        <ReadOnlyField label="Resultado" value={inv.resultado} />
        <ReadOnlyField label="Clasificación" value={inv.clasif_ajuste} />
        <ReadOnlyField label="Especialista" value={inv.especialista_nombre} />
        {inv.notas_inv && <ReadOnlyField label="Notas INV" value={inv.notas_inv} />}
      </ReadOnlyBlock>

      {/* Solo cuando ya no es de inventario: es quien procesa días después
          el que necesita saber de cuándo es el número. */}
      {inv.estado_tarea !== 'en_curso' && <ExistenciaAhora inv={inv} />}

      {(inv.fact_no_factura || inv.fact_clasif || inv.fact_notas || inv.fact_estado || inv.fact_fecha) && (
        <ReadOnlyBlock title="Registro FACT">
          {inv.fact_fecha               && <ReadOnlyField label="Fecha"        value={inv.fact_fecha} />}
          {inv.fact_no_factura          && <ReadOnlyField label="No. factura"  value={inv.fact_no_factura} />}
          {inv.fact_clasif              && <ReadOnlyField label="Clasificación" value={inv.fact_clasif} />}
          {inv.fact_estado              && <ReadOnlyField label="Estado"        value={inv.fact_estado} />}
          {inv.fact_notas               && <ReadOnlyField label="Notas"         value={inv.fact_notas} />}
          {inv.fact_especialista_nombre && <ReadOnlyField label="Especialista"  value={inv.fact_especialista_nombre} />}
        </ReadOnlyBlock>
      )}

      {(inv.auditoria_fecha || inv.nota_auditor || inv.auditor_nombre) && (
        <ReadOnlyBlock title="Registro Auditor">
          {inv.auditoria_fecha && <ReadOnlyField label="Fecha"   value={inv.auditoria_fecha} />}
          {inv.auditor_nombre  && <ReadOnlyField label="Auditor" value={inv.auditor_nombre} />}
          {inv.nota_auditor    && <ReadOnlyField label="Nota"    value={inv.nota_auditor} />}
        </ReadOnlyBlock>
      )}

      {/* Corrección del conteo: el borrador propio y el devuelto */}
      {(canEditarBorrador || canDevuelto) && (
        <BloqueCorreccion
          inv={inv}
          devuelto={inv.estado_tarea === 'devuelto'}
          isUpdating={isUpdating}
          onGuardar={onUpdate}
          confirmDialog={confirmDialog}
        />
      )}

      {/* FACT form */}
      {canProcessFact && (
        <div className="space-y-3 p-4 border rounded-lg" style={{ borderRadius: '8px', borderWidth: '0.5px' }}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Procesamiento FACT</p>
          {hermanos.length > 0 && (
            <AlertBanner variant="warning"
              message={`Hay ${hermanos.length} ${hermanos.length === 1 ? 'conteo anterior' : 'conteos anteriores'} de este producto esperando a facturación. Al procesar este, aquellos se cierran sin ajuste y se avisa a quien los hizo: su diferencia se midió contra otra existencia.`} />
          )}
          <Input placeholder="No. factura TKC" value={factData.fact_no_factura} onChange={(e) => setFactData({ ...factData, fact_no_factura: e.target.value })} style={{ borderRadius: '8px' }} />
          <Select value={factData.fact_clasif} onValueChange={(v) => setFactData({ ...factData, fact_clasif: v })}>
            <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue placeholder="Clasificación FACT" /></SelectTrigger>
            <SelectContent>{conValorActual(CLASIF_FACT, inv.fact_clasif).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={factData.fact_estado} onValueChange={(v) => setFactData({ ...factData, fact_estado: v })}>
            <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue placeholder="Estado FACT" /></SelectTrigger>
            <SelectContent>{ESTADO_FACT.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
          </Select>
          {estadoContradictorio(inv.resultado, factData.fact_estado) && (
            <p className="text-xs text-[#BA7517] bg-[#BA7517]/10 px-3 py-2 rounded-md">
              El conteo dio un <strong>{inv.resultado}</strong> de {Math.abs(inv.diferencia ?? 0)} y
              estás aplicando «{factData.fact_estado}», que va en sentido contrario. Puedes
              continuar, pero comprueba que es lo que quieres.
            </p>
          )}
          {factData.fact_estado === 'Procesamiento' && (
            <p className="text-xs text-muted-foreground bg-secondary/60 px-3 py-2 rounded-md">
              Anota en las notas <strong>con qué producto se intercambió y su precio</strong>: el
              registro guarda un solo producto, así que esa información solo queda aquí.
            </p>
          )}
          <Textarea placeholder="Notas FACT" value={factData.fact_notas} onChange={(e) => setFactData({ ...factData, fact_notas: e.target.value })} style={{ borderRadius: '8px' }} />
          <div className="flex gap-2">
            <Button size="sm" disabled={isUpdating} onClick={async () => {
              // Los conteos anteriores del mismo producto que siguen esperando
              // a facturación ya no valen: su diferencia se midió contra una
              // existencia de otro día. Aplicarles un ajuste además de este
              // sería mover dos veces la misma mercancía, y dejarlos ahí es
              // dejar datos falseados en la bandeja de alguien.
              if (hermanos.length > 0) {
                const ok = await confirmDialog(
                  `Hay ${hermanos.length} ${hermanos.length === 1 ? 'conteo anterior' : 'conteos anteriores'} ` +
                  'del mismo producto esperando a facturación. Se cerrarán sin ajuste, porque su diferencia ' +
                  'se midió contra otra existencia, y se avisará a quien los hizo.',
                  { title: '¿Procesar este conteo?' },
                );
                if (!ok) return;
              }
              onUpdate({
                ...factData,
                fact_especialista_id: user?.email,
                fact_especialista_nombre: user?.full_name,
                fact_fecha: new Date().toISOString().slice(0, 10),
                estado_tarea: 'en_auditoria',
              }, hermanos);
            }} style={{ borderRadius: '8px' }}>
              {isUpdating ? 'Enviando...' : 'Enviar a auditor'}
            </Button>
            <Button size="sm" variant="outline" disabled={isUpdating} onClick={() => onUpdate({ estado_tarea: 'devuelto' })} style={{ borderRadius: '8px' }}>
              Devolver a INV
            </Button>
          </div>
        </div>
      )}

      {/* Auditor form */}
      {canAudit && (
        <div className="space-y-3 p-4 border rounded-lg" style={{ borderRadius: '8px', borderWidth: '0.5px' }}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Auditoría</p>
          <Textarea placeholder="Nota del auditor" value={auditorNota} onChange={(e) => setAuditorNota(e.target.value)} style={{ borderRadius: '8px' }} />
          <div className="flex gap-2">
            <Button size="sm" disabled={isUpdating} onClick={async () => {
              if (!await confirmDialog('Se completará el proceso y no podrá revertirse.', { title: '¿Aprobar y completar este inventario?' })) return;
              onUpdate({ nota_auditor: auditorNota, auditor_id: user?.email, auditor_nombre: user?.full_name, auditoria_fecha: new Date().toISOString().slice(0, 10), estado_tarea: 'completado' });
            }} style={{ borderRadius: '8px' }}>{isUpdating ? 'Guardando...' : 'Aprobar y completar'}</Button>
            {/* Dos destinos: no siempre el problema es del conteo. Si lo que
                está mal es la factura o la clasificación contable, devolverlo
                a quien contó no arregla nada y hace perder un viaje. */}
            <Button size="sm" variant="outline" disabled={isUpdating}
              onClick={() => onUpdate({ nota_auditor: auditorNota, auditoria_fecha: new Date().toISOString().slice(0, 10), estado_tarea: 'devuelto' })}
              style={{ borderRadius: '8px' }}>
              Devolver a inventario
            </Button>
            <Button size="sm" variant="outline" disabled={isUpdating}
              onClick={() => onUpdate({ nota_auditor: auditorNota, auditoria_fecha: new Date().toISOString().slice(0, 10), estado_tarea: 'pend_fact' })}
              style={{ borderRadius: '8px' }}>
              Devolver a facturación
            </Button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}