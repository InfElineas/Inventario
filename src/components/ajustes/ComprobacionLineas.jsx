import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Loader2, ShieldCheck, ShieldX, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AlertBanner from '@/components/shared/AlertBanner';
import { comprobarLineas } from '@/services/comprobacionLineas';
import { evaluarLinea, firmaDeLineas, resumirComprobacion } from '@/lib/existenciaLineas';

const ETIQUETA = {
  ok:       { texto: 'Hay',          color: 'text-[var(--c-ok-dim)]' },
  bajar:    { texto: 'Bajar antes',  color: 'text-[var(--c-warn)]' },
  excede:   { texto: 'No alcanza',   color: 'text-[var(--c-bad)]' },
  sin_dato: { texto: 'Sin comprobar', color: 'text-muted-foreground' },
};

/**
 * La barrera antes de montar: cada línea contra la existencia de TKC.
 *
 * No monta nada y no escribe: lee lo que hay y dice qué líneas se pueden montar.
 * El botón de montar de quien lo usa se queda apagado hasta que la comprobación
 * de ESTAS líneas salga limpia; si se cambia una cantidad, un código o el
 * almacén, la comprobación deja de valer y hay que repetirla.
 *
 * @param {object} props
 * @param {string} props.almacen
 * @param {Array<{ code: string, quantity: number }>} props.lines
 * @param {'disminucion'|'transferencia'} props.tipo
 * @param {boolean} [props.deshabilitado]
 * @param {(estado: { vigente: boolean, bloqueado: boolean }) => void} props.onEstado
 *   Se llama cada vez que cambia: `vigente` si la comprobación es de estas líneas,
 *   `bloqueado` si alguna no se puede montar.
 */
export default function ComprobacionLineas({ almacen, lines, tipo, deshabilitado = false, onEstado }) {
  const [hecha, setHecha] = useState(null);   // { firma, filas }
  const firma = firmaDeLineas({ almacen, lines });

  const comprobar = useMutation({
    mutationFn: async () => {
      const filas = await comprobarLineas({ almacen, lines });
      return { firma, filas: filas.map((f) => ({ ...f, evaluacion: evaluarLinea({ ...f, cantidad: f.quantity }, tipo) })) };
    },
    onSuccess: setHecha,
  });

  const vigente = hecha?.firma === firma ? hecha : null;
  const resumen = useMemo(() => (vigente ? resumirComprobacion(vigente.filas) : null), [vigente]);

  useEffect(() => {
    onEstado({ vigente: Boolean(vigente), bloqueado: resumen ? !resumen.puedeMontar : false });
  }, [vigente, resumen, onEstado]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          {vigente
            ? (resumen.puedeMontar
              ? <><ShieldCheck className="w-3.5 h-3.5 text-[var(--c-ok-dim)]" /> Comprobado contra TKC: se puede montar.</>
              : <><ShieldX className="w-3.5 h-3.5 text-[var(--c-bad)]" /> Hay líneas que no se pueden montar.</>)
            : 'Antes de montar se comprueba cada línea contra la existencia de TKC.'}
        </p>
        <Button type="button" variant="outline" size="sm" style={{ borderRadius: 'var(--r-ctl)' }}
          disabled={deshabilitado || lines.length === 0 || comprobar.isPending}
          onClick={() => comprobar.mutate()}>
          {comprobar.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
          {vigente ? 'Comprobar otra vez' : 'Comprobar existencia'}
        </Button>
      </div>

      {comprobar.error && <AlertBanner variant="danger" message={`No se pudo comprobar: ${comprobar.error.message}`} />}

      {vigente && (
        <div className="overflow-x-auto rounded-lg border border-border" style={{ borderRadius: 'var(--r-ctl)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="px-2.5 py-1.5 font-medium">Código</th>
                <th className="px-2.5 py-1.5 font-medium text-right">Pides</th>
                <th className="px-2.5 py-1.5 font-medium text-right">EF</th>
                <th className="px-2.5 py-1.5 font-medium text-right">A</th>
                <th className="px-2.5 py-1.5 font-medium text-right">T</th>
                <th className="px-2.5 py-1.5 font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {vigente.filas.map((f) => {
                const e = f.evaluacion;
                const cfg = ETIQUETA[e.estado];
                return (
                  <tr key={f.code}>
                    <td className="px-2.5 py-1.5 font-mono">{f.code}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{f.quantity}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{f.existencia?.fisica ?? '—'}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{f.existencia?.enAlmacen ?? '—'}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{f.existencia?.enTienda ?? '—'}</td>
                    <td className="px-2.5 py-1.5">
                      <span className={`font-medium ${cfg.color}`}>{cfg.texto}</span>
                      {e.motivo && <span className="block text-[11px] text-muted-foreground">{e.motivo}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {resumen && resumen.sinDato > 0 && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <TriangleAlert className="w-3 h-3" />
          {resumen.sinDato} {resumen.sinDato === 1 ? 'línea no se pudo comprobar y no bloquea' : 'líneas no se pudieron comprobar y no bloquean'}: la API las rechazará si no valen.
        </p>
      )}
    </div>
  );
}
