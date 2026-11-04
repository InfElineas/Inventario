import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { SIN_SONDEO } from '@/lib/query-client';
import { fetchVentasDia } from '@/services/ventasService';

const numero = new Intl.NumberFormat('es-CU');
const dinero = new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'USD' });

/**
 * Las ventas día a día.
 *
 * Una cifra de seis mil unidades en un día no dice qué pasó: cada día se abre y
 * enseña los productos que lo componen, y desde ahí se puede ir a ver los días
 * de uno en concreto. Con un producto elegido arriba, la lista ya es de ese
 * producto —los días en que se vendió— y no hay nada que abrir.
 *
 * @param {object} props
 * @param {'plataforma'|'directas'} props.fuente
 * @param {string} props.almacen       Solo para la plataforma.
 * @param {Array<{ fecha: string, cantidad: number, ordenes: number, importe: number, costo: number }>} props.filas
 * @param {boolean} props.conProducto  La lista ya es de un solo producto.
 * @param {(codigo: string) => void} props.onElegirProducto
 */
export default function VentasPorDia({ fuente, almacen, filas, cargando, conProducto, onElegirProducto }) {
  const [abiertos, setAbiertos] = useState(() => new Set());
  const directas = fuente === 'directas';
  const alternar = (fecha) => setAbiertos((prev) => {
    const s = new Set(prev);
    if (s.has(fecha)) s.delete(fecha); else s.add(fecha);
    return s;
  });

  if (cargando) {
    return <Card className="p-6 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</Card>;
  }
  if (filas.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground text-center">
        {conProducto ? 'Ese producto no se vendió en este período.' : 'Sin ventas en este período.'}
      </Card>
    );
  }

  const columnas = directas ? 4 : 5;
  return (
    <Card className="overflow-hidden" style={{ borderRadius: 'var(--r-card)', borderWidth: '0.5px' }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border text-left">
              <th className="px-3 py-2 font-medium">Día</th>
              <th className="px-3 py-2 font-medium text-right">Unidades</th>
              <th className="px-3 py-2 font-medium text-right hidden sm:table-cell">{directas ? 'Facturas' : 'Órdenes'}</th>
              <th className="px-3 py-2 font-medium text-right">Importe</th>
              {!directas && <th className="px-3 py-2 font-medium text-right hidden md:table-cell">Costo</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filas.map((f) => {
              const abierto = !conProducto && abiertos.has(f.fecha);
              return (
                <Fragment key={f.fecha}>
                  <tr className={conProducto ? '' : 'cursor-pointer hover:bg-secondary/40 transition-colors'}
                    onClick={conProducto ? undefined : () => alternar(f.fecha)}>
                    <td className="px-3 py-1.5 font-medium tabular-nums">
                      {conProducto ? f.fecha : (
                        <button type="button" aria-expanded={abierto} aria-label={`Productos de ${f.fecha}`}
                          className="inline-flex items-center gap-1.5">
                          <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${abierto ? 'rotate-90' : ''}`} />
                          {f.fecha}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums">{numero.format(f.cantidad)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums hidden sm:table-cell">{numero.format(f.ordenes)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{dinero.format(f.importe)}</td>
                    {!directas && <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground hidden md:table-cell">{dinero.format(f.costo)}</td>}
                  </tr>
                  {abierto && (
                    <tr>
                      <td colSpan={columnas} className="bg-secondary/20 px-3 py-2">
                        <ProductosDelDia fuente={fuente} almacen={almacen} fecha={f.fecha} onElegir={onElegirProducto} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Lo que se vendió un día, producto a producto. Se pide al abrir el día, no antes. */
function ProductosDelDia({ fuente, almacen, fecha, onElegir }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['ventas-dia', fuente, almacen, fecha],
    queryFn: () => fetchVentasDia({ almacen, fecha, fuente }),
    retry: false,
    ...SIN_SONDEO,
  });

  if (isLoading) return <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando los productos…</p>;
  if (error) return <p className="text-xs text-[var(--c-bad)]">No se pudieron cargar los productos: {error.message}</p>;
  const productos = data?.productos ?? [];
  if (productos.length === 0) return <p className="text-xs text-muted-foreground">Sin productos ese día.</p>;

  return (
    <div className="max-h-72 overflow-y-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground text-left">
            <th className="sticky top-0 bg-secondary/40 py-1.5 pr-3 font-medium">Producto</th>
            <th className="sticky top-0 bg-secondary/40 py-1.5 pr-3 font-medium text-right">Unidades</th>
            <th className="sticky top-0 bg-secondary/40 py-1.5 font-medium text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => (
            <tr key={p.codigo} className="border-t border-border">
              <td className="py-1.5 pr-3">
                <button type="button" onClick={() => onElegir(p.codigo)} title="Ver los días en que se vendió"
                  className="text-left hover:underline">
                  <span className="block line-clamp-1">{p.nombre || 'Sin nombre en el catálogo'}</span>
                  <span className="block text-[11px] text-muted-foreground font-mono">{p.codigo}</span>
                </button>
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{numero.format(p.cantidad)}</td>
              <td className="py-1.5 text-right tabular-nums">{dinero.format(p.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-muted-foreground pt-1.5">{productos.length} productos. Pulsa uno para ver sus días.</p>
    </div>
  );
}
