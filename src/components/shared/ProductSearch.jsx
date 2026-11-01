import { useEffect, useRef, useState } from 'react';
import { useAlmacen } from '@/lib/useAlmacen';
import { Input } from '@/components/ui/input';
import { Search, Package } from 'lucide-react';
import { base44 } from '@/api/base44Client';

/** Lo que se espera a que dejen de escribir antes de preguntar. */
const ESPERA_MS = 250;

export default function ProductSearch({ onSelect, placeholder: placeholderRaw }) {
  const placeholder = placeholderRaw ?? 'Buscar producto por nombre o código...';
  const { almacen }       = useAlmacen();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen]   = useState(false);
  // El número de la última búsqueda pedida y el nombre del producto ya
  // elegido. Ver abajo por qué hacen falta los dos.
  const ultima  = useRef(0);
  const elegido = useRef('');

  useEffect(() => {
    const val = query.trim();
    // Al elegir un producto su nombre se queda escrito en el campo. Sin esto,
    // ese nombre se buscaba otra vez y la lista volvía a abrirse sola encima
    // del formulario que acababa de aparecer.
    if (val.length < 2 || val === elegido.current) {
      setResults([]); setOpen(false); setLoading(false); setError('');
      return;
    }

    setLoading(true);
    // Una búsqueda por cada tecla era una petición por letra, y la respuesta
    // de «choco» podía llegar después de la de «chocolate» y pisarla: se veía
    // una lista que no correspondía a lo escrito. Se espera a que paren de
    // escribir y, además, cada respuesta comprueba que sigue siendo la última
    // pedida antes de pintarse.
    const mia = ++ultima.current;
    const t = setTimeout(async () => {
      try {
        const data = await base44.entities.Producto.buscar(
          val,
          ['nombre', 'codigo_producto'],
          { activo: true, ...(almacen ? { almacen_num: almacen } : {}) },
          'nombre',
          15,
        );
        if (mia !== ultima.current) return;
        setResults(data ?? []); setError(''); setOpen(true);
      } catch (e) {
        if (mia !== ultima.current) return;
        // Antes el fallo se tragaba entero: la lista salía vacía y parecía
        // que el producto no existía.
        setResults([]); setError(e?.message || 'No se pudo buscar'); setOpen(true);
      } finally {
        if (mia === ultima.current) setLoading(false);
      }
    }, ESPERA_MS);

    return () => clearTimeout(t);
  }, [query, almacen]);

  const elegir = (p) => {
    elegido.current = p.nombre ?? '';
    onSelect(p);
    setQuery(p.nombre ?? '');
    setOpen(false);
  };

  const showEmpty = open && !error && results.length === 0 && !loading && query.trim().length >= 2;

  const verLista = open && (results.length > 0 || showEmpty || Boolean(error));

  return (
    // La lista va en el flujo, debajo del buscador, y no flotando encima.
    //
    // Flotar tiene dos problemas dentro de un modal, y los tiene siempre: si
    // el menú se dibuja dentro del diálogo, el `overflow-y-auto` del diálogo
    // lo recorta; y si se saca a un portal para que no lo recorte, queda
    // fuera del bloqueo de scroll que monta Radix al abrir el modal, así que
    // la rueda del ratón y el dedo dejan de mover la lista —justo lo que
    // hace falta cuando hay quince resultados—.
    //
    // En el flujo no pasa ninguna de las dos cosas: la lista empuja el
    // contenido, y el scroll que la mueve es el del propio diálogo, que sí
    // está permitido. Es como ya funcionaba SelectorCoincidencias.
    // `min-w-0` por si el buscador cuelga directo de una fila flex: el nombre
    // de un producto no cabe en una línea y, sin esto, el hueco se estira
    // hasta que cabe en vez de recortarlo.
    <div className="space-y-2 min-w-0">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="pl-10"
          style={{ borderRadius: '8px' }}
        />
      </div>

      {verLista && (
        <div className="border border-border bg-card max-h-60 overflow-y-auto divide-y divide-border"
          style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
          {results.length > 0 ? (
            results.map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-left"
                onClick={() => elegir(p)}
              >
                <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.nombre}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.codigo_producto} · {p.suministrador?.replace('SEL ', '') || '—'} · EF: {p.exist_fisica ?? 0} · ${(p.precio_costo ?? 0).toFixed(2)}
                  </p>
                </div>
              </button>
            ))
          ) : error ? (
            <div className="p-4 text-center text-sm text-[#E24B4A]">
              No se pudo buscar: {error}
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No se encontraron productos{almacen ? ` en el almacén ${almacen}` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
