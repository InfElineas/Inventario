import StatusBadge from '@/components/shared/StatusBadge';
import { warehouseName } from '@/services/tkc/warehouses';

/** Una celda del listado de conteos, la misma para tabla y ficha. La usan Inventario y su historial por usuario. */
export function celdaConteo(inv, clave, enTabla, difColor, acciones) {
  // `py-1.5`: la fila baja de 44 px a 32. En una pantalla de portátil eso
  // son seis filas más sin desplazar, que es de lo que va un listado de
  // trabajo. La ficha del teléfono no cambia: ahí el dedo manda.
  const env = (contenido, clases = '') => (enTabla
    ? <td key={clave} className={`px-2.5 py-1.5 ${clases}`}>{contenido}</td>
    : contenido);

  switch (clave) {
    case 'producto':
      return env(
        <>
          <p className="font-medium leading-snug">{inv.producto_nombre}</p>
          <p className="text-xs text-muted-foreground font-mono">{inv.producto_codigo}</p>
        </>,
      );
    case 'almacen':
      return env(
        <span className="text-xs text-muted-foreground">
          {warehouseName(inv.almacen_num) || inv.almacen_num || '—'}
        </span>,
      );
    case 'ef_tkc':
      return env(<span className="tabular-nums">{inv.exist_fisica_tkc ?? '—'}</span>, 'text-right');
    case 'conteo':
      return env(<span className="font-medium tabular-nums">{inv.conteo_real}</span>, 'text-right');
    case 'diferencia':
      return env(
        <span className={`font-medium tabular-nums ${difColor(inv.diferencia)}`}>
          {inv.diferencia > 0 ? '+' : ''}{inv.diferencia}
        </span>,
        'text-right',
      );
    case 'clasificacion':
      return env(<span className="text-xs text-muted-foreground">{inv.clasif_ajuste || '—'}</span>);
    case 'especialista':
      return env(<span className="text-xs text-muted-foreground">{inv.especialista_nombre || '—'}</span>);
    case 'estado':
      return env(<StatusBadge status={inv.estado_tarea} />, 'text-center');
    case 'fecha':
      return env(<span className="text-muted-foreground">{inv.fecha_inv?.slice(0, 10)}</span>);
    case 'acciones':
      return env(acciones(inv), 'whitespace-nowrap');
    default:
      return env(null);
  }
}
