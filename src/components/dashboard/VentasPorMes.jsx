import { useMemo } from 'react';
import { Bar, BarChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Loader2 } from 'lucide-react';
import { completarMeses } from '@/lib/ventas';

/**
 * Lo que vendió la plataforma cada mes en el almacén elegido, con el mes en
 * curso resaltado: es el que se mira, y el resto es contexto.
 *
 * Sale de nuestra propia base (`/api/ventas/mensual`). Quien no puede ver las
 * ventas recibe un 403 y aquí no se pinta nada: no es un fallo, es que esta
 * tarjeta no es suya.
 *
 * @param {{ meses: number, consulta: { data?: object, isLoading: boolean, error?: Error & { status?: number } } }} props
 */
export default function VentasPorMes({ meses = 12, consulta }) {
  const { data, isLoading, error } = consulta;
  const serie = useMemo(() => completarMeses(data?.meses, meses), [data, meses]);

  if (error?.status === 403) return null;

  const total = serie.reduce((s, m) => s + m.cantidad, 0);
  const actual = serie[serie.length - 1];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-medium">Ventas por mes</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Unidades vendidas por la plataforma, últimos {meses} meses
        </p>
      </div>

      <div className="p-4">
        {isLoading ? (
          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground h-[190px]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculando…
          </p>
        ) : error ? (
          <p className="text-xs text-muted-foreground text-center py-12">No se pudieron cargar las ventas: {error.message}</p>
        ) : total === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-12">Este almacén no tiene ventas en estos meses.</p>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground mb-2">
              <span className="text-foreground font-medium tabular-nums">{actual.cantidad.toLocaleString('es')}</span>
              {' '}este mes{actual.dias > 0 ? `, ${actual.dias} ${actual.dias === 1 ? 'día' : 'días'} con datos` : ''}
            </p>
            <div role="img" aria-label={`Barras de unidades vendidas por mes; este mes ${actual.cantidad}`}>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={serie} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted, #898781)' }} />
                  <YAxis tickLine={false} axisLine={false} width={48}
                    tick={{ fontSize: 11, fill: 'var(--text-muted, #898781)' }}
                    tickFormatter={(v) => v.toLocaleString('es')} />
                  <Tooltip
                    cursor={{ fill: 'var(--fill-ghost-hover, rgba(0,0,0,.04))' }}
                    formatter={(v) => [Number(v).toLocaleString('es'), 'Unidades']}
                    labelFormatter={(_, p) => {
                      const m = p?.[0]?.payload;
                      return m ? `${m.mes}${m.enCurso ? ' (en curso)' : ''}` : '';
                    }}
                  />
                  <Bar dataKey="cantidad" radius={[4, 4, 0, 0]} maxBarSize={24}>
                    {serie.map((m) => (
                      <Cell key={m.mes} fill={m.enCurso ? 'var(--c-orange)' : 'var(--c-gray)'} fillOpacity={m.enCurso ? 1 : 0.4} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
