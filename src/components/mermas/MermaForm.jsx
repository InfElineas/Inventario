import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import ProductSearch from '@/components/shared/ProductSearch';
import BarcodeScanner from '@/components/inventario/BarcodeScanner';
import AlertBanner from '@/components/shared/AlertBanner';
import { ALL_CLASIF_MERMA, CLASIF_MERMA_SIN_FACT, DESTINOS_MERMA } from '@/lib/constants';
import { Save, ScanLine } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/api/supabaseClient';
import { useAlmacen } from '@/lib/useAlmacen';

// Extraída del formulario para poder probarla sin renderizar el componente.
export function validateMerma({ producto, cantidad, clasif, fechaInv, notas }) {
  const cant = Number(cantidad);
  if (!producto)                           return 'Selecciona un producto';
  if (!cantidad || isNaN(cant))            return 'Cantidad requerida';
  if (!Number.isInteger(cant) || cant < 1) return 'Cantidad debe ser un número entero positivo';
  if (cant > 100_000)                      return 'Cantidad no puede superar 100.000';
  const ef = producto?.exist_fisica ?? 0;
  if (cant > ef)                            return `Cantidad (${cant}) supera la existencia física del producto (${ef})`;
  if (!clasif)                              return 'Clasificación requerida';
  if (!fechaInv)                            return 'Fecha requerida';
  if (notas.length > 500)                   return 'Notas: máximo 500 caracteres';
  return null;
}

