import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StatusBadge from '@/components/shared/StatusBadge';
import ProductSearch from '@/components/shared/ProductSearch';
import AlertBanner from '@/components/shared/AlertBanner';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Search, Check, X, PackageOpen, Trash2, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { useConfirm } from '@/lib/useConfirm';
import SortTh from '@/components/shared/SortTh';
import { useSortable } from '@/lib/useSortable';
import ColPicker, { loadColsWithOrder, saveColsWithOrder } from '@/components/shared/ColPicker';
import { notifyJefeDepto } from '@/lib/notificationService';
import { fetchPedidos, fetchLineasDePedido } from '@/services/pedidosService';
import { SIN_SONDEO } from '@/lib/query-client';

const RECEP_COL_DEFS = [
  { key: 'no_recepcion',      label: 'No. Recepción', defaultOn: true, required: true  },
  { key: 'proveedor',         label: 'Proveedor',     defaultOn: true, required: false },
  { key: 'fecha',             label: 'Fecha',         defaultOn: true, required: false },
  { key: 'items_confirmados', label: 'Items',         defaultOn: true, required: false },
  { key: 'estado',            label: 'Estado',        defaultOn: true, required: false },
]
const RECEP_COLS_KEY = 'recep_cols'

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
 * La recepción que nace de un pedido de compra.
 *
 * Las líneas entran ya puestas, con lo que pidió comercial como esperado y lo
 * recibido en blanco: lo que hay que hacer al descargar es contar, no
 * transcribir. `contada: false` las distingue de una línea que llegó a cero.
 */
