import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowDownToLine, PackageMinus } from 'lucide-react';

/**
 * Las mermas que inventario ya bajó de tienda y esperan su ajuste de disminución.
 *
 * Es el equivalente, para las mermas, de los conteos que esperan su ajuste
 * (`PendientesInventario`): se ve qué está esperando, se elige cuáles ajustar y se
 * pasan al formulario. Una merma siempre resta existencia, así que solo entran en
 * la disminución.
 *
 * Al pasarlas se adaptan a la forma de un conteo (`resultado: 'faltante'`,
 * `origen_registro: 'merma'`) para que, con el documento confirmado, el mismo
 * «Enviar a auditoría» las dé por procesadas en la entidad `Merma`.
 *
 * @param {object} props
 * @param {string} props.almacen
 * @param {(lineas: string, conteos: Array<{ conteo: object, anteriores: object[] }>) => void} props.onUsar
 */
export default function PendientesMermas({ almacen, onUsar }) {
  const [excluidos, setExcluidos] = useState(() => new Set());

  const { data: filas = [], isLoading } = useQuery({
    queryKey: ['pend-fact', 'mermas', almacen],
    queryFn: () => base44.entities.Merma.filter(
      { almacen_num: almacen, estado_tarea: 'pend_fact' }, '-created_date', 500,
    ),
    enabled: Boolean(almacen),
    select: (d) => (Array.isArray(d) ? d : []),
  });

  // Sin código o sin cantidad no hay línea que montar.
  const ajustables = useMemo(
    () => filas.filter((m) => m.producto_codigo && Number(m.cantidad) > 0),
    [filas],
  );
  const marcadas = ajustables.filter((m) => !excluidos.has(m.id));

  if (!almacen) return null;

  const alternar = (id) => setExcluidos((prev) => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  const usar = () => onUsar(
    marcadas.map((m) => `${m.producto_codigo}*${Math.abs(Number(m.cantidad))}`).join('\n'),
    marcadas.map((m) => ({ conteo: { ...m, resultado: 'faltante', origen_registro: 'merma' }, anteriores: [] })),
  );

  return (
    <Card className="overflow-hidden" style={{ borderRadius: 'var(--r-card)', borderWidth: '0.5px' }}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <p className="text-sm font-medium flex items-center gap-2">
          <PackageMinus className="w-4 h-4 text-muted-foreground" />
          Mermas esperando este ajuste
          {ajustables.length > 0 && <span className="text-xs text-muted-foreground">({ajustables.length})</span>}
        </p>
        {ajustables.length > 0 && (
          <Button type="button" variant="outline" size="sm" style={{ borderRadius: 'var(--r-ctl)' }}
            disabled={marcadas.length === 0} onClick={usar}>
            <ArrowDownToLine className="w-3.5 h-3.5 mr-1.5" />
            Pasarlas al formulario ({marcadas.length})
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="px-4 py-6 text-xs text-muted-foreground text-center">Cargando…</p>
      ) : ajustables.length === 0 ? (
        <p className="px-4 py-6 text-xs text-muted-foreground text-center">
          Ninguna merma de este almacén espera su ajuste de disminución.
        </p>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="w-8 px-3 py-2" />
                <th className="px-2 py-2 text-left font-medium">Producto</th>
                <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Código</th>
                <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Registró</th>
                <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ajustables.map((m) => (
                <tr key={m.id} className="hover:bg-secondary/40 transition-colors">
                  <td className="px-3 py-2">
                    <input type="checkbox" aria-label={`Incluir ${m.producto_nombre}`}
                      checked={!excluidos.has(m.id)} onChange={() => alternar(m.id)}
                      className="w-3.5 h-3.5 accent-[var(--c-ok)] cursor-pointer" />
                  </td>
                  <td className="px-2 py-2">
                    <p className="line-clamp-1">{m.producto_nombre || '—'}</p>
                    {m.clasif_merma && <p className="text-[11px] text-muted-foreground">{m.clasif_merma}</p>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs hidden sm:table-cell">{m.producto_codigo}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-[var(--c-bad)]">-{m.cantidad}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground hidden md:table-cell">{m.especialista_nombre || '—'}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground hidden md:table-cell">
                    {m.fecha_inv || m.created_date?.slice(0, 10) || '—'}
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
