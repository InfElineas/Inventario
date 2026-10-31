import { useState } from 'react';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';

/**
 * Los filtros, plegados en el teléfono.
 *
 * Media docena de desplegables a ancho completo son media docena de líneas
 * que hay que pasar antes de ver un solo dato. En el escritorio caben en una
 * fila y se quedan donde estaban; en el móvil se esconden detrás de un botón
 * que dice cuántos hay puestos, porque un filtro activo que no se ve es la
 * forma más rápida de no entender por qué falta algo en la lista.
 *
 * @param {object}   props
 * @param {number}   props.activos  Cuántos filtros están puestos.
 * @param {Function} [props.onLimpiar]
 * @param {React.ReactNode} props.children
 */
export default function FiltrosPlegables({ activos = 0, onLimpiar, children }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <div className="sm:hidden flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm transition-transform active:scale-[0.99]"
          style={{ borderRadius: '10px' }}
        >
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="flex-1 text-left">Filtros</span>
          {activos > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full text-[11px] font-bold bg-[#4ade80]/15 text-[#4ade80]">
              {activos}
            </span>
          )}
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 transition-transform"
            style={{ transform: abierto ? 'rotate(180deg)' : 'none' }} />
        </button>
        {activos > 0 && onLimpiar && (
          <button type="button" onClick={onLimpiar}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-2 shrink-0">
            Limpiar
          </button>
        )}
      </div>

      {/* En el móvil solo si está abierto; de `sm` para arriba, siempre y en
          una fila que envuelve. */}
      <div className={`${abierto ? 'grid' : 'hidden'} grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2`}>
        {children}
      </div>
    </>
  );
}
