import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AlertBanner from '@/components/shared/AlertBanner';
import { useConfirm } from '@/lib/useConfirm';
import { planearTienda, ejecutarTienda, esperarTrabajo } from '@/services/tiendaService';
import { warehouseName } from '@/services/tkc/warehouses';
import { Loader2, RefreshCw, ArrowUpFromLine, ArrowDownToLine, CheckCircle2, XCircle } from 'lucide-react';

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
    verboEjecutar: 'subirán a tienda',
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
    verboEjecutar: 'bajarán al almacén',
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

/**
 * Lo que el análisis dice que pasaría, en números sueltos.
 *
 * Su API parte las líneas en `exito` y `fallido` y pone en `totalGranted` lo
 * que de verdad se movería, que puede ser menos de lo pedido.
 */
function leerPlan(plan) {
  const r = plan?.result ?? plan ?? {};
  const lineas = [...(r.exito ?? []), ...(r.fallido ?? [])]
    .sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return {
    lineas,
    concedido: Number(r.totalGranted ?? 0),
    pedido: lineas.reduce((s, l) => s + (Number(l.requested) || 0), 0),
  };
}

/**
 * El plan, en lo que le importa a quien lo mira: cuánto se mueve y, si no se
 * mueve, por qué.
 *
 * Antes salía el JSON de su API tal cual. Tenía todo, pero no lo entendía
 * nadie, y un plan que no se entiende no sirve para decidir si ejecutar.
 */
function Plan({ lineas, concedido, pedido, modulo }) {
  if (lineas.length === 0) {
    return <AlertBanner variant="warning" message="El análisis no devolvió ninguna línea. Vuelve a intentarlo." />;
  }
  const verbo = modulo === 'bajar' ? 'bajarían' : 'subirían';

  return (
    <div className="rounded-lg border border-border overflow-hidden" style={{ borderRadius: '8px' }}>
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        {concedido > 0
          ? <CheckCircle2 className="w-3.5 h-3.5 text-[#1D9E75] shrink-0" />
          : <XCircle className="w-3.5 h-3.5 text-[#E24B4A] shrink-0" />}
        <p className="text-xs font-medium">
          {concedido > 0
            ? `Se ${verbo} ${concedido} de las ${pedido} unidades pedidas.`
            : 'No se movería nada.'}
        </p>
      </div>
      <ul className="divide-y divide-border">
        {lineas.map((l) => {
          const concede = Number(l.granted) || 0;
          return (
            <li key={`${l.line}-${l.code}`} className="px-3 py-2 space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="font-mono text-muted-foreground">{l.code}</span>
                <span className={concede > 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}>
                  {concede} de {l.requested}
                </span>
              </div>
              {/* Recortar es un resultado válido, no un fallo: TKC mueve lo
                  que hay. Pero hay que decirlo, porque quien pidió 294 y ve
                  «ejecutado» da por hecho que se movieron 294. */}
              {concede > 0 && concede < Number(l.requested) && (
                <p className="text-xs text-[#BA7517]">
                  Se recorta a lo que hay disponible.
                </p>
              )}
              {l.reason && <p className="text-xs text-muted-foreground leading-snug">{l.reason}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

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
  // Sube de uno para pedir otro análisis de lo mismo (los datos del catálogo
  // pueden tener horas y la tienda haber cambiado mientras).
  const [intento, setIntento] = useState(0);

  const n = Number(cantidad);
  const cantidadValida = Number.isInteger(n) && n > 0;
  const lineas = [{ code: producto?.codigo, quantity: n }];
  const pct = Number(porcentaje);
  const porcentajeValido = modo !== 'porcentaje' || (Number.isInteger(pct) && pct >= 1 && pct <= 100);
  const envio = { almacen, lineas, modo, ...(modo === 'porcentaje' ? { porcentaje: pct } : {}) };
  const entradaValida = Boolean(producto) && cantidadValida && porcentajeValido;

  // El análisis se pide solo. Darle a un botón para saber qué pasaría era un
  // paso que no decidía nada —nadie ejecuta sin analizar— y que se olvidaba.
  // Con una pausa antes de preguntar, para no llamar a TKC en cada tecla; y
  // con `vivo`, para que una respuesta vieja no pise el plan de lo que ahora
  // hay escrito: ejecutar con un plan que no corresponde mueve otra cosa.
  const firma = JSON.stringify(envio);
  useEffect(() => {
    if (!entradaValida || resultado) return undefined;
    let vivo = true;
    const temporizador = setTimeout(async () => {
      setOcupado('analizar');
      setError('');
      try {
        const inicio = await planearTienda(modulo, JSON.parse(firma));
        const id = inicio?.jobId ?? inicio?.id;
        const fin = id ? await esperarTrabajo(id) : inicio;
        if (vivo) setPlan(fin);
      } catch (e) {
        if (vivo) setError(e.message);
      } finally {
        if (vivo) setOcupado(null);
      }
    }, 500);
    return () => { vivo = false; clearTimeout(temporizador); };
  }, [firma, entradaValida, resultado, modulo, intento]);

  if (!producto) return null;

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

  const ejecutar = async () => {
    // La cantidad que se anuncia es la que el análisis concede, no la pedida:
    // si TKC recorta, decir lo pedido sería mentirle a quien confirma.
    //
    // Y se dice qué pasa si no se miró el plan, porque es el error que de
    // verdad ocurre: dar a ejecutar por costumbre. Lo que se mueve aquí deja
    // de cuadrar con lo que hay en el piso de tienda, y la diferencia no
    // aparece hasta el conteo, cuando ya nadie recuerda este movimiento.
    const ok = await confirmDialog(
      `Se ${cfg.verboEjecutar} ${leerPlan(plan).concedido} unidades de «${producto.nombre}» ` +
      `en el almacén ${warehouseName(almacen)}. Esto escribe en TKC y no se puede deshacer desde aquí. ` +
      'Comprueba antes el análisis de arriba: si ejecutas sin leerlo puedes mover una cantidad ' +
      'distinta de la que creías, y la existencia dejará de cuadrar con lo que hay en tienda hasta ' +
      'el próximo conteo.',
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
  const analisis = leerPlan(plan);

  return (
    <>
      {ConfirmDialogNode}
      <Dialog open onOpenChange={(abierto) => { if (!abierto) onClose(); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
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

            {ocupado === 'analizar' && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Preguntando a TKC qué pasaría…
              </p>
            )}

            {plan && !resultado && ocupado !== 'analizar' && <Plan {...analisis} modulo={modulo} />}

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
                  {/* El análisis se hace solo; esto es para repetirlo cuando
                      ha pasado un rato con el diálogo abierto, o tras un fallo
                      de red. */}
                  <Button variant="outline" disabled={!entradaValida || ocupado}
                    onClick={() => setIntento((i) => i + 1)} style={{ borderRadius: '8px' }}>
                    <RefreshCw className={`w-4 h-4 mr-1.5 ${ocupado === 'analizar' ? 'animate-spin' : ''}`} />
                    Volver a analizar
                  </Button>
                  {/* Solo tras ver el plan, y solo si el plan mueve algo:
                      ejecutar uno que no concede nada manda un envío que TKC
                      ya dijo que va a rechazar. */}
                  <Button disabled={!plan || analisis.concedido === 0 || !entradaValida || ocupado} onClick={ejecutar}
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
