import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Un grupo de números: tarjetas en el escritorio, una sola lista en el móvil.
 *
 * Seis tarjetas a dos columnas son tres pantallas de scroll antes de llegar a
 * nada accionable, y cada una gasta su borde, su relleno y su aire para
 * enseñar un número de cuatro cifras. En el teléfono se convierten en un
 * bloque con una fila por dato —nombre a la izquierda, número a la derecha—,
 * de las que se ven tres: las tres primeras son las que el grupo quiso contar
 * primero, y el resto se despliega si hace falta.
 *
 * @param {object} props
 * @param {{clave: string, titulo: string, valor: any, sub?: string,
 *          color?: string, alerta?: boolean, onClick?: Function}[]} props.metricas
 * @param {number} [props.visibles] Cuántas se ven en el móvil sin desplegar.
 * @param {string} [props.columnas] Clases de rejilla para el escritorio.
 */
export default function BloqueMetricas({ metricas, visibles = 3, columnas = 'sm:grid-cols-3 lg:grid-cols-6' }) {
  const [abierto, setAbierto] = useState(false);
  const utiles = metricas.filter(Boolean);
  if (utiles.length === 0) return null;

  const ocultas = Math.max(0, utiles.length - visibles);
  const enLista = abierto ? utiles : utiles.slice(0, visibles);

  return (
    <>
      {/* Móvil: un bloque, una fila por dato. */}
      <div className="sm:hidden rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        {enLista.map((m) => (
          <button
            key={m.clave}
            type="button"
            onClick={m.onClick}
            disabled={!m.onClick}
            className={`w-full flex items-baseline gap-3 px-3 py-2.5 text-left transition-transform ${
              m.onClick ? 'active:scale-[0.99]' : 'cursor-default'
            }`}
            style={{ background: m.alerta ? `${m.color}0d` : undefined }}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm truncate">{m.titulo}</span>
              {m.sub && <span className="block text-[10px] text-muted-foreground leading-tight">{m.sub}</span>}
            </span>
            <span className="text-lg font-bold tabular-nums leading-none shrink-0" style={{ color: m.color }}>
              {m.valor ?? '—'}
            </span>
          </button>
        ))}

        {ocultas > 0 && (
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="w-full flex items-center justify-center gap-1 py-2 text-xs text-muted-foreground"
          >
            {abierto ? 'Ver menos' : `Ver ${ocultas} más`}
            <ChevronDown className="w-3.5 h-3.5 transition-transform"
              style={{ transform: abierto ? 'rotate(180deg)' : 'none' }} />
          </button>
        )}
      </div>

      {/* Escritorio: las tarjetas de siempre, donde sí hay sitio. */}
      <div className={`hidden sm:grid grid-cols-2 ${columnas} gap-3`}>
        {utiles.map((m) => <TarjetaMetrica key={m.clave} {...m} />)}
      </div>
    </>
  );
}

export function TarjetaMetrica({ titulo, valor, sub, color, alerta, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-4 bg-card transition-colors select-none
        ${onClick ? 'cursor-pointer hover:bg-accent/40 active:scale-[.98]' : ''}`}
      style={{ borderColor: alerta ? `${color}44` : undefined, background: alerta ? `${color}0d` : undefined }}
    >
      <p className="text-xs text-muted-foreground mb-1 truncate">{titulo}</p>
      <p className="text-2xl font-bold tabular-nums leading-none" style={{ color }}>{valor ?? '—'}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{sub}</p>}
      {onClick && <p className="text-[9px] text-muted-foreground/60 mt-1">Ver detalle</p>}
    </div>
  );
}
