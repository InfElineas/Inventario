import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

export default function Recepciones() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const { sort, onSort } = useSortable('fecha', 'desc');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const role = user?.role || 'inv';

  const { data: recepciones = [], isLoading } = useQuery({
    queryKey: ['recepciones'],
    queryFn: () => base44.entities.Recepcion.list('-created_date', 100),
    select: (d) => Array.isArray(d) ? d : [],
  });

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium">Recepciones</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Recepción de mercancía</p>
        </div>
        {['inv', 'administrador', 'superadmin'].includes(role) && (
          <Button onClick={() => setShowCreate(true)} style={{ borderRadius: '8px' }}>
            <Plus className="w-4 h-4 mr-1.5" /> Nueva recepción
          </Button>
        )}
      </div>

      {/* Create form */}
      <Dialog open={showCreate} onOpenChange={(o) => { if (!o) setShowCreate(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva recepción</DialogTitle>
          </DialogHeader>
          <CreateRecepcionForm
            genNo={genNoRecepcion}
            user={user}
            onSubmit={(d) => createMut.mutate(d)}
            onCancel={() => setShowCreate(false)}
          />
        </DialogContent>
      </Dialog>

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
                  <SortTh colKey="no_recepcion" label="No. Recepción" sort={sort} onSort={onSort} />
                  <SortTh colKey="proveedor" label="Proveedor" sort={sort} onSort={onSort} />
                  <SortTh colKey="fecha" label="Fecha" sort={sort} onSort={onSort} />
                  <SortTh colKey="items_confirmados" label="Items" sort={sort} onSort={onSort} align="center" />
                  <SortTh colKey="estado" label="Estado" sort={sort} onSort={onSort} align="center" />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Cargando...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Sin registros</td></tr>
                ) : sorted.map(r => (
                  <tr key={r.id}
                    className={`border-b hover:bg-accent/50 cursor-pointer transition-colors ${selectedId === r.id ? 'bg-accent' : ''}`}
                    onClick={() => { setSelectedId(r.id); setShowCreate(false); }}>
                    <td className="p-3 font-medium">{r.no_recepcion}</td>
                    <td className="p-3">{r.proveedor}</td>
                    <td className="p-3 text-muted-foreground">{r.fecha}</td>
                    <td className="p-3 text-center">{r.items_confirmados || 0}/{r.total_items || 0}</td>
                    <td className="p-3 text-center"><StatusBadge status={estadoMap[r.estado] || 'en_curso'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

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

function CreateRecepcionForm({ genNo, user, onSubmit, onCancel }) {
  const [proveedor, setProveedor] = useState('');
  const [noOrden, setNoOrden] = useState('');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Proveedor *" style={{ borderRadius: '8px' }} />
        <Input value={noOrden} onChange={(e) => setNoOrden(e.target.value)} placeholder="No. orden (opcional)" style={{ borderRadius: '8px' }} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} style={{ borderRadius: '8px' }}>Cancelar</Button>
        <Button onClick={() => onSubmit({
          no_recepcion: genNo(),
          proveedor,
          no_orden: noOrden,
          fecha: format(new Date(), 'yyyy-MM-dd'),
          especialista_id: user?.email,
          especialista_nombre: user?.full_name,
          estado: 'en_curso',
          detalles: [],
          diferencias: [],
        })} disabled={!proveedor} style={{ borderRadius: '8px' }}>
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

  const cerrarRecepcion = async () => {
    if (!await confirmDialog('Se registrarán las diferencias y no podrá modificarse.', { title: '¿Cerrar esta recepción?' })) return;
    const difs = detalles.filter(d => d.diferencia !== 0);
    const estado = difs.length > 0 ? 'con_diferencias' : 'cerrada';
    const diferencias = difs.map(d => ({
      producto_id: d.producto_id,
      producto_nombre: d.producto_nombre,
      cantidad_diferencia: d.diferencia,
      tipo_diferencia: 'pendiente',
    }));
    onUpdate({ estado, diferencias });
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
          <div key={i} className="p-3 bg-secondary/50 rounded-lg flex items-center justify-between gap-2" style={{ borderRadius: '8px' }}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{d.producto_nombre}</p>
              <p className="text-xs text-muted-foreground">Esp: {d.cant_esperada} · Rec: {d.cant_recibida}{d.no_lote ? ` · Lote: ${d.no_lote}` : ''}{d.cant_merma_origen > 0 ? ` · Merma origen: ${d.cant_merma_origen}` : ''}</p>
              {d.recomienda_devolucion && (
                <p className="text-xs font-medium text-[#E24B4A] mt-0.5">Recomendado: devolver al proveedor</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
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
        <Button className="w-full" variant="outline" onClick={cerrarRecepcion} style={{ borderRadius: '8px' }}>
          Cerrar recepción
        </Button>
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