import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import AlertBanner from '@/components/shared/AlertBanner';
import { ArrowDownToLine, ArrowRight, Eye, Repeat, Undo2 } from 'lucide-react';
import { CLASIF_INTERCAMBIO, lineasDePares, paresDeIntercambio } from '@/lib/conteosFact';
import { DetalleConteo, DevolverConteo } from '@/components/ajustes/PendientesInventario';
import DialogosConteo, { CeldaAcciones } from '@/components/inventario/AccionesConteo';
import { tieneRol } from '@/lib/roles';
import { ROLES_TIENDA } from '@/lib/ajustes';

/**
 * Los intercambios que esperan su procesamiento.
 *
 * Un intercambio es un producto vendido por otro: uno sale faltante y el otro
 * sobrante por la misma cantidad. Se arregla pasando la existencia del que
 * falta al que sobra, que es lo que hace un procesamiento `ORIGEN>DESTINO`.
 *
 * Cada mitad del conteo apunta a la otra; aquí se ven juntas, como un solo
 * caso. Una mitad sin su par no se propone: mover mercancía entre dos productos
 * sin saber cuál es el otro es adivinar.
 *
 * Los productos que no son un intercambio —un sobrante o un faltante sin más—
 * son de las pantallas de ajustes.
 *
 * @param {object} props
 * @param {string} props.almacen
 * @param {(lineas: string, pares: Array<{ origen: object, destino: object, cantidad: number }>) => void} props.onUsar
 *   Las líneas `ORIGEN>DESTINO*CANTIDAD` y los pares de los que salen, para dar
 *   por procesados sus conteos cuando el documento salga bien.
 */
