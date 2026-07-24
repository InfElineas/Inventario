import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { supabaseExterna } from '@/api/externalSupabase';
import { useAlmacen } from '@/lib/useAlmacen';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ProductSearch from '@/components/shared/ProductSearch';
import AlertBanner from '@/components/shared/AlertBanner';
import BarcodeScanner from '@/components/inventario/BarcodeScanner';
import { Plus, Trash2, Save, X, ScanLine, Package } from 'lucide-react';
import { format } from 'date-fns';

const CLASIF_AJUSTE = ['Faltante por deterioro', 'Faltante por robo', 'Faltante sin justificar', 'Sobrante por transferencia', 'Sobrante por devolución', 'Error de sistema', 'Ajuste administrativo'];

function ProductThumb({ fotos, nombre }) {
  const [err, setErr] = useState(false);
  const src = Array.isArray(fotos) && fotos.length > 0 ? fotos[0] : null;
  if (!src || err) {
    return (
      <div className="w-16 h-16 rounded-lg flex-shrink-0 border border-border bg-muted flex items-center justify-center">
        <Package className="w-6 h-6 text-muted-foreground/40" />
      </div>
    );
  }
  return (
    <img src={src} alt={nombre} onError={() => setErr(true)}
      className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border border-border bg-muted" />
  );
}

// Extraída del formulario para poder probarla sin renderizar el componente.
export function validateInventario({ producto, detalles, fechaInv, notas }) {
  if (!producto) return 'Selecciona un producto';
  for (const d of detalles) {
    const q = Number(d.cantidad);
    if (isNaN(q) || !isFinite(q) || q < 0) return 'Cantidades deben ser números no negativos';
    if (q > 100_000)                        return 'Cantidad máxima por línea: 100.000';
  }
  if (!fechaInv)             return 'Fecha requerida';
  if (notas.length > 500)    return 'Notas: máximo 500 caracteres';
  return null;
}

