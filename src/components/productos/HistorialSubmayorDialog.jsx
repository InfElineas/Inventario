import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import AlertBanner from '@/components/shared/AlertBanner';
import { SIN_SONDEO } from '@/lib/query-client';
import { fetchHistorialTkc } from '@/services/tkcService';
import { warehouseName } from '@/services/tkc/warehouses';
import { Loader2 } from 'lucide-react';

/**
 * Los movimientos de un producto en el submayor de TKC.
 *
 * Contesta la pregunta que aparece siempre que una existencia no cuadra: «¿y
 * esto por qué bajó?». El listado solo da el saldo de hoy y nuestra copia es
 * una foto; el documento de cada movimiento y quién lo hizo solo están aquí.
 *
 * Se pide en vivo y no se sondea: es una consulta puntual contra TKC, que
 * limita las peticiones por cuenta.
 */

const hoy = () => new Date().toISOString().slice(0, 10);
const haceUnMes = () => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

export default function HistorialSubmayorDialog({ producto, almacen, onClose }) {
  const [desde, setDesde] = useState(haceUnMes);
  const [hasta, setHasta] = useState(hoy);

  const idTienda = producto?.idOnline ?? producto?.id_tienda ?? '';

  const { data, isLoading, error } = useQuery({
    queryKey: ['historial-submayor', almacen, idTienda, desde, hasta],
    queryFn: () => fetchHistorialTkc({ almacen, idTienda, desde, hasta }),
    enabled: Boolean(producto && almacen && idTienda),
    retry: false,
    ...SIN_SONDEO,
  });

  const movimientos = data?.movimientos ?? [];

  return (
    <Dialog open={Boolean(producto)} onOpenChange={(abierto) => { if (!abierto) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogTitle className="text-sm font-medium">
          Historial del submayor — {warehouseName(almacen)}
        </DialogTitle>
        <DialogDescription className="text-xs">
          {producto?.nombre} · <span className="font-mono">{producto?.codigo ?? producto?.codigo_producto}</span>
        </DialogDescription>

        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block space-y-1.5 text-xs text-muted-foreground">
              Desde
              <Input type="date" value={desde} max={hasta}
                onChange={(e) => setDesde(e.target.value)} style={{ borderRadius: '8px' }} />
            </label>
            <label className="block space-y-1.5 text-xs text-muted-foreground">
              Hasta
              <Input type="date" value={hasta} min={desde}
                onChange={(e) => setHasta(e.target.value)} style={{ borderRadius: '8px' }} />
            </label>
            {isLoading && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground pb-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Preguntando a TKC…
              </span>
            )}
          </div>

          {!idTienda && (
            <AlertBanner variant="warning"
              message="Este producto no tiene id de tienda, y el submayor busca por ese id. Hay que crearle el anuncio en TKC." />
          )}
          {error && <AlertBanner variant="danger" message={error.message} />}
          {data === null && !isLoading && !error && (
            <AlertBanner variant="warning" message="El submayor no tiene este producto en este almacén." />
          )}

          {!isLoading && data && movimientos.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Sin movimientos entre esas dos fechas.
            </p>
          )}

          {movimientos.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-3 font-medium">Fecha</th>
                    <th className="py-2 pr-3 font-medium">Documento</th>
                    <th className="py-2 pr-3 font-medium text-right">Antes</th>
                    <th className="py-2 pr-3 font-medium text-right">Entrada</th>
                    <th className="py-2 pr-3 font-medium text-right">Salida</th>
                    <th className="py-2 pr-3 font-medium text-right">Después</th>
                    <th className="py-2 font-medium">Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m, i) => (
                    <tr key={`${m.fecha}-${m.documento}-${i}`} className="border-b last:border-0">
                      <td className="py-1.5 pr-3 whitespace-nowrap">{m.fecha}</td>
                      <td className="py-1.5 pr-3">{m.documento}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{m.saldoInicial ?? '—'}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-[#1D9E75]">{m.entrada ?? ''}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-[#E24B4A]">{m.salida ?? ''}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{m.saldoFinal ?? '—'}</td>
                      <td className="py-1.5 text-muted-foreground">{m.usuario}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-2">
                {movimientos.length} {movimientos.length === 1 ? 'movimiento' : 'movimientos'}. Tal como los tiene TKC.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
