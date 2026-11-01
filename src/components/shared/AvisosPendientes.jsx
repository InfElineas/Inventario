import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

/**
 * Qué te está esperando, con a dónde ir a resolverlo.
 *
 * El panel enseñaba cifras del catálogo —cuántos SKU hay, cuántos están
 * agotados— que no se pueden hacer nada con ellas desde ahí. Un panel sirve
 * para saber qué toca hoy: cuántos lotes se van a vencer, cuántos conteos
 * esperan tu firma, cuántos casos te devolvieron. Y cada uno con su enlace,
 * porque leer el número y no poder ir es media función.
 *
 * Lo que está en cero no sale. Una lista de «0 pendientes» repetida cinco
 * veces es ruido que esconde el único que sí tiene algo.
 *
 * @param {{avisos: {clave, cantidad, texto, accion, enlace, color, Icono}[]}} props
 */
export default function AvisosPendientes({ avisos }) {
  const vivos = avisos.filter((a) => a && a.cantidad > 0);

  if (vivos.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">No tienes nada pendiente ahora mismo.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
      {vivos.map(({ clave, cantidad, texto, accion, enlace, color, Icono }) => (
        <Link
          key={clave}
          to={enlace}
          className="flex items-center gap-3 px-3 py-3 sm:px-4 transition-colors hover:bg-accent/40 active:scale-[0.995]"
        >
          <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${color}18` }}>
            <Icono className="w-4 h-4" style={{ color }} />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-sm leading-snug">
              <strong className="font-semibold tabular-nums" style={{ color }}>{cantidad}</strong>
              {' '}{texto}
            </span>
            <span className="block text-[11px] text-muted-foreground">{accion}</span>
          </span>

          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </Link>
      ))}
    </div>
  );
}
