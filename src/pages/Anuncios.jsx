import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import KPICard from '@/components/shared/KPICard';
import StatusBadge from '@/components/shared/StatusBadge';
import ReadOnlyBlock, { ReadOnlyField } from '@/components/shared/ReadOnlyBlock';
import Timeline from '@/components/shared/Timeline';
import { TIPO_CASO_LABELS, MOTIVOS_TKC, MOTIVOS_ELINEAS } from '@/lib/constants';
import { Search, AlertTriangle, Hash, Eye } from 'lucide-react';
import { notifyJefeDepto } from '@/lib/notificationService';
import { logTransicion, notificarTransicion } from '@/lib/workflowService';
import { useConfirm } from '@/lib/useConfirm';
import { format } from 'date-fns';
import SortTh from '@/components/shared/SortTh';
import { useSortable } from '@/lib/useSortable';

export default function Anuncios() {
  const [filterTipo, setFilterTipo] = useState('all');
  const [filterEstado, setFilterEstado] = useState('all');
  const [searchQ, setSearchQ] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const queryClient = useQueryClient();
  const { sort, onSort } = useSortable('fecha_deteccion', 'desc');

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const role = user?.role || 'inv';

  const { data: anuncios = [], isLoading } = useQuery({
    queryKey: ['anuncios'],
    queryFn: () => base44.entities.AnuncioDesact.list('-created_date', 200),
    select: (d) => Array.isArray(d) ? d : [],
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.AnuncioDesact.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['anuncios'] });
      setSelectedId(null);
      if (variables?.data?.estado_tarea) {
        notifyJefeDepto(
          'ca', 'sistema',
          'Anuncio actualizado',
          `Estado: ${variables.data.estado_tarea} — por ${user?.full_name || user?.email || '—'}`
        ).catch(() => {});
      }
    },
  });

  const counts = {
    desact_ef: anuncios.filter(a => a.tipo_caso === 'desact_ef_positivo' && a.estado_tarea !== 'completado').length,
    sin_id: anuncios.filter(a => a.tipo_caso === 'sin_id' && a.estado_tarea !== 'completado').length,
    activo_ef0: anuncios.filter(a => a.tipo_caso === 'activo_ef_cero' && a.estado_tarea !== 'completado').length,
  };

  const filtered = anuncios.filter(a => {
    if (filterTipo !== 'all' && a.tipo_caso !== filterTipo) return false;
    if (filterEstado !== 'all' && a.estado_tarea !== filterEstado) return false;
    if (searchQ && !a.producto_nombre?.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });

  const sorted = (() => {
    const mul = sort.dir === 'asc' ? 1 : -1
    const arr = [...filtered]
    switch (sort.key) {
      case 'producto':  return arr.sort((a,b) => mul * (a.producto_nombre ?? '').localeCompare(b.producto_nombre ?? ''))
      case 'tipo':      return arr.sort((a,b) => mul * (a.tipo_caso ?? '').localeCompare(b.tipo_caso ?? ''))
      case 'ef':        return arr.sort((a,b) => mul * ((a.ef_al_detectar ?? 0) - (b.ef_al_detectar ?? 0)))
      case 'estado':    return arr.sort((a,b) => mul * (a.estado_tarea ?? '').localeCompare(b.estado_tarea ?? ''))
      case 'fecha':     return arr.sort((a,b) => mul * (a.fecha_deteccion ?? '').localeCompare(b.fecha_deteccion ?? ''))
      default:          return arr
    }
  })()

  const selected = anuncios.find(a => a.id === selectedId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">Anuncios desactivados</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gestión de anuncios desactivados y sin ID</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <KPICard title={"DESACT EF>0"} value={counts.desact_ef} icon={AlertTriangle} color="text-[#E24B4A]" bgColor="bg-[#E24B4A]/10" />
        <KPICard title="Sin ID con stock" value={counts.sin_id} icon={Hash} color="text-[#BA7517]" bgColor="bg-[#BA7517]/10" />
        <KPICard title={"Activo EF=0"} value={counts.activo_ef0} icon={Eye} color="text-[#888780]" bgColor="bg-[#888780]/10" />
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Buscar producto..." className="pl-10" style={{ borderRadius: '8px' }} />
        </div>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-40" style={{ borderRadius: '8px' }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos tipos</SelectItem>
            <SelectItem value="desact_ef_positivo">{"DESACT EF>0"}</SelectItem>
            <SelectItem value="sin_id">Sin ID</SelectItem>
            <SelectItem value="activo_ef_cero">{"Activo EF=0"}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-40" style={{ borderRadius: '8px' }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos estados</SelectItem>
            <SelectItem value="pendiente">Pendiente</SelectItem>
            <SelectItem value="pend_ca">Pend. CA</SelectItem>
            <SelectItem value="en_auditoria">En auditoría</SelectItem>
            <SelectItem value="completado">Completado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Card className="overflow-hidden" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <SortTh colKey="producto" label="Producto" sort={sort} onSort={onSort} />
                  <SortTh colKey="tipo"     label="Tipo"     sort={sort} onSort={onSort} className="text-center" align="center" />
                  <SortTh colKey="ef"       label="EF"       sort={sort} onSort={onSort} className="text-right"  align="right" />
                  <SortTh colKey="estado"   label="Estado"   sort={sort} onSort={onSort} className="text-center" align="center" />
                  <SortTh colKey="fecha"    label="Fecha"    sort={sort} onSort={onSort} />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Cargando...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Sin registros</td></tr>
                ) : sorted.map(a => {
                  const tc = TIPO_CASO_LABELS[a.tipo_caso] || {};
                  return (
                    <tr key={a.id}
                      className={`border-b hover:bg-accent/50 cursor-pointer transition-colors ${selectedId === a.id ? 'bg-accent' : ''}`}
                      onClick={() => setSelectedId(a.id)}>
                      <td className="p-3">
                        <p className="font-medium">{a.producto_nombre}</p>
                        <p className="text-xs text-muted-foreground">{a.suministrador}</p>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${tc.bg} ${tc.text}`} style={{ borderRadius: '4px' }}>
                          {tc.label}
                        </span>
                      </td>
                      <td className="p-3 text-right font-medium">{a.ef_al_detectar}</td>
                      <td className="p-3 text-center"><StatusBadge status={a.estado_tarea} /></td>
                      <td className="p-3 text-muted-foreground">{a.fecha_deteccion}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Dialog open={!!selectedId} onOpenChange={(o) => { if (!o) setSelectedId(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
          {selected && (
            <AnuncioDetail
              anuncio={selected}
              role={role}
              user={user}
              onUpdate={(data) => updateMut.mutate({ id: selected.id, data })}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const TIPO_CASO_WHY = {
  desact_ef_positivo: {
    titulo: '¿Por qué está aquí?',
    desc: 'El anuncio está desactivado en TKC pero el producto tiene existencia física positiva. Mientras esté desactivado, no se puede vender en línea aunque haya stock.',
    accion: 'INV debe determinar si reactivar el anuncio o escalarlo a CA para revisión de precio o condiciones.',
  },
  sin_id: {
    titulo: '¿Por qué está aquí?',
    desc: 'El producto tiene stock físico pero no tiene ID de tienda asignado en TKC. Sin ese ID, el artículo no puede publicarse ni venderse en línea.',
    accion: 'INV debe verificar si aplica crear el anuncio, transferir el stock o darlo de baja.',
  },
  activo_ef_cero: {
    titulo: '¿Por qué está aquí?',
    desc: 'El anuncio aparece activo en TKC pero la existencia física registrada es cero. Puede generar ventas de un producto sin stock real.',
    accion: 'INV debe confirmar si el stock es real, ajustar el conteo o desactivar el anuncio.',
  },
};

const ESTADO_HINT = {
  pendiente:     { msg: 'Esperando revisión de INV.',          color: 'text-[#facc15]' },
  pend_ca:       { msg: 'Esperando acción de CA (Anuncios).',  color: 'text-[#60a5fa]' },
  en_auditoria:  { msg: 'En revisión por Auditoría.',          color: 'text-[#a78bfa]' },
  completado:    { msg: 'Proceso completado y cerrado.',        color: 'text-[#4ade80]' },
  devuelto:      { msg: 'Devuelto para corrección.',           color: 'text-[#E24B4A]'  },
};

function AnuncioDetail({ anuncio, role, user, onUpdate }) {
  const [invForm, setInvForm] = useState({ motivo_tkc: '', motivo_elineas: '', accion_inv: '', nota_inv: '' });
  const [caForm, setCaForm] = useState({ accion_ca: '', precio_nuevo: '', nota_ca: '' });
  const [auditorNota, setAuditorNota] = useState('');
  const { confirmDialog, ConfirmDialogNode } = useConfirm();

  const handleTransicion = (data) => {
    if (data.estado_tarea) {
      logTransicion('anuncios_desact', anuncio, data.estado_tarea, user, data).catch(() => {})
      notificarTransicion('anuncios_desact', anuncio, data.estado_tarea, user).catch(() => {})
    }
    onUpdate(data)
  }

  const needsCa = ['reactivar', 'escalar_ca'].includes(anuncio.accion_inv);
  const steps = needsCa ? ['INV', 'CA', 'Auditor', 'Completado'] : ['INV', 'Auditor', 'Completado'];
  const stepMap = needsCa
    ? { pendiente: 0, pend_ca: 1, en_auditoria: 2, completado: 3 }
    : { pendiente: 0, en_auditoria: 1, completado: 2 };
  const currentStep = stepMap[anuncio.estado_tarea] ?? 0;

  const canInv = (role === 'inv' || role === 'administrador') && anuncio.estado_tarea === 'pendiente';
  const canCa = (role === 'ca' || role === 'administrador') && anuncio.estado_tarea === 'pend_ca';
  const canAudit = (role === 'auditor' || role === 'administrador') && anuncio.estado_tarea === 'en_auditoria';

  return (
    <>
    <div className="p-5 space-y-4">
      <DialogTitle className="text-sm font-medium pr-6">Detalle anuncio</DialogTitle>

      <Timeline steps={steps} currentStep={currentStep} />

      {/* Banner: quién actúa ahora */}
      {(() => {
        const hint = ESTADO_HINT[anuncio.estado_tarea];
        const tieneAccion = canInv || canCa || canAudit;
        if (!hint || tieneAccion) return null;
        return (
          <p className={`text-xs px-3 py-2 rounded-md bg-secondary/60 border border-border ${hint.color}`}>
            {hint.msg}
          </p>
        );
      })()}

      {/* Por qué está aquí */}
      {TIPO_CASO_WHY[anuncio.tipo_caso] && (
        <div className="rounded-lg bg-secondary/50 border border-border p-3 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {TIPO_CASO_WHY[anuncio.tipo_caso].titulo}
          </p>
          <p className="text-xs text-foreground leading-relaxed">
            {TIPO_CASO_WHY[anuncio.tipo_caso].desc}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {TIPO_CASO_WHY[anuncio.tipo_caso].accion}
          </p>
        </div>
      )}

      <ReadOnlyBlock title="Datos del producto">
        <ReadOnlyField label="Producto" value={anuncio.producto_nombre} />
        <ReadOnlyField label="Código" value={anuncio.producto_codigo} />
        <ReadOnlyField label="EF al detectar" value={anuncio.ef_al_detectar} />
        <ReadOnlyField label="Suministrador" value={anuncio.suministrador} />
        <ReadOnlyField label="Estado anuncio" value={anuncio.estado_anuncio_tkc} />
        <ReadOnlyField label="Tipo caso" value={TIPO_CASO_LABELS[anuncio.tipo_caso]?.label} />
      </ReadOnlyBlock>

      {anuncio.accion_inv && (
        <ReadOnlyBlock title="Revisión INV">
          <ReadOnlyField label="Motivo TKC" value={anuncio.motivo_tkc} />
          <ReadOnlyField label="Motivo ELíneas" value={anuncio.motivo_elineas} />
          <ReadOnlyField label="Acción" value={anuncio.accion_inv} />
          <ReadOnlyField label="Nota" value={anuncio.nota_inv} />
        </ReadOnlyBlock>
      )}

      {anuncio.accion_ca && (
        <ReadOnlyBlock title="Revisión CA">
          <ReadOnlyField label="Acción" value={anuncio.accion_ca} />
          <ReadOnlyField label="Precio nuevo" value={anuncio.precio_nuevo ? `$${anuncio.precio_nuevo}` : '—'} />
          <ReadOnlyField label="Nota" value={anuncio.nota_ca} />
        </ReadOnlyBlock>
      )}

      {/* INV form */}
      {canInv && (
        <div className="space-y-3 p-4 border rounded-lg" style={{ borderRadius: '8px', borderWidth: '0.5px' }}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Revisión INV</p>
          <Select value={invForm.motivo_tkc} onValueChange={(v) => setInvForm({ ...invForm, motivo_tkc: v })}>
            <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue placeholder="Motivo TKC" /></SelectTrigger>
            <SelectContent>{MOTIVOS_TKC.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={invForm.motivo_elineas} onValueChange={(v) => setInvForm({ ...invForm, motivo_elineas: v })}>
            <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue placeholder="Motivo ELíneas" /></SelectTrigger>
            <SelectContent>{MOTIVOS_ELINEAS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={invForm.accion_inv} onValueChange={(v) => setInvForm({ ...invForm, accion_inv: v })}>
            <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue placeholder="Acción INV" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="reactivar">Reactivar</SelectItem>
              <SelectItem value="escalar_ca">Escalar a CA</SelectItem>
              <SelectItem value="dar_de_baja">Dar de baja</SelectItem>
              <SelectItem value="mantener">Mantener</SelectItem>
            </SelectContent>
          </Select>
          <Textarea value={invForm.nota_inv} onChange={(e) => setInvForm({ ...invForm, nota_inv: e.target.value })} placeholder="Nota INV" style={{ borderRadius: '8px' }} />
          <Button size="sm" onClick={() => {
            const needsCaAction = ['reactivar', 'escalar_ca'].includes(invForm.accion_inv);
            handleTransicion({
              ...invForm,
              especialista_inv_id: user?.email,
              especialista_inv_nombre: user?.full_name,
              fecha_inv: format(new Date(), 'yyyy-MM-dd'),
              estado_tarea: needsCaAction ? 'pend_ca' : 'en_auditoria',
            });
          }} disabled={!invForm.accion_inv} style={{ borderRadius: '8px' }}>Confirmar</Button>
        </div>
      )}

      {/* CA form */}
      {canCa && (
        <div className="space-y-3 p-4 border rounded-lg" style={{ borderRadius: '8px', borderWidth: '0.5px' }}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Revisión CA</p>
          <Select value={caForm.accion_ca} onValueChange={(v) => setCaForm({ ...caForm, accion_ca: v })}>
            <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue placeholder="Acción CA" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="reactivar">Reactivar</SelectItem>
              <SelectItem value="actualizar_precio">Actualizar precio</SelectItem>
              <SelectItem value="crear_id">Crear ID</SelectItem>
              <SelectItem value="eliminar_anuncio">Eliminar anuncio</SelectItem>
              <SelectItem value="mantener">Mantener</SelectItem>
            </SelectContent>
          </Select>
          {caForm.accion_ca === 'actualizar_precio' && (
            <Input type="number" placeholder="Precio nuevo" value={caForm.precio_nuevo}
              onChange={(e) => setCaForm({ ...caForm, precio_nuevo: e.target.value })} style={{ borderRadius: '8px' }} />
          )}
          <Textarea value={caForm.nota_ca} onChange={(e) => setCaForm({ ...caForm, nota_ca: e.target.value })} placeholder="Nota CA" style={{ borderRadius: '8px' }} />
          <Button size="sm" onClick={() => handleTransicion({
            ...caForm,
            precio_nuevo: caForm.precio_nuevo ? Number(caForm.precio_nuevo) : null,
            especialista_ca_id: user?.email,
            especialista_ca_nombre: user?.full_name,
            fecha_ca: format(new Date(), 'yyyy-MM-dd'),
            estado_tarea: 'en_auditoria',
          })} disabled={!caForm.accion_ca} style={{ borderRadius: '8px' }}>Confirmar</Button>
        </div>
      )}

      {/* Auditor */}
      {canAudit && (
        <div className="space-y-3 p-4 border rounded-lg" style={{ borderRadius: '8px', borderWidth: '0.5px' }}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Auditoría</p>
          <Textarea value={auditorNota} onChange={(e) => setAuditorNota(e.target.value)} placeholder="Nota auditor" style={{ borderRadius: '8px' }} />
          <div className="flex gap-2">
            <Button size="sm" onClick={async () => {
              if (!await confirmDialog('Se completará el proceso y no podrá revertirse.', { title: '¿Aprobar y completar?' })) return;
              handleTransicion({
                nota_auditor: auditorNota,
                auditor_id: user?.email,
                auditor_nombre: user?.full_name,
                fecha_auditoria: format(new Date(), 'yyyy-MM-dd'),
                estado_tarea: 'completado',
                fecha_resolucion: format(new Date(), 'yyyy-MM-dd'),
              });
            }} style={{ borderRadius: '8px' }}>Aprobar</Button>
            <Button size="sm" variant="outline" onClick={() => handleTransicion({ nota_auditor: auditorNota, estado_tarea: 'devuelto' })} style={{ borderRadius: '8px' }}>Devolver</Button>
          </div>
        </div>
      )}
    </div>
    {ConfirmDialogNode}
    </>
  );
}