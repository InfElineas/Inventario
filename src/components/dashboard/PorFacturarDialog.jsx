import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { casosDeFacturacion } from '@/components/dashboard/TarjetasTareas';

/**
 * Lo que espera a facturación, separado por caso. La tarjeta «Por facturar» del
 * panel sumaba cuatro cosas distintas y llevaba a una sola pantalla; aquí se ve
 * cuánto hay de cada una y se va directo a la que se quiere resolver.
 *
 * @param {object} props
 * @param {ReturnType<typeof import('@/lib/panelTareas').resumenFacturacion>} props.resumen
 * @param {() => void} props.onClose
 */
export default function PorFacturarDialog({ resumen, onClose }) {
  const navigate = useNavigate();
  const casos = casosDeFacturacion(resumen);

  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogTitle className="text-sm font-medium">Por facturar</DialogTitle>
        <DialogDescription className="text-xs">
          {resumen.total === 0
            ? 'Nada espera a facturación.'
            : `${resumen.total} ${resumen.total === 1 ? 'caso espera' : 'casos esperan'} su ajuste. Elige uno para ir a resolverlo.`}
        </DialogDescription>

        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left font-medium px-3 py-2">Caso</th>
                <th className="text-right font-medium px-3 py-2 w-20">Cantidad</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {casos.map((c) => (
                <tr key={c.clave}
                  className={`${c.cantidad > 0 ? 'cursor-pointer hover:bg-accent/40' : 'opacity-50'} transition-colors`}
                  onClick={c.cantidad > 0 ? () => { onClose(); navigate(c.to); } : undefined}>
                  <td className="px-3 py-2.5">
                    <p className="font-medium">{c.texto}</p>
                    <p className="text-[11px] text-muted-foreground">{c.detalle}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-xs font-medium tabular-nums px-2 py-0.5 rounded-md"
                      style={{ color: c.color, background: `color-mix(in srgb, ${c.color} 14%, transparent)` }}>
                      {c.cantidad}
                    </span>
                  </td>
                  <td className="pr-2">{c.cantidad > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
