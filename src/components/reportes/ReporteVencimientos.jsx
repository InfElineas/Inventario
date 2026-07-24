import { useMemo } from 'react';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileDown } from 'lucide-react';

const CATEGORIAS = [
  { key: 'vencido',    label: 'Vencido',       color: '#E24B4A', min: -Infinity, max: 0 },
  { key: '1_7',        label: '1–7 días',       color: '#C0392B', min: 1,  max: 7  },
  { key: '8_15',       label: '8–15 días',      color: '#E67E22', min: 8,  max: 15 },
  { key: '16_30',      label: '16–30 días',     color: '#F1C40F', min: 16, max: 30 },
  { key: '31_60',      label: '31–60 días',     color: '#2ECC71', min: 31, max: 60 },
  { key: '61_90',      label: '61–90 días',     color: '#1ABC9C', min: 61, max: 90 },
];

export function calcDias(fechaStr) {
  if (!fechaStr) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  // Construir fv a medianoche LOCAL (igual que "hoy"): parsear fechaStr
  // como "YYYY-MM-DD" con new Date(fechaStr) la interpreta en UTC,
  // desfasando el conteo de días según la zona horaria del navegador.
  const [y, m, d] = fechaStr.slice(0, 10).split('-').map(Number);
  const fv = new Date(y, m - 1, d);
  return Math.round((fv - hoy) / 86400000);
}

function getCategoria(dias) {
  if (dias === null) return null;
  return CATEGORIAS.find(c => dias >= c.min && dias <= c.max) || null;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-md text-sm">
      <p className="font-semibold mb-1">{label}</p>
      <p>Lotes: <span className="font-medium">{payload[0]?.value}</span></p>
      <p>Valor: <span className="font-medium text-primary">${payload[1]?.value?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
    </div>
  );
};

export default function ReporteVencimientos({ lotes = [] }) {
  const lotesConFV = useMemo(() =>
    lotes.filter(l => l.fecha_vencimiento),
    [lotes]
  );

  const chartData = useMemo(() => {
    return CATEGORIAS.map(cat => {
      const grupo = lotesConFV.filter(l => {
        const dias = calcDias(l.fecha_vencimiento);
        return dias !== null && dias >= cat.min && dias <= cat.max;
      });
      const valor = grupo.reduce((sum, l) => {
        const precio = l.precio_costo || 0;
        const cant = l.cantidad || 0;
        return sum + precio * cant;
      }, 0);
      return { label: cat.label, color: cat.color, lotes: grupo.length, valor: parseFloat(valor.toFixed(2)) };
    });
  }, [lotesConFV]);

  const detalleRows = useMemo(() => {
    return lotesConFV
      .map(l => {
        const dias = calcDias(l.fecha_vencimiento);
        const cat = getCategoria(dias);
        if (!cat) return null;
        return {
          categoria: cat.label,
          producto: l.producto_nombre || '—',
          codigo: l.producto_codigo || '—',
          no_lote: l.no_lote || '—',
          fecha_vencimiento: l.fecha_vencimiento,
          dias_restantes: dias,
          cantidad: l.cantidad || 0,
          precio_costo: l.precio_costo || 0,
          valor_total: parseFloat(((l.cantidad || 0) * (l.precio_costo || 0)).toFixed(2)),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.dias_restantes - b.dias_restantes);
  }, [lotesConFV]);

  const totalLotes = chartData.reduce((s, d) => s + d.lotes, 0);
  const totalValor = chartData.reduce((s, d) => s + d.valor, 0);

  function exportXLSX() {
    const wb = XLSX.utils.book_new();

    // Hoja resumen
    const resumenData = [
      ['Categoría', 'Lotes', 'Valor Total ($)'],
      ...chartData.map(d => [d.label, d.lotes, d.valor]),
      ['TOTAL', totalLotes, parseFloat(totalValor.toFixed(2))],
    ];
    const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

    // Hoja detalle
    const wsDetalle = XLSX.utils.json_to_sheet(detalleRows);
    XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle');

    XLSX.writeFile(wb, `reporte_vencimientos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total lotes con FV', value: totalLotes, color: 'text-foreground' },
          { label: 'Valor total en riesgo', value: `$${totalValor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'text-primary' },
          { label: 'Vencidos', value: chartData[0]?.lotes ?? 0, color: 'text-[#E24B4A]' },
          { label: 'Por vencer ≤ 30 días', value: (chartData[1]?.lotes ?? 0) + (chartData[2]?.lotes ?? 0) + (chartData[3]?.lotes ?? 0), color: 'text-[#E67E22]' },
        ].map(kpi => (
          <Card key={kpi.label} className="p-4" style={{ borderRadius: '10px', borderWidth: '0.5px' }}>
            <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
            <p className={`text-xl font-semibold ${kpi.color}`}>{kpi.value}</p>
          </Card>
        ))}
      </div>

      {/* Gráfico */}
      <Card className="p-5" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Lotes por categoría de vencimiento</p>
          <Button variant="outline" size="sm" onClick={exportXLSX} className="text-xs gap-1.5">
            <FileDown className="w-3.5 h-3.5" /> Exportar XLSX
          </Button>
        </div>
        {totalLotes === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">Sin lotes con fecha de vencimiento registrada</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar yAxisId="left" dataKey="lotes" name="Lotes" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.85} />)}
              </Bar>
              <Bar yAxisId="right" dataKey="valor" name="Valor ($)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} fillOpacity={0.25} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Tabla detalle */}
      {detalleRows.length > 0 && (
        <Card className="p-5" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Detalle de lotes</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  {['Categoría', 'Producto', 'Lote', 'FV', 'Días', 'Cantidad', 'P. Costo', 'Valor Total'].map(h => (
                    <th key={h} className="text-left p-2 text-xs text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detalleRows.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-2">
                      <span className="text-[10px] px-2 py-0.5 rounded font-medium"
                        style={{ background: CATEGORIAS.find(c => c.label === r.categoria)?.color + '22', color: CATEGORIAS.find(c => c.label === r.categoria)?.color }}>
                        {r.categoria}
                      </span>
                    </td>
                    <td className="p-2 max-w-[200px] truncate">{r.producto}</td>
                    <td className="p-2 text-xs text-muted-foreground">{r.no_lote}</td>
                    <td className="p-2 text-xs">{r.fecha_vencimiento}</td>
                    <td className="p-2 text-center font-medium" style={{ color: CATEGORIAS.find(c => c.label === r.categoria)?.color }}>{r.dias_restantes}</td>
                    <td className="p-2 text-right">{r.cantidad}</td>
                    <td className="p-2 text-right">${r.precio_costo.toFixed(2)}</td>
                    <td className="p-2 text-right font-medium">${r.valor_total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detalleRows.length > 50 && (
              <p className="text-xs text-muted-foreground text-center py-2">Mostrando 50 de {detalleRows.length} lotes. Exporta el XLSX para ver todos.</p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}