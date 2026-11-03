import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { fetchExistenciaTkc } from '@/services/tkcService';
import { SIN_SONDEO } from '@/lib/query-client';
import AnalisisConteo from '@/components/inventario/AnalisisConteo';
import { analizarConteo, conteoDeRegistro } from '@/lib/analisisConteo';

/**
 * De cuándo es el conteo y cómo está la existencia ahora.
 *
 * El `EF TKC` del registro es una foto del momento de contar, y eso está
 * bien: es contra lo que se midió la diferencia. Pero quien lo procesa días
 * después lo lee como si fuera de hoy. Aquí se dicen los dos números y los
 * días que han pasado, para que nadie confunda uno con otro.
 */
export default function ExistenciaAhora({ inv }) {
  const { data: producto } = useQuery({
    queryKey: ['producto-de-conteo', inv.producto_id],
    queryFn: () => base44.entities.Producto.filter({ id: inv.producto_id }, '-updated_date', 1),
    enabled: Boolean(inv.producto_id),
    select: (d) => (Array.isArray(d) ? d[0] : null),
    ...SIN_SONDEO,
  });

  const idTienda = producto?.id_tienda;
  const { data: submayor, isLoading } = useQuery({
    queryKey: ['submayor-producto', inv.almacen_num, idTienda],
    queryFn: () => fetchExistenciaTkc({ almacen: inv.almacen_num, idTienda }),
    enabled: Boolean(inv.almacen_num && idTienda),
    retry: false,
    ...SIN_SONDEO,
  });

  const ahora = submayor?.existencia?.fisica;
  const entonces = inv.exist_fisica_tkc;
  const dias = inv.fecha_inv
    ? Math.round((Date.now() - new Date(inv.fecha_inv).getTime()) / 86400000)
    : null;
  const cambio = Number.isFinite(ahora) && Number.isFinite(entonces) && ahora !== entonces;
  // Con A y T de AHORA: lo que recomienda quien procesa días después no es lo
  // mismo que lo que se veía al contar. Un conteo ya cerrado no necesita consejo.
  const analisis = inv.estado_tarea === 'completado' ? null : analizarConteo({
    conteo: conteoDeRegistro(inv),
    enAlmacen: submayor?.existencia?.enAlmacen,
    enTienda: submayor?.existencia?.enTienda,
  });

  return (
    <>
    <div className="px-4 py-3 rounded-lg border border-border bg-secondary/40 text-xs space-y-1" style={{ borderRadius: 'var(--r-ctl)' }}>
      <p className="font-medium text-foreground">
        Conteo del {inv.fecha_inv?.slice(0, 10) ?? '—'}
        {dias !== null && dias > 0 && <span className="text-muted-foreground font-normal"> — hace {dias} {dias === 1 ? 'día' : 'días'}</span>}
      </p>
      <p className="text-muted-foreground">
        Se midió contra una existencia de <span className="text-foreground">{entonces ?? '—'}</span>.
        {' '}Ahora TKC dice{' '}
        <span className="text-foreground">{isLoading ? '…' : Number.isFinite(ahora) ? ahora : '—'}</span>.
      </p>
      {cambio && (
        <p className="text-[var(--c-warn)]">
          La existencia ha cambiado desde el conteo. La diferencia registrada sigue siendo la de
          aquel día; comprueba si el ajuste sigue teniendo sentido.
        </p>
      )}
    </div>
    <AnalisisConteo analisis={analisis} />
    </>
  );
}
