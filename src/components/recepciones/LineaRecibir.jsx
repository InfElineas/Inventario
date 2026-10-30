import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import AlertBanner from '@/components/shared/AlertBanner';
import { Camera, Check, Loader2, X } from 'lucide-react';
import CamaraFoto from './CamaraFoto';

/** A partir de aquí la merma de origen deja de ser un roce del transporte. */
const MERMA_PARA_DEVOLVER = 0.15;

/**
 * Una línea del pedido, tal como se recibe en el muelle.
 *
 * Lo que NO está aquí es tan importante como lo que está: no se ve cuánto se
 * pidió. Teniendo el número delante, contar se convierte en comprobar que
 * cuadra, y lo que acaba en el sistema es lo que decía el pedido en vez de lo
 * que traía la caja. La diferencia aparece después, cuando ya está contado.
 *
 * Lo demás es lo que inventario confirma contra lo que tiene en la mano:
 * gramaje, vencimiento, cuántas unidades trae la caja y una foto de la
 * presentación. Solo la cantidad frena la confirmación —y el código completo
 * si el producto es nuevo—; el resto se guarda si está, porque un camión
 * esperando es como se consiguen datos inventados.
 */
export default function LineaRecibir({ linea, producto, nuevo, onConfirmar, onCancelar }) {
  const [cantidad, setCantidad] = useState('');
  const [gramaje, setGramaje] = useState(linea.gramaje ?? '');
  const [porCaja, setPorCaja] = useState(linea.unidades_por_caja ?? '');
  const [vence, setVence] = useState(linea.fecha_vencimiento ?? '');
  const [codigo, setCodigo] = useState(linea.codigo_completo ?? linea.producto_codigo ?? '');
  const [merma, setMerma] = useState('');
  const [calidadOk, setCalidadOk] = useState(true);
  const [notaCalidad, setNotaCalidad] = useState('');
  const [foto, setFoto] = useState(null);
  const [camara, setCamara] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // El código completo solo se exige en los nuevos: de los que ya están en el
  // catálogo lo tenemos, y pedirlo otra vez es teclear por teclear.
  const falta = cantidad === '' || (nuevo && !codigo.trim());

  const recibidas = Number(cantidad) || 0;
  const pctMerma = recibidas > 0 ? (Number(merma) || 0) / recibidas : 0;
  const devolver = pctMerma > MERMA_PARA_DEVOLVER;

  const confirmar = async () => {
    setGuardando(true);
    try {
      await onConfirmar({
        cant_recibida: recibidas,
        gramaje: String(gramaje).trim(),
        unidades_por_caja: Number(porCaja) || 0,
        fecha_vencimiento: vence,
        codigo_completo: codigo.trim(),
        cant_merma_origen: Number(merma) || 0,
        recomienda_devolucion: devolver,
        calidad_ok: calidadOk,
        nota_calidad: notaCalidad.trim(),
        foto,
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="p-4 rounded-lg border space-y-3 bg-secondary/30"
      style={{ borderRadius: '10px', borderWidth: '0.5px' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{linea.producto_nombre}</p>
          <p className="text-xs text-muted-foreground">{linea.producto_codigo}</p>
        </div>
        <EstadoTkc producto={producto} nuevo={nuevo} />
      </div>

      {/* Dos columnas en el móvil, que es donde se cuenta: con una sola hay
          que bajar media pantalla para cada campo. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          Cantidad recibida *
          <Input type="number" min="0" value={cantidad} autoFocus
            onChange={(e) => setCantidad(e.target.value)} style={{ borderRadius: '8px' }} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Gramaje
          <Input value={gramaje} placeholder="370 ml, 500 g…"
            onChange={(e) => setGramaje(e.target.value)} style={{ borderRadius: '8px' }} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Unidades por caja
          <Input type="number" min="0" value={porCaja}
            onChange={(e) => setPorCaja(e.target.value)} style={{ borderRadius: '8px' }} />
        </label>
        <label className="col-span-2 lg:col-span-1 space-y-1 text-xs text-muted-foreground">
          Fecha de vencimiento
          <Input type="date" value={vence}
            onChange={(e) => setVence(e.target.value)} style={{ borderRadius: '8px' }} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Merma de origen
          <Input type="number" min="0" value={merma}
            onChange={(e) => setMerma(e.target.value)} style={{ borderRadius: '8px' }} />
        </label>
      </div>

      {devolver && (
        <AlertBanner variant="danger"
          message={`La merma de origen (${(pctMerma * 100).toFixed(0)}%) supera el 15% de lo recibido. Se recomienda devolver este ítem al proveedor.`} />
      )}

      {nuevo && (
        <label className="block space-y-1 text-xs text-muted-foreground">
          Código completo * <span className="text-[#BA7517]">— el producto no está en el catálogo</span>
          <Input value={codigo} onChange={(e) => setCodigo(e.target.value)}
            placeholder="Código de barras completo, tal como viene en el envase"
            style={{ borderRadius: '8px' }} />
        </label>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <CamaraFoto abierta={camara} onCerrar={() => setCamara(false)} onTomar={setFoto} />
        <Button variant="outline" size="sm" onClick={() => setCamara(true)} style={{ borderRadius: '8px' }}>
          <Camera className="w-4 h-4 mr-1.5" /> {foto ? 'Repetir foto' : 'Foto de la presentación'}
        </Button>
        {foto && (
          <div className="flex items-center gap-2">
            <img src={foto} alt="Presentación del producto"
              className="w-12 h-12 object-cover rounded" style={{ borderRadius: '6px' }} />
            <button onClick={() => setFoto(null)}
              className="text-xs text-muted-foreground hover:text-[#E24B4A]">Quitar</button>
          </div>
        )}

        <div className="flex gap-2 ml-auto">
          <Button size="sm" variant={calidadOk ? 'default' : 'outline'}
            onClick={() => setCalidadOk(true)} style={{ borderRadius: '8px' }}>
            <Check className="w-3.5 h-3.5 mr-1" /> Calidad OK
          </Button>
          <Button size="sm" variant={!calidadOk ? 'destructive' : 'outline'}
            onClick={() => setCalidadOk(false)} style={{ borderRadius: '8px' }}>
            <X className="w-3.5 h-3.5 mr-1" /> Deficiente
          </Button>
        </div>
      </div>

      {!calidadOk && (
        <Textarea placeholder="Qué le pasa al producto..." value={notaCalidad}
          onChange={(e) => setNotaCalidad(e.target.value)} style={{ borderRadius: '8px' }} />
      )}

      <div className="flex justify-end gap-2">
        {onCancelar && (
          <Button variant="ghost" size="sm" onClick={onCancelar} style={{ borderRadius: '8px' }}>
            <X className="w-4 h-4 mr-1.5" /> Cancelar
          </Button>
        )}
        <Button size="sm" onClick={confirmar} disabled={falta || guardando}
          style={{ borderRadius: '8px' }}>
          {guardando
            ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Guardando…</>
            : <><Check className="w-4 h-4 mr-1.5" /> Confirmar</>}
        </Button>
      </div>
    </div>
  );
}

/**
 * Qué sabe el catálogo de este producto.
 *
 * Que no esté es la información que más vale aquí: significa que nadie lo ha
 * dado de alta en TKC todavía y que lo que se teclee ahora es lo único que va
 * a haber de él.
 */
function EstadoTkc({ producto, nuevo }) {
  if (nuevo) {
    return (
      <span className="shrink-0 text-xs px-2 py-1 rounded bg-[#BA751714] text-[#BA7517] font-medium"
        style={{ borderRadius: '6px' }}>
        Nuevo · sin anuncio en TKC
      </span>
    );
  }

  const estado = producto?.estado_anuncio ?? '—';
  const activo = estado === 'ACTIVADO';
  return (
    <span className={`shrink-0 text-xs px-2 py-1 rounded font-medium ${
      activo ? 'bg-[#3E9B4F14] text-[#3E9B4F]' : 'bg-secondary text-muted-foreground'
    }`} style={{ borderRadius: '6px' }}>
      TKC: {estado}
      {producto?.id_tienda ? ` · ${producto.id_tienda}` : ''}
    </span>
  );
}
