import { useState } from 'react';
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
import BajarMermasDialog from '@/components/mermas/BajarMermasDialog';
import { ROLES_TIENDA } from '@/lib/ajustes';
import { notifyJefeDepto } from '@/lib/notificationService';
import { logTransicion, notificarTransicion } from '@/lib/workflowService';
import SortTh from '@/components/shared/SortTh';
import { useSortable } from '@/lib/useSortable';

export default function Mermas() {
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [filterEstado, setFilterEstado] = useState('all');
  const [searchQ, setSearchQ] = useState('');
  const queryClient = useQueryClient();
  const { sort, onSort } = useSortable('fecha_inv', 'desc');

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const role = user?.role || 'inv';
  // Una merma sigue contada en el piso de tienda hasta que se baja. Quien
  // puede mover mercancía puede hacerlo desde aquí.
  const puedeBajar = ROLES_TIENDA.includes(role);
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [bajando, setBajando] = useState(null);   // { mermas, almacen }

  const { data: mermasRaw, isLoading } = useQuery({
    queryKey: ['mermas'],
    queryFn: () => base44.entities.Merma.list('-created_date', 200),
    select: (d) => Array.isArray(d) ? d : [],
    refetchInterval: 30_000,
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
    mutationFn: (id) => base44.entities.Merma.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['mermas'] }); setSelectedId(null); },
    onError: (error) => alert(error.message),
  });

  const selected = mermas.find(m => m.id === selectedId);

  const filtered = mermas.filter(m => {
    if (filterEstado !== 'all' && m.estado_tarea !== filterEstado) return false;
    if (searchQ && !m.producto_nombre?.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const av = a[sort.key] ?? '';
    const bv = b[sort.key] ?? '';
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });

  const totalPerdida = filtered.reduce((s, m) => s + (m.total_perdida || 0), 0);

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
          <p className="text-sm text-muted-foreground mt-0.5">Registro y seguimiento de mermas</p>
        </div>
        {['inv', 'administrador', 'superadmin'].includes(role) && (
          <Button onClick={() => { setShowForm(true); setSelectedId(null); }} style={{ borderRadius: '8px' }}>
            <Plus className="w-4 h-4 mr-1.5" /> Registrar merma
          </Button>
        )}
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
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-48" style={{ borderRadius: '8px' }}><SelectValue /></SelectTrigger>
          <SelectContent>
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
                  <SortTh colKey="producto_nombre" label="Producto" sort={sort} onSort={onSort} className="text-left p-3 text-xs font-medium text-muted-foreground" />
                  <SortTh colKey="cantidad" label="Cant." sort={sort} onSort={onSort} className="text-right p-3 text-xs font-medium text-muted-foreground" align="right" />
                  <SortTh colKey="clasif_merma" label="Clasificación" sort={sort} onSort={onSort} className="text-left p-3 text-xs font-medium text-muted-foreground" />
                  <SortTh colKey="total_perdida" label="Pérdida" sort={sort} onSort={onSort} className="text-right p-3 text-xs font-medium text-muted-foreground" align="right" />
                  <SortTh colKey="estado_tarea" label="Estado" sort={sort} onSort={onSort} className="text-center p-3 text-xs font-medium text-muted-foreground" align="center" />
                  <SortTh colKey="rebaja_confirmada" label="Tienda" sort={sort} onSort={onSort} className="text-center p-3 text-xs font-medium text-muted-foreground" align="center" />
                  <SortTh colKey="fecha_inv" label="Fecha" sort={sort} onSort={onSort} className="text-left p-3 text-xs font-medium text-muted-foreground" />
                  {puedeBajar && <th className="p-3 w-10" />}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={puedeBajar ? 9 : 7} className="p-8 text-center text-muted-foreground">Cargando...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={puedeBajar ? 9 : 7} className="p-8 text-center text-muted-foreground">Sin registros</td></tr>
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
                    <td className="p-3">
                      <p className="font-medium">{m.producto_nombre}</p>
                      <p className="text-xs text-muted-foreground">{m.producto_codigo}</p>
                    </td>
                    <td className="p-3 text-right font-medium">{m.cantidad}</td>
                    <td className="p-3 text-xs">{m.clasif_merma}</td>
                    <td className="p-3 text-right font-medium text-[#E24B4A]">${m.total_perdida?.toFixed(2) || '0.00'}</td>
                    <td className="p-3 text-center"><StatusBadge status={m.estado_tarea} /></td>
                    <td className="p-3 text-center">
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
                    <td className="p-3 text-muted-foreground">{m.fecha_inv}</td>
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
                  <td colSpan={puedeBajar ? 4 : 3} className="p-3 text-xs font-medium text-muted-foreground">Total acumulado</td>
                  <td className="p-3 text-right font-medium text-[#E24B4A]">${totalPerdida.toFixed(2)}</td>
                  <td colSpan={puedeBajar ? 4 : 3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

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