export default function InventarioForm({ user, onSubmit, onCancel, isPending = false }) {
  const { almacen }         = useAlmacen();
  const [producto, setProducto] = useState(null);
  const [detalles, setDetalles] = useState([{ fecha_vencimiento: '', no_lote: '', cantidad: 0 }]);
  const [clasifAjuste, setClasifAjuste] = useState('');
  const [notas, setNotas] = useState('');
  const [fechaInv, setFechaInv] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showScanner, setShowScanner] = useState(false);
  const [validError, setValidError] = useState('');
  const [pendingData, setPendingData] = useState(null);

  const handleScanResult = async (code) => {
    setShowScanner(false);
    const trimmed = code.trim();

    // 1. Buscar en BD interna
    let q = supabase
      .from('productos')
      .select('id, nombre, codigo_producto, id_tienda, exist_fisica, almacen, tienda, precio_costo, suministrador, fotos, almacen_num')
      .eq('activo', true)
      .eq('codigo_producto', trimmed);
    if (almacen) q = q.eq('almacen_num', almacen);
    const { data } = await q.limit(1);

    if (data?.[0]) {
      setProducto(data[0]);
      return;
    }

    // 2. Verificar en catálogo externo para dar mensaje útil
    if (supabaseExterna) {
      const { data: ext } = await supabaseExterna
        .from('products')
        .select('nombre')
        .eq('codigo', trimmed)
        .limit(1);
      if (ext?.[0]) {
        alert(`"${ext[0].nombre}" existe en el catálogo pero no está importado en el almacén${almacen ? ` ${almacen}` : ''}.`);
        return;
      }
    }

    alert(`No se encontró ningún producto con el código: ${trimmed}`);
  };

  const conteoReal = detalles.reduce((s, d) => s + (Number(d.cantidad) || 0), 0);
  const efTkc = producto?.exist_fisica || 0;
  const diferencia = conteoReal - efTkc;

  const addDetalle = () => setDetalles([...detalles, { fecha_vencimiento: '', no_lote: '', cantidad: 0 }]);
  const removeDetalle = (i) => setDetalles(detalles.filter((_, idx) => idx !== i));
  const updateDetalle = (i, field, val) => {
    const copy = [...detalles];
    copy[i] = { ...copy[i], [field]: val };
    setDetalles(copy);
  };

  const handleSubmit = () => {
    const err = validateInventario({ producto, detalles, fechaInv, notas });
    setValidError(err || '');
    if (err) return;
    const estado = diferencia === 0 ? 'completado' : 'pend_fact';
    const data = {
      producto_id: producto.id,
      producto_nombre: producto.nombre,
      producto_codigo: producto.codigo_producto,
      almacen_num: producto.almacen_num,
      suministrador: producto.suministrador,
      fecha_inv: fechaInv,
      especialista_id: user?.email,
      especialista_nombre: user?.full_name,
      exist_fisica_tkc: efTkc,
      conteo_real: conteoReal,
      diferencia,
      resultado: diferencia === 0 ? 'ok' : diferencia > 0 ? 'sobrante' : 'faltante',
      clasif_ajuste: diferencia !== 0 ? clasifAjuste : '',
      notas_inv: notas,
      estado_tarea: estado,
      detalles: detalles.filter(d => Number(d.cantidad) > 0),
    };
    if (diferencia !== 0) {
      setPendingData(data);
    } else {
      onSubmit(data);
    }
  };

  const difColor = diferencia === 0 ? 'text-[#1D9E75]' : diferencia > 0 ? 'text-[#BA7517]' : 'text-[#E24B4A]';

  // ── Pantalla de confirmación (diferencia detectada) ──────────
  if (pendingData) {
    const esSobrante = pendingData.diferencia > 0;
    const difColor   = esSobrante ? 'text-[#BA7517]' : 'text-[#E24B4A]';
    const difBg      = esSobrante ? 'bg-[#BA7517]/8 border-[#BA7517]/20' : 'bg-[#E24B4A]/8 border-[#E24B4A]/20';
    return (
      <div className="space-y-5">
        {/* Resumen del conteo */}
        <div className={`rounded-lg border p-4 space-y-3 ${difBg}`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resumen del conteo</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">EF TKC</p>
              <p className="text-xl font-semibold">{pendingData.exist_fisica_tkc}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Conteo real</p>
              <p className="text-xl font-semibold">{pendingData.conteo_real}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Diferencia</p>
              <p className={`text-xl font-semibold ${difColor}`}>
                {pendingData.diferencia > 0 ? '+' : ''}{pendingData.diferencia}
              </p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p><span className="font-medium text-foreground">Producto:</span> {pendingData.producto_nombre}</p>
            <p><span className="font-medium text-foreground">Tipo:</span> {esSobrante ? 'Sobrante' : 'Faltante'}</p>
            <p><span className="font-medium text-foreground">Clasificación:</span> {pendingData.clasif_ajuste || '—'}</p>
          </div>
        </div>

        {/* Explicación del siguiente paso */}
        <div className="rounded-lg bg-secondary/60 border border-border p-4 space-y-2">
          <p className="text-sm font-medium">¿Qué pasa después?</p>
          <ol className="space-y-1.5 text-xs text-muted-foreground list-none">
            <li className="flex gap-2">
              <span className="w-5 h-5 rounded-full bg-[#4ade80]/15 text-[#4ade80] flex items-center justify-center font-bold flex-shrink-0 text-[10px]">1</span>
              <span>El conteo queda en estado <strong className="text-foreground">Pendiente FACT</strong>.</span>
            </li>
            <li className="flex gap-2">
              <span className="w-5 h-5 rounded-full bg-[#60a5fa]/15 text-[#60a5fa] flex items-center justify-center font-bold flex-shrink-0 text-[10px]">2</span>
              <span><strong className="text-foreground">Facturación</strong> revisa la diferencia, agrega la factura o nota de ajuste y lo envía a auditoría.</span>
            </li>
            <li className="flex gap-2">
              <span className="w-5 h-5 rounded-full bg-[#a78bfa]/15 text-[#a78bfa] flex items-center justify-center font-bold flex-shrink-0 text-[10px]">3</span>
              <span><strong className="text-foreground">Auditor</strong> valida y cierra el proceso.</span>
            </li>
          </ol>
          <p className="text-xs text-muted-foreground pt-1">Puedes seguir el avance desde la tabla de inventarios.</p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPendingData(null)} style={{ borderRadius: '8px' }}>
            Editar conteo
          </Button>
          <Button onClick={() => onSubmit(pendingData)} disabled={isPending} style={{ borderRadius: '8px' }}>
            <Save className="w-4 h-4 mr-1.5" />
            {isPending ? 'Enviando…' : 'Confirmar y enviar a FACT'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Scanner toggle */}
      {showScanner ? (
        <BarcodeScanner onResult={handleScanResult} onClose={() => setShowScanner(false)} />
      ) : (
        <div className="flex gap-2">
          <div className="flex-1">
            <ProductSearch onSelect={setProducto} />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowScanner(true)}
            title="Escanear código de barras"
            style={{ borderRadius: '8px' }}
          >
            <ScanLine className="w-4 h-4" />
          </Button>
        </div>
      )}

      {producto && (
        <>
          <div className="bg-secondary/50 rounded-lg p-4 flex gap-4 items-start" style={{ borderRadius: '8px' }}>
            <ProductThumb fotos={producto.fotos} nombre={producto.nombre} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 min-w-0">
              <div className="col-span-2 sm:col-span-1"><p className="text-[10px] text-muted-foreground uppercase">Producto</p><p className="text-sm font-medium line-clamp-2">{producto.nombre}</p></div>
              <div><p className="text-[10px] text-muted-foreground uppercase">Código</p><p className="text-sm font-medium">{producto.codigo_producto}</p></div>
              <div><p className="text-[10px] text-muted-foreground uppercase">Suministrador</p><p className="text-sm font-medium">{producto.suministrador || '—'}</p></div>
              <div><p className="text-[10px] text-muted-foreground uppercase">EF TKC</p><p className="text-sm font-medium">{efTkc}</p></div>
            </div>
          </div>

          {/* Detail lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Líneas de detalle</p>
              <Button variant="outline" size="sm" onClick={addDetalle} style={{ borderRadius: '8px' }}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Agregar FV
              </Button>
            </div>
            {detalles.map((d, i) => (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_100px_36px] gap-2 items-end">
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[11px] text-muted-foreground">Fecha vencimiento</label>
                  <Input type="date" value={d.fecha_vencimiento} onChange={(e) => updateDetalle(i, 'fecha_vencimiento', e.target.value)} style={{ borderRadius: '8px' }} />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">No. lote</label>
                  <Input value={d.no_lote} onChange={(e) => updateDetalle(i, 'no_lote', e.target.value)} placeholder="Opcional" style={{ borderRadius: '8px' }} />
                </div>
                {/* En móvil: cantidad y botón comparten la celda derecha */}
                <div className="flex gap-2 items-end sm:contents">
                  <div className="flex-1 min-w-0">
                    <label className="text-[11px] text-muted-foreground">Cantidad</label>
                    <Input type="number" min="0" value={d.cantidad} onChange={(e) => updateDetalle(i, 'cantidad', e.target.value)} style={{ borderRadius: '8px' }} />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeDetalle(i)} disabled={detalles.length === 1}>
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="flex items-center gap-6 p-4 bg-secondary/50 rounded-lg" style={{ borderRadius: '8px' }}>
            <div><p className="text-[10px] text-muted-foreground uppercase">Conteo</p><p className="text-lg font-medium">{conteoReal}</p></div>
            <div><p className="text-[10px] text-muted-foreground uppercase">EF TKC</p><p className="text-lg font-medium">{efTkc}</p></div>
            <div><p className="text-[10px] text-muted-foreground uppercase">Diferencia</p><p className={`text-lg font-medium ${difColor}`}>{diferencia > 0 ? '+' : ''}{diferencia}</p></div>
          </div>

          {diferencia !== 0 && (
            <>
              <AlertBanner variant={diferencia > 0 ? 'warning' : 'danger'} message={`Diferencia detectada: ${diferencia > 0 ? 'sobrante' : 'faltante'} de ${Math.abs(diferencia)} unidades. Se requiere clasificación.`} />
              <Select value={clasifAjuste} onValueChange={setClasifAjuste}>
                <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue placeholder="Clasificación de ajuste" /></SelectTrigger>
                <SelectContent>
                  {CLASIF_AJUSTE.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )}

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">Fecha del conteo *</label>
            <Input type="date" value={fechaInv} onChange={(e) => setFechaInv(e.target.value)} required style={{ borderRadius: '8px' }} />
          </div>
          <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas del conteo..." maxLength={500} style={{ borderRadius: '8px' }} />

          {validError && (
            <p className="text-xs text-[#E24B4A] bg-[#E24B4A]/10 px-3 py-2 rounded-md">{validError}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button onClick={handleSubmit} disabled={!producto || (diferencia !== 0 && !clasifAjuste) || isPending} style={{ borderRadius: '8px' }}>
              <Save className="w-4 h-4 mr-1.5" /> {isPending ? 'Guardando...' : 'Confirmar conteo'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}