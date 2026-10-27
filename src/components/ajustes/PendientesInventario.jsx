import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardList, ArrowDownToLine } from 'lucide-react';

/**
 * Los conteos de inventario que esperan este ajuste.
 *
 * El flujo ya existía partido en dos mitades que no se hablaban: inventario
 * cuenta, encuentra una diferencia y la manda a facturación (`pend_fact`); y
 * facturación, en otra pantalla, escribe a mano los códigos a ajustar. Entre
 * las dos había un copiar y pegar desde un sitio que no era el sistema.
 *
 * Aquí se ve qué está esperando y se rellena el formulario con ello. La
 * cantidad del ajuste es la diferencia que midió el conteo, que es justo lo
 * que hay que mover: ni más ni menos.
 *
 * Un sobrante se resuelve con un ajuste de AUMENTO y un faltante con uno de
 * DISMINUCIÓN. Por eso cada pantalla pide un `resultado` distinto.
 */

const POR_TIPO = {
  aumento:     { resultado: 'sobrante', etiqueta: 'sobrantes' },
  disminucion: { resultado: 'faltante', etiqueta: 'faltantes' },
};

/** `CODIGO*CANTIDAD`, una línea por producto: el formato que lee parseLineas. */
function aLineas(filas) {
  return filas
    .filter((i) => i.producto_codigo && Math.abs(Number(i.diferencia) || 0) > 0)
    .map((i) => `${i.producto_codigo}*${Math.abs(Number(i.diferencia))}`)
    .join('\n');
}

export default function PendientesInventario({ tipo, almacen, onUsar }) {
  const cfg = POR_TIPO[tipo];

  const { data: filas = [], isLoading } = useQuery({
    queryKey: ['pend-fact', tipo, almacen],
    queryFn: () => base44.entities.Inventario.filter(
      { almacen_num: almacen, resultado: cfg.resultado, estado_tarea: 'pend_fact' },
      '-fecha_inv', 500,
    ),
    enabled: Boolean(almacen && cfg),
    select: (d) => (Array.isArray(d) ? d : []),
  });

  if (!cfg || !almacen) return null;

  return (
    <Card className="overflow-hidden" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <p className="text-sm font-medium flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-muted-foreground" />
          Conteos esperando este ajuste
          {filas.length > 0 && (
            <span className="text-xs text-muted-foreground">({filas.length})</span>
          )}
        </p>
        {filas.length > 0 && (
          <Button type="button" variant="outline" size="sm" style={{ borderRadius: '8px' }}
            onClick={() => onUsar(aLineas(filas))}>
            <ArrowDownToLine className="w-3.5 h-3.5 mr-1.5" />
            Pasarlos al formulario
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="px-4 py-6 text-xs text-muted-foreground text-center">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="px-4 py-6 text-xs text-muted-foreground text-center">
          Ningún conteo de este almacén tiene {cfg.etiqueta} pendientes de facturación.
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="px-4 py-2 text-left font-medium">Producto</th>
                <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Código</th>
                <th className="px-3 py-2 text-right font-medium">Diferencia</th>
                <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Contó</th>
                <th className="px-4 py-2 text-left font-medium hidden md:table-cell">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map((i) => (
                <tr key={i.id} className="hover:bg-secondary/40 transition-colors">
                  <td className="px-4 py-2">
                    <p className="line-clamp-1">{i.producto_nombre || '—'}</p>
                    {i.clasif_ajuste && (
                      <p className="text-[11px] text-muted-foreground">{i.clasif_ajuste}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs hidden sm:table-cell">{i.producto_codigo || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium"
                      style={{ color: Number(i.diferencia) > 0 ? '#BA7517' : '#E24B4A' }}>
                    {Number(i.diferencia) > 0 ? '+' : ''}{i.diferencia}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground hidden md:table-cell">
                    {i.especialista_nombre || '—'}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground hidden md:table-cell">
                    {i.fecha_inv || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