export default function MermaForm({ user, onSubmit, onCancel, isPending = false }) {
  const { almacen } = useAlmacen();
  const [producto, setProducto] = useState(null);
  const [cantidad, setCantidad] = useState('');
  const [clasif, setClasif] = useState('');
  const [destino, setDestino] = useState('');
  const [fvLote, setFvLote] = useState('');
  const [rebajaConfirmada, setRebajaConfirmada] = useState(false);
  const [fechaRebaja, setFechaRebaja] = useState('');
  const [notas, setNotas] = useState('');
  const [fechaInv, setFechaInv] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showScanner, setShowScanner] = useState(false);
  const [validError, setValidError] = useState('');

  const handleScanResult = async (code) => {
    setShowScanner(false);
    const trimmed = code.trim();
    let q = supabase
      .from('productos')
      .select('id, nombre, codigo_producto, id_tienda, exist_fisica, precio_costo, suministrador, almacen_num')
      .eq('activo', true)
      .eq('codigo_producto', trimmed);
    if (almacen) q = q.eq('almacen_num', almacen);
    const { data } = await q.limit(1);
    if (data?.[0]) { setProducto(data[0]); return; }
    alert(`No se encontró producto con código: ${trimmed}`);
  };

  const sinFact = CLASIF_MERMA_SIN_FACT.includes(clasif);
  const precioUnit = producto?.precio_costo ?? producto?.precio ?? 0;
  const totalPerdida = (Number(cantidad) || 0) * precioUnit;

  const handleSubmit = () => {
    const err = validateMerma({ producto, cantidad, clasif, fechaInv, notas });
    setValidError(err || '');
    if (err) return;
    const requiereFact = !sinFact;
    onSubmit({
      producto_id: producto.id,
      producto_nombre: producto.nombre,
      producto_codigo: producto.codigo_producto,
      suministrador: producto.suministrador,
      almacen_num: producto.almacen_num,
      fecha_inv: fechaInv,
      especialista_id: user?.email,
      especialista_nombre: user?.full_name,
      cantidad: Number(cantidad),
      clasif_merma: clasif,
      requiere_fact: requiereFact,
      destino_final: destino,
      rebaja_confirmada: rebajaConfirmada,
      fecha_rebaja_tienda: rebajaConfirmada && fechaRebaja ? fechaRebaja : null,
      notas,
      precio_unitario: precioUnit,
      total_perdida: totalPerdida,
      estado_tarea: requiereFact ? 'pend_fact' : 'en_auditoria',
      fecha_vencimiento_lote: fvLote || null,
      destinos: [],
      reconteos: [],
    });
  };

  return (
    <div className="space-y-5">
      {showScanner ? (
        <BarcodeScanner onResult={handleScanResult} onClose={() => setShowScanner(false)} />
      ) : (
        <div className="flex gap-2">
          <div className="flex-1">
            <ProductSearch onSelect={setProducto} />
          </div>
          <Button type="button" variant="outline" onClick={() => setShowScanner(true)} title="Escanear código de barras" style={{ borderRadius: '8px' }}>
            <ScanLine className="w-4 h-4" />
          </Button>
        </div>
      )}

      {producto && (
        <>
          <div className="bg-secondary/50 rounded-lg p-4 grid grid-cols-4 gap-4" style={{ borderRadius: '8px' }}>
            <div><p className="text-[10px] text-muted-foreground uppercase">Producto</p><p className="text-sm font-medium">{producto.nombre}</p></div>
            <div><p className="text-[10px] text-muted-foreground uppercase">Código</p><p className="text-sm font-medium">{producto.codigo_producto}</p></div>
            <div><p className="text-[10px] text-muted-foreground uppercase">EF</p><p className="text-sm font-medium">{producto.exist_fisica}</p></div>
            <div><p className="text-[10px] text-muted-foreground uppercase">Precio costo</p><p className="text-sm font-medium">${precioUnit}</p></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] text-muted-foreground">Cantidad</label>
              <Input type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} style={{ borderRadius: '8px' }} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">FV del lote (opcional)</label>
              <Input type="date" value={fvLote} onChange={(e) => setFvLote(e.target.value)} style={{ borderRadius: '8px' }} />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground">Clasificación de merma</label>
            <Select value={clasif} onValueChange={setClasif}>
              <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue placeholder="Seleccionar clasificación" /></SelectTrigger>
              <SelectContent className="max-h-60">
                {ALL_CLASIF_MERMA.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {clasif && (
            <AlertBanner
              variant={sinFact ? 'info' : 'warning'}
              message={sinFact ? 'Ruta: INV → Auditor (sin FACT)' : 'Ruta: INV → FACT → Auditor'}
            />
          )}

          <div>
            <label className="text-[11px] text-muted-foreground">Destino final</label>
            <Select value={destino} onValueChange={setDestino}>
              <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue placeholder="Seleccionar destino" /></SelectTrigger>
              <SelectContent>
                {DESTINOS_MERMA.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            <Checkbox checked={rebajaConfirmada} onCheckedChange={setRebajaConfirmada} />
            <span className="text-sm">Confirmar que se rebajó en sistema externo</span>
            {rebajaConfirmada && (
              <Input type="date" value={fechaRebaja} onChange={(e) => setFechaRebaja(e.target.value)} className="w-44" style={{ borderRadius: '8px' }} />
            )}
          </div>

          {Number(cantidad) > 200 && <AlertBanner variant="danger" message={`Cantidad alta: ${cantidad} unidades. Verificar antes de continuar.`} />}
          {totalPerdida > 500 && <AlertBanner variant="danger" message={`Valor alto: $${totalPerdida.toFixed(2)}. Verificar antes de continuar.`} />}

          <div className="p-3 bg-secondary/50 rounded-lg flex items-center gap-4" style={{ borderRadius: '8px' }}>
            <span className="text-xs text-muted-foreground">Pérdida estimada:</span>
            <span className="text-lg font-medium text-[#E24B4A]">${totalPerdida.toFixed(2)}</span>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">Fecha del registro *</label>
            <Input type="date" value={fechaInv} onChange={(e) => setFechaInv(e.target.value)} required style={{ borderRadius: '8px' }} />
          </div>
          <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas..." maxLength={500} style={{ borderRadius: '8px' }} />

          {validError && (
            <p className="text-xs text-[#E24B4A] bg-[#E24B4A]/10 px-3 py-2 rounded-md">{validError}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button onClick={handleSubmit} disabled={!producto || isPending} style={{ borderRadius: '8px' }}>
              <Save className="w-4 h-4 mr-1.5" /> {isPending ? 'Registrando...' : 'Registrar merma'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}