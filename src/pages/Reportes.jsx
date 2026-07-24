import { useState, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import AccessDenied from '@/components/shared/AccessDenied';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { ChevronDown, Download, FileText } from 'lucide-react';
import ReporteVencimientos from '@/components/reportes/ReporteVencimientos';

// jsPDF solo se necesita si el usuario realmente genera un PDF — se carga
// bajo demanda en vez de sumarse al peso inicial de la página de Reportes.
const GeneradorPDF = lazy(() => import('@/components/reportes/GeneradorPDF'));

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function exportCSV(data, filename) {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  const csv = [headers.join(','), ...data.map(r => headers.map(h => `"${r[h] ?? ''}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

function SectionHeader({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors rounded-lg" style={{ borderRadius: '8px' }}>
          <h2 className="text-sm font-medium">{title}</h2>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 space-y-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function ReportCard({ title, onExport, children }) {
  return (
    <Card className="p-5" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
        {onExport && (
          <Button variant="ghost" size="sm" onClick={onExport} className="text-xs">
            <Download className="w-3.5 h-3.5 mr-1" /> CSV
          </Button>
        )}
      </div>
      {children}
    </Card>
  );
}

export default function Reportes() {
  const { user } = useAuth();
  const role = user?.role || 'inv';

  const [periodo, setPeriodo] = useState('mes');
  const [showPDF, setShowPDF] = useState(false);

  const toArr = (d) => Array.isArray(d) ? d : [];
  const { data: mermas = [] } = useQuery({ queryKey: ['reportes-mermas'], queryFn: () => base44.entities.Merma.list('-created_date', 500), select: toArr });
  const { data: inventarios = [] } = useQuery({ queryKey: ['reportes-inventarios'], queryFn: () => base44.entities.Inventario.list('-created_date', 500), select: toArr });
  const { data: lotes = [] } = useQuery({ queryKey: ['reportes-lotes'], queryFn: () => base44.entities.Lote.list('-updated_date', 500), select: toArr });
  const { data: anuncios = [] } = useQuery({ queryKey: ['reportes-anuncios'], queryFn: () => base44.entities.AnuncioDesact.list('-created_date', 500), select: toArr });

  // Rango de fechas según el período seleccionado
  const now = new Date();
  const periodStart = periodo === 'anio'
    ? new Date(now.getFullYear(), 0, 1)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const inPeriod = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d >= periodStart && d <= now;
  };

  const mermasEnPeriodo = mermas.filter(m => inPeriod(m.fecha_inv));
  const inventariosEnPeriodo = inventarios.filter(i => inPeriod(i.fecha_inv));

  // Mermas por clasificación — clave incluye año para no mezclar el mismo
  // mes de años distintos (ej. "Ene 2024" y "Ene 2025")
  const mermasByClasif = {};
  mermasEnPeriodo.filter(m => m.estado_tarea === 'completado').forEach(m => {
    const cat = m.clasif_merma?.includes('Mal estado') ? 'Mal estado'
      : m.clasif_merma?.includes('Merma-FV') ? 'Merma-FV'
      : m.clasif_merma?.includes('Cuenta casa') ? 'Cuenta casa'
      : m.clasif_merma?.includes('Salida') ? 'Salida insumos'
      : 'Otros';
    const fecha = new Date(m.fecha_inv);
    const month = fecha.getMonth();
    const year  = fecha.getFullYear();
    const key   = `${year}-${month}`;
    if (!mermasByClasif[key]) mermasByClasif[key] = { mes: periodo === 'anio' ? `${MESES[month]} ${year}` : MESES[month], _sort: year * 12 + month };
    mermasByClasif[key][cat] = (mermasByClasif[key][cat] || 0) + (m.total_perdida || 0);
  });
  const mermasChartData = Object.values(mermasByClasif).sort((a, b) => a._sort - b._sort);

  // Lotes alerts
  const lotesAlertas = lotes.filter(l => ['critico', 'vencido'].includes(l.estado_fv));

  // Pending tasks by role
  const pendingByRole = [
    { rol: 'INV', mermas: mermas.filter(m => ['reconteo_solicitado', 'devuelto'].includes(m.estado_tarea)).length, inventarios: inventarios.filter(i => i.estado_tarea === 'devuelto').length },
    { rol: 'FACT', mermas: mermas.filter(m => m.estado_tarea === 'pend_fact').length, inventarios: inventarios.filter(i => i.estado_tarea === 'pend_fact').length },
    { rol: 'Auditor', mermas: mermas.filter(m => m.estado_tarea === 'en_auditoria').length, inventarios: inventarios.filter(i => i.estado_tarea === 'en_auditoria').length },
    { rol: 'CA', anuncios: anuncios.filter(a => a.estado_tarea === 'pend_ca').length },
  ];

  // Tasks by specialist (respeta el período seleccionado)
  const byEspecialista = {};
  mermasEnPeriodo.filter(m => m.estado_tarea === 'completado').forEach(m => {
    const name = m.especialista_nombre || 'Desconocido';
    if (!byEspecialista[name]) byEspecialista[name] = { nombre: name, mermas: 0, inventarios: 0, monto_merma: 0 };
    byEspecialista[name].mermas++;
    byEspecialista[name].monto_merma += m.total_perdida || 0;
  });
  inventariosEnPeriodo.filter(i => i.estado_tarea === 'completado').forEach(i => {
    const name = i.especialista_nombre || 'Desconocido';
    if (!byEspecialista[name]) byEspecialista[name] = { nombre: name, mermas: 0, inventarios: 0, monto_merma: 0 };
    byEspecialista[name].inventarios++;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium">Reportes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Análisis y métricas del almacén</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowPDF(v => !v)} style={{ borderRadius: '8px' }}>
            <FileText className="w-4 h-4 mr-1.5" /> Generar PDF
          </Button>
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-32" style={{ borderRadius: '8px' }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mes">Mes actual</SelectItem>
              <SelectItem value="anio">Año actual</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {showPDF && (
        <Suspense fallback={null}>
          <GeneradorPDF onClose={() => setShowPDF(false)} />
        </Suspense>
      )}

      {/* Operativos */}
      <Card style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
        <SectionHeader title="Operativos">
          <ReportCard title="Cola de tareas pendientes por rol"
            onExport={() => exportCSV(pendingByRole, 'tareas_pendientes.csv')}>
            <table className="w-full text-sm">
              <thead><tr className="border-b">
                <th className="text-left p-2 text-xs text-muted-foreground">Rol</th>
                <th className="text-right p-2 text-xs text-muted-foreground">Mermas</th>
                <th className="text-right p-2 text-xs text-muted-foreground">Inventarios</th>
                <th className="text-right p-2 text-xs text-muted-foreground">Anuncios</th>
              </tr></thead>
              <tbody>
                {pendingByRole.map(r => (
                  <tr key={r.rol} className="border-b">
                    <td className="p-2 font-medium">{r.rol}</td>
                    <td className="p-2 text-right">{r.mermas || 0}</td>
                    <td className="p-2 text-right">{r.inventarios || 0}</td>
                    <td className="p-2 text-right">{r.anuncios || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ReportCard>

          <ReportCard title="Alertas LOT activas"
            onExport={() => exportCSV(lotesAlertas.map(l => ({ producto: l.producto_nombre, lote: l.no_lote, estado: l.estado_fv, dias: l.vigencia_dias, cantidad: l.cantidad })), 'alertas_lot.csv')}>
            {lotesAlertas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin alertas activas</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b">
                  <th className="text-left p-2 text-xs text-muted-foreground">Producto</th>
                  <th className="text-left p-2 text-xs text-muted-foreground">Lote</th>
                  <th className="text-center p-2 text-xs text-muted-foreground">Estado</th>
                  <th className="text-right p-2 text-xs text-muted-foreground">Días</th>
                </tr></thead>
                <tbody>
                  {lotesAlertas.slice(0, 20).map(l => (
                    <tr key={l.id} className="border-b">
                      <td className="p-2">{l.producto_nombre}</td>
                      <td className="p-2 text-xs">{l.no_lote || '—'}</td>
                      <td className="p-2 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${l.estado_fv === 'vencido' ? 'bg-[#E24B4A14] text-[#E24B4A]' : 'bg-[#BA751714] text-[#BA7517]'}`} style={{ borderRadius: '4px' }}>
                          {l.estado_fv}
                        </span>
                      </td>
                      <td className="p-2 text-right">{l.vigencia_dias}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ReportCard>
        </SectionHeader>
      </Card>

      {/* Financieros */}
      <Card style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
        <SectionHeader title="Financieros">
          <ReportCard title="Mermas por clasificación y mes"
            onExport={() => exportCSV(mermasChartData.map(({ _sort, ...row }) => row), 'mermas_clasif.csv')}>
            {mermasChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin datos</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={mermasChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Mal estado" stackId="a" fill="#E24B4A" />
                  <Bar dataKey="Merma-FV" stackId="a" fill="#BA7517" />
                  <Bar dataKey="Cuenta casa" stackId="a" fill="#7F77DD" />
                  <Bar dataKey="Salida insumos" stackId="a" fill="#378ADD" />
                  <Bar dataKey="Otros" stackId="a" fill="#888780" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ReportCard>
        </SectionHeader>
      </Card>

      {/* Vencimientos */}
      <Card style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
        <SectionHeader title="Productos próximos a vencer">
          <ReporteVencimientos lotes={lotes} />
        </SectionHeader>
      </Card>

      {/* Rendimiento */}
      <Card style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
        <SectionHeader title="Rendimiento">
          <ReportCard title="Tareas completadas por especialista"
            onExport={() => exportCSV(Object.values(byEspecialista), 'rendimiento_especialista.csv')}>
            <table className="w-full text-sm">
              <thead><tr className="border-b">
                <th className="text-left p-2 text-xs text-muted-foreground">Especialista</th>
                <th className="text-right p-2 text-xs text-muted-foreground">Mermas</th>
                <th className="text-right p-2 text-xs text-muted-foreground">Inventarios</th>
                <th className="text-right p-2 text-xs text-muted-foreground">Monto merma</th>
              </tr></thead>
              <tbody>
                {Object.values(byEspecialista).map(e => (
                  <tr key={e.nombre} className="border-b">
                    <td className="p-2 font-medium">{e.nombre}</td>
                    <td className="p-2 text-right">{e.mermas}</td>
                    <td className="p-2 text-right">{e.inventarios}</td>
                    <td className="p-2 text-right text-[#E24B4A]">${e.monto_merma.toFixed(2)}</td>
                  </tr>
                ))}
                {Object.values(byEspecialista).length === 0 && (
                  <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Sin datos</td></tr>
                )}
              </tbody>
            </table>
          </ReportCard>
        </SectionHeader>
      </Card>
    </div>
  );
}