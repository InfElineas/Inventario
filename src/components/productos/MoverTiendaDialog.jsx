import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AlertBanner from '@/components/shared/AlertBanner';
import { useConfirm } from '@/lib/useConfirm';
import { planearTienda, ejecutarTienda, esperarTrabajo } from '@/services/tiendaService';
import { warehouseName } from '@/services/tkc/warehouses';
import { Loader2, ArrowUpFromLine, ArrowDownToLine } from 'lucide-react';

/** Mismo aspecto que los desplegables del catálogo. */
const FILTER_CLS = 'w-full appearance-none bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground';

/**
 * Mover un producto entre el almacén y el piso de tienda.
 *
 * Dos pasos separados, como en la herramienta de transferencias: «Analizar»
 * dice qué pasaría sin tocar nada, y «Ejecutar» mueve la existencia en TKC.
 * No se encadenan: entre los dos hay una persona mirando, porque el segundo no
 * tiene deshacer.
 *
 * El análisis puede proponer MENOS de lo pedido —si la tienda o el almacén no
 * dan para tanto—, y eso es un resultado válido, no un error: por eso se
 * enseña el plan antes de dejar ejecutar.
 */

const MODULOS = {
  subir: {
    titulo: 'Subir a tienda',
    descripcion: 'Mueve existencia del almacén al piso de tienda en TKC.',
    icono: ArrowUpFromLine,
    disponible: (p) => Number(p.enAlmacen ?? 0),
    etiquetaDisponible: 'en almacén',
    modos: [
      { valor: 'integro', etiqueta: 'Íntegro — sube lo pedido' },
      { valor: 'reserva', etiqueta: 'Reserva — deja el resguardo en almacén' },
    ],
  },
  bajar: {
    titulo: 'Bajar de tienda',
    descripcion: 'Devuelve existencia del piso de tienda al almacén en TKC.',
    icono: ArrowDownToLine,
    disponible: (p) => Number(p.enTienda ?? 0),
    etiquetaDisponible: 'en tienda',
    modos: [
      { valor: 'integro', etiqueta: 'Íntegro — baja lo pedido' },
      { valor: 'porcentaje', etiqueta: 'Porcentaje — tope sobre lo que hay' },
    ],
  },
};

/** Una por envío distinto; repetir el mismo la reutiliza y TKC no duplica. */
const nuevaClave = () => `tienda-${crypto.randomUUID()}`;

