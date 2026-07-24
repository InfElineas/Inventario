import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, FileText, Download, Loader2, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd/MM/yyyy', { locale: es }); } catch { return d; }
}

function fmtMoney(n) {
  if (n == null) return '—';
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── PDF builder ────────────────────────────────────────────────────────────────

function buildPDF({ filtros, inventarios, movimientos, suministradores }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210; // A4 width mm
  const MARGIN = 14;
  const COL_W = W - MARGIN * 2;
  let y = 0;

  // Colors
  const BLUE = [55, 138, 221];
  const DARK = [30, 30, 40];
  const GRAY = [120, 120, 135];
  const LIGHT = [245, 246, 248];
  const RED_C = [226, 75, 74];
  const GREEN_C = [29, 158, 117];
  const AMBER = [186, 117, 23];

  function checkPage(needed = 10) {
    if (y + needed > 275) { doc.addPage(); y = MARGIN; }
  }

  function hLine(yy, color = [220, 222, 228]) {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, yy, W - MARGIN, yy);
  }

  // ── Cover header ─────────────────────────────────────────────────────────────
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, W, 38, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Reporte de Inventario y Movimientos', MARGIN, 16);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const generado = `Generado: ${format(new Date(), "dd 'de' MMMM yyyy, HH:mm", { locale: es })}`;
  const filtroTexto = [
    filtros.fechaDesde ? `Desde: ${fmtDate(filtros.fechaDesde)}` : null,
    filtros.fechaHasta ? `Hasta: ${fmtDate(filtros.fechaHasta)}` : null,
    filtros.suministrador !== 'all' ? `Suministrador: ${filtros.suministrador}` : null,
  ].filter(Boolean).join('  |  ') || 'Sin filtros aplicados';
  doc.text(generado, MARGIN, 25);
  doc.text(filtroTexto, MARGIN, 31);

  y = 48;
  doc.setTextColor(...DARK);

  // ── KPI summary ──────────────────────────────────────────────────────────────
  const totalInv = inventarios.length;
  const completados = inventarios.filter(i => i.estado_tarea === 'completado').length;
  const faltantes = inventarios.filter(i => i.resultado === 'faltante').length;
  const sobrantes = inventarios.filter(i => i.resultado === 'sobrante').length;
  const totalMov = movimientos.length;

  const kpis = [
    { label: 'Conteos totales', value: totalInv, color: BLUE },
    { label: 'Completados', value: completados, color: GREEN_C },
    { label: 'Faltantes', value: faltantes, color: RED_C },
    { label: 'Sobrantes', value: sobrantes, color: AMBER },
    { label: 'Movimientos', value: totalMov, color: BLUE },
  ];

  const kpiW = COL_W / kpis.length;
  kpis.forEach((k, i) => {
    const x = MARGIN + i * kpiW;
    doc.setFillColor(...LIGHT);
    doc.roundedRect(x, y, kpiW - 3, 22, 2, 2, 'F');
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...k.color);
    doc.text(String(k.value), x + kpiW / 2 - 1.5, y + 12, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY);
    doc.text(k.label, x + kpiW / 2 - 1.5, y + 18, { align: 'center' });
  });

  y += 30;

  // ── Section: Inventarios ──────────────────────────────────────────────────────
  function sectionTitle(title) {
    checkPage(14);
    doc.setFillColor(...BLUE);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.roundedRect(MARGIN, y, COL_W, 8, 1.5, 1.5, 'F');
    doc.text(title, MARGIN + 4, y + 5.5);
    doc.setTextColor(...DARK);
    y += 12;
  }

  function tableHeader(cols) {
    checkPage(8);
    doc.setFillColor(235, 237, 242);
    doc.rect(MARGIN, y, COL_W, 7, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    let xCursor = MARGIN + 2;
    cols.forEach(col => {
      doc.text(col.label, xCursor, y + 4.8, { align: col.align || 'left' });
      xCursor += col.w;
    });
    y += 7;
    hLine(y);
    y += 1;
  }

  function tableRow(cols, values, alt = false) {
    const rowH = 8;
    checkPage(rowH);
    if (alt) {
      doc.setFillColor(250, 251, 253);
      doc.rect(MARGIN, y, COL_W, rowH, 'F');
    }
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DARK);
    let xCursor = MARGIN + 2;
    cols.forEach((col, i) => {
      const val = String(values[i] ?? '—');
      if (col.color) doc.setTextColor(...col.color);
      else doc.setTextColor(...DARK);
      doc.text(val, xCursor, y + 5.5, { align: col.align || 'left' });
      xCursor += col.w;
    });
    y += rowH;
    hLine(y, [230, 232, 238]);
    y += 0.5;
  }

  // Inventarios table
  sectionTitle(`Conteos de Inventario (${inventarios.length} registros)`);

  const invCols = [
    { label: 'Fecha', w: 22 },
    { label: 'Producto', w: 64 },
    { label: 'Suministrador', w: 40 },
    { label: 'EF TKC', w: 16, align: 'right' },
    { label: 'Conteo', w: 16, align: 'right' },
    { label: 'Dif.', w: 14, align: 'right' },
    { label: 'Estado', w: 24 },
  ];
  tableHeader(invCols);

  inventarios.forEach((inv, idx) => {
    const dif = inv.diferencia ?? 0;
    const difColor = dif === 0 ? GREEN_C : dif > 0 ? AMBER : RED_C;
    const cols = [...invCols];
    cols[5] = { ...cols[5], color: difColor };
    const estadoShort = {
      en_curso: 'En curso', pend_fact: 'P. FACT',
      en_auditoria: 'Auditoría', completado: 'Completado', devuelto: 'Devuelto',
    }[inv.estado_tarea] || inv.estado_tarea;
    tableRow(cols, [
      fmtDate(inv.fecha_inv),
      (inv.producto_nombre || '').substring(0, 30),
      (inv.suministrador || '').substring(0, 18),
      inv.exist_fisica_tkc ?? 0,
      inv.conteo_real ?? 0,
      dif > 0 ? `+${dif}` : dif,
      estadoShort,
    ], idx % 2 === 0);
  });

  if (inventarios.length === 0) {
    doc.setFontSize(8); doc.setTextColor(...GRAY);
    doc.text('Sin registros para los filtros seleccionados.', MARGIN + 4, y + 6);
    y += 12;
  }

  y += 8;

  // ── Section: Movimientos ──────────────────────────────────────────────────────
  sectionTitle(`Movimientos de Stock y Precio (${movimientos.length} registros)`);

  const movCols = [
    { label: 'Fecha', w: 28 },
    { label: 'Producto', w: 60 },
    { label: 'Campo', w: 26 },
    { label: 'Valor anterior', w: 28, align: 'right' },
    { label: 'Valor nuevo', w: 26, align: 'right' },
    { label: 'Usuario', w: 34 },
  ];
  tableHeader(movCols);

  const CAMPO_LABEL = {
    exist_fisica: 'Exist. física', almacen: 'Almacén', tienda: 'Tienda',
    precio: 'Precio venta', precio_costo: 'Precio costo', estado_anuncio: 'Anuncio',
  };

  movimientos.slice(0, 300).forEach((mov, idx) => {
    tableRow(movCols, [
      fmtDate(mov.fecha),
      (mov.producto_nombre || '').substring(0, 28),
      CAMPO_LABEL[mov.campo] || mov.campo,
      mov.valor_anterior || '—',
      mov.valor_nuevo || '—',
      (mov.usuario_nombre || mov.usuario_id || '').substring(0, 18),
    ], idx % 2 === 0);
  });

  if (movimientos.length === 0) {
    doc.setFontSize(8); doc.setTextColor(...GRAY);
    doc.text('Sin movimientos para los filtros seleccionados.', MARGIN + 4, y + 6);
    y += 12;
  }

  if (movimientos.length > 300) {
    checkPage(8);
    doc.setFontSize(7.5); doc.setTextColor(...GRAY);
    doc.text(`Mostrando 300 de ${movimientos.length} movimientos. Ajusta el rango de fechas para ver todos.`, MARGIN + 4, y + 6);
    y += 10;
  }

  // ── Footer on every page ──────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY);
    hLine(285, [220, 222, 228]);
    doc.text('Sistema de Gestión de Inventario', MARGIN, 290);
    doc.text(`Página ${p} / ${totalPages}`, W - MARGIN, 290, { align: 'right' });
  }

  return doc;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function GeneradorPDF({ onClose }) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const firstOfMonth = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd');

  const [filtros, setFiltros] = useState({
    fechaDesde: firstOfMonth,
    fechaHasta: today,
    suministrador: 'all',
  });
  const [generating, setGenerating] = useState(false);

  const { data: inventarios = [], isLoading: loadingInv } = useQuery({
    queryKey: ['pdf-inventarios'],
    queryFn: () => base44.entities.Inventario.list('-created_date', 1000),
  });

  const { data: movimientos = [], isLoading: loadingMov } = useQuery({
    queryKey: ['pdf-movimientos'],
    queryFn: () => base44.entities.HistorialMovimiento.list('-fecha', 1000),
  });

  const suministradores = useMemo(() => {
    const set = new Set(inventarios.map(i => i.suministrador).filter(Boolean));
    return [...set].sort();
  }, [inventarios]);

  const filtered = useMemo(() => {
    const desde = filtros.fechaDesde ? new Date(filtros.fechaDesde) : null;
    const hasta = filtros.fechaHasta ? new Date(filtros.fechaHasta + 'T23:59:59') : null;

    const fInv = inventarios.filter(i => {
      const d = i.fecha_inv ? new Date(i.fecha_inv) : null;
      if (desde && d && d < desde) return false;
      if (hasta && d && d > hasta) return false;
      if (filtros.suministrador !== 'all' && i.suministrador !== filtros.suministrador) return false;
      return true;
    });

    const fMov = movimientos.filter(m => {
      const d = m.fecha ? new Date(m.fecha) : null;
      if (desde && d && d < desde) return false;
      if (hasta && d && d > hasta) return false;
      return true;
    });

    return { inventarios: fInv, movimientos: fMov };
  }, [inventarios, movimientos, filtros]);

  const isLoading = loadingInv || loadingMov;

  async function handleGenerate(preview = false) {
    setGenerating(true);
    await new Promise(r => setTimeout(r, 50)); // allow UI to update
    const doc = buildPDF({ filtros, inventarios: filtered.inventarios, movimientos: filtered.movimientos });
    const filename = `reporte_inventario_${filtros.fechaDesde || 'all'}_${filtros.fechaHasta || 'all'}.pdf`;
    if (preview) {
      const blob = doc.output('blob');
      window.open(URL.createObjectURL(blob), '_blank');
    } else {
      doc.save(filename);
    }
    setGenerating(false);
  }

  return (
    <Card className="p-6 space-y-5" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium">Generar Reporte PDF</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Fecha desde</label>
          <Input
            type="date"
            value={filtros.fechaDesde}
            onChange={e => setFiltros(f => ({ ...f, fechaDesde: e.target.value }))}
            style={{ borderRadius: '8px' }}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Fecha hasta</label>
          <Input
            type="date"
            value={filtros.fechaHasta}
            onChange={e => setFiltros(f => ({ ...f, fechaHasta: e.target.value }))}
            style={{ borderRadius: '8px' }}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Suministrador</label>
          <Select value={filtros.suministrador} onValueChange={v => setFiltros(f => ({ ...f, suministrador: v }))}>
            <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los suministradores</SelectItem>
              {suministradores.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Preview summary */}
      {!isLoading && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-secondary/50 rounded-lg p-4 text-center" style={{ borderRadius: '8px' }}>
            <p className="text-2xl font-semibold text-primary">{filtered.inventarios.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Conteos de inventario</p>
          </div>
          <div className="bg-secondary/50 rounded-lg p-4 text-center" style={{ borderRadius: '8px' }}>
            <p className="text-2xl font-semibold text-primary">{filtered.movimientos.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Movimientos de stock</p>
          </div>
        </div>
      )}

      {!isLoading && (inventarios.length >= 1000 || movimientos.length >= 1000) && (
        <p className="text-xs text-[#BA7517] bg-[#BA7517]/10 px-3 py-2 rounded-md">
          Solo se cargan los 1000 registros más recientes de cada tipo. Si "Fecha desde" queda fuera de ese rango, el reporte no incluirá los registros más antiguos — acorta el rango de fechas para asegurar que estén completos.
        </p>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Cargando datos...</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} style={{ borderRadius: '8px' }}>Cancelar</Button>
        <Button
          variant="outline"
          disabled={isLoading || generating}
          onClick={() => handleGenerate(true)}
          style={{ borderRadius: '8px' }}
        >
          {generating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Eye className="w-4 h-4 mr-1.5" />}
          Vista previa
        </Button>
        <Button
          disabled={isLoading || generating}
          onClick={() => handleGenerate(false)}
          style={{ borderRadius: '8px' }}
        >
          {generating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Download className="w-4 h-4 mr-1.5" />}
          Descargar PDF
        </Button>
      </div>
    </Card>
  );
}