import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StatusBadge from '@/components/shared/StatusBadge';
import ProductSearch from '@/components/shared/ProductSearch';
import AlertBanner from '@/components/shared/AlertBanner';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Search, PackageOpen, Trash2, Pencil, ChevronLeft, ListFilter, Truck,
  Image as ImageIcon } from 'lucide-react';
import { format } from 'date-fns';
import { useConfirm } from '@/lib/useConfirm';
import Pagination from '@/components/shared/Pagination';
import { useSortable } from '@/lib/useSortable';
import ColPicker, { loadColsWithOrder, saveColsWithOrder } from '@/components/shared/ColPicker';
import { notifyJefeDepto, notifyRoles } from '@/lib/notificationService';
import { incidenciasDe, hayIncidencia, resumenIncidencias } from '@/lib/incidenciasRecepcion';
import ReporteIncidencia from '@/components/recepciones/ReporteIncidencia';
import ResolverIncidencia from '@/components/recepciones/ResolverIncidencia';
import { tieneRol } from '@/lib/roles';
import { useAlmacen } from '@/lib/useAlmacen';
import { warehouseName } from '@/services/tkc/warehouses';
import { fetchPedidos, fetchLineasDePedido } from '@/services/pedidosService';
import LineaRecibir from '@/components/recepciones/LineaRecibir';
import { SIN_SONDEO } from '@/lib/query-client';
import BotonAccion from '@/components/shared/BotonAccion';
import { FiltroIcono } from '@/components/shared/ControlesLista';
import CabeceraLista from '@/components/shared/CabeceraLista';
import ListaResponsive from '@/components/shared/ListaResponsive';

const RECEP_COL_DEFS = [
  { key: 'no_recepcion',      label: 'No. Recepción', defaultOn: true, required: true  },
  { key: 'proveedor',         label: 'Proveedor',     defaultOn: true, required: false },
  { key: 'fecha',             label: 'Fecha',         defaultOn: true, required: false },
  { key: 'items_confirmados', label: 'Items',         defaultOn: true, required: false },
  { key: 'estado',            label: 'Estado',        defaultOn: true, required: false },
  { key: 'almacen_num',       label: 'Almacén',       defaultOn: false, required: false },
]
const RECEP_COLS_KEY = 'recep_cols'

/** Hoy hay una recepción; con trescientas, la lista sin paginar es un muro. */
const PAGE_SIZE = 50

/** Los estados de una recepción, para el filtro. */
const FILTRO_RECEPCION = [
  { valor: 'todas',           label: 'Todas' },
  { valor: 'en_curso',        label: 'Recibiendo' },
  { valor: 'con_diferencias', label: 'Con incidencia' },
  { valor: 'cerrada',         label: 'Conformes' },
]

/**
 * Los estados de un pedido de compra, dichos como los dice la gente.
 *
 * `en_camino` y `todos` no son estados suyos: son los dos atajos del filtro.
 * El primero viene puesto porque es contra lo que se recibe casi siempre; el
 * segundo está porque a veces el camión llega de un pedido que comercial dejó
 * en otro estado y había que poder encontrarlo.
 */
const FILTRO_PEDIDO = [
  { valor: 'en_camino',             label: 'En camino' },
  { valor: 'todos',                 label: 'Todos los pedidos' },
  { valor: 'enviado',               label: 'Enviados' },
  { valor: 'parcialmente_recibido', label: 'Parcialmente recibidos' },
  { valor: 'confirmado',            label: 'Confirmados' },
  { valor: 'pendiente_revision',    label: 'Pendientes de revisión' },
  { valor: 'borrador',              label: 'Borradores' },
  { valor: 'recibido',              label: 'Ya recibidos' },
  { valor: 'cancelado',             label: 'Cancelados' },
]

/**
 * La clave de una línea. Las recepciones de antes no la traen, así que para
 * esas se cae en la posición: no es estable, pero tampoco hay nada mejor.
 */
const claveDe = (d, i) => d.clave ?? `${d.producto_codigo ?? ''}#${i}`;

/** Cuántas líneas se contaron ya. Se recalculaba en cuatro sitios. */
const yaContadas = (detalles) => detalles.filter((d) => d.contada !== false).length;

/**
 * La recepción que nace de un pedido de compra.
 *
 * Las líneas entran ya puestas, con lo que pidió comercial como esperado y lo
 * recibido en blanco: lo que hay que hacer al descargar es contar, no
 * transcribir. `contada: false` las distingue de una línea que llegó a cero.
 */
function recepcionDePedido({ pedido, lineas, no, user, almacen }) {
  const detalles = lineas.map((l, i) => ({
    // Clave propia de la línea. El mismo producto puede venir dos veces en un
    // pedido —dos cantidades, dos precios— así que el código no distingue, y
    // con la posición como clave React mezcla lo escrito entre filas en
    // cuanto se borra una del medio.
    clave: `${l.codigo}#${i}`,
    producto_codigo: l.codigo,
    producto_nombre: l.nombre,
    cant_esperada: l.cantidad,
    cant_recibida: 0,
    cant_merma_origen: 0,
    diferencia: -l.cantidad,
    no_lote: '',
    fecha_vencimiento: '',
    temperatura: 'ambient',
    calidad_ok: true,
    nota_calidad: '',
    contada: false,
  }));

  return {
    no_recepcion: no,
    fecha: format(new Date(), 'yyyy-MM-dd'),
    especialista_id: user?.email,
    especialista_nombre: user?.full_name,
    estado: 'en_curso',
    diferencias: [],
    almacen_num: almacen,
    proveedor: pedido.proveedor,
    no_orden: pedido.numero,
    pedido_id: pedido.id,
    detalles,
    total_items: detalles.length,
    items_confirmados: 0,
  };
}

