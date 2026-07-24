import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatusBadge from '@/components/shared/StatusBadge';
import InventarioForm from '@/components/inventario/InventarioForm';
import ReadOnlyBlock, { ReadOnlyField } from '@/components/shared/ReadOnlyBlock';
import Timeline from '@/components/shared/Timeline';
import AlertBanner from '@/components/shared/AlertBanner';
import { Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';
import OrdenReabastecimiento from '@/components/inventario/OrdenReabastecimiento';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import ColPicker, { loadCols } from '@/components/shared/ColPicker';
import Pagination from '@/components/shared/Pagination';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { notifyJefeDepto } from '@/lib/notificationService';
import { logTransicion, notificarTransicion } from '@/lib/workflowService';
import { useConfirm } from '@/lib/useConfirm';
import { CLASIF_FACT, ESTADO_FACT } from '@/lib/constants'
import SortTh from '@/components/shared/SortTh'
import { useSortable } from '@/lib/useSortable';

const PAGE_SIZE = 50

const INV_COL_DEFS = [
  { key: 'producto',      label: 'Producto',       defaultOn: true,  required: true  },
  { key: 'ef_tkc',        label: 'EF TKC',         defaultOn: true,  required: false },
  { key: 'conteo',        label: 'Conteo real',     defaultOn: true,  required: false },
  { key: 'diferencia',    label: 'Diferencia',      defaultOn: true,  required: false },
  { key: 'clasificacion', label: 'Clasificación',   defaultOn: false, required: false },
  { key: 'especialista',  label: 'Especialista',    defaultOn: false, required: false },
  { key: 'estado',        label: 'Estado',          defaultOn: true,  required: false },
  { key: 'fecha',         label: 'Fecha',           defaultOn: true,  required: false },
]
const INV_COLS_KEY = 'inv_cols'

export default function Inventario() {
  const [showForm, setShowForm] = useState(false);
  const [showOrden, setShowOrden] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [filterEstado, setFilterEstado] = useState('all');
  const [searchQ, setSearchQ] = useState('');
  const [cols, setCols] = useState(() => loadCols(INV_COLS_KEY, INV_COL_DEFS));
  const [page, setPage] = useState(1);
  const { sort, setSort, onSort } = useSortable('fecha_inv', 'desc')
  const queryClient = useQueryClient();

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const role = user?.role || 'inv';

  const { data: inventarios = [], isLoading } = useQuery({
    queryKey: ['inventarios'],
    queryFn: () => base44.entities.Inventario.list('-created_date', 200),
    select: (d) => Array.isArray(d) ? d : [],
    refetchInterval: 30_000,
  });

  const { data: productos = [] } = useQuery({
    queryKey: ['productos'],
    queryFn: () => base44.entities.Producto.list('-updated_date', 500),
    select: (d) => Array.isArray(d) ? d : [],
  });

  const bajoMinimoCount = productos.filter(p =>
    p.activo !== false &&
    (p.stock_minimo || 0) > 0 &&
    (p.exist_fisica || 0) < (p.stock_minimo || 0)
  ).length;

  // Map producto_id → stock_minimo for quick lookup in the table
  const productoMinMap = Object.fromEntries(productos.map(p => [p.id, p.stock_minimo || 0]));

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
    mutationFn: (id) => base44.entities.Inventario.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['inventarios'] }); setSelectedId(null); },
    onError: (error) => alert(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Inventario.update(id, data),
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

  const filtered = inventarios.filter(i => {
    if (filterEstado !== 'all' && i.estado_tarea !== filterEstado) return false;
    if (searchQ && !i.producto_nombre?.toLowerCase().includes(searchQ.toLowerCase()) && !i.producto_codigo?.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });

  const sorted = (() => {
    const mul = sort.dir === 'asc' ? 1 : -1
    const arr = [...filtered]
    switch (sort.key) {
      case 'producto':      return arr.sort((a,b) => mul * (a.producto_nombre ?? '').localeCompare(b.producto_nombre ?? ''))
      case 'ef_tkc':        return arr.sort((a,b) => mul * ((a.exist_fisica_tkc ?? 0) - (b.exist_fisica_tkc ?? 0)))
      case 'conteo':        return arr.sort((a,b) => mul * ((a.conteo_real ?? 0) - (b.conteo_real ?? 0)))
      case 'diferencia':    return arr.sort((a,b) => mul * ((a.diferencia ?? 0) - (b.diferencia ?? 0)))
      case 'clasificacion': return arr.sort((a,b) => mul * (a.clasif_ajuste ?? '').localeCompare(b.clasif_ajuste ?? ''))
      case 'especialista':  return arr.sort((a,b) => mul * (a.especialista_nombre ?? '').localeCompare(b.especialista_nombre ?? ''))
      case 'estado':        return arr.sort((a,b) => mul * (a.estado_tarea ?? '').localeCompare(b.estado_tarea ?? ''))
      case 'fecha':         return arr.sort((a,b) => mul * (a.fecha_inv ?? '').localeCompare(b.fecha_inv ?? ''))
      default:              return arr
    }
  })()

  const difColor = (d) => d === 0 ? 'text-[#1D9E75]' : d > 0 ? 'text-[#BA7517]' : 'text-[#E24B4A]';

  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium">Inventario</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Conteos y ajustes de inventario</p>
        </div>
        <div className="flex items-center gap-2">
          <ColPicker cols={INV_COL_DEFS} visible={cols} onChange={setCols} storageKey={INV_COLS_KEY} />
          <Button
            variant="outline"
            onClick={() => { setShowOrden(v => !v); setShowForm(false); }}
            style={{ borderRadius: '8px' }}
            className={bajoMinimoCount > 0 ? 'border-[#E24B4A] text-[#E24B4A] hover:bg-[#E24B4A]/5' : ''}
          >
            <ShoppingCart className="w-4 h-4 lg:mr-1.5" />
            <span className="hidden lg:inline">Reabastecimiento</span>
            {bajoMinimoCount > 0 && (
              <span className="ml-1.5 bg-[#E24B4A] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {bajoMinimoCount}
              </span>
            )}
          </Button>
          {(role === 'inv' || role === 'administrador' || role === 'superadmin') && (
            <Button onClick={() => { setShowForm(true); setSelectedId(null); setShowOrden(false); }} style={{ borderRadius: '8px' }}>
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

      {showOrden && (
        <OrdenReabastecimiento onClose={() => setShowOrden(false)} />
      )}

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Buscar..." className="pl-10" style={{ borderRadius: '8px' }} />
        </div>
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-44" style={{ borderRadius: '8px' }}><SelectValue /></SelectTrigger>
          <SelectContent>
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
                <tr className="border-b">
                  <SortTh colKey="producto"      label="Producto"       sort={sort} onSort={onSort} className="hidden sm:table-cell" />
                  {cols.ef_tkc        && <SortTh colKey="ef_tkc"        label="EF TKC"         sort={sort} onSort={onSort} align="right" className="hidden sm:table-cell" />}
                  {cols.conteo        && <SortTh colKey="conteo"        label="Conteo"         sort={sort} onSort={onSort} align="right" className="hidden sm:table-cell" />}
                  {cols.diferencia    && <SortTh colKey="diferencia"    label="Diferencia"     sort={sort} onSort={onSort} align="right" />}
                  {cols.clasificacion && <SortTh colKey="clasificacion" label="Clasificación"  sort={sort} onSort={onSort} className="hidden lg:table-cell" />}
                  {cols.especialista  && <SortTh colKey="especialista"  label="Especialista"   sort={sort} onSort={onSort} className="hidden lg:table-cell" />}
                  {cols.estado        && <SortTh colKey="estado"        label="Estado"         sort={sort} onSort={onSort} align="center" />}
                  {cols.fecha         && <SortTh colKey="fecha"         label="Fecha"          sort={sort} onSort={onSort} className="hidden md:table-cell" />}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={1 + Object.values(cols).filter(Boolean).length} className="p-8 text-center text-muted-foreground">Cargando...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={1 + Object.values(cols).filter(Boolean).length} className="p-8 text-center text-muted-foreground">Sin registros</td></tr>
                ) : paginated.map(inv => {
                  const minimo = productoMinMap[inv.producto_id] || 0;
                  const bajominimo = minimo > 0 && (inv.conteo_real ?? inv.exist_fisica_tkc ?? 0) < minimo;
                  return (
                  <tr key={inv.id}
                    className={`border-b hover:bg-accent/50 cursor-pointer transition-colors
                      ${selectedId === inv.id ? 'bg-accent' : ''}
                      ${bajominimo && selectedId !== inv.id ? 'bg-[#E24B4A]/[0.04]' : ''}
                    `}
                    onClick={() => { setSelectedId(inv.id); setShowForm(false); setShowOrden(false); }}>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {bajominimo && <span title="Stock bajo mínimo" className="w-1.5 h-1.5 rounded-full bg-[#E24B4A] flex-shrink-0" />}
                        <div>
                          <p className={`font-medium ${bajominimo ? 'text-[#E24B4A]' : ''}`}>{inv.producto_nombre}</p>
                          <p className="text-xs text-muted-foreground">{inv.producto_codigo}</p>
                        </div>
                      </div>
                    </td>
                    {cols.ef_tkc        && <td className="p-3 text-right hidden sm:table-cell">{inv.exist_fisica_tkc}</td>}
                    {cols.conteo        && <td className="p-3 text-right font-medium hidden sm:table-cell">{inv.conteo_real}</td>}
                    {cols.diferencia    && <td className={`p-3 text-right font-medium ${difColor(inv.diferencia)}`}>{inv.diferencia > 0 ? '+' : ''}{inv.diferencia}</td>}
                    {cols.clasificacion && <td className="p-3 text-xs text-muted-foreground hidden lg:table-cell">{inv.clasif_ajuste || '—'}</td>}
                    {cols.especialista  && <td className="p-3 text-xs text-muted-foreground hidden lg:table-cell">{inv.especialista_nombre || '—'}</td>}
                    {cols.estado        && <td className="p-3 text-center"><StatusBadge status={inv.estado_tarea} /></td>}
                    {cols.fecha         && <td className="p-3 text-muted-foreground hidden md:table-cell">{inv.fecha_inv}</td>}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
      </div>

      {/* Detail modal */}
      <Dialog open={!!selectedId} onOpenChange={(o) => { if (!o) setSelectedId(null) }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
          {selected && (
            <InventarioDetail
              inv={selected}
              role={role}
              user={user}
              onUpdate={(data) => updateMutation.mutate({ id: selected.id, data })}
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

function InventarioDetail({ inv, role, user, onUpdate, onDelete, onClose, isUpdating = false }) {
  const [factData, setFactData] = useState({ fact_no_factura: '', fact_clasif: '', fact_notas: '', fact_estado: '' });
  const [auditorNota, setAuditorNota] = useState('');
  const [nuevoConteo, setNuevoConteo] = useState(String(inv.conteo_real ?? ''));
  const { confirmDialog, ConfirmDialogNode } = useConfirm();

  const steps = ['INV', 'FACT', 'Auditor', 'Completado'];
  const stepMap = { en_curso: 0, pend_fact: 1, en_auditoria: 2, completado: 3, devuelto: 0 };
  const currentStep = stepMap[inv.estado_tarea] ?? 0;

  const canProcessFact = (role === 'fact'    || role === 'administrador') && inv.estado_tarea === 'pend_fact';
  const canAudit       = (role === 'auditor' || role === 'administrador') && inv.estado_tarea === 'en_auditoria';
  const canDevuelto    = (role === 'inv'     || role === 'administrador') && inv.estado_tarea === 'devuelto';
  const canDelete = role === 'superadmin'
    || (role === 'administrador' && inv.estado_tarea !== 'completado')
    || (role === 'inv' && inv.estado_tarea === 'en_curso' && inv.especialista_id === user?.email);

  // Mensaje contextual según estado + rol
  const statusHint = (() => {
    const e = inv.estado_tarea;
    if (e === 'completado') return { msg: 'Proceso completado y cerrado.', color: 'text-[#4ade80]' };
    if (e === 'pend_fact'  && !['fact','administrador','superadmin'].includes(role))
      return { msg: 'Esperando revisión de FACTURACIÓN.', color: 'text-[#60a5fa]' };
    if (e === 'en_auditoria' && !['auditor','administrador','superadmin'].includes(role))
      return { msg: 'En revisión por AUDITORÍA.', color: 'text-[#a78bfa]' };
    if (e === 'devuelto' && !['inv','administrador','superadmin'].includes(role))
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

      {/* Devuelto — acción INV */}
      {canDevuelto && (() => {
        const conteoNum = Number(nuevoConteo)
        const conteoValido = !isNaN(conteoNum) && conteoNum >= 0
        return (
          <div className="space-y-3 p-4 border border-[#E24B4A]/40 rounded-lg bg-[#E24B4A08]" style={{ borderRadius: '8px' }}>
            <p className="text-xs font-medium text-[#E24B4A] uppercase tracking-wider">Devuelto — corrección requerida</p>
            {inv.nota_auditor && (
              <p className="text-xs text-muted-foreground"><span className="font-medium">Nota:</span> {inv.nota_auditor}</p>
            )}
            {inv.fact_notas && (
              <p className="text-xs text-muted-foreground"><span className="font-medium">Nota FACT:</span> {inv.fact_notas}</p>
            )}
            <Input
              type="number"
              placeholder="Conteo real corregido"
              value={nuevoConteo}
              onChange={(e) => setNuevoConteo(e.target.value)}
              style={{ borderRadius: '8px' }}
            />
            <Button
              size="sm"
              disabled={!conteoValido || isUpdating}
              onClick={() => {
                const diff = conteoNum - (inv.exist_fisica_tkc || 0)
                const resultado = diff === 0 ? 'ok' : diff > 0 ? 'sobrante' : 'faltante'
                const nuevoEstado = resultado === 'ok' ? 'completado' : 'pend_fact'
                onUpdate({ conteo_real: conteoNum, diferencia: diff, resultado, estado_tarea: nuevoEstado })
              }}
              style={{ borderRadius: '8px' }}
            >
              {isUpdating ? 'Enviando...' : 'Reenviar conteo corregido'}
            </Button>
          </div>
        )
      })()}

      {/* FACT form */}
      {canProcessFact && (
        <div className="space-y-3 p-4 border rounded-lg" style={{ borderRadius: '8px', borderWidth: '0.5px' }}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Procesamiento FACT</p>
          <Input placeholder="No. factura TKC" value={factData.fact_no_factura} onChange={(e) => setFactData({ ...factData, fact_no_factura: e.target.value })} style={{ borderRadius: '8px' }} />
          <Select value={factData.fact_clasif} onValueChange={(v) => setFactData({ ...factData, fact_clasif: v })}>
            <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue placeholder="Clasificación FACT" /></SelectTrigger>
            <SelectContent>{CLASIF_FACT.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={factData.fact_estado} onValueChange={(v) => setFactData({ ...factData, fact_estado: v })}>
            <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue placeholder="Estado FACT" /></SelectTrigger>
            <SelectContent>{ESTADO_FACT.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
          </Select>
          <Textarea placeholder="Notas FACT" value={factData.fact_notas} onChange={(e) => setFactData({ ...factData, fact_notas: e.target.value })} style={{ borderRadius: '8px' }} />
          <div className="flex gap-2">
            <Button size="sm" disabled={isUpdating} onClick={() => onUpdate({ ...factData, fact_especialista_id: user?.email, fact_especialista_nombre: user?.full_name, fact_fecha: new Date().toISOString().slice(0, 10), estado_tarea: 'en_auditoria' })} style={{ borderRadius: '8px' }}>
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
            <Button size="sm" variant="outline" disabled={isUpdating} onClick={() => onUpdate({ nota_auditor: auditorNota, auditoria_fecha: new Date().toISOString().slice(0, 10), estado_tarea: 'devuelto' })} style={{ borderRadius: '8px' }}>
              Devolver
            </Button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}