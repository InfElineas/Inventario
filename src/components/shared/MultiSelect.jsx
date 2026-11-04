import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { ALTO } from '@/components/shared/ControlesLista';

/**
 * Un filtro de varias opciones a la vez, con buscador. Se ve como los demás
 * filtros de cabecera (cuadrado con icono, y su valor escrito a partir de `lg`)
 * y se marca en verde cuando está acotando la lista.
 *
 * El desplegable NO se cierra al marcar: se elige de una vez todo lo que haga
 * falta. Nada marcado significa «todos», que es lo que se espera de un filtro.
 *
 * @param {object} props
 * @param {string[]} props.value                  Lo marcado. Vacío = sin filtrar.
 * @param {(v: string[]) => void} props.onChange
 * @param {{value: string, label: string}[]} props.options
 * @param {string} props.placeholder              Lo que se lee con nada marcado.
 * @param {React.ElementType} [props.icono]
 * @param {(n: number) => string} [props.etiquetaVarios]  Con 2 o más marcados.
 * @param {boolean} [props.bloque]  Ocupa todo el ancho y escribe siempre su valor (dentro de un formulario).
 */
export default function MultiSelect({
  value, onChange, options, placeholder, icono: Icono, etiquetaVarios = (n) => `${n} seleccionados`, maxWidth = 'max-w-[200px]', bloque = false,
}) {
  const marcados = Array.isArray(value) ? value : [];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);

  const activo = marcados.length > 0;
  const label = marcados.length === 0
    ? placeholder
    : marcados.length === 1
      ? (options.find((o) => o.value === marcados[0])?.label ?? marcados[0])
      : etiquetaVarios(marcados.length);
  const filtradas = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  useEffect(() => {
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0); }, [open]);

  const alternar = (v) => onChange(marcados.includes(v) ? marcados.filter((x) => x !== v) : [...marcados, v]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" title={label} aria-label={label} aria-expanded={open}
        onClick={() => { setOpen((v) => !v); setQuery(''); }}
        className={`${ALTO} ${bloque
          ? 'w-full justify-between gap-1.5 px-3 text-sm'
          : `w-9 justify-center lg:w-auto lg:justify-between lg:gap-1.5 lg:px-3 ${maxWidth} text-xs`} flex items-center rounded-lg bg-card border transition-colors cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-[var(--c-ok)]/50 ${
          activo ? 'border-[var(--c-ok)]/40 text-[var(--c-ok)] bg-[var(--c-ok)]/10' : 'border-border text-muted-foreground hover:text-foreground'}`}>
        <span className="flex items-center gap-1.5 min-w-0">
          {Icono && <Icono className="w-4 h-4 shrink-0" />}
          <span className={`${bloque ? '' : 'hidden lg:inline'} truncate`}>{label}</span>
        </span>
        <ChevronDown className={`${bloque ? '' : 'hidden lg:block'} w-3.5 h-3.5 shrink-0 opacity-60`} />
      </button>

      {open && (
        <div className="absolute top-[calc(100%+4px)] right-0 z-50 rounded-xl shadow-2xl overflow-hidden"
          style={{ width: '260px', maxWidth: 'calc(100vw - 2rem)', background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-[var(--c-ok)]/50" />
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-1.5 text-[11px] text-muted-foreground border-b border-border">
            <span>{activo ? `${marcados.length} marcados` : 'Todos'}</span>
            <button type="button" disabled={!activo} onClick={() => onChange([])}
              className="text-[var(--c-ok)] disabled:opacity-40 disabled:cursor-default hover:underline">
              Quitar filtro
            </button>
          </div>
          <div className="py-1 max-h-52 overflow-y-auto" role="listbox" aria-multiselectable="true">
            {filtradas.length === 0 ? (
              <p className="px-4 py-3 text-xs text-muted-foreground text-center">Sin resultados</p>
            ) : filtradas.map((o) => {
              const on = marcados.includes(o.value);
              return (
                <button key={o.value} type="button" role="option" aria-selected={on} onClick={() => alternar(o.value)}
                  className={`w-full flex items-center gap-2 text-left px-4 py-2 text-sm transition-colors hover:bg-white/[0.04] ${on ? 'text-[var(--c-ok)]' : 'text-muted-foreground hover:text-foreground'}`}>
                  <span className={`w-3.5 h-3.5 shrink-0 rounded-[3px] border flex items-center justify-center ${on ? 'bg-[var(--c-ok)] border-[var(--c-ok)]' : 'border-border'}`}>
                    {on && <Check className="w-3 h-3 text-background" />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
