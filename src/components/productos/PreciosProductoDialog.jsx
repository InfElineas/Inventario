import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import AlertBanner from '@/components/shared/AlertBanner';
import { SIN_SONDEO } from '@/lib/query-client';
import { fetchPrecios } from '@/services/preciosService';
import { warehouseName } from '@/services/tkc/warehouses';
import { Loader2 } from 'lucide-react';

const dinero = new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'USD' });

/**
 * Todos los precios de un producto, junto a su fuente.
 *
 * El catálogo enseña uno solo, el que TKC guarda como precio. Pero un producto
 * tiene un precio de costo, uno de venta y varios más, cada uno en una tabla
 * distinta, y para decidir una rebaja o cuadrar una factura hace falta verlos
 * a la vez y saber de dónde sale cada uno. Cada fuente va en su bloque, con su
 * nota, y si una no se puede leer lo dice sin esconder las demás.
 */
export default function PreciosProductoDialog({ producto, almacen, onClose }) {
  const codigo = producto?.codigo ?? producto?.codigo_producto;

  const { data, isLoading, error } = useQuery({
    queryKey: ['precios-producto', almacen, codigo],
    queryFn: () => fetchPrecios({ almacen, codigo }),
    enabled: Boolean(producto && almacen && codigo),
    retry: false,
    ...SIN_SONDEO,
  });

  const nombre = data?.nombre || producto?.nombre;

  return (
    <Dialog open={Boolean(producto)} onOpenChange={(abierto) => { if (!abierto) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogTitle className="text-sm font-medium">Precios — {warehouseName(almacen)}</DialogTitle>
        <DialogDescription className="text-xs">
          {nombre} · <span className="font-mono">{codigo}</span>
        </DialogDescription>

        <div className="space-y-4">
          {isLoading && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando precios…
            </p>
          )}
          {error && <AlertBanner variant="danger" message={error.message} />}

          {(data?.fuentes ?? []).map((f) => (
            <section key={f.clave} className="space-y-1.5">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{f.titulo}</h3>
              <p className="text-xs text-muted-foreground">{f.nota}</p>

              {f.error && <AlertBanner variant="warning" message={f.error} />}
              {!f.error && f.precios.length === 0 && (
                <p className="text-xs text-muted-foreground">Esta fuente no tiene este producto en este almacén.</p>
              )}
              {f.precios.length > 0 && (
                <dl className="rounded-lg border border-border divide-y divide-border" style={{ borderRadius: 'var(--r-ctl)' }}>
                  {f.precios.map((p) => (
                    <div key={p.etiqueta} className="flex items-baseline justify-between gap-3 px-3 py-2">
                      <dt className="text-sm">{p.etiqueta}</dt>
                      <dd className="text-sm font-medium tabular-nums">
                        {p.valor === null ? <span className="text-muted-foreground font-normal">—</span> : dinero.format(p.valor)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