export default function ParesIntercambio({ almacen, onUsar }) {
  const queryClient = useQueryClient();
  const [excluidos, setExcluidos] = useState(() => new Set());   // por defecto van todos
  const [detalle, setDetalle] = useState(null);
  const [devolviendo, setDevolviendo] = useState(null);
  const [accion, setAccion] = useState(null);     // { tipo, inv } del menú ⋯

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

  const { data: filas = [], isLoading } = useQuery({
    queryKey: ['pend-fact', 'intercambio', almacen],
    queryFn: () => base44.entities.Inventario.filter(
      { almacen_num: almacen, estado_tarea: 'pend_fact', clasif_ajuste: CLASIF_INTERCAMBIO },
      '-fecha_inv', 500,
    ),
    enabled: Boolean(almacen),
    select: (d) => (Array.isArray(d) ? d : []),
  });

  const { pares, sueltos } = useMemo(() => paresDeIntercambio(filas), [filas]);
  const clave = (p) => `${p.origen.id}|${p.destino.id}`;
  const marcados = pares.filter((p) => !excluidos.has(clave(p)));

  if (!almacen || (!isLoading && filas.length === 0)) return null;

  const alternar = (k) => setExcluidos((prev) => {
    const s = new Set(prev);
    if (s.has(k)) s.delete(k); else s.add(k);
    return s;
  });

  const hecho = () => {
    setDevolviendo(null);
    queryClient.invalidateQueries({ queryKey: ['pend-fact'] });
    queryClient.invalidateQueries({ queryKey: ['inventarios'] });
  };

  return (
    <Card className="overflow-hidden" style={{ borderRadius: 'var(--r-card)', borderWidth: '0.5px' }}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <p className="text-sm font-medium flex items-center gap-2">
          <Repeat className="w-4 h-4 text-muted-foreground" />
          Intercambios esperando procesamiento
          {pares.length > 0 && <span className="text-xs text-muted-foreground">({pares.length})</span>}
        </p>
        {pares.length > 0 && (
          <Button type="button" variant="outline" size="sm" style={{ borderRadius: 'var(--r-ctl)' }}
            disabled={marcados.length === 0}
            onClick={() => onUsar(lineasDePares(marcados), marcados)}>
            <ArrowDownToLine className="w-3.5 h-3.5 mr-1.5" />
            Pasarlos al formulario ({marcados.length})
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="px-4 py-6 text-xs text-muted-foreground text-center">Cargando…</p>
      ) : (
        <div className="divide-y divide-border max-h-80 overflow-y-auto">
          {pares.map((p) => (
            <div key={clave(p)} className="flex items-center gap-3 px-4 py-2.5">
              <input type="checkbox" aria-label={`Incluir ${p.origen.producto_nombre} a ${p.destino.producto_nombre}`}
                checked={!excluidos.has(clave(p))} onChange={() => alternar(clave(p))}
                className="w-3.5 h-3.5 accent-[var(--c-ok)] cursor-pointer shrink-0" />
              <div className="min-w-0 flex-1 grid gap-1 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <div className="min-w-0 flex items-start gap-1">
                  <Acciones conteo={p.origen} par={p} user={user} onAccion={setAccion} onMontar={onUsar} onDetalle={setDetalle} onDevolver={setDevolviendo} />
                  <div className="min-w-0">
                    <p className="text-sm line-clamp-1">{p.origen.producto_nombre}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {p.origen.producto_codigo} · <span className="text-[var(--c-bad)]">{p.origen.diferencia}</span>
                    </p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground flex items-center gap-1 sm:justify-center">
                  <ArrowRight className="w-3.5 h-3.5" /> {p.cantidad}
                </span>
                <div className="min-w-0 flex items-start gap-1">
                  <Acciones conteo={p.destino} par={p} user={user} onAccion={setAccion} onMontar={onUsar} onDetalle={setDetalle} onDevolver={setDevolviendo} />
                  <div className="min-w-0">
                    <p className="text-sm line-clamp-1">{p.destino.producto_nombre}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {p.destino.producto_codigo} · <span className="text-[var(--c-warn)]">+{p.destino.diferencia}</span>
                    </p>
                  </div>
                </div>
              </div>
              <div className="shrink-0 whitespace-nowrap">
              </div>
            </div>
          ))}

          {sueltos.length > 0 && (
            <div className="px-4 py-3 space-y-2">
              <AlertBanner variant="warning"
                message={`${sueltos.length} ${sueltos.length === 1 ? 'conteo de intercambio no tiene' : 'conteos de intercambio no tienen'} `
                  + 'su par entre lo pendiente, así que no se propone nada con ellos.'} />
              {sueltos.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 line-clamp-1">{c.producto_nombre} <span className="text-muted-foreground">({c.diferencia})</span></span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setDevolviendo([c])}
                    aria-label={`Devolver a inventario: ${c.producto_nombre}`} title="Devolver a inventario">
                    <Undo2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <DetalleConteo conteo={detalle} onClose={() => setDetalle(null)} />
      <DialogosConteo accion={accion} onHecho={() => setAccion(null)} onClose={() => setAccion(null)} />
      <DevolverConteo conteos={devolviendo} onClose={() => setDevolviendo(null)} onHecho={hecho} />
    </Card>
  );
}

/** El menú ⋯ de un producto del par: analizar su diferencia y montar el procesamiento del par. */
function Acciones({ conteo, par, user, onAccion, onMontar, onDetalle, onDevolver }) {
  return (
    <CeldaAcciones inv={conteo} analizar onAccion={onAccion}
      puedeMoverTienda={tieneRol(user, ROLES_TIENDA)}
      extras={[{
        clave: 'montar', etiqueta: 'Montar procesamiento de este par', Icono: Repeat,
        color: 'text-[var(--c-ok)]', al: () => onMontar(lineasDePares([par]), [par]),
      }, {
        clave: 'detalle', etiqueta: 'Ver detalle del conteo', Icono: Eye, color: 'text-muted-foreground', al: () => onDetalle(conteo),
      }, {
        clave: 'devolver', etiqueta: 'Devolver los dos conteos a inventario', Icono: Undo2,
        color: 'text-[var(--c-warn)]', al: () => onDevolver([par.origen, par.destino]),
      }]} />
  );
}
