import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatusBadge from '@/components/shared/StatusBadge';
import MermaForm from '@/components/mermas/MermaForm';
import MermaDetail from '@/components/mermas/MermaDetail';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowDownToLine, Check, Plus, Search } from 'lucide-react';
import { ESTADOS_AMBITO, ETIQUETA_AMBITO } from '@/lib/ambito';
import { useTablaPaginada } from '@/lib/useTablaPaginada';
import Pagination from '@/components/shared/Pagination';
import BajarMermasDialog from '@/components/mermas/BajarMermasDialog';
import { useAlmacen, filterAlmacenesByConfig } from '@/lib/useAlmacen';
import { WAREHOUSES, warehouseName } from '@/services/tkc/warehouses';
import ColPicker, { loadColsWithOrder, saveColsWithOrder } from '@/components/shared/ColPicker';
import { ROLES_TIENDA } from '@/lib/ajustes';
import { notifyJefeDepto } from '@/lib/notificationService';
import { logTransicion, logBorrado, notificarTransicion } from '@/lib/workflowService';
import SortTh from '@/components/shared/SortTh';
import { useSortable } from '@/lib/useSortable';
import { tieneRol } from '@/lib/roles';


/**
 * Elegir el almacén que se está mirando.
 *
 * La lista va filtrada por él, así que sin este control la pantalla depende
 * de un almacén elegido en otro sitio: quien entrara directo a Inventario con
 * el almacén equivocado —o sin ninguno— veía una lista vacía y nada que
 * tocar para arreglarlo.
 */
const PAGE_SIZE = 50

const MERMA_COL_DEFS = [
  { key: 'producto_nombre',   label: 'Producto',      defaultOn: true,  required: true  },
  { key: 'almacen',           label: 'Almacén',       defaultOn: false, required: false },
  { key: 'cantidad',          label: 'Cant.',         defaultOn: true,  required: false },
  { key: 'clasif_merma',      label: 'Clasificación', defaultOn: true,  required: false },
  { key: 'total_perdida',     label: 'Pérdida',       defaultOn: true,  required: false },
  { key: 'estado_tarea',      label: 'Estado',        defaultOn: true,  required: false },
  { key: 'rebaja_confirmada', label: 'Tienda',        defaultOn: true,  required: false },
  { key: 'fecha_inv',         label: 'Fecha',         defaultOn: true,  required: false },
]
const MERMA_COLS_KEY = 'merma_cols'

/** Cómo se titula y alinea cada columna. La usan la cabecera y las celdas. */
const COL_TITULO = {
  producto_nombre:   { label: 'Producto' },
  almacen:           { label: 'Almacén',       className: 'hidden md:table-cell' },
  cantidad:          { label: 'Cant.',         align: 'right' },
  clasif_merma:      { label: 'Clasificación' },
  total_perdida:     { label: 'Pérdida',       align: 'right' },
  estado_tarea:      { label: 'Estado',        align: 'center' },
  rebaja_confirmada: { label: 'Tienda',        align: 'center' },
  fecha_inv:         { label: 'Fecha' },
}

/** Clave de orden de la pantalla → columna real, para que ordene Postgres. */
const ORDEN_COLUMNA = {
  producto_nombre: 'producto_nombre',
  almacen:         'almacen_num',
  cantidad:        'cantidad',
  clasif_merma:    'clasif_merma',
  total_perdida:   'total_perdida',
  rebaja_confirmada: 'rebaja_confirmada',
  estado_tarea:    'estado_tarea',
  fecha_inv:       'fecha_inv',
}

/** Quién ve las mermas de los demás. Mismo criterio que en inventario. */
const VISTA_GLOBAL_MERMAS = ['jefe_depto', 'fact', 'auditor', 'administrador', 'superadmin'];

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

