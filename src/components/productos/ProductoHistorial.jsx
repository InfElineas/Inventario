import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  TrendingUp, TrendingDown, Tag, ToggleLeft, Package,
  FileText, ClipboardCheck, ArrowRight, Loader2
} from 'lucide-react';

const TIPO_CONFIG = {
  stock: { icon: Package, color: 'text-[#378ADD]', bg: 'bg-[#378ADD]/10', label: 'Stock' },
  precio: { icon: Tag, color: 'text-[#BA7517]', bg: 'bg-[#BA7517]/10', label: 'Precio' },
  estado_anuncio: { icon: ToggleLeft, color: 'text-[#1D9E75]', bg: 'bg-[#1D9E75]/10', label: 'Anuncio' },
  importacion: { icon: ClipboardCheck, color: 'text-[#7B68D4]', bg: 'bg-[#7B68D4]/10', label: 'Importación' },
};

const CAMPO_LABEL = {
  exist_fisica: 'Exist. física',
  almacen: 'Almacén',
  tienda: 'Tienda',
  precio: 'Precio venta',
  precio_costo: 'Precio costo',
  estado_anuncio: 'Estado anuncio',
};

function MovimientoItem({ mov }) {
  const tipo = TIPO_CONFIG[mov.tipo_cambio] || TIPO_CONFIG.stock;
  const Icon = tipo.icon;
  const esNumero = !isNaN(Number(mov.valor_anterior)) && !isNaN(Number(mov.valor_nuevo));
  const diferencia = esNumero ? Number(mov.valor_nuevo) - Number(mov.valor_anterior) : null;

  const fechaFormateada = mov.fecha
    ? format(new Date(mov.fecha), "d MMM yyyy, HH:mm", { locale: es })
    : '—';

  return (
    <div className="flex gap-3 pb-5 last:pb-0 relative">
      {/* vertical line */}
      <div className="absolute left-4 top-8 bottom-0 w-px bg-border last:hidden" />

      <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${tipo.bg}`}>
        <Icon className={`w-3.5 h-3.5 ${tipo.color}`} />
      </div>

      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-foreground">
              {CAMPO_LABEL[mov.campo] || mov.campo}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{mov.usuario_nombre || mov.usuario_id}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[11px] text-muted-foreground">{fechaFormateada}</p>
            {diferencia !== null && diferencia !== 0 && (
              <span className={`text-xs font-medium flex items-center gap-0.5 justify-end mt-0.5 ${diferencia > 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                {diferencia > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {diferencia > 0 ? '+' : ''}{diferencia}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
          <span className="bg-secondary px-1.5 py-0.5 rounded text-[11px]">{mov.valor_anterior || '—'}</span>
          <ArrowRight className="w-3 h-3 flex-shrink-0" />
          <span className="bg-secondary px-1.5 py-0.5 rounded text-[11px] font-medium text-foreground">{mov.valor_nuevo || '—'}</span>
        </div>

        {mov.notas && (
          <p className="text-[11px] text-muted-foreground mt-1 italic">{mov.notas}</p>
        )}

        <span className={`text-[10px] px-1.5 py-0.5 rounded mt-1.5 inline-block ${tipo.bg} ${tipo.color}`}>
          {tipo.label} · {mov.origen === 'importacion' ? 'Importación' : 'Manual'}
        </span>
      </div>
    </div>
  );
}

export default function ProductoHistorial({ productoId }) {
  const { data: movimientos = [], isLoading } = useQuery({
    queryKey: ['historial', productoId],
    queryFn: () => base44.entities.HistorialMovimiento.filter(
      { producto_id: productoId },
      '-fecha',
      100
    ),
    enabled: !!productoId,
  });

  // Also fetch related inventory records
  const { data: inventarios = [] } = useQuery({
    queryKey: ['inventarios_producto', productoId],
    queryFn: () => base44.entities.Inventario.filter({ producto_id: productoId }, '-created_date', 50),
    enabled: !!productoId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Merge: inventory events + stock movements
  const invEventos = inventarios.map(inv => ({
    _type: 'inventario',
    id: inv.id,
    fecha: inv.created_date || inv.fecha_inv,
    resultado: inv.resultado,
    diferencia: inv.diferencia,
    conteo_real: inv.conteo_real,
    exist_fisica_tkc: inv.exist_fisica_tkc,
    estado_tarea: inv.estado_tarea,
    especialista_nombre: inv.especialista_nombre,
    fact_no_factura: inv.fact_no_factura,
    clasif_ajuste: inv.clasif_ajuste,
    auditor_nombre: inv.auditor_nombre,
  }));

  const totalEventos = movimientos.length + invEventos.length;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{totalEventos} evento{totalEventos !== 1 ? 's' : ''} registrado{totalEventos !== 1 ? 's' : ''}</p>

      {/* Inventory conteos */}
      {invEventos.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-3">Conteos de inventario</p>
          <div className="space-y-3">
            {invEventos.map(ev => (
              <div key={ev.id} className="flex gap-3 pb-4 last:pb-0 relative">
                <div className="absolute left-4 top-8 bottom-0 w-px bg-border" />
                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${ev.resultado === 'ok' ? 'bg-[#1D9E75]/10' : ev.resultado === 'faltante' ? 'bg-[#E24B4A]/10' : 'bg-[#BA7517]/10'}`}>
                  <ClipboardCheck className={`w-3.5 h-3.5 ${ev.resultado === 'ok' ? 'text-[#1D9E75]' : ev.resultado === 'faltante' ? 'text-[#E24B4A]' : 'text-[#BA7517]'}`} />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium">Conteo INV</p>
                      <p className="text-[11px] text-muted-foreground">{ev.especialista_nombre}</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground flex-shrink-0">
                      {ev.fecha ? format(new Date(ev.fecha), "d MMM yyyy", { locale: es }) : '—'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <span className="text-[11px] bg-secondary px-1.5 py-0.5 rounded">EF TKC: {ev.exist_fisica_tkc}</span>
                    <span className="text-[11px] bg-secondary px-1.5 py-0.5 rounded">Conteo: {ev.conteo_real}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${ev.diferencia === 0 ? 'bg-[#1D9E75]/10 text-[#1D9E75]' : ev.diferencia > 0 ? 'bg-[#BA7517]/10 text-[#BA7517]' : 'bg-[#E24B4A]/10 text-[#E24B4A]'}`}>
                      Dif: {ev.diferencia > 0 ? '+' : ''}{ev.diferencia}
                    </span>
                    {ev.fact_no_factura && (
                      <span className="text-[11px] bg-[#7B68D4]/10 text-[#7B68D4] px-1.5 py-0.5 rounded flex items-center gap-1">
                        <FileText className="w-3 h-3" /> {ev.fact_no_factura}
                      </span>
                    )}
                    {ev.auditor_nombre && (
                      <span className="text-[11px] bg-[#1D9E75]/10 text-[#1D9E75] px-1.5 py-0.5 rounded">
                        ✓ {ev.auditor_nombre}
                      </span>
                    )}
                  </div>
                  {ev.clasif_ajuste && (
                    <p className="text-[11px] text-muted-foreground mt-1">{ev.clasif_ajuste}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stock / price movements */}
      {movimientos.length > 0 && (
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-3 mt-2">Cambios de stock y precio</p>
          <div className="space-y-1">
            {movimientos.map(mov => <MovimientoItem key={mov.id} mov={mov} />)}
          </div>
        </div>
      )}

      {totalEventos === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Sin movimientos registrados</p>
        </div>
      )}
    </div>
  );
}