export default function MoverTiendaDialog({ modulo, producto, almacen, onHecho, onClose }) {
  const cfg = MODULOS[modulo] ?? MODULOS.subir;
  const { confirmDialog, ConfirmDialogNode } = useConfirm();

  const disponible = cfg.disponible(producto ?? {});
  const [cantidad, setCantidad] = useState(String(disponible || 1));
  const [plan, setPlan] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(null);   // 'analizar' | 'ejecutar'
  const [clave, setClave] = useState(nuevaClave);
  // Sus dos modos: «integro» mueve lo pedido —y lo recorta si no llega, que
  // sigue siendo éxito— y «porcentaje» pone un tope sobre lo que hay.
  const [modo, setModo] = useState('integro');   // válido en los dos sentidos
  const [porcentaje, setPorcentaje] = useState('30');

  if (!producto) return null;

  const n = Number(cantidad);
  const cantidadValida = Number.isInteger(n) && n > 0;
  const lineas = [{ code: producto.codigo, quantity: n }];
  const pct = Number(porcentaje);
  const porcentajeValido = modo !== 'porcentaje' || (Number.isInteger(pct) && pct >= 1 && pct <= 100);
  const envio = { almacen, lineas, modo, ...(modo === 'porcentaje' ? { porcentaje: pct } : {}) };

  const correr = async (paso, fn) => {
    setOcupado(paso);
    setError('');
    try {
      const inicio = await fn();
      // Es un trabajo asíncrono: el 202 solo trae el id.
      const id = inicio?.jobId ?? inicio?.id;
      const fin = id ? await esperarTrabajo(id) : inicio;
      return fin;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setOcupado(null);
    }
  };

  const analizar = async () => {
    setResultado(null);
    const r = await correr('analizar', () => planearTienda(modulo, envio));
    if (r) setPlan(r);
  };

  const ejecutar = async () => {
    const ok = await confirmDialog(
      `Se moverán ${n} unidades de «${producto.nombre}» en TKC. Esto no se puede deshacer desde aquí.`,
      { title: `¿${cfg.titulo}?`, destructive: modulo === 'bajar' },
    );
    if (!ok) return;

    const r = await correr('ejecutar', () =>
      ejecutarTienda(modulo, { ...envio, idempotencyKey: clave }));
    if (r) {
      setResultado(r);
      // Clave nueva para el siguiente envío: reutilizarla devolvería lo ya
      // hecho en vez de mover otra vez.
      setClave(nuevaClave());
      onHecho?.();
    }
  };

  const Icono = cfg.icono;

  return (
    <>
      {ConfirmDialogNode}
      <Dialog open onOpenChange={(abierto) => { if (!abierto) onClose(); }}>
        <DialogContent className="max-w-lg">
          <DialogTitle className="text-sm font-medium flex items-center gap-2">
            <Icono className="w-4 h-4" /> {cfg.titulo} — {warehouseName(almacen)}
          </DialogTitle>
          <DialogDescription className="text-xs">{cfg.descripcion}</DialogDescription>

          <div className="space-y-4">
            <div className="bg-secondary/50 rounded-lg p-3 space-y-1" style={{ borderRadius: '8px' }}>
              <p className="text-sm font-medium line-clamp-2">{producto.nombre}</p>
              <p className="text-xs text-muted-foreground font-mono">{producto.codigo}</p>
              <p className="text-xs text-muted-foreground">
                EF {producto.ef ?? 0} · A {producto.enAlmacen ?? 0} · T {producto.enTienda ?? 0}
                {' · '}<span className="text-foreground">{disponible} {cfg.etiquetaDisponible}</span>
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 text-xs text-muted-foreground">
                Cantidad a mover
                <Input type="number" min="1" value={cantidad} inputMode="numeric"
                  onChange={(e) => { setCantidad(e.target.value); setPlan(null); setResultado(null); }}
                  style={{ borderRadius: '8px' }} />
              </label>
              <label className="block space-y-1.5 text-xs text-muted-foreground">
                Modo
                <select value={modo} className={FILTER_CLS}
                  onChange={(e) => { setModo(e.target.value); setPlan(null); setResultado(null); }}>
                  {cfg.modos.map((m) => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
                </select>
              </label>
            </div>

            {modo === 'reserva' && (
              <AlertBanner variant="info"
                message="La reserva la calcula la herramienta de transferencias: sube lo que sobra y deja en almacén el resguardo que le corresponde al producto." />
            )}

            {modo === 'porcentaje' && (
              <label className="block space-y-1.5 text-xs text-muted-foreground max-w-[12rem]">
                Porcentaje (1–100)
                <Input type="number" min="1" max="100" value={porcentaje} inputMode="numeric"
                  onChange={(e) => { setPorcentaje(e.target.value); setPlan(null); setResultado(null); }}
                  style={{ borderRadius: '8px' }} />
              </label>
            )}

            {disponible === 0 && (
              <AlertBanner variant="warning"
                message={`No hay nada ${cfg.etiquetaDisponible} según nuestra copia. El análisis lo comprobará contra TKC.`} />
            )}

            {error && <AlertBanner variant="danger" message={error} />}

            {plan && !resultado && (
              <div className="rounded-lg border border-border p-3 text-xs space-y-1" style={{ borderRadius: '8px' }}>
                <p className="font-medium text-foreground">Lo que haría</p>
                <pre className="whitespace-pre-wrap text-muted-foreground">{JSON.stringify(plan.result ?? plan, null, 2)}</pre>
              </div>
            )}

            {resultado && (
              <AlertBanner variant="success"
                message={resultado.detail ?? `Movimiento ejecutado en ${warehouseName(almacen)}.`} />
            )}

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={onClose} style={{ borderRadius: '8px' }}>
                {resultado ? 'Cerrar' : 'Cancelar'}
              </Button>
              {!resultado && (
                <>
                  <Button variant="outline" disabled={!cantidadValida || !porcentajeValido || ocupado} onClick={analizar}
                    style={{ borderRadius: '8px' }}>
                    {ocupado === 'analizar' && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                    Analizar
                  </Button>
                  {/* Solo tras ver el plan: ejecutar sin mirarlo es mover a ciegas. */}
                  <Button disabled={!plan || !cantidadValida || !porcentajeValido || ocupado} onClick={ejecutar}
                    style={{ borderRadius: '8px' }}>
                    {ocupado === 'ejecutar' && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                    Ejecutar
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