export default function Mermas({ ambito = 'inventario' }) {
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  // Por defecto, lo que le toca a esta sección. Ver src/lib/ambito.js.
  const { almacen, setAlmacen, almacenesConfig } = useAlmacen();
  const [filterEstado, setFilterEstado] = useState('ambito');
  const [searchQ, setSearchQ] = useState('');
  const [cols, setCols] = useState(() => loadColsWithOrder(MERMA_COLS_KEY, MERMA_COL_DEFS).visible);
  const [colOrder, setColOrder] = useState(() => loadColsWithOrder(MERMA_COLS_KEY, MERMA_COL_DEFS).order);
  const [page, setPage] = useState(1);
  // Cambiar de almacén, de filtro o de búsqueda devuelve a la primera página.
  const firmaFiltros = `${almacen}|${filterEstado}|${searchQ.trim()}`;
  const firmaPrevia = useRef(firmaFiltros);
  useEffect(() => {
    if (firmaPrevia.current !== firmaFiltros) { firmaPrevia.current = firmaFiltros; setPage(1); }
  }, [firmaFiltros]);
  const queryClient = useQueryClient();
  const { sort, onSort } = useSortable('fecha_inv', 'desc');

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const role = user?.role || 'inv';
  // Igual que en inventario: cada uno ve lo suyo y lo de su almacén; la vista
  // global es del jefe de departamento y de quien tiene que procesarlas.
  const vistaGlobal = tieneRol(user, VISTA_GLOBAL_MERMAS);
  // Una merma sigue contada en el piso de tienda hasta que se baja. Quien
  // puede mover mercancía puede hacerlo desde aquí.
  const puedeBajar = tieneRol(user, ROLES_TIENDA);
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [bajando, setBajando] = useState(null);   // { mermas, almacen }

  const condiciones = {
    ...(almacen ? { almacen_num: almacen } : {}),
    ...(vistaGlobal || !user?.email ? {} : { especialista_id: user.email }),
    ...(filterEstado === 'all' ? {}
      : filterEstado === 'ambito' ? { estado_tarea: ESTADOS_AMBITO[ambito] }
      : { estado_tarea: filterEstado }),
  };

  const { filas: mermasRaw, total, cargando: isLoading } = useTablaPaginada({
    entidad: 'Merma',
    clave: ['mermas', almacen, vistaGlobal ? 'todos' : user?.email, ambito, filterEstado],
    condiciones,
    texto: searchQ,
    campos: ['producto_nombre', 'producto_codigo'],
    orden: ORDEN_COLUMNA[sort.key] ? `${sort.dir === 'asc' ? '' : '-'}${ORDEN_COLUMNA[sort.key]}` : '-created_date',
    pagina: page,
    porPagina: PAGE_SIZE,
    activa: Boolean(user),
  });

  const mermas = mermasRaw ?? [];

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Merma.create(data),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['mermas'] });
      setShowForm(false);
      const registro = { ...variables, id: result?.id, estado_tarea: null }
      logTransicion('mermas', registro, variables.estado_tarea, user, variables).catch(() => {})
      notificarTransicion('mermas', registro, variables.estado_tarea, user).catch(() => {})
      notifyJefeDepto(
        'inventario', 'merma',
        'Nueva merma registrada',
        `Producto: ${variables?.producto_nombre || '—'} — por ${user?.full_name || user?.email || '—'}`
      ).catch(() => {});
    },
    onError: (error) => alert(error.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Merma.update(id, data),
    onSuccess: (_, variables) => {
      if (variables.data?.estado_tarea) {
        const mermaAntes = mermas.find(m => m.id === variables.id) || {}
        notificarTransicion('mermas', { ...mermaAntes, ...variables.data }, variables.data.estado_tarea, user).catch(() => {})
      }
      queryClient.invalidateQueries({ queryKey: ['mermas'] })
      setSelectedId(null)
    },
    onError: (error) => alert(error.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      // La traza va ANTES del borrado: después ya no hay fila de la que
      // sacar el producto ni la diferencia.
      const fila = mermas.find((x) => x.id === id);
      if (fila) await logBorrado('mermas', fila, user);
      return base44.entities.Merma.delete(id);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['mermas'] }); setSelectedId(null); },
    onError: (error) => alert(error.message),
  });

  const selected = mermas.find(m => m.id === selectedId);

  const sorted = mermas;

  // El acumulado es el de la página que se está viendo, no el de la tabla
  // entera: decir «total» de lo que solo es una página sería mentir.
  const perdidaPagina = sorted.reduce((s, m) => s + (m.total_perdida || 0), 0);

  // ── Selección para bajar de tienda ──────────────────────────
  //
  // Solo entran las que tienen código y cantidad: sin eso no hay nada que
  // mandarle a TKC.
  // Lo ya rebajado queda fuera: volver a bajarlo sacaría del piso de tienda
  // unidades que ya se sacaron.
  const bajables = sorted.filter(
    m => m.producto_codigo && Number(m.cantidad) > 0 && !m.rebaja_confirmada,
  );
  const marcadas = bajables.filter(m => seleccion.has(m.id));
  // Un envío va a UN almacén: la API de transferencias recibe un `warehouse`.
  // Mezclarlos no se puede resolver aquí, así que se avisa y no se deja.
  const almacenes = [...new Set(marcadas.map(m => m.almacen_num).filter(Boolean))];
  const mezclaAlmacenes = almacenes.length > 1;
  const unidadesMarcadas = marcadas.reduce((s, m) => s + Math.abs(Number(m.cantidad) || 0), 0);

  const alternar = (id) => setSeleccion(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });
  const todasMarcadas = bajables.length > 0 && marcadas.length === bajables.length;
  const alternarTodas = () => setSeleccion(
    todasMarcadas ? new Set() : new Set(bajables.map(m => m.id)),
  );
  const abrirBajada = (lista) => setBajando({ mermas: lista, almacen: lista[0]?.almacen_num });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium">Mermas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {ambito === 'facturacion'
              ? 'Mermas ya bajadas de tienda, a la espera de facturación'
              : 'Registro y seguimiento de mermas'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ColPicker cols={MERMA_COL_DEFS} visible={cols}
            onChange={(next) => { setCols(next); saveColsWithOrder(MERMA_COLS_KEY, next, colOrder); }}
            storageKey={MERMA_COLS_KEY} order={colOrder}
            onOrderChange={(next) => { setColOrder(next); saveColsWithOrder(MERMA_COLS_KEY, cols, next); }} />
        {tieneRol(user, ['inv', 'administrador', 'superadmin']) && (
          <Button onClick={() => { setShowForm(true); setSelectedId(null); }} style={{ borderRadius: '8px' }}>
            <Plus className="w-4 h-4 mr-1.5" /> Registrar merma
          </Button>
        )}
        </div>
      </div>

      <Dialog open={showForm} onOpenChange={(o) => { if (!o && !createMut.isPending) setShowForm(false) }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar merma</DialogTitle>
          </DialogHeader>
          <MermaForm user={user} onSubmit={(d) => createMut.mutate(d)} onCancel={() => setShowForm(false)} isPending={createMut.isPending} />
        </DialogContent>
      </Dialog>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Buscar..." className="pl-10" style={{ borderRadius: '8px' }} />
        </div>
        <SelectorAlmacen almacen={almacen} setAlmacen={setAlmacen} almacenesConfig={almacenesConfig} />
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-48" style={{ borderRadius: '8px' }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ambito">{ETIQUETA_AMBITO[ambito]}</SelectItem>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="en_curso">En curso</SelectItem>
            <SelectItem value="pend_fact">Pend. FACT</SelectItem>
            <SelectItem value="en_auditoria">En auditoría</SelectItem>
            <SelectItem value="completado">Completado</SelectItem>
            <SelectItem value="devuelto">Devuelto</SelectItem>
            <SelectItem value="reconteo_solicitado">Reconteo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* La barra está siempre que haya algo que bajar, no solo al marcar: si
          el botón aparece con la selección, quien no sabe que puede marcar
          tampoco descubre que puede bajarlas. */}
      {puedeBajar && bajables.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border border-[#BA7517]/30 bg-[#BA7517]/5"
          style={{ borderRadius: '12px' }}>
          <p className="text-sm flex-1 min-w-0">
            {marcadas.length === 0 ? (
              <span className="text-muted-foreground">
                {bajables.length} {bajables.length === 1 ? 'merma sin bajar' : 'mermas sin bajar'} de tienda.
                Mientras sigan contadas en el piso, la existencia dice que hay algo que no hay.
              </span>
            ) : (
              <>
                <span className="font-medium">{marcadas.length}</span>
                {marcadas.length === 1 ? ' merma seleccionada' : ' mermas seleccionadas'}
                {' · '}{unidadesMarcadas} {unidadesMarcadas === 1 ? 'unidad' : 'unidades'}
              </>
            )}
            {mezclaAlmacenes && (
              <span className="block text-xs text-[#E24B4A] mt-0.5">
                Son de {almacenes.length} almacenes distintos y cada envío va a uno solo. Deja marcadas las de un almacén.
              </span>
            )}
          </p>
          <Button variant="ghost" size="sm" onClick={alternarTodas}>
            {todasMarcadas ? 'Quitar selección' : 'Seleccionar todas'}
          </Button>
          <Button size="sm" disabled={marcadas.length === 0 || mezclaAlmacenes}
            onClick={() => abrirBajada(marcadas)} style={{ borderRadius: '8px' }}>
            <ArrowDownToLine className="w-3.5 h-3.5 mr-1.5" />
            Bajar de tienda
          </Button>
        </div>
      )}

      <div>
        <Card className="overflow-hidden" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  {puedeBajar && (
                    <th className="p-3 w-9">
                      <input type="checkbox" aria-label="Seleccionar todas"
                        checked={todasMarcadas} onChange={alternarTodas}
                        disabled={bajables.length === 0}
                        className="w-3.5 h-3.5 accent-[#BA7517] cursor-pointer" />
                    </th>
                  )}
                  {colOrder.filter(k => cols[k]).map(k => (
                    <SortTh key={k} colKey={k} label={COL_TITULO[k].label}
                      align={COL_TITULO[k].align} sort={sort} onSort={onSort}
                      className={`p-3 text-xs font-medium text-muted-foreground ${COL_TITULO[k].className ?? ''}`} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={colOrder.filter(k => cols[k]).length + (puedeBajar ? 2 : 0) || 5} className="p-8 text-center text-muted-foreground">Cargando...</td></tr>
                ) : sorted.length === 0 ? (
                  <tr><td colSpan={colOrder.filter(k => cols[k]).length + (puedeBajar ? 2 : 0) || 5} className="p-8 text-center text-muted-foreground">Sin registros</td></tr>
                ) : sorted.map(m => (
                  <tr key={m.id}
                    className={`border-b hover:bg-accent/50 cursor-pointer transition-colors ${selectedId === m.id ? 'bg-accent' : ''}`}
                    onClick={() => { setSelectedId(m.id); setShowForm(false); }}>
                    {puedeBajar && (
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        {m.producto_codigo && Number(m.cantidad) > 0 && !m.rebaja_confirmada && (
                          <input type="checkbox" aria-label={`Seleccionar ${m.producto_nombre}`}
                            checked={seleccion.has(m.id)} onChange={() => alternar(m.id)}
                            className="w-3.5 h-3.5 accent-[#BA7517] cursor-pointer" />
                        )}
                      </td>
                    )}
                    {colOrder.filter(k => cols[k]).map(k => {
                      const CELDAS = {
                        producto_nombre: (
                          <td key={k} className="p-3">
                            <p className="font-medium">{m.producto_nombre}</p>
                            <p className="text-xs text-muted-foreground">{m.producto_codigo}</p>
                          </td>
                        ),
                        almacen: <td key={k} className="p-3 text-xs text-muted-foreground hidden md:table-cell">{warehouseName(m.almacen_num) || m.almacen_num || '—'}</td>,
                        cantidad: <td key={k} className="p-3 text-right font-medium">{m.cantidad}</td>,
                        clasif_merma: <td key={k} className="p-3 text-xs">{m.clasif_merma}</td>,
                        total_perdida: <td key={k} className="p-3 text-right font-medium text-[#E24B4A]">${m.total_perdida?.toFixed(2) || '0.00'}</td>,
                        estado_tarea: <td key={k} className="p-3 text-center"><StatusBadge status={m.estado_tarea} /></td>,
                        rebaja_confirmada: (
                          <td key={k} className="p-3 text-center">
                            {m.rebaja_confirmada ? (
                              <span className="inline-flex items-center gap-1 text-xs text-[#1D9E75] bg-[#1D9E75]/10 px-2 py-1 rounded-md whitespace-nowrap"
                                title={m.fecha_rebaja_tienda ? `Bajado el ${m.fecha_rebaja_tienda}` : 'Bajado de tienda'}>
                                <Check className="w-3 h-3" /> Bajado
                              </span>
                            ) : m.producto_codigo && Number(m.cantidad) > 0 ? (
                              <span className="inline-flex items-center gap-1 text-xs text-[#BA7517] bg-[#BA7517]/10 px-2 py-1 rounded-md whitespace-nowrap">
                                Sin bajar
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">—</span>
                            )}
                          </td>
                        ),
                        fecha_inv: <td key={k} className="p-3 text-muted-foreground">{m.fecha_inv?.slice(0, 10)}</td>,
                      };
                      return CELDAS[k] ?? <td key={k} className="p-3" />;
                    })}
                    {puedeBajar && (
                      <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {m.producto_codigo && Number(m.cantidad) > 0 && !m.rebaja_confirmada && (
                          <button type="button" title="Bajar esta merma de tienda"
                            aria-label={`Bajar de tienda: ${m.producto_nombre}`}
                            onClick={() => abrirBajada([m])}
                            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-[#BA7517] transition-colors">
                            <ArrowDownToLine className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-secondary/30">
                  <td colSpan={colOrder.filter(k => cols[k]).indexOf('total_perdida') + (puedeBajar ? 1 : 0) || 1} className="p-3 text-xs font-medium text-muted-foreground">Pérdida en esta página</td>
                  <td className="p-3 text-right font-medium text-[#E24B4A]">${perdidaPagina.toFixed(2)}</td>
                  <td colSpan={colOrder.filter(k => cols[k]).length + (puedeBajar ? 2 : 0)}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />

      </div>

      {bajando && (
        <BajarMermasDialog
          mermas={bajando.mermas}
          almacen={bajando.almacen}
          onHecho={() => setSeleccion(new Set())}
          onClose={() => setBajando(null)}
        />
      )}

      <Dialog open={!!selectedId} onOpenChange={(o) => { if (!o) setSelectedId(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
          {selected && (
            <MermaDetail
              merma={selected}
              role={role}
              user={user}
              onUpdate={(data) => updateMut.mutate({ id: selected.id, data })}
              onDelete={() => deleteMut.mutate(selected.id)}
              isUpdating={updateMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}