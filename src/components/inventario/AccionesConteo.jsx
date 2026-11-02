import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import AlertBanner from '@/components/shared/AlertBanner';
import MenuAcciones from '@/components/productos/MenuAcciones';
import MoverTiendaDialog, { sugerirBajada } from '@/components/productos/MoverTiendaDialog';
import HistorialSubmayorDialog from '@/components/productos/HistorialSubmayorDialog';
import HistorialInventarioDialog from '@/components/productos/HistorialInventarioDialog';
import { fetchExistenciaTkc } from '@/services/tkcService';
import { SIN_SONDEO } from '@/lib/query-client';
import { warehouseName } from '@/services/tkc/warehouses';
import { puedeEliminarConteo } from '@/lib/conteos';
import { Loader2 } from 'lucide-react';

/**
 * Las acciones del catálogo, sobre la fila de un conteo.
 *
 * Una fila de Inventario no trae lo que esas acciones necesitan —la
 * existencia repartida entre almacén y tienda, ni el id del anuncio en TKC—,
 * así que se busca al abrirlas, y con las mismas claves de consulta que el
 * detalle del conteo para no pedirlo dos veces.
 */

/** La celda: el menú, sin que pulsarlo abra el detalle de la fila. */
export function CeldaAcciones({ inv, user, puedeMoverTienda, onAccion }) {
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <MenuAcciones
        producto={{ nombre: inv.producto_nombre }}
        puedeMoverTienda={puedeMoverTienda}
        onMover={(modulo) => onAccion({ tipo: modulo, inv })}
        onHistorial={() => onAccion({ tipo: 'historial', inv })}
        onConteos={() => onAccion({ tipo: 'conteos', inv })}
        onEliminar={puedeEliminarConteo(inv, user) ? () => onAccion({ tipo: 'eliminar', inv }) : undefined}
      />
    </div>
  );
}

/** Mientras llega la existencia, o si no llega: el diálogo no se abre a medias. */
function Espera({ inv, error, onClose }) {
  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogTitle className="text-sm font-medium">{warehouseName(inv.almacen_num)}</DialogTitle>
        <DialogDescription className="text-xs">{inv.producto_nombre}</DialogDescription>
        {error
          ? <AlertBanner variant="danger" message={error} />
          : (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Consultando la existencia en TKC…
            </p>
          )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * El diálogo que corresponde a la acción elegida.
 *
 * `accion` es `{ tipo, inv }`; con `null` no hay nada abierto.
 */
export default function DialogosConteo({ accion, onHecho, onClose }) {
  const inv = accion?.inv;
  const tipo = accion?.tipo;

  const { data: producto, isLoading: cargaProducto } = useQuery({
    queryKey: ['producto-de-conteo', inv?.producto_id],
    queryFn: () => base44.entities.Producto.filter({ id: inv.producto_id }, '-updated_date', 1),
    enabled: Boolean(inv?.producto_id) && tipo !== 'conteos',
    select: (d) => (Array.isArray(d) ? d[0] : null),
    ...SIN_SONDEO,
  });
  const idTienda = producto?.id_tienda;

  // Solo subir y bajar necesitan la existencia en vivo.
  const muevePieza = tipo === 'subir' || tipo === 'bajar';
  const { data: submayor, isLoading: cargaSubmayor, error: errorSubmayor } = useQuery({
    queryKey: ['submayor-producto', inv?.almacen_num, idTienda],
    queryFn: () => fetchExistenciaTkc({ almacen: inv.almacen_num, idTienda }),
    enabled: muevePieza && Boolean(inv?.almacen_num && idTienda),
    retry: false,
    ...SIN_SONDEO,
  });

  if (!accion) return null;

  if (tipo === 'conteos') {
    return (
      <HistorialInventarioDialog
        producto={{ nombre: inv.producto_nombre, codigo: inv.producto_codigo }}
        almacen={inv.almacen_num}
        onClose={onClose}
      />
    );
  }

  if (!inv.producto_id) {
    return <Espera inv={inv} onClose={onClose} error="Este conteo no está ligado a un producto del catálogo." />;
  }
  if (cargaProducto) return <Espera inv={inv} onClose={onClose} />;
  if (!idTienda) {
    return <Espera inv={inv} onClose={onClose} error="El producto no tiene id de anuncio en TKC: no se puede consultar." />;
  }

  if (tipo === 'historial') {
    return (
      <HistorialSubmayorDialog
        producto={{ nombre: inv.producto_nombre, codigo: inv.producto_codigo, id_tienda: idTienda }}
        almacen={inv.almacen_num}
        onClose={onClose}
      />
    );
  }

  if (cargaSubmayor) return <Espera inv={inv} onClose={onClose} />;
  if (errorSubmayor || !submayor?.existencia) {
    return (
      <Espera inv={inv} onClose={onClose}
        error={errorSubmayor?.message ?? 'El submayor de TKC no tiene este producto en este almacén.'} />
    );
  }

  const { fisica, enAlmacen, enTienda } = submayor.existencia;

  // La sugerencia es de bajar; subir se queda como en el catálogo. Y si la
  // existencia cambió desde el conteo, se dice: la diferencia es de aquel día.
  const base = tipo === 'bajar' ? sugerirBajada(inv.diferencia, enTienda) : null;
  const entonces = inv.exist_fisica_tkc;
  const cambio = Number.isFinite(fisica) && Number.isFinite(entonces) && fisica !== entonces;
  const aviso = cambio
    ? `La existencia cambió desde el conteo (${entonces} → ${fisica}); la diferencia es la de aquel día.`
    : '';
  const motivo = [base?.motivo, tipo === 'bajar' ? aviso : ''].filter(Boolean).join(' ');
  const sugerencia = motivo ? { ...(base ?? {}), motivo } : undefined;

  return (
    <MoverTiendaDialog
      modulo={tipo}
      producto={{
        codigo: inv.producto_codigo, nombre: inv.producto_nombre,
        ef: fisica, enAlmacen, enTienda,
      }}
      almacen={inv.almacen_num}
      sugerencia={sugerencia}
      onHecho={onHecho}
      onClose={onClose}
    />
  );
}
