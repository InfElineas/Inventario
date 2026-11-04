import { useMemo, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { filtrarProductos } from '@/lib/ventas';

const numero = new Intl.NumberFormat('es-CU');

/**
 * Elegir un producto de los que se vendieron en el período, buscando por código
 * o por nombre.
 *
 * La lista sale de lo que ya se cargó —los productos con ventas en las fechas
 * elegidas—, así que solo ofrece lo que tiene algo que analizar. Con miles de
 * productos no se pinta todo: se enseñan los que más vendieron y se busca el
 * resto escribiendo.
 *
 * @param {object} props
 * @param {Array<{ codigo: string, nombre: string, cantidad: number }>} props.productos
 * @param {string} props.valor        Código elegido, o vacío para «todos».
 * @param {(codigo: string) => void} props.onChange
 */
export default function SelectorProducto({ productos, valor, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');

  const elegido = productos.find((p) => p.codigo === valor);
  const coincidencias = useMemo(() => filtrarProductos(productos, texto), [productos, texto]);

  const elegir = (codigo) => { onChange(codigo); setAbierto(false); setTexto(''); };

  return (
    <div className="flex items-center gap-1">
      <Popover open={abierto} onOpenChange={setAbierto}>
        <PopoverTrigger asChild>
          <button type="button" aria-label="Producto"
            className="h-9 inline-flex items-center gap-2 px-3 text-xs rounded-lg border border-border bg-card text-left max-w-[260px]"
            style={{ borderRadius: 'var(--r-ctl)' }}>
            <span className="truncate">
              {valor ? (elegido?.nombre || valor) : 'Todos los productos'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[340px] p-0">
          <div className="relative border-b border-border">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar por producto o código…" aria-label="Buscar producto"
              className="border-0 pl-9 focus-visible:ring-0" />
          </div>
          <div className="max-h-72 overflow-y-auto py-1" role="listbox" aria-label="Productos vendidos">
            <button type="button" role="option" aria-selected={!valor} onClick={() => elegir('')}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-accent">
              <span className="flex-1">Todos los productos</span>
              {!valor && <Check className="w-3.5 h-3.5" />}
            </button>
            {coincidencias.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted-foreground text-center">Ningún producto vendido coincide.</p>
            )}
            {coincidencias.map((p) => (
              <button key={p.codigo} type="button" role="option" aria-selected={p.codigo === valor}
                onClick={() => elegir(p.codigo)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent">
                <span className="min-w-0 flex-1">
                  <span className="block text-xs line-clamp-1">{p.nombre || 'Sin nombre en el catálogo'}</span>
                  <span className="block text-[11px] text-muted-foreground font-mono">{p.codigo}</span>
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">{numero.format(p.cantidad)} uds</span>
                {p.codigo === valor && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {valor && (
        <button type="button" aria-label="Quitar el producto" onClick={() => onChange('')}
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
