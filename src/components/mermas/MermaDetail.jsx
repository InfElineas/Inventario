import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DialogTitle } from '@/components/ui/dialog';
import ReadOnlyBlock, { ReadOnlyField } from '@/components/shared/ReadOnlyBlock';
import Timeline from '@/components/shared/Timeline';
import AlertBanner from '@/components/shared/AlertBanner';
import { Trash2 } from 'lucide-react';
import { MOTIVOS_RECONTEO, CLASIF_MERMA_SIN_FACT, ALL_CLASIF_MERMA, DESTINOS_MERMA, CLASIF_FACT, ESTADO_FACT } from '@/lib/constants';
import { logTransicion, notificarTransicion } from '@/lib/workflowService';
import { useConfirm } from '@/lib/useConfirm';

export default function MermaDetail({ merma, role, user, onUpdate, onDelete, isUpdating = false }) {
  const [factData, setFactData] = useState({ fact_no_factura: '', fact_clasif: '', fact_notas: '', fact_estado: '' });
  const [reconteoMotivo, setReconteoMotivo] = useState('');
  const [reconteoDetalle, setReconteoDetalle] = useState('');
  const [auditorNota, setAuditorNota] = useState('');
  const [tab, setTab] = useState('procesar');
  const [invReconteo, setInvReconteo] = useState({ cantidad: String(merma.cantidad), clasif_merma: merma.clasif_merma });
  const { confirmDialog, ConfirmDialogNode } = useConfirm();
  const [destinos, setDestinos] = useState(merma.destinos || []);
  const [newDestino, setNewDestino] = useState({ tipo: '', cantidad: '' });

  // Sincronizar destinos cuando el servidor confirma el guardado
  useEffect(() => { setDestinos(merma.destinos || []) }, [merma.id, merma.estado_tarea]);

  const sinFact = CLASIF_MERMA_SIN_FACT.includes(merma.clasif_merma);
  const steps = sinFact ? ['INV', 'Auditor', 'Completado'] : ['INV', 'FACT', 'Auditor', 'Completado'];
  const stepMap = sinFact
    ? { en_curso: 0, en_auditoria: 1, completado: 2, devuelto: 0, reconteo_solicitado: 0 }
    : { en_curso: 0, pend_fact: 1, en_auditoria: 2, completado: 3, devuelto: 0, reconteo_solicitado: 0 };
  const currentStep = stepMap[merma.estado_tarea] ?? 0;

  const handleTransicion = (data) => {
    if (data.estado_tarea) {
      logTransicion('mermas', merma, data.estado_tarea, user, data).catch(() => {})
    }
    onUpdate(data)
  }

  const canFact       = (role === 'fact'    || role === 'administrador') && merma.estado_tarea === 'pend_fact';
  const canAudit      = (role === 'auditor' || role === 'administrador') && merma.estado_tarea === 'en_auditoria';
  const canReconteo   = (role === 'inv'     || role === 'administrador') && merma.estado_tarea === 'reconteo_solicitado';
  const canDevueltoInv = (role === 'inv'    || role === 'administrador') && merma.estado_tarea === 'devuelto';
  const canSuperDelete = role === 'superadmin';

  // Audit validations (usa estado local para feedback en tiempo real)
  const destSum   = destinos.reduce((s, d) => s + (Number(d.cantidad) || 0), 0);
  const destinosOk = destSum === merma.cantidad;
  const rebajaOk   = merma.rebaja_confirmada || sinFact;
  const canApprove = destinosOk && rebajaOk;

  return (
    <>
    {ConfirmDialogNode}
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between pr-6">
        <DialogTitle className="text-sm font-medium">Detalle de merma</DialogTitle>
        {(canSuperDelete || (
          role === 'inv'
          && merma.especialista_id === user?.email
          && ['pend_fact', 'en_auditoria'].includes(merma.estado_tarea)
          && !merma.fact_no_factura
          && !merma.auditor_id
        )) && (
          <Button
            variant="ghost" size="sm"
            className="text-[#E24B4A] hover:text-[#E24B4A] hover:bg-[#E24B4A]/10"
            onClick={async () => { if (await confirmDialog('Esta acción no se puede deshacer.', { title: '¿Eliminar esta merma?', destructive: true })) onDelete() }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      <Timeline steps={steps} currentStep={currentStep} />

      <ReadOnlyBlock title="Registro INV">
        <ReadOnlyField label="Fecha" value={merma.fecha_inv || (merma.created_date ? format(new Date(merma.created_date), 'dd/MM/yyyy') : '—')} />
        <ReadOnlyField label="Producto" value={merma.producto_nombre} />
        <ReadOnlyField label="Almacén" value={merma.almacen_num} />
        <ReadOnlyField label="Cantidad" value={merma.cantidad} />
        <ReadOnlyField label="Clasificación" value={merma.clasif_merma} />
        <ReadOnlyField label="Destino" value={merma.destino_final} />
        <ReadOnlyField label="Pérdida" value={`$${merma.total_perdida?.toFixed(2) || '0.00'}`} />
        <ReadOnlyField label="Especialista" value={merma.especialista_nombre} />
        <ReadOnlyField label="Rebaja" value={merma.rebaja_confirmada ? 'Sí' : 'No'} />
        <ReadOnlyField label="Versión" value={merma.version_reconteo} />
        {merma.notas && <ReadOnlyField label="Notas INV" value={merma.notas} />}
      </ReadOnlyBlock>

      {(merma.fact_no_factura || merma.fact_clasif || merma.fact_notas || merma.fact_estado || merma.fact_fecha) && (
        <ReadOnlyBlock title="Registro FACT">
          {merma.fact_fecha      && <ReadOnlyField label="Fecha" value={merma.fact_fecha} />}
          {merma.fact_no_factura && <ReadOnlyField label="No. factura" value={merma.fact_no_factura} />}
          {merma.fact_clasif     && <ReadOnlyField label="Clasificación" value={merma.fact_clasif} />}
          {merma.fact_estado     && <ReadOnlyField label="Estado" value={merma.fact_estado} />}
          {merma.fact_notas      && <ReadOnlyField label="Notas" value={merma.fact_notas} />}
          {merma.fact_especialista_nombre && <ReadOnlyField label="Especialista" value={merma.fact_especialista_nombre} />}
        </ReadOnlyBlock>
      )}

      {(merma.auditoria_fecha || merma.nota_auditor || merma.auditor_nombre) && (
        <ReadOnlyBlock title="Registro Auditor">
          {merma.auditoria_fecha && <ReadOnlyField label="Fecha" value={merma.auditoria_fecha} />}
          {merma.auditor_nombre  && <ReadOnlyField label="Auditor" value={merma.auditor_nombre} />}
          {merma.nota_auditor    && <ReadOnlyField label="Nota" value={merma.nota_auditor} />}
        </ReadOnlyBlock>
      )}

      {/* FACT processing */}
      {canFact && (
        <div className="space-y-3 p-4 border rounded-lg" style={{ borderRadius: '8px', borderWidth: '0.5px' }}>
          <div className="flex gap-2 mb-3">
            <Button size="sm" variant={tab === 'procesar' ? 'default' : 'outline'} onClick={() => setTab('procesar')} style={{ borderRadius: '8px' }}>Procesar FACT</Button>
            <Button size="sm" variant={tab === 'reconteo' ? 'default' : 'outline'} onClick={() => setTab('reconteo')} style={{ borderRadius: '8px' }}>Solicitar reconteo</Button>
          </div>

          {tab === 'procesar' && (
            <div className="space-y-3">
              {merma.cantidad > 200 && <AlertBanner variant="danger" message={`Alerta: cantidad ${merma.cantidad} > 200`} />}
              {merma.total_perdida > 500 && <AlertBanner variant="danger" message={`Alerta: valor $${merma.total_perdida?.toFixed(2)} > $500`} />}
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
                <Button size="sm" disabled={isUpdating} onClick={() => handleTransicion({
                  ...factData,
                  fact_especialista_id: user?.email,
                  fact_especialista_nombre: user?.full_name,
                  fact_fecha: format(new Date(), 'yyyy-MM-dd'),
                  estado_tarea: 'en_auditoria'
                })} style={{ borderRadius: '8px' }}>{isUpdating ? 'Enviando...' : 'Enviar a auditor'}</Button>
                <Button size="sm" variant="outline" disabled={isUpdating} onClick={() => handleTransicion({ estado_tarea: 'devuelto' })} style={{ borderRadius: '8px' }}>Devolver</Button>
              </div>
            </div>
          )}

          {tab === 'reconteo' && (
            <div className="space-y-3">
              <Select value={reconteoMotivo} onValueChange={setReconteoMotivo}>
                <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue placeholder="Motivo del reconteo (obligatorio)" /></SelectTrigger>
                <SelectContent>
                  {MOTIVOS_RECONTEO.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Textarea placeholder="Detalle adicional" value={reconteoDetalle} onChange={(e) => setReconteoDetalle(e.target.value)} style={{ borderRadius: '8px' }} />
              <Button size="sm" disabled={!reconteoMotivo || isUpdating} onClick={() => {
                const reconteos = [...(merma.reconteos || []), {
                  solicitado_por: user?.email,
                  fecha_solicitud: new Date().toISOString(),
                  motivo_categoria: reconteoMotivo,
                  motivo_detalle: reconteoDetalle,
                  cantidad_anterior: merma.cantidad,
                  clasif_anterior: merma.clasif_merma,
                  estado: 'pendiente',
                }];
                handleTransicion({
                  estado_tarea: 'reconteo_solicitado',
                  version_reconteo: (merma.version_reconteo || 1) + 1,
                  reconteos,
                });
              }} style={{ borderRadius: '8px' }}>Enviar solicitud</Button>
            </div>
          )}
        </div>
      )}

      {/* Devuelto — acción INV */}
      {canDevueltoInv && (() => {
        const cantNum = Number(invReconteo.cantidad)
        const cantValida = Number.isInteger(cantNum) && cantNum >= 1
        const esSinFact = CLASIF_MERMA_SIN_FACT.includes(invReconteo.clasif_merma)
        return (
          <div className="space-y-3 p-4 border border-[#E24B4A]/40 rounded-lg bg-[#E24B4A08]" style={{ borderRadius: '8px' }}>
            <p className="text-xs font-medium text-[#E24B4A] uppercase tracking-wider">Devuelto — corrección requerida</p>
            {merma.nota_auditor && (
              <p className="text-xs text-muted-foreground"><span className="font-medium">Nota auditor:</span> {merma.nota_auditor}</p>
            )}
            <Input
              type="number"
              placeholder="Cantidad corregida"
              value={invReconteo.cantidad}
              onChange={(e) => setInvReconteo(d => ({ ...d, cantidad: e.target.value }))}
              style={{ borderRadius: '8px' }}
            />
            <Select value={invReconteo.clasif_merma} onValueChange={(v) => setInvReconteo(d => ({ ...d, clasif_merma: v }))}>
              <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue placeholder="Clasificación" /></SelectTrigger>
              <SelectContent>
                {(ALL_CLASIF_MERMA || []).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!cantValida || !invReconteo.clasif_merma || isUpdating}
              onClick={() => {
                const precioUnit = merma.precio_unitario || 0
                handleTransicion({
                  cantidad:      cantNum,
                  clasif_merma:  invReconteo.clasif_merma,
                  requiere_fact: !esSinFact,
                  total_perdida: cantNum * precioUnit,
                  estado_tarea:  esSinFact ? 'en_auditoria' : 'pend_fact',
                })
              }}
              style={{ borderRadius: '8px' }}
            >
              {isUpdating ? 'Enviando...' : 'Reenviar merma corregida'}
            </Button>
          </div>
        )
      })()}

      {/* Reconteo — acción INV */}
      {canReconteo && (() => {
        const ultimoReconteo = (merma.reconteos || []).at(-1)
        const cantNum = Number(invReconteo.cantidad)
        const cantValida = Number.isInteger(cantNum) && cantNum >= 1
        return (
          <div className="space-y-3 p-4 border border-[#BA7517]/40 rounded-lg bg-[#BA751708]" style={{ borderRadius: '8px' }}>
            <p className="text-xs font-medium text-[#BA7517] uppercase tracking-wider">Reconteo solicitado por FACT</p>
            {ultimoReconteo && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p><span className="font-medium">Motivo:</span> {ultimoReconteo.motivo_categoria}</p>
                {ultimoReconteo.motivo_detalle && <p><span className="font-medium">Detalle:</span> {ultimoReconteo.motivo_detalle}</p>}
                <p><span className="font-medium">Cantidad anterior:</span> {ultimoReconteo.cantidad_anterior}</p>
              </div>
            )}
            <Input
              type="number"
              placeholder="Nueva cantidad (reconteo físico)"
              value={invReconteo.cantidad}
              onChange={(e) => setInvReconteo(d => ({ ...d, cantidad: e.target.value }))}
              style={{ borderRadius: '8px' }}
            />
            <Select value={invReconteo.clasif_merma} onValueChange={(v) => setInvReconteo(d => ({ ...d, clasif_merma: v }))}>
              <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue placeholder="Clasificación" /></SelectTrigger>
              <SelectContent>
                {(ALL_CLASIF_MERMA || []).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!cantValida || !invReconteo.clasif_merma || isUpdating}
              onClick={() => {
                const precioUnit = merma.precio_unitario || 0
                const reconteos = (merma.reconteos || []).map((r, i) =>
                  i === (merma.reconteos.length - 1)
                    ? { ...r, estado: 'completado', cantidad_nueva: cantNum, fecha_completado: new Date().toISOString() }
                    : r
                )
                handleTransicion({
                  cantidad:      cantNum,
                  clasif_merma:  invReconteo.clasif_merma,
                  total_perdida: cantNum * precioUnit,
                  reconteos,
                  estado_tarea:  'pend_fact',
                })
              }}
              style={{ borderRadius: '8px' }}
            >
              Confirmar reconteo y devolver a FACT
            </Button>
          </div>
        )
      })()}

      {/* Auditor */}
      {canAudit && (
        <div className="space-y-3 p-4 border rounded-lg" style={{ borderRadius: '8px', borderWidth: '0.5px' }}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Auditoría</p>

          {/* Estado de requisitos */}
          <div className="space-y-1.5">
            <div className={`text-xs flex justify-between p-2 rounded ${rebajaOk ? 'bg-[#1D9E7510] text-[#1D9E75]' : 'bg-[#E24B4A10] text-[#E24B4A]'}`} style={{ borderRadius: '4px' }}>
              <span>Rebaja confirmada</span><span>{rebajaOk ? 'SÍ' : 'NO — bloquea aprobación'}</span>
            </div>
            <div className={`text-xs flex justify-between p-2 rounded ${destinosOk ? 'bg-[#1D9E7510] text-[#1D9E75]' : 'bg-[#E24B4A10] text-[#E24B4A]'}`} style={{ borderRadius: '4px' }}>
              <span>Destinos asignados: {destSum} / {merma.cantidad}</span>
              <span>{destinosOk ? 'OK' : `Faltan ${merma.cantidad - destSum}`}</span>
            </div>
          </div>

          {/* Destinos registrados */}
          {destinos.length > 0 && (
            <div className="space-y-1">
              {destinos.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-secondary/50 px-3 py-1.5 rounded" style={{ borderRadius: '6px' }}>
                  <span className="font-medium">{d.tipo}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{d.cantidad} ud.</span>
                    <button
                      className="text-[#E24B4A] hover:opacity-70 text-xs font-bold leading-none"
                      onClick={() => setDestinos(ds => ds.filter((_, j) => j !== i))}
                    >×</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Agregar destino */}
          {!destinosOk && (
            <div className="flex gap-2">
              <Select value={newDestino.tipo} onValueChange={(v) => setNewDestino(d => ({ ...d, tipo: v }))}>
                <SelectTrigger className="flex-1 h-8 text-xs" style={{ borderRadius: '6px' }}>
                  <SelectValue placeholder="Destino" />
                </SelectTrigger>
                <SelectContent>
                  {DESTINOS_MERMA.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="Cant."
                value={newDestino.cantidad}
                onChange={(e) => setNewDestino(d => ({ ...d, cantidad: e.target.value }))}
                className="w-20 h-8 text-xs"
                style={{ borderRadius: '6px' }}
              />
              <Button
                size="sm" variant="outline"
                className="h-8 px-3 text-xs"
                disabled={!newDestino.tipo || !newDestino.cantidad || Number(newDestino.cantidad) <= 0 || destSum + Number(newDestino.cantidad) > merma.cantidad}
                onClick={() => {
                  setDestinos(ds => [...ds, { tipo: newDestino.tipo, cantidad: Number(newDestino.cantidad) }])
                  setNewDestino({ tipo: '', cantidad: '' })
                }}
                style={{ borderRadius: '6px' }}
              >+</Button>
            </div>
          )}

          <Textarea placeholder="Nota del auditor" value={auditorNota} onChange={(e) => setAuditorNota(e.target.value)} style={{ borderRadius: '8px' }} />

          <div className="flex gap-2">
            <Button size="sm" disabled={!canApprove || isUpdating} onClick={async () => {
              if (!await confirmDialog('Se completará el proceso y no podrá revertirse.', { title: '¿Aprobar y completar esta merma?' })) return;
              handleTransicion({ destinos, nota_auditor: auditorNota, auditor_id: user?.email, auditor_nombre: user?.full_name, auditoria_fecha: format(new Date(), 'yyyy-MM-dd'), estado_tarea: 'completado' });
            }} style={{ borderRadius: '8px' }}>
              {isUpdating ? 'Guardando...' : canApprove ? 'Aprobar y completar' : 'Bloqueado'}
            </Button>
            <Button size="sm" variant="outline" disabled={isUpdating} onClick={() => handleTransicion({ nota_auditor: auditorNota, auditoria_fecha: format(new Date(), 'yyyy-MM-dd'), estado_tarea: 'devuelto' })} style={{ borderRadius: '8px' }}>Devolver</Button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}