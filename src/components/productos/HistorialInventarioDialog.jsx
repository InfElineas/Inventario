import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import StatusBadge from '@/components/shared/StatusBadge';
import AlertBanner from '@/components/shared/AlertBanner';
import { warehouseName } from '@/services/tkc/warehouses';
import { Loader2 } from 'lucide-react';

/**
 * Los conteos que se le han hecho a un producto.
 *
 * Antes de contar algo conviene saber si ya se contó, cuándo y qué salió. Un
 * producto que aparece cada semana con diferencia no tiene el mismo problema
 * que uno que falló una vez, y esa distinción no estaba en ninguna parte: cada
 * conteo vivía suelto en su pantalla.
 *
 * Se busca por `producto_id` y, como respaldo, por código: un mismo código
 * puede tener varias filas de producto si TKC creó más de un anuncio.
 */
export default function HistorialInventarioDialog({ producto, almacen, onClose }) {
  const codigo = producto?.codigo ?? producto?.codigo_producto;

  const { data: conteos, isLoading, error } = useQuery({
    queryKey: ['historial-inventario', almacen, codigo],
    queryFn: () => base44.entities.Inventario.filter(
      { almacen_num: almacen, producto_codigo: codigo }, '-fecha_inv', 50,
    ),
    enabled: Boolean(producto && almacen && codigo),
    select: (d) => (Array.isArray(d) ? d : []),
  });

  const filas = conteos ?? [];
  const conDiferencia = filas.filter((i) => (i.diferencia ?? 0) !== 0).length;

  return (
    <Dialog open={Boolean(producto)} onOpenChange={(abierto) => { if (!abierto) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogTitle className="text-sm font-medium">
          Conteos de inventario — {warehouseName(almacen)}
        </DialogTitle>
        <DialogDescription className="text-xs">
          {producto?.nombre} · <span className="font-mono">{codigo}</span>
        </DialogDescription>

        <div className="space-y-4">
          {isLoading && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando conteos…
            </p>
          )}
          {error && <AlertBanner variant="danger" message={error.message} />}

          {!isLoading && filas.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              A este producto no se le ha hecho ningún conteo en este almacén.
            </p>
          )}

          {filas.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground">
                {filas.length} {filas.length === 1 ? 'conteo' : 'conteos'}
                {conDiferencia > 0 && <> · <span className="text-[#BA7517]">{conDiferencia} con diferencia</span></>}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-2 pr-3 font-medium">Fecha</th>
                      <th className="py-2 pr-3 font-medium text-right">EF TKC</th>
                      <th className="py-2 pr-3 font-medium text-right">Contó</th>
                      <th className="py-2 pr-3 font-medium text-right">Diferencia</th>
                      <th className="py-2 pr-3 font-medium">Clasificación</th>
                      <th className="py-2 pr-3 font-medium">Especialista</th>
                      <th className="py-2 font-medium text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((i) => (
                      <tr key={i.id} className="border-b last:border-0">
                        <td className="py-1.5 pr-3 whitespace-nowrap">{i.fecha_inv?.slice(0, 10) ?? '—'}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{i.exist_fisica_tkc ?? '—'}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{i.conteo_real ?? '—'}</td>
                        <td className={`py-1.5 pr-3 text-right tabular-nums font-medium ${
                          (i.diferencia ?? 0) === 0 ? 'text-[#1D9E75]' : (i.diferencia ?? 0) > 0 ? 'text-[#BA7517]' : 'text-[#E24B4A]'
                        }`}>
                          {(i.diferencia ?? 0) > 0 ? '+' : ''}{i.diferencia ?? 0}
                        </td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{i.clasif_ajuste || '—'}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{i.especialista_nombre || '—'}</td>
                        <td className="py-1.5 text-center"><StatusBadge status={i.estado_tarea} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