/** Cómo se titula y alinea cada columna. La usan la cabecera y las celdas. */
const COL_TITULO = {
  no_recepcion:      { label: 'No. Recepción' },
  proveedor:         { label: 'Proveedor' },
  fecha:             { label: 'Fecha' },
  items_confirmados: { label: 'Items', align: 'center' },
  estado:            { label: 'Estado', align: 'center' },
  almacen_num:       { label: 'Almacén' },
}

export default function Recepciones() {
  const [cols, setCols] = useState(() => loadColsWithOrder(RECEP_COLS_KEY, RECEP_COL_DEFS).visible);
  const [colOrder, setColOrder] = useState(() => loadColsWithOrder(RECEP_COLS_KEY, RECEP_COL_DEFS).order);
  const [showCreate, setShowCreate] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const { almacen } = useAlmacen();
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [page, setPage] = useState(1);
  // La recepción abierta va en la URL, no en el estado: así es una pantalla
  // propia y el botón de atrás del móvil vuelve a la lista.
  const { id: selectedId } = useParams();
  const navigate = useNavigate();
  const abrir = (id) => navigate(`/recepciones/${id}`);
  const cerrar = () => navigate('/recepciones');
  // Se abre en los pedidos y no en las recepciones: descargar un camión
  // empieza por buscar de qué pedido viene, y mientras no se recibe nada la
  // otra pestaña está vacía por definición.
  const [vista, setVista] = useState('pedidos');
  const [creando, setCreando] = useState(null);
  // El filtro y la busqueda de la pestana de pedidos viven aqui y no dentro
  // de `PedidosPorRecibir`: la cabecera es la misma para las dos pestanas y
  // todos los mandos van en su fila, como en el resto del sitio.
  const [filtroPedido, setFiltroPedido] = useState('en_camino');
  const [buscaPedido, setBuscaPedido] = useState('');
  const { sort, onSort } = useSortable('fecha', 'desc');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

  // Acotada al almacén activo, como el resto del módulo. Las de antes de que
  // existiera la columna no tienen almacén; se muestran igual —marcadas— para
  // no esconder historial que sí ocurrió.
  const { data: recepcionesRaw, isLoading } = useQuery({
    queryKey: ['recepciones', almacen],
    queryFn: () => base44.entities.Recepcion.list('-created_date', 100),
    select: (d) => (Array.isArray(d) ? d : [])
      .filter((r) => !almacen || !r.almacen_num || r.almacen_num === almacen),
  });
  const recepciones = recepcionesRaw ?? [];

  // Como en el resto del módulo: cambiar de almacén, filtro o búsqueda
  // devuelve a la primera página.
  const firmaFiltros = `${almacen}|${filtroEstado}|${searchQ.trim()}`;
  const firmaPrevia = useRef(firmaFiltros);
  useEffect(() => {
    if (firmaPrevia.current !== firmaFiltros) { firmaPrevia.current = firmaFiltros; setPage(1); }
  }, [firmaFiltros]);

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Recepcion.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['recepciones'] }); setShowCreate(false); },
    onError: (error) => alert(error.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Recepcion.update(id, data),
    onSuccess: (_d, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['recepciones'] });
      queryClient.invalidateQueries({ queryKey: ['recepcion', id] });
    },
    onError: (error) => alert(error.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Recepcion.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['recepciones'] }); cerrar(); },
    onError: (error) => alert(error.message),
  });

  // La lista trae las cien últimas; una más vieja abierta por su enlace no
  // está ahí, así que se pide suelta.
  const { data: suelta, isLoading: cargandoSuelta } = useQuery({
    queryKey: ['recepcion', selectedId],
    queryFn: async () => (await base44.entities.Recepcion.filter({ id: selectedId }, null, 1))[0] ?? null,
    enabled: Boolean(selectedId),
  });
  const selected = recepciones.find(r => r.id === selectedId) ?? suelta ?? null;

  const filtered = recepciones.filter(r => {
    if (filtroEstado !== 'todas' && r.estado !== filtroEstado) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      // También por proveedor, número de orden y producto: quien busca una
      // recepción suele tener delante el albarán o la caja, no su número.
      const hay = [r.proveedor, r.no_recepcion, r.no_orden]
        .some((c) => String(c ?? '').toLowerCase().includes(q))
        || (r.detalles ?? []).some((d) =>
          String(d.producto_nombre ?? '').toLowerCase().includes(q)
          || String(d.producto_codigo ?? '').toLowerCase().includes(q));
      if (!hay) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const k = sort.key;
    if (k === 'items_confirmados') {
      return ((a.items_confirmados || 0) - (b.items_confirmados || 0)) * dir;
    }
    const av = a[k] ?? '';
    const bv = b[k] ?? '';
    return av < bv ? -dir : av > bv ? dir : 0;
  });

  const pagina = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const genNoRecepcion = () => {
    const y = new Date().getFullYear();
    const n = recepciones.filter(r => r.no_recepcion?.startsWith(`REC-${y}`)).length + 1;
    return `REC-${y}-${String(n).padStart(4, '0')}`;
  };

  // `tieneRol` y no `user.role`: quien es inventarista y además factura
  // resolvía al rol de más autoridad y perdía lo que solo puede `inv`.
  const puedeRecibir = tieneRol(user, ['inv', 'administrador']);
  const enPedidos = vista === 'pedidos';

  /**
   * Empezar a recibir un pedido.
   *
   * Si ya tiene recepción se abre esa en vez de crear otra: dos recepciones
   * del mismo pedido son dos conteos que luego nadie sabe cuál vale.
   */
  const recibirPedido = async (pedido) => {
    const ya = recepciones.find((r) => r.pedido_id === pedido.id);
    if (ya) return abrir(ya.id);

    setCreando(pedido.id);
    try {
      const lineas = await fetchLineasDePedido(pedido.id);
      const creada = await createMut.mutateAsync(
        recepcionDePedido({ pedido, lineas, no: genNoRecepcion(), user, almacen }),
      );
      if (creada?.id) abrir(creada.id);
    } catch {
      // El aviso lo da `createMut.onError`; aquí solo se suelta el botón.
    } finally {
      setCreando(null);
    }
  };

  // Una recepción abierta ocupa la pantalla entera. Se cuenta con el móvil en
  // la mano y una caja en la otra: un diálogo con seis campos por línea, sobre
  // la lista y con su propio scroll, no se puede usar así.
  if (selectedId) {
    return (
      <div className="space-y-4">
        <button onClick={cerrar}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" /> Recepciones
        </button>
        {selected ? (
          <RecepcionDetail
            recepcion={selected}
            user={user}
            onUpdate={(data) => updateMut.mutate({ id: selected.id, data })}
            onDelete={() => deleteMut.mutate(selected.id)}
          />
        ) : cargandoSuelta ? (
          <p className="text-sm text-muted-foreground p-8 text-center">Cargando…</p>
        ) : (
          <AlertBanner variant="warning" message="Esa recepción ya no existe." />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CabeceraLista
        titulo="Recepciones"
        subtitulo={almacen ? `Recepción de mercancía en ${warehouseName(almacen)}` : 'Recepción de mercancía'}
        recuento={enPedidos ? null : `${filtered.length} de ${recepciones.length}`}
        buscador={(
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={enPedidos ? buscaPedido : searchQ}
              onChange={(e) => (enPedidos ? setBuscaPedido(e.target.value) : setSearchQ(e.target.value))}
              placeholder={enPedidos
                ? 'Buscar por proveedor, número u oferta...'
                : 'Buscar por proveedor, orden o producto...'}
              className="pl-10" style={{ borderRadius: 'var(--r-ctl)' }} />
          </div>
        )}
        filtros={(
          <>
          {enPedidos ? (
            <FiltroIcono icono={Truck} etiqueta="Estado del pedido"
              valor={filtroPedido} porDefecto="en_camino" onChange={setFiltroPedido}
              opciones={FILTRO_PEDIDO} />
          ) : (
            <>
              <FiltroIcono icono={ListFilter} etiqueta="Estado de la recepción"
                valor={filtroEstado} porDefecto="todas" onChange={setFiltroEstado}
                opciones={FILTRO_RECEPCION} />
              <ColPicker cols={RECEP_COL_DEFS} visible={cols}
                onChange={(next) => { setCols(next); saveColsWithOrder(RECEP_COLS_KEY, next, colOrder); }}
                storageKey={RECEP_COLS_KEY} order={colOrder}
                onOrderChange={(next) => { setColOrder(next); saveColsWithOrder(RECEP_COLS_KEY, cols, next); }} />
            </>
          )}
          {puedeRecibir && (
            <BotonAccion icono={Plus} onClick={() => setShowCreate(true)}>
              Recepción sin pedido
            </BotonAccion>
          )}
          </>
        )}
      />

      <Tabs value={vista} onValueChange={setVista}>
        <TabsList>
          <TabsTrigger value="pedidos">Pedidos de compra</TabsTrigger>
          <TabsTrigger value="recepciones">Recepciones ({recepciones.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Create form */}
      <Dialog open={showCreate} onOpenChange={(o) => { if (!o) setShowCreate(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Recepción sin pedido</DialogTitle>
          </DialogHeader>
          <CreateRecepcionForm
            genNo={genNoRecepcion}
            user={user}
            almacen={almacen}
            onSubmit={(d) => createMut.mutate(d)}
            onCancel={() => setShowCreate(false)}
          />
        </DialogContent>
      </Dialog>

      {vista === 'pedidos' ? (
        <PedidosPorRecibir
          puedeRecibir={puedeRecibir}
          recepciones={recepciones}
          creando={creando}
          onRecibir={recibirPedido}
          filtro={filtroPedido}
          busca={buscaPedido}
        />
      ) : (
      <>
      <ListaResponsive
        columnas={colOrder.filter((k) => cols[k])}
        titulos={COL_TITULO}
        filas={pagina}
        cargando={isLoading}
        vacio="Ninguna recepción con estos filtros."
        claveDe={(r) => r.id}
        encabezado="no_recepcion"
        orden={{ sort, onSort }}
        alPulsar={(r) => abrir(r.id)}
        celda={celdaRecepcion}
      />

      <Pagination page={page} total={sorted.length} pageSize={PAGE_SIZE}
        onPage={(n) => setPage(Math.max(1, n))} />

      </>
      )}

    </div>
  );
}

/**
 * Los pedidos de compra que hizo comercial, para recibir contra ellos.
 *
 * Están aquí y no escondidos en el formulario de «nueva recepción» porque
 * recibir empieza justo por esto: mirar qué pedido es el que acaba de llegar.
 * De paso se ve cuáles ya se recibieron, que antes solo se sabía abriendo el
 * desplegable.
 *
 * El filtro trae por defecto los que están en camino, pero se puede pedir
 * cualquier estado: en la práctica llega mercancía de pedidos que se quedaron
 * en `confirmado`.
 */
function PedidosPorRecibir({ puedeRecibir, recepciones, creando, onRecibir, filtro, busca }) {

  const { data: pedidos, isLoading, error } = useQuery({
    queryKey: ['pedidos', filtro],
    // `en_camino` es lo que el servidor hace por defecto, así que no se manda.
    queryFn: () => fetchPedidos({ estados: filtro === 'en_camino' ? undefined : filtro }),
    ...SIN_SONDEO,
    retry: false,
  });

  const q = busca.trim().toLowerCase();
  const lista = (pedidos ?? []).filter((p) => !q
    || p.proveedor.toLowerCase().includes(q)
    || String(p.numero).toLowerCase().includes(q)
    || p.oferta.toLowerCase().includes(q));

  /** La recepción de este pedido, si ya se empezó. */
  const recepcionDe = (id) => recepciones.find((r) => r.pedido_id === id);

  if (error) {
    return (
      <AlertBanner variant="warning"
        message={`No se pudieron cargar los pedidos (${error.message}). Puedes registrar la recepción sin pedido.`} />
    );
  }

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Card className="p-8 text-center text-muted-foreground" style={{ borderRadius: 'var(--r-card)', borderWidth: '0.5px' }}>
          Cargando pedidos…
        </Card>
      ) : lista.length === 0 ? (
        <AlertBanner variant="info"
          message={filtro === 'todos'
            ? 'No hay ningún pedido de compra. Si la mercancía llegó igualmente, regístrala sin pedido.'
            : 'Ningún pedido en ese estado. Prueba con «Todos los pedidos»: puede que se haya quedado en otro.'} />
      ) : lista.map((p) => {
        const ya = recepcionDe(p.id);
        return (
          <Card key={p.id} className="p-4 flex flex-wrap items-center gap-3"
            style={{ borderRadius: 'var(--r-card)', borderWidth: '0.5px' }}>
            <div className="flex-1 min-w-[220px] space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{p.numero}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground"
                  style={{ borderRadius: 'var(--r-chip)' }}>{p.estado.replace(/_/g, ' ')}</span>
                {ya && (
                  <span className="text-xs px-2 py-0.5 rounded bg-[var(--c-ok-dim)]/8 text-[var(--c-ok-dim)]"
                    style={{ borderRadius: 'var(--r-chip)' }}>Recepción {ya.no_recepcion}</span>
                )}
              </div>
              <p className="text-sm">{p.proveedor || 'Sin proveedor'}</p>
              <p className="text-xs text-muted-foreground">
                {p.lineas} {p.lineas === 1 ? 'ítem' : 'ítems'}
                {p.importe ? ` · ${p.importe} ${p.moneda}` : ''}
                {p.oferta ? ` · ${p.oferta}` : ''}
                {p.llegadaEstimada ? ` · llega ${p.llegadaEstimada}` : ''}
              </p>
            </div>
            {puedeRecibir && (
              <Button variant={ya ? 'outline' : 'default'} onClick={() => onRecibir(p)}
                disabled={creando === p.id} style={{ borderRadius: 'var(--r-ctl)' }}>
                <PackageOpen className="w-4 h-4 mr-1.5" />
                {creando === p.id ? 'Preparando…' : ya ? 'Abrir recepción' : 'Recibir'}
              </Button>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/**
 * Una recepción sin pedido detrás.
 *
 * Lo normal es recibir contra un pedido —así las cantidades esperadas son las
 * que pidió comercial y no las que alguien recuerde—, pero la mercancía a
 * veces llega sin él, o la API de pedidos está caída con el camión en la
 * puerta. Entonces se teclea el proveedor y se van añadiendo los productos.
 */
function CreateRecepcionForm({ genNo, user, almacen, onSubmit, onCancel }) {
  const [proveedor, setProveedor] = useState('');
  const [noOrden, setNoOrden] = useState('');

  const crear = () => onSubmit({
    no_recepcion: genNo(),
    fecha: format(new Date(), 'yyyy-MM-dd'),
    especialista_id: user?.email,
    especialista_nombre: user?.full_name,
    estado: 'en_curso',
    diferencias: [],
    almacen_num: almacen,
    proveedor,
    no_orden: noOrden,
    detalles: [],
  });

  return (
    <div className="space-y-4">
      <AlertBanner variant="info"
        message="Si la mercancía viene de un pedido, recíbela desde la pestaña «Pedidos de compra»: las cantidades esperadas vienen puestas." />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Proveedor *" style={{ borderRadius: 'var(--r-ctl)' }} />
        <Input value={noOrden} onChange={(e) => setNoOrden(e.target.value)} placeholder="No. orden (opcional)" style={{ borderRadius: 'var(--r-ctl)' }} />
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onCancel} style={{ borderRadius: 'var(--r-ctl)' }}>Cancelar</Button>
        <Button onClick={crear} disabled={!proveedor.trim()} style={{ borderRadius: 'var(--r-ctl)' }}>
          <PackageOpen className="w-4 h-4 mr-1.5" /> Crear recepción
        </Button>
      </div>
    </div>
  );
}

function RecepcionDetail({ recepcion, user, onUpdate, onDelete }) {
  const [newItem, setNewItem] = useState(null);
  // Se guarda la CLAVE de la línea que se está contando, no su posición:
  // borrar otra línea mientras tanto desplazaba el índice y el formulario
  // pasaba a escribir en un producto distinto.
  const [contando, setContando] = useState(null);
  const [editingProveedor, setEditingProveedor] = useState(false);
  const [proveedorDraft, setProveedorDraft] = useState(recepcion.proveedor || '');
  const { confirmDialog, ConfirmDialogNode } = useConfirm();
  const detalles = recepcion.detalles || [];
  const canEdit = tieneRol(user, ['inv', 'administrador']) && recepcion.estado === 'en_curso';
  // Una línea del pedido nace sin contar; las que se añaden a mano ya vienen
  // contadas. El progreso es lo contado, no lo listado: con lo segundo una
  // recepción recién abierta decía 100% sin que nadie hubiera tocado nada.
  const sinContar = detalles.filter((d) => d.contada === false);
  const confirmados = detalles.length - sinContar.length;
  const total = recepcion.total_items || detalles.length;
  const progress = total > 0 ? (confirmados / total) * 100 : 0;

  // Las diferencias son de quien las resuelve, no de quien cuenta: ver el
  // número de más o de menos es ver lo que se esperaba.
  const veCantidades = tieneRol(user, ['supervisor', 'jefe_depto', 'fact', 'administrador']);
  // Facturación entra a resolver porque la mitad de la resolución es suya:
  // cuánto se factura de verdad de cada línea. Lo que no hace es devolver la
  // recepción al muelle ni darla por resuelta.
  const puedeResolver = tieneRol(user, ['supervisor', 'jefe_depto', 'fact', 'administrador']);
  const puedeRecontar = tieneRol(user, ['supervisor', 'jefe_depto', 'administrador']);

  /**
   * Qué sabe el catálogo de los productos de esta recepción.
   *
   * Lo que se busca es sobre todo lo que NO está: un código que no aparece es
   * un producto nuevo, sin anuncio en TKC, y de ese hay que apuntar el código
   * completo porque no lo tenemos de ningún otro sitio.
   */
  const codigos = [...new Set(detalles.map((d) => d.producto_codigo).filter(Boolean))];
  const { data: catalogo } = useQuery({
    queryKey: ['recepcion-catalogo', recepcion.id, codigos.length],
    queryFn: () => base44.entities.Producto.filter(
      { codigo_producto: codigos }, 'nombre', 1000, 0,
      ['codigo_producto', 'nombre', 'estado_anuncio', 'id_tienda', 'suministrador'],
    ),
    enabled: codigos.length > 0,
    ...SIN_SONDEO,
  });
  const porCodigo = new Map((catalogo ?? []).map((p) => [String(p.codigo_producto), p]));
  // Mientras el catálogo no ha llegado nada es «nuevo»: marcarlo antes de
  // saberlo haría teclear códigos completos que ya tenemos.
  const esNuevo = (codigo) => Boolean(catalogo) && !porCodigo.has(String(codigo));

  /** Guarda la foto aparte y devuelve su id, que es lo que va en la línea. */
  const guardarFoto = async (codigo, datos) => {
    if (!datos) return null;
    const fila = await base44.entities.RecepcionFoto.create({
      recepcion_id: recepcion.id,
      producto_codigo: String(codigo ?? ''),
      datos,
      creado_por: user?.email,
    });
    return fila?.id ?? null;
  };

  /** Escribe lo contado en una línea que ya venía del pedido. */
  const contarLinea = async (clave, datos) => {
    const i = detalles.findIndex((d, j) => claveDe(d, j) === clave);
    if (i < 0) return;
    const { foto, ...campos } = datos;
    const fotoId = await guardarFoto(detalles[i]?.producto_codigo, foto);
    const updated = detalles.map((x, j) => (j === i ? {
      ...x, ...campos,
      diferencia: campos.cant_recibida - (Number(x.cant_esperada) || 0),
      contada: true,
      // Se anota al contar y no se recalcula luego: si el producto se da de
      // alta la semana que viene, el reporte seguirá diciendo que cuando
      // llegó no existía, que es lo que pasó.
      nuevo_en_tkc: esNuevo(x.producto_codigo),
      ...(fotoId ? { foto_id: fotoId } : {}),
    } : x));
    onUpdate({
      detalles: updated,
      items_confirmados: yaContadas(updated),
    });
    setContando(null);
  };

  const addItem = (producto) => {
    setNewItem({
      clave: `${producto.codigo_producto}#manual-${Date.now()}`,
      producto_id: producto.id,
      producto_nombre: producto.nombre,
      producto_codigo: producto.codigo_producto,
      // No venía en el pedido, así que no se esperaba ninguna: la diferencia
      // es todo lo que llegue.
      cant_esperada: 0,
      no_lote: '',
      temperatura: 'ambient',
    });
  };

  /** Añade un producto que no venía en el pedido. */
  const confirmItem = async (datos) => {
    const { foto, ...campos } = datos;
    const fotoId = await guardarFoto(newItem.producto_codigo, foto);
    const item = {
      ...newItem, ...campos,
      diferencia: campos.cant_recibida,
      contada: true,
      nuevo_en_tkc: esNuevo(newItem.producto_codigo),
      ...(fotoId ? { foto_id: fotoId } : {}),
    };
    const updated = [...detalles, item];
    onUpdate({
      detalles: updated,
      items_confirmados: yaContadas(updated),
      total_items: updated.length,
    });
    setNewItem(null);
  };

  /**
   * Devolver al muelle los productos que hay que volver a contar.
   *
   * Las líneas vuelven a nacer sin contar —no a cero, sin contar— y la
   * recepción entera vuelve a `en_curso`. Lo contado antes se borra a
   * propósito: si se deja a la vista, el reconteo es mirar el número de la
   * vez pasada y confirmarlo, que es exactamente lo que se quiere evitar.
   *
   * @param {number[]} indices posiciones dentro de `recepcion.diferencias`
   */
  const mandarARecontar = (indices) => {
    const diferencias = recepcion.diferencias ?? [];
    const codigos = new Set(indices.map((i) => diferencias[i]?.producto_codigo).filter(Boolean));
    if (codigos.size === 0) return;

    const nuevosDetalles = detalles.map((d) => (codigos.has(d.producto_codigo) ? {
      ...d,
      cant_recibida: 0,
      diferencia: -(Number(d.cant_esperada) || 0),
      contada: false,
    } : d));

    onUpdate({
      estado: 'en_curso',
      detalles: nuevosDetalles,
      items_confirmados: yaContadas(nuevosDetalles),
      diferencias: diferencias.map((d, i) => (indices.includes(i)
        ? { ...d, tipo_diferencia: 'reconteo_solicitado', resuelto_por: user?.email,
            fecha_resolucion: format(new Date(), 'yyyy-MM-dd') }
        : d)),
    });

    notifyJefeDepto(
      'inventario', 'recepcion',
      `Reconteo pedido en ${recepcion.no_recepcion}`,
      `${codigos.size} ${codigos.size === 1 ? 'producto vuelve' : 'productos vuelven'} a contarse `
      + `en la recepción de ${recepcion.proveedor || 'proveedor sin nombre'}.`,
      `/recepciones/${recepcion.id}`,
    ).catch(() => {});
  };

  const cerrarRecepcion = async () => {
    // Lo que se mira ya no son solo las cantidades: también cuenta la
    // mercancía dañada, la de calidad deficiente y el producto que no existe
    // en el catálogo. Una recepción donde las cifras cuadran pero media caja
    // viene rota también es una incidencia.
    const incidencias = incidenciasDe(recepcion);
    const marcar = hayIncidencia(incidencias);
    const difs = detalles.filter(d => d.diferencia !== 0);

    // La incidencia no bloquea: con el camión en la puerta, impedir cerrar
    // hasta que alguien la resuelva es como se consiguen números inventados.
    // Se registra, se avisa y la recepción sigue su curso marcada.
    const aviso = marcar
      ? `Se generará el reporte de incidencia (${resumenIncidencias(incidencias)}) `
        + 'y se avisará al jefe de departamento y a facturación.'
      : 'Se registrarán las diferencias y no podrá modificarse.';
    if (!await confirmDialog(aviso, { title: '¿Cerrar esta recepción?' })) return;

    const estado = marcar ? 'con_diferencias' : 'cerrada';
    const diferencias = difs.map(d => ({
      producto_id: d.producto_id,
      producto_nombre: d.producto_nombre,
      producto_codigo: d.producto_codigo,
      cant_esperada: d.cant_esperada,
      cant_recibida: d.cant_recibida,
      cantidad_diferencia: d.diferencia,
      tipo_diferencia: 'pendiente',
    }));
    onUpdate({ estado, diferencias });

    if (!marcar) return;

    const titulo = `Recepción ${recepcion.no_recepcion} con incidencias`;
    const cuerpo = `${recepcion.proveedor || 'Proveedor sin nombre'}`
      + `${recepcion.no_orden ? ` (orden ${recepcion.no_orden})` : ''} — ${resumenIncidencias(incidencias)}. `
      + 'Abre la recepción para ver el reporte completo.';
    const enlace = `/recepciones/${recepcion.id}`;

    // A inventario para reclamar al proveedor; a facturación porque es quien
    // cuadra la factura contra lo que de verdad entró, y hasta ahora se
    // enteraba cuando ya la había pagado.
    // `recepcion` en singular: es la clave del icono y el color en el menú de
    // notificaciones. Con el plural que había antes salía el aviso sin icono.
    notifyJefeDepto('inventario', 'recepcion', titulo, cuerpo, enlace).catch(() => {});
    notifyJefeDepto('facturacion', 'recepcion', titulo, cuerpo, enlace).catch(() => {});
    notifyRoles(['fact'], 'recepcion', titulo, cuerpo, enlace).catch(() => {});
  };

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg sm:text-xl font-medium">{recepcion.no_recepcion}</h1>
        {canEdit && (
          <Button
            variant="ghost" size="sm"
            className="text-[var(--c-bad)] hover:text-[var(--c-bad)] hover:bg-[var(--c-bad)]/10"
            onClick={async () => {
              if (await confirmDialog('Se eliminará permanentemente con todos sus ítems.', { title: '¿Eliminar esta recepción?', destructive: true })) onDelete()
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Proveedor editable */}
      <div className="flex items-center gap-2 text-sm">
        {editingProveedor ? (
          <>
            <Input
              value={proveedorDraft}
              onChange={(e) => setProveedorDraft(e.target.value)}
              className="h-7 text-xs flex-1"
              style={{ borderRadius: 'var(--r-ctl)' }}
              autoFocus
            />
            <Button size="sm" className="h-7 px-2 text-xs" onClick={() => {
              if (proveedorDraft.trim()) onUpdate({ proveedor: proveedorDraft.trim() })
              setEditingProveedor(false)
            }}>✓</Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setProveedorDraft(recepcion.proveedor || ''); setEditingProveedor(false) }}>✕</Button>
          </>
        ) : (
          <>
            <span className="text-muted-foreground flex-1">{recepcion.proveedor || '—'}</span>
            {canEdit && (
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-50 hover:opacity-100" onClick={() => setEditingProveedor(true)}>
                <Pencil className="w-3 h-3" />
              </Button>
            )}
          </>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Progreso: {confirmados} / {total || confirmados} items</span>
          <span>{progress.toFixed(0)}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {recepcion.estado === 'en_curso' && (
        <>
          <ProductSearch onSelect={addItem} placeholder="Agregar un producto que no venía en el pedido..." />
          {newItem && (
            <LineaRecibir
              linea={newItem}
              producto={porCodigo.get(String(newItem.producto_codigo))}
              nuevo={esNuevo(newItem.producto_codigo)}
              onConfirmar={confirmItem}
              onCancelar={() => setNewItem(null)}
            />
          )}
        </>
      )}

      {/* Las líneas por contar primero: es lo que queda por hacer. */}
      <div className="space-y-2">
        {detalles.map((d, i) => {
          // Contando esta: el formulario ocupa el sitio de la fila.
          const clave = claveDe(d, i);
          if (contando === clave && canEdit) {
            return (
              <LineaRecibir key={clave} linea={d}
                producto={porCodigo.get(String(d.producto_codigo))}
                nuevo={esNuevo(d.producto_codigo)}
                onConfirmar={(datos) => contarLinea(clave, datos)}
                onCancelar={() => setContando(null)} />
            );
          }

          return (
            <div key={clave} className={`p-3 rounded-lg flex flex-wrap items-center justify-between gap-2 ${
              d.contada === false ? 'bg-[var(--c-warn)]/[0.06] border border-[var(--c-warn)]/20' : 'bg-secondary/50'
            }`} style={{ borderRadius: 'var(--r-ctl)' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate">{d.producto_nombre}</p>
                  {esNuevo(d.producto_codigo) && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--c-warn)]/8 text-[var(--c-warn)] shrink-0"
                      style={{ borderRadius: 'var(--r-chip)' }}>Nuevo en TKC</span>
                  )}
                </div>
                {/* Sin contar: no se dice cuántas se pidieron. Con el número
                    delante, contar se vuelve comprobar que cuadra, y lo que
                    queda registrado es el pedido y no la caja. */}
                {d.contada === false ? (
                  <p className="text-xs text-muted-foreground">{d.producto_codigo} · por contar</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Contadas: {d.cant_recibida}
                    {veCantidades ? ` · Pedidas: ${d.cant_esperada}` : ''}
                    {d.gramaje ? ` · ${d.gramaje}` : ''}
                    {d.unidades_por_caja > 0 ? ` · ${d.unidades_por_caja} u/caja` : ''}
                    {d.fecha_vencimiento ? ` · vence ${d.fecha_vencimiento}` : ''}
                    {d.cant_merma_origen > 0 ? ` · merma origen ${d.cant_merma_origen}` : ''}
                  </p>
                )}
                {d.recomienda_devolucion && (
                  <p className="text-xs font-medium text-[var(--c-bad)] mt-0.5">Recomendado: devolver al proveedor</p>
                )}
                {!d.calidad_ok && d.nota_calidad && (
                  <p className="text-xs text-[var(--c-bad)] mt-0.5">Calidad: {d.nota_calidad}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {d.foto_id && <VerFoto id={d.foto_id} />}
                {d.contada !== false && d.diferencia !== 0 && (
                  veCantidades ? (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${d.diferencia > 0 ? 'bg-[var(--c-warn)]/8 text-[var(--c-warn)]' : 'bg-[var(--c-bad)]/8 text-[var(--c-bad)]'}`} style={{ borderRadius: 'var(--r-chip)' }}>
                      {d.diferencia > 0 ? '+' : ''}{d.diferencia}
                    </span>
                  ) : (
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-[var(--c-bad)]/8 text-[var(--c-bad)]" style={{ borderRadius: 'var(--r-chip)' }}>
                      No cuadra
                    </span>
                  )
                )}
                {canEdit && (
                  <Button size="sm" variant={d.contada === false ? 'default' : 'ghost'}
                    className="h-9 px-4 text-xs" onClick={() => setContando(clave)} style={{ borderRadius: 'var(--r-ctl)' }}>
                    {d.contada === false ? 'Contar' : <Pencil className="w-3 h-3" />}
                  </Button>
                )}
                {canEdit && (
                  <button
                    className="text-muted-foreground hover:text-[var(--c-bad)] transition-colors text-xs font-bold leading-none"
                    onClick={() => {
                      const updated = detalles.filter((_, j) => j !== i)
                      onUpdate({
                        detalles: updated,
                        items_confirmados: yaContadas(updated),
                        total_items: updated.length,
                      })
                    }}
                    title="Quitar ítem"
                  >×</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {recepcion.estado === 'en_curso' && detalles.length > 0 && (
        <>
          {sinContar.length > 0 && (
            <p className="text-xs text-[var(--c-warn)]">
              Faltan {sinContar.length} {sinContar.length === 1 ? 'producto por contar' : 'productos por contar'}.
              Un producto sin contar no es lo mismo que uno que llegó a cero: escribe 0 si no vino.
            </p>
          )}
          <Button className="w-full" variant="outline" onClick={cerrarRecepcion}
            disabled={sinContar.length > 0} style={{ borderRadius: 'var(--r-ctl)' }}>
            Cerrar recepción
          </Button>
        </>
      )}

      {/* El reporte solo cuando ya está cerrada: mientras se cuenta diría
          «faltaron 1270», que es justo el número que no debe verse. */}
      {recepcion.estado !== 'en_curso' && <ReporteIncidencia recepcion={recepcion} />}

      {recepcion.estado === 'con_diferencias' && puedeResolver && (
        <ResolverIncidencia
          recepcion={recepcion}
          puedeRecontar={puedeRecontar}
          puedeCerrar={puedeRecontar}
          usuario={user}
          onUpdate={onUpdate}
          onRecontar={mandarARecontar}
        />
      )}
    </div>
    {ConfirmDialogNode}
    </>
  );
}

/**
 * La foto de una línea, que solo se descarga si alguien la mira.
 *
 * Están aparte de la recepción justamente para esto: una recepción de cien
 * líneas lleva cien fotos y traerlas todas para pintar una lista sería
 * descargar varios megas que nadie pidió.
 */
function VerFoto({ id }) {
  const [abierta, setAbierta] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['recepcion-foto', id],
    queryFn: async () => {
      const [f] = await base44.entities.RecepcionFoto.filter({ id }, null, 1);
      return f ?? null;
    },
    enabled: abierta,
    ...SIN_SONDEO,
  });

  return (
    <>
      <button onClick={() => setAbierta(true)} title="Ver la foto de la presentación"
        className="text-muted-foreground hover:text-foreground transition-colors">
        <ImageIcon className="w-4 h-4" />
      </button>
      <Dialog open={abierta} onOpenChange={setAbierta}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="text-sm">Foto de la presentación</DialogTitle></DialogHeader>
          {isLoading ? (
            <p className="text-sm text-muted-foreground p-8 text-center">Cargando…</p>
          ) : data?.datos ? (
            <img src={data.datos} alt="Presentación del producto" className="w-full rounded"
              style={{ borderRadius: 'var(--r-ctl)' }} />
          ) : (
            <p className="text-sm text-muted-foreground p-8 text-center">La foto ya no está.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Una celda del listado de recepciones, la misma para tabla y ficha. */
function celdaRecepcion(r, clave, enTabla) {
  // `py-1.5`: la fila baja de 44 px a 32. En una pantalla de portátil eso
  // son seis filas más sin desplazar, que es de lo que va un listado de
  // trabajo. La ficha del teléfono no cambia: ahí el dedo manda.
  const env = (contenido, clases = '') => (enTabla
    ? <td key={clave} className={`px-2.5 py-1.5 ${clases}`}>{contenido}</td>
    : contenido);

  switch (clave) {
    case 'no_recepcion':
      return env(
        <>
          <p className="font-medium leading-snug">{r.no_recepcion}</p>
          <p className="text-xs text-muted-foreground">{r.no_orden ? `Orden ${r.no_orden}` : 'Sin pedido'}</p>
        </>,
      );
    case 'proveedor':
      return env(<span>{r.proveedor}</span>);
    case 'fecha':
      return env(<span className="text-muted-foreground">{r.fecha}</span>);
    case 'items_confirmados':
      return env(
        <span className="tabular-nums">{r.items_confirmados || 0}/{r.total_items || 0}</span>,
        'text-center',
      );
    case 'estado':
      return env(<StatusBadge status={r.estado} vocabulario="recepcion" />, 'text-center');
    case 'almacen_num':
      return env(<span className="text-muted-foreground">{r.almacen_num || 'sin almacén'}</span>);
    default:
      return env(null);
  }
}
