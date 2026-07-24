import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import KPICard from '@/components/shared/KPICard';
import LotBadge from '@/components/shared/LotBadge';
import SortTh from '@/components/shared/SortTh';
import { useSortable } from '@/lib/useSortable';
import ReadOnlyBlock, { ReadOnlyField } from '@/components/shared/ReadOnlyBlock';
import { Search, AlertTriangle, Clock, CheckCircle, HelpCircle, Send } from 'lucide-react';
import { format } from 'date-fns';

export default function Lotes() {
  const [filterEstado, setFilterEstado] = useState('all');
  const [filterTemp, setFilterTemp] = useState('all');
  const [searchQ, setSearchQ] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [icForm, setIcForm] = useState({ cant_x_vencer: '', clasif_inv: '', nota_inv: '', propuesta_precio_ic: '', precio_restaurar: '', notas_ic: '' });
  const { sort, onSort } = useSortable('fecha_vencimiento', 'asc');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const role = user?.role || 'inv';

  const { data: lotes = [], isLoading } = useQuery({
    queryKey: ['lotes'],
    queryFn: () => base44.entities.Lote.list('-updated_date', 300),
    select: (d) => Array.isArray(d) ? d : [],
  });

  const createIcMut = useMutation({
    mutationFn: (data) => base44.entities.LoteIC.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lotes'] }); setSelectedId(null); },
  });

  const counts = {
    vencido: lotes.filter(l => l.estado_fv === 'vencido').length,
    critico: lotes.filter(l => l.estado_fv === 'critico').length,
    por_vencer: lotes.filter(l => l.estado_fv === 'por_vencer').length,
    vigente: lotes.filter(l => l.estado_fv === 'vigente').length,
    sin_fecha: lotes.filter(l => l.estado_fv === 'sin_fecha').length,
  };

  const filtered = lotes.filter(l => {
    if (filterEstado !== 'all' && l.estado_fv !== filterEstado) return false;
    if (filterTemp !== 'all' && l.temperatura !== filterTemp) return false;
    if (searchQ && !l.producto_nombre?.toLowerCase().includes(searchQ.toLowerCase()) && !l.no_lote?.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const av = a[sort.key] ?? '';
    const bv = b[sort.key] ?? '';
    return av < bv ? -dir : av > bv ? dir : 0;
  });

  const selected = lotes.find(l => l.id === selectedId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">Vencimientos LOT</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Control de fechas de vencimiento por lote</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KPICard title="Vencidos" value={counts.vencido} icon={AlertTriangle} color="text-[#E24B4A]" bgColor="bg-[#E24B4A]/10" />
        <KPICard title="Críticos" value={counts.critico} icon={AlertTriangle} color="text-[#E24B4A]" bgColor="bg-[#E24B4A]/5" />
        <KPICard title="Por vencer" value={counts.por_vencer} icon={Clock} color="text-[#BA7517]" bgColor="bg-[#BA7517]/10" />
        <KPICard title="Vigentes" value={counts.vigente} icon={CheckCircle} color="text-[#1D9E75]" bgColor="bg-[#1D9E75]/10" />
        <KPICard title="Sin fecha" value={counts.sin_fecha} icon={HelpCircle} color="text-[#888780]" bgColor="bg-[#888780]/10" />
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Buscar por producto o lote..." className="pl-10" style={{ borderRadius: '8px' }} />
        </div>
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-40" style={{ borderRadius: '8px' }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="vencido">Vencido</SelectItem>
            <SelectItem value="critico">Crítico</SelectItem>
            <SelectItem value="por_vencer">Por vencer</SelectItem>
            <SelectItem value="vigente">Vigente</SelectItem>
            <SelectItem value="sin_fecha">Sin fecha</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterTemp} onValueChange={setFilterTemp}>
          <SelectTrigger className="w-36" style={{ borderRadius: '8px' }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas temp.</SelectItem>
            <SelectItem value="ambient">Ambient</SelectItem>
            <SelectItem value="chilled">Chilled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Card className="overflow-hidden" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <SortTh colKey="producto_nombre" label="Producto" sort={sort} onSort={onSort} />
                  <SortTh colKey="no_lote" label="Lote" sort={sort} onSort={onSort} />
                  <SortTh colKey="temperatura" label="Temp." sort={sort} onSort={onSort} align="center" />
                  <SortTh colKey="fecha_vencimiento" label="FV" sort={sort} onSort={onSort} />
                  <SortTh colKey="cantidad" label="Cant." sort={sort} onSort={onSort} align="right" />
                  <SortTh colKey="estado_fv" label="Estado" sort={sort} onSort={onSort} align="center" />
                  <th className="text-center p-3 text-xs font-medium text-muted-foreground">Acción</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Cargando...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Sin registros</td></tr>
                ) : sorted.map(l => (
                  <tr key={l.id} className={`border-b hover:bg-accent/50 cursor-pointer transition-colors ${selectedId === l.id ? 'bg-accent' : ''}`}
                    onClick={() => setSelectedId(l.id)}>
                    <td className="p-3">
                      <p className="font-medium">{l.producto_nombre}</p>
                      <p className="text-xs text-muted-foreground">{l.producto_codigo}</p>
                    </td>
                    <td className="p-3 text-xs">{l.no_lote || '—'}</td>
                    <td className="p-3 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded ${l.temperatura === 'chilled' ? 'bg-[#378ADD]/10 text-[#378ADD]' : 'bg-secondary text-muted-foreground'}`} style={{ borderRadius: '4px' }}>
                        {l.temperatura === 'chilled' ? '❄ Frío' : '☀ Amb'}
                      </span>
                    </td>
                    <td className="p-3 text-xs">{l.fecha_vencimiento || '—'}</td>
                    <td className="p-3 text-right font-medium">{l.cantidad}</td>
                    <td className="p-3 text-center"><LotBadge estado={l.estado_fv} dias={l.vigencia_dias} /></td>
                    <td className="p-3 text-center">
                      {['critico', 'por_vencer'].includes(l.estado_fv) && (role === 'inv' || role === 'administrador') && (
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSelectedId(l.id); }}
                          style={{ borderRadius: '8px' }} className="text-xs">
                          IC
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

      </div>

      {/* IC Panel */}
      <Dialog
        open={!!(selected && ['critico', 'por_vencer'].includes(selected.estado_fv))}
        onOpenChange={(o) => { if (!o) setSelectedId(null); }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Intervención Comercial</DialogTitle>
          </DialogHeader>
          {selected && ['critico', 'por_vencer'].includes(selected.estado_fv) && (
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
                onChange={(e) => setIcForm({ ...icForm, cant_x_vencer: e.target.value })} style={{ borderRadius: '8px' }} />
              <Input placeholder="Clasificación INV" value={icForm.clasif_inv}
                onChange={(e) => setIcForm({ ...icForm, clasif_inv: e.target.value })} style={{ borderRadius: '8px' }} />
              <Textarea placeholder="Nota INV" value={icForm.nota_inv}
                onChange={(e) => setIcForm({ ...icForm, nota_inv: e.target.value })} style={{ borderRadius: '8px' }} />
              <Input type="number" placeholder="Precio propuesto IC" value={icForm.propuesta_precio_ic}
                onChange={(e) => setIcForm({ ...icForm, propuesta_precio_ic: e.target.value })} style={{ borderRadius: '8px' }} />
              <Input type="number" placeholder="Precio a restaurar" value={icForm.precio_restaurar}
                onChange={(e) => setIcForm({ ...icForm, precio_restaurar: e.target.value })} style={{ borderRadius: '8px' }} />

              {icForm.propuesta_precio_ic && selected.precio_costo && (
                <div className="bg-secondary/50 p-3 rounded-lg space-y-1" style={{ borderRadius: '8px' }}>
                  <p className="text-xs text-muted-foreground">Descuento: <span className="font-medium text-foreground">
                    {(((selected.precio_costo - Number(icForm.propuesta_precio_ic)) / selected.precio_costo) * 100).toFixed(1)}%
                  </span></p>
                  <p className="text-xs text-muted-foreground">Recaudación estimada: <span className="font-medium text-[#1D9E75]">
                    ${(Number(icForm.cant_x_vencer || 0) * Number(icForm.propuesta_precio_ic || 0)).toFixed(2)}
                  </span></p>
                  <p className="text-xs text-muted-foreground">Pérdida si merma: <span className="font-medium text-[#E24B4A]">
                    ${(Number(icForm.cant_x_vencer || 0) * (selected.precio_costo || 0)).toFixed(2)}
                  </span></p>
                </div>
              )}

              {icForm.cant_x_vencer && Number(icForm.cant_x_vencer) > (selected.cantidad || 0) && (
                <p className="text-xs text-[#E24B4A]">
                  Cantidad por vencer ({icForm.cant_x_vencer}) supera el total del lote ({selected.cantidad})
                </p>
              )}

              <Button className="w-full" onClick={() => createIcMut.mutate({
                lote_id: selected.id,
                producto_id: selected.producto_id,
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
              })} disabled={!icForm.cant_x_vencer || Number(icForm.cant_x_vencer) > (selected.cantidad || 0)} style={{ borderRadius: '8px' }}>
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