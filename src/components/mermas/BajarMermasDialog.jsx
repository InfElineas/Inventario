import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import AlertBanner from '@/components/shared/AlertBanner';
import { useConfirm } from '@/lib/useConfirm';
import { base44 } from '@/api/base44Client';
import { CLASIF_MERMA_SIN_FACT } from '@/lib/constants';
import { planearTienda, ejecutarTienda, esperarTrabajo } from '@/services/tiendaService';
import { leerPlan, Plan } from '@/components/productos/MoverTiendaDialog';
import { warehouseName } from '@/services/tkc/warehouses';
import { Loader2, ArrowDownToLine, RefreshCw } from 'lucide-react';

/**
 * Bajar de tienda lo que se registró como merma.
 *
 * Una merma es mercancía que ya no se puede vender, y mientras siga contada en
 * el piso de tienda la existencia dice que hay algo que no hay. Hasta ahora
 * había que ir producto por producto a la otra plataforma; aquí se bajan las
 * mermas seleccionadas de una vez.
 *
 * Las mismas dos etapas que mover un producto suelto: «Analizar» dice qué
 * pasaría y «Ejecutar» lo hace. El plan se pide solo al abrir, porque no hay
 * nada que configurar: las cantidades son las de las mermas.
 *
 * Un solo almacén por envío: la API de transferencias recibe un `warehouse`.
 * Quien llama se encarga de no mezclarlos.
 */

const nuevaClave = () => `merma-${crypto.randomUUID()}`;

/**
 * A quién le toca la merma una vez bajada de tienda.
 *
 * Algunas clasificaciones no pasan por facturación —no hay nada que facturar—
 * y van directas a auditoría. Es la misma regla que enseña el formulario al
 * registrarla, leída de la clasificación guardada.
 */
function siguienteEstado(merma) {
  const sinFact = CLASIF_MERMA_SIN_FACT.includes(merma.clasif_merma);
  return sinFact ? 'en_auditoria' : 'pend_fact';
}

/** `CODIGO` + cantidad, una línea por merma. Dos mermas del mismo producto se suman. */
export function aLineas(mermas) {
  const porCodigo = new Map();
  for (const m of mermas ?? []) {
    const code = String(m.producto_codigo ?? '').trim();
    const quantity = Math.abs(Number(m.cantidad) || 0);
    if (!code || quantity === 0) continue;
    porCodigo.set(code, (porCodigo.get(code) ?? 0) + quantity);
  }
  return [...porCodigo].map(([code, quantity]) => ({ code, quantity }));
}

export default function BajarMermasDialog({ mermas, almacen, onHecho, onClose }) {
  const { confirmDialog, ConfirmDialogNode } = useConfirm();
  const [plan, setPlan] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(null);   // 'analizar' | 'ejecutar'
  const [clave, setClave] = useState(nuevaClave);
  const [intento, setIntento] = useState(0);
  const [sinAnotar, setSinAnotar] = useState([]);   // se bajaron, no se pudo marcarlas

  const lineas = aLineas(mermas);
  const envio = { almacen, lineas, modo: 'integro' };
  const firma = JSON.stringify(envio);

  // El análisis se pide al abrir: aquí no hay nada que teclear antes.
  useEffect(() => {
    if (lineas.length === 0 || resultado) return undefined;
    let vivo = true;
    (async () => {
      setOcupado('analizar');
      setError('');
      try {
        const inicio = await planearTienda('bajar', JSON.parse(firma));
        const id = inicio?.jobId ?? inicio?.id;
        const fin = id ? await esperarTrabajo(id) : inicio;
        if (vivo) setPlan(fin);
      } catch (e) {
        if (vivo) setError(e.message);
      } finally {
        if (vivo) setOcupado(null);
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, intento, resultado]);

  const analisis = leerPlan(plan);

  const ejecutar = async () => {
    const ok = await confirmDialog(
      `Se bajarán ${analisis.concedido} unidades de ${lineas.length} ` +
      `${lineas.length === 1 ? 'producto' : 'productos'} en ${warehouseName(almacen)}. ` +
      'Esto escribe en TKC y no se puede deshacer desde aquí. Comprueba antes el detalle: ' +
      'si bajas de más, la existencia del piso de tienda deja de cuadrar hasta el próximo conteo.',
      { title: '¿Bajar estas mermas de tienda?', destructive: true },
    );
    if (!ok) return;

    setOcupado('ejecutar');
    setError('');
    try {
      const inicio = await ejecutarTienda('bajar', { ...envio, idempotencyKey: clave });
      const id = inicio?.jobId ?? inicio?.id;
      const fin = id ? await esperarTrabajo(id) : inicio;
      setResultado(fin);
      setClave(nuevaClave());

      // La merma queda marcada como rebajada porque ACABA de rebajarse, no
      // porque alguien dijera que sí: eso es lo que mira el auditor antes de
      // cerrarla. Si no se puede anotar, el movimiento ya está hecho en TKC y
      // hay que decirlo en vez de callarlo.
      const fecha = new Date().toISOString().slice(0, 10);
      const fallos = [];
      for (const m of mermas) {
        try {
          await base44.entities.Merma.update(m.id, {
            rebaja_confirmada: true,
            fecha_rebaja_tienda: fecha,
            // Y aquí deja de ser asunto de inventario. Antes la merma nacía en
            // «pendiente FACT» con la mercancía todavía en el piso de tienda:
            // facturación recibía algo que aún no estaba hecho.
            ...(m.estado_tarea === 'en_curso'
              ? { estado_tarea: siguienteEstado(m) }
              : {}),
          });
        } catch {
          fallos.push(m.producto_nombre || m.producto_codigo || m.id);
        }
      }
      setSinAnotar(fallos);
      onHecho?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(null);
    }
  };

  const unidades = lineas.reduce((s, l) => s + l.quantity, 0);

  return (
    <>
      {ConfirmDialogNode}
      <Dialog open onOpenChange={(abierto) => { if (!abierto) onClose(); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogTitle className="text-sm font-medium flex items-center gap-2">
            <ArrowDownToLine className="w-4 h-4" /> Bajar mermas de tienda — {warehouseName(almacen)}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Devuelve al almacén lo que se registró como merma, para que deje de contar en el piso de tienda.
          </DialogDescription>

          <div className="space-y-4">
            <div className="bg-secondary/50 rounded-lg p-3 text-xs space-y-1" style={{ borderRadius: '8px' }}>
              <p className="text-sm font-medium">
                {lineas.length} {lineas.length === 1 ? 'producto' : 'productos'} · {unidades} unidades
              </p>
              <p className="text-muted-foreground">
                De {mermas.length} {mermas.length === 1 ? 'merma registrada' : 'mermas registradas'}.
                Dos mermas del mismo producto se suman en una línea.
              </p>
            </div>

            {lineas.length === 0 && (
              <AlertBanner variant="warning"
                message="Ninguna de las mermas seleccionadas tiene código y cantidad: no hay nada que bajar." />
            )}

            {error && <AlertBanner variant="danger" message={error} />}

            {ocupado === 'analizar' && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Preguntando a TKC qué pasaría…
              </p>
            )}

            {plan && !resultado && ocupado !== 'analizar' && <Plan {...analisis} modulo="bajar" />}

            {resultado && (
              <AlertBanner variant="success"
                message={resultado.detail ?? `Mermas bajadas de tienda en ${warehouseName(almacen)}.`} />
            )}

            {sinAnotar.length > 0 && (
              <AlertBanner variant="warning"
                message={`Se bajaron en TKC, pero no se pudo marcarlas como rebajadas: ${sinAnotar.join(', ')}. `
                  + 'El auditor las verá sin la rebaja confirmada.'} />
            )}

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={onClose} style={{ borderRadius: '8px' }}>
                {resultado ? 'Cerrar' : 'Cancelar'}
              </Button>
              {!resultado && (
                <>
                  <Button variant="outline" disabled={lineas.length === 0 || ocupado}
                    onClick={() => setIntento((i) => i + 1)} style={{ borderRadius: '8px' }}>
                    <RefreshCw className={`w-4 h-4 mr-1.5 ${ocupado === 'analizar' ? 'animate-spin' : ''}`} />
                    Volver a analizar
                  </Button>
                  {/* Como en el catálogo: solo tras ver el plan, y solo si
                      concede algo. */}
                  <Button disabled={!plan || analisis.concedido === 0 || ocupado} onClick={ejecutar}
                    style={{ borderRadius: '8px' }}>
                    {ocupado === 'ejecutar' && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                    Bajar de tienda
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