function recepcionDePedido({ pedido, lineas, no, user }) {
  const detalles = lineas.map((l) => ({
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
}

export default function Recepciones() {
  const [cols, setCols] = useState(() => loadColsWithOrder(RECEP_COLS_KEY, RECEP_COL_DEFS).visible);
  const [colOrder, setColOrder] = useState(() => loadColsWithOrder(RECEP_COLS_KEY, RECEP_COL_DEFS).order);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  // Se abre en los pedidos y no en las recepciones: descargar un camión
  // empieza por buscar de qué pedido viene, y mientras no se recibe nada la
  // otra pestaña está vacía por definición.
  const [vista, setVista] = useState('pedidos');
  const [creando, setCreando] = useState(null);
  const { sort, onSort } = useSortable('fecha', 'desc');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const role = user?.role || 'inv';

  const { data: recepcionesRaw, isLoading } = useQuery({
    queryKey: ['recepciones'],
    queryFn: () => base44.entities.Recepcion.list('-created_date', 100),
    select: (d) => Array.isArray(d) ? d : [],
  });
  const recepciones = recepcionesRaw ?? [];

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Recepcion.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['recepciones'] }); setShowCreate(false); },
    onError: (error) => alert(error.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Recepcion.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recepciones'] }),
    onError: (error) => alert(error.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Recepcion.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['recepciones'] }); setSelectedId(null); },
    onError: (error) => alert(error.message),
  });

  const selected = recepciones.find(r => r.id === selectedId);

  const filtered = recepciones.filter(r => {
    if (searchQ && !r.proveedor?.toLowerCase().includes(searchQ.toLowerCase()) && !r.no_recepcion?.toLowerCase().includes(searchQ.toLowerCase())) return false;
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

  const genNoRecepcion = () => {
    const y = new Date().getFullYear();
    const n = recepciones.filter(r => r.no_recepcion?.startsWith(`REC-${y}`)).length + 1;
    return `REC-${y}-${String(n).padStart(4, '0')}`;
  };

  const estadoMap = { en_curso: 'en_curso', cerrada: 'completado', con_diferencias: 'devuelto' };

  const puedeRecibir = ['inv', 'administrador', 'superadmin'].includes(role);

  /**
   * Empezar a recibir un pedido.
   *
   * Si ya tiene recepción se abre esa en vez de crear otra: dos recepciones
   * del mismo pedido son dos conteos que luego nadie sabe cuál vale.
   */
  const recibirPedido = async (pedido) => {
    const ya = recepciones.find((r) => r.pedido_id === pedido.id);
    if (ya) { setVista('recepciones'); setSelectedId(ya.id); return; }

    setCreando(pedido.id);
    try {
      const lineas = await fetchLineasDePedido(pedido.id);
      const creada = await createMut.mutateAsync(
        recepcionDePedido({ pedido, lineas, no: genNoRecepcion(), user }),
      );
      setVista('recepciones');
      if (creada?.id) setSelectedId(creada.id);
    } catch {
      // El aviso lo da `createMut.onError`; aquí solo se suelta el botón.
    } finally {
      setCreando(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium">Recepciones</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Recepción de mercancía</p>
        </div>
        <div className="flex items-center gap-2">
          {vista === 'recepciones' && (
            <ColPicker cols={RECEP_COL_DEFS} visible={cols}
              onChange={(next) => { setCols(next); saveColsWithOrder(RECEP_COLS_KEY, next, colOrder); }}
              storageKey={RECEP_COLS_KEY} order={colOrder}
              onOrderChange={(next) => { setColOrder(next); saveColsWithOrder(RECEP_COLS_KEY, cols, next); }} />
          )}
          {puedeRecibir && (
            <Button variant="outline" onClick={() => setShowCreate(true)} style={{ borderRadius: '8px' }}>
              <Plus className="w-4 h-4 mr-1.5" /> Recepción sin pedido
            </Button>
          )}
        </div>
      </div>

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
        />
      ) : (
      <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Buscar por proveedor o número..." className="pl-10" style={{ borderRadius: '8px' }} />
      </div>

      <div>
        <Card className="overflow-hidden" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  {colOrder.filter(k => cols[k]).map(k => (
                    <SortTh key={k} colKey={k} label={COL_TITULO[k].label}
                      align={COL_TITULO[k].align} sort={sort} onSort={onSort} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={colOrder.filter(k => cols[k]).length || 5} className="p-8 text-center text-muted-foreground">Cargando...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={colOrder.filter(k => cols[k]).length || 5} className="p-8 text-center text-muted-foreground">Sin registros</td></tr>
                ) : sorted.map(r => (
                  <tr key={r.id}
                    className={`border-b hover:bg-accent/50 cursor-pointer transition-colors ${selectedId === r.id ? 'bg-accent' : ''}`}
                    onClick={() => { setSelectedId(r.id); setShowCreate(false); }}>
                    {colOrder.filter(k => cols[k]).map(k => {
                      const CELDAS = {
                        no_recepcion: <td key={k} className="p-3 font-medium">{r.no_recepcion}</td>,
                        proveedor: <td key={k} className="p-3">{r.proveedor}</td>,
                        fecha: <td key={k} className="p-3 text-muted-foreground">{r.fecha}</td>,
                        items_confirmados: <td key={k} className="p-3 text-center">{r.items_confirmados || 0}/{r.total_items || 0}</td>,
                        estado: <td key={k} className="p-3 text-center"><StatusBadge status={estadoMap[r.estado] || 'en_curso'} /></td>,
                      };
                      return CELDAS[k] ?? <td key={k} className="p-3" />;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      </>
      )}

      <Dialog open={!!selectedId} onOpenChange={(o) => { if (!o) setSelectedId(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
          {selected && (
            <RecepcionDetail
              recepcion={selected}
              role={role}
              user={user}
              onUpdate={(data) => updateMut.mutate({ id: selected.id, data })}
              onDelete={() => deleteMut.mutate(selected.id)}
            />
          )}
        </DialogContent>
      </Dialog>
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
function PedidosPorRecibir({ puedeRecibir, recepciones, creando, onRecibir }) {
  const [filtro, setFiltro] = useState('en_camino');
  const [busca, setBusca] = useState('');

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
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por proveedor, número u oferta..." className="pl-10" style={{ borderRadius: '8px' }} />
        </div>
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-[220px]" style={{ borderRadius: '8px' }}><SelectValue /></SelectTrigger>
          <SelectContent>
            {FILTRO_PEDIDO.map((f) => (
              <SelectItem key={f.valor} value={f.valor}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center text-muted-foreground" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
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
            style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
            <div className="flex-1 min-w-[220px] space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{p.numero}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground"
                  style={{ borderRadius: '4px' }}>{p.estado.replace(/_/g, ' ')}</span>
                {ya && (
                  <span className="text-xs px-2 py-0.5 rounded bg-[#3E9B4F14] text-[#3E9B4F]"
                    style={{ borderRadius: '4px' }}>Recepción {ya.no_recepcion}</span>
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
                disabled={creando === p.id} style={{ borderRadius: '8px' }}>
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
function CreateRecepcionForm({ genNo, user, onSubmit, onCancel }) {
  const [proveedor, setProveedor] = useState('');
  const [noOrden, setNoOrden] = useState('');

  const crear = () => onSubmit({
    no_recepcion: genNo(),
    fecha: format(new Date(), 'yyyy-MM-dd'),
    especialista_id: user?.email,
    especialista_nombre: user?.full_name,
    estado: 'en_curso',
    diferencias: [],
    proveedor,
    no_orden: noOrden,
    detalles: [],
  });

  return (
    <div className="space-y-4">
      <AlertBanner variant="info"
        message="Si la mercancía viene de un pedido, recíbela desde la pestaña «Pedidos de compra»: las cantidades esperadas vienen puestas." />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Proveedor *" style={{ borderRadius: '8px' }} />
        <Input value={noOrden} onChange={(e) => setNoOrden(e.target.value)} placeholder="No. orden (opcional)" style={{ borderRadius: '8px' }} />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} style={{ borderRadius: '8px' }}>Cancelar</Button>
        <Button onClick={crear} disabled={!proveedor.trim()} style={{ borderRadius: '8px' }}>
          <PackageOpen className="w-4 h-4 mr-1.5" /> Crear recepción
        </Button>
      </div>
    </div>
  );
}

function RecepcionDetail({ recepcion, role, user, onUpdate, onDelete }) {
  const [newItem, setNewItem] = useState(null);
  const [editingProveedor, setEditingProveedor] = useState(false);
  const [proveedorDraft, setProveedorDraft] = useState(recepcion.proveedor || '');
  const { confirmDialog, ConfirmDialogNode } = useConfirm();
  const detalles = recepcion.detalles || [];
  const canEdit = (role === 'inv' || role === 'administrador') && recepcion.estado === 'en_curso';
  const confirmados = detalles.length;
  const total = recepcion.total_items || detalles.length;
  const progress = total > 0 ? (confirmados / total) * 100 : 0;

  const addItem = (producto) => {
    setNewItem({ producto_id: producto.id, producto_nombre: producto.nombre, producto_codigo: producto.codigo_producto, cant_esperada: '', cant_recibida: '', cant_merma_origen: '', no_lote: '', fecha_vencimiento: '', temperatura: 'ambient', calidad_ok: true, nota_calidad: '' });
  };

  const pctMermaOrigen = newItem && Number(newItem.cant_recibida) > 0
    ? (Number(newItem.cant_merma_origen) || 0) / Number(newItem.cant_recibida)
    : 0;
  const recomiendaDevolucion = pctMermaOrigen > 0.15;

  const confirmItem = () => {
    if (!newItem) return;
    const cantRecibida = Number(newItem.cant_recibida) || 0;
    const cantMermaOrigen = Number(newItem.cant_merma_origen) || 0;
    const item = {
      ...newItem,
      cant_esperada: Number(newItem.cant_esperada) || 0,
      cant_recibida: cantRecibida,
      cant_merma_origen: cantMermaOrigen,
      recomienda_devolucion: cantRecibida > 0 && (cantMermaOrigen / cantRecibida) > 0.15,
      diferencia: cantRecibida - (Number(newItem.cant_esperada) || 0),
    };
    const updated = [...detalles, item];
    onUpdate({ detalles: updated, items_confirmados: updated.length, total_items: updated.length });
    setNewItem(null);
  };

  const sinContar = detalles.filter((d) => d.contada === false);

  const cerrarRecepcion = async () => {
    const difs = detalles.filter(d => d.diferencia !== 0);

    // La incidencia no bloquea: con el camión en la puerta, impedir cerrar
    // hasta que alguien resuelva una diferencia es como se consiguen números
    // inventados. Se registra, se avisa al jefe y la recepción sigue su
    // curso marcada «con diferencias».
    const aviso = difs.length > 0
      ? `Hay ${difs.length} ${difs.length === 1 ? 'producto' : 'productos'} donde lo contado no cuadra con lo pedido. `
        + 'Se registrará la incidencia y se avisará al jefe de departamento.'
      : 'Se registrarán las diferencias y no podrá modificarse.';
    if (!await confirmDialog(aviso, { title: '¿Cerrar esta recepción?' })) return;

    const estado = difs.length > 0 ? 'con_diferencias' : 'cerrada';
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

    if (difs.length > 0) {
      const detalle = difs
        .slice(0, 5)
        .map((d) => `${d.producto_nombre}: se pidieron ${d.cant_esperada} y llegaron ${d.cant_recibida}`)
        .join('; ');
      notifyJefeDepto(
        'inventario', 'recepciones',
        `Recepción ${recepcion.no_recepcion} con diferencias`,
        `${recepcion.proveedor || 'Proveedor sin nombre'} — ${difs.length} ${difs.length === 1 ? 'producto no cuadra' : 'productos no cuadran'}. ${detalle}`
        + (difs.length > 5 ? ` …y ${difs.length - 5} más.` : ''),
      ).catch(() => {});
    }
  };

  return (
    <>
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between pr-6">
        <DialogTitle className="text-sm font-medium">{recepcion.no_recepcion}</DialogTitle>
        {canEdit && (
          <Button
            variant="ghost" size="sm"
            className="text-[#E24B4A] hover:text-[#E24B4A] hover:bg-[#E24B4A]/10"
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
              style={{ borderRadius: '6px' }}
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
          <ProductSearch onSelect={addItem} placeholder="Agregar producto..." />
          {newItem && (
            <div className="space-y-3 p-4 border rounded-lg" style={{ borderRadius: '8px', borderWidth: '0.5px' }}>
              <p className="text-sm font-medium">{newItem.producto_nombre}</p>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" placeholder="Cant. esperada" value={newItem.cant_esperada}
                  onChange={(e) => setNewItem({ ...newItem, cant_esperada: e.target.value })} style={{ borderRadius: '8px' }} />
                <Input type="number" placeholder="Cant. recibida *" value={newItem.cant_recibida}
                  onChange={(e) => setNewItem({ ...newItem, cant_recibida: e.target.value })} style={{ borderRadius: '8px' }} />
                <Input placeholder="No. lote" value={newItem.no_lote}
                  onChange={(e) => setNewItem({ ...newItem, no_lote: e.target.value })} style={{ borderRadius: '8px' }} />
                <Input type="date" value={newItem.fecha_vencimiento}
                  onChange={(e) => setNewItem({ ...newItem, fecha_vencimiento: e.target.value })} style={{ borderRadius: '8px' }} />
                <Input type="number" placeholder="Unidades merma de origen" value={newItem.cant_merma_origen}
                  onChange={(e) => setNewItem({ ...newItem, cant_merma_origen: e.target.value })} className="col-span-2" style={{ borderRadius: '8px' }} />
              </div>
              {recomiendaDevolucion && (
                <AlertBanner variant="danger" message={`La merma de origen (${(pctMermaOrigen * 100).toFixed(0)}%) supera el 15% de lo recibido. Se recomienda devolver este ítem al proveedor.`} />
              )}
              <div className="flex gap-2">
                <Button size="sm" variant={newItem.calidad_ok ? 'default' : 'outline'}
                  onClick={() => setNewItem({ ...newItem, calidad_ok: true })} style={{ borderRadius: '8px' }}>
                  <Check className="w-3.5 h-3.5 mr-1" /> Calidad OK
                </Button>
                <Button size="sm" variant={!newItem.calidad_ok ? 'destructive' : 'outline'}
                  onClick={() => setNewItem({ ...newItem, calidad_ok: false })} style={{ borderRadius: '8px' }}>
                  <X className="w-3.5 h-3.5 mr-1" /> Deficiente
                </Button>
              </div>
              {!newItem.calidad_ok && (
                <Textarea placeholder="Nota de calidad..." value={newItem.nota_calidad}
                  onChange={(e) => setNewItem({ ...newItem, nota_calidad: e.target.value })} style={{ borderRadius: '8px' }} />
              )}
              <Button size="sm" className="w-full" onClick={confirmItem} disabled={!newItem.cant_recibida} style={{ borderRadius: '8px' }}>
                Confirmar ítem
              </Button>
            </div>
          )}
        </>
      )}

      {/* Items list */}
      <div className="space-y-2">
        {detalles.map((d, i) => (
          <div key={i} className={`p-3 rounded-lg flex items-center justify-between gap-2 ${
            d.contada === false ? 'bg-[#BA7517]/[0.06] border border-[#BA7517]/20' : 'bg-secondary/50'
          }`} style={{ borderRadius: '8px' }}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{d.producto_nombre}</p>
              {/* Las líneas que vienen del pedido nacen sin contar: la cantidad
                  recibida se escribe aquí mismo, al lado de lo que se pidió. */}
              {d.contada === false && canEdit ? (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Pedidas: {d.cant_esperada} · Recibidas</span>
                  <Input type="number" min="0" className="w-20 h-7 text-xs text-right"
                    defaultValue=""
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v === '') return;
                      const recibida = Number(v) || 0;
                      const updated = detalles.map((x, j) => j === i
                        ? { ...x, cant_recibida: recibida, diferencia: recibida - (Number(x.cant_esperada) || 0), contada: true }
                        : x);
                      onUpdate({
                        detalles: updated,
                        items_confirmados: updated.filter((x) => x.contada !== false).length,
                      });
                    }}
                    style={{ borderRadius: '6px' }} />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Esp: {d.cant_esperada} · Rec: {d.cant_recibida}{d.no_lote ? ` · Lote: ${d.no_lote}` : ''}{d.cant_merma_origen > 0 ? ` · Merma origen: ${d.cant_merma_origen}` : ''}</p>
              )}
              {d.recomienda_devolucion && (
                <p className="text-xs font-medium text-[#E24B4A] mt-0.5">Recomendado: devolver al proveedor</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {d.diferencia !== 0 && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${d.diferencia > 0 ? 'bg-[#BA751714] text-[#BA7517]' : 'bg-[#E24B4A14] text-[#E24B4A]'}`} style={{ borderRadius: '4px' }}>
                  {d.diferencia > 0 ? '+' : ''}{d.diferencia}
                </span>
              )}
              {canEdit && (
                <button
                  className="text-muted-foreground hover:text-[#E24B4A] transition-colors text-xs font-bold leading-none"
                  onClick={() => {
                    const updated = detalles.filter((_, j) => j !== i)
                    onUpdate({ detalles: updated, items_confirmados: updated.length, total_items: updated.length })
                  }}
                  title="Quitar ítem"
                >×</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {recepcion.estado === 'en_curso' && detalles.length > 0 && (
        <>
          {sinContar.length > 0 && (
            <p className="text-xs text-[#BA7517]">
              Faltan {sinContar.length} {sinContar.length === 1 ? 'producto por contar' : 'productos por contar'}.
              Un producto sin contar no es lo mismo que uno que llegó a cero: escribe 0 si no vino.
            </p>
          )}
          <Button className="w-full" variant="outline" onClick={cerrarRecepcion}
            disabled={sinContar.length > 0} style={{ borderRadius: '8px' }}>
            Cerrar recepción
          </Button>
        </>
      )}

      {/* Diferencias for supervisor */}
      {recepcion.estado === 'con_diferencias' && (role === 'supervisor' || role === 'administrador') && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Resolver diferencias</p>
          {(recepcion.diferencias || []).map((dif, i) => (
            <div key={i} className="p-3 border rounded-lg space-y-2" style={{ borderRadius: '8px', borderWidth: '0.5px' }}>
              <p className="text-sm font-medium">{dif.producto_nombre}</p>
              <p className="text-xs text-muted-foreground">Diferencia: {dif.cantidad_diferencia}</p>
              <Select value={dif.tipo_diferencia} onValueChange={(val) => {
                const diffs = [...(recepcion.diferencias || [])];
                diffs[i] = { ...diffs[i], tipo_diferencia: val, resuelto_por: user?.email, fecha_resolucion: format(new Date(), 'yyyy-MM-dd') };
                onUpdate({ diferencias: diffs });
              }}>
                <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="aceptada">Aceptada</SelectItem>
                  <SelectItem value="reclamada_proveedor">Reclamada al proveedor</SelectItem>
                  <SelectItem value="rechazo_parcial">Rechazo parcial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}
    </div>
    {ConfirmDialogNode}
    </>
  );
}