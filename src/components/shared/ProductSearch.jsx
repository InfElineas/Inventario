import { useState } from 'react';
import { useAlmacen } from '@/lib/useAlmacen';
import { Input } from '@/components/ui/input';
import { Search, Package } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function ProductSearch({ onSelect, placeholder: placeholderRaw }) {
  const placeholder = placeholderRaw ?? 'Buscar producto por nombre o código...';
  const { almacen }       = useAlmacen();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]   = useState(false);

  const handleSearch = async (val) => {
    setQuery(val);
    if (val.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const data = await base44.entities.Producto.buscar(
        val,
        ['nombre', 'codigo_producto'],
        { activo: true, ...(almacen ? { almacen_num: almacen } : {}) },
        'nombre',
        15,
      );
      setResults(data ?? []);
      setOpen(true);
    } catch {}
    setLoading(false);
  };

  const showEmpty = open && results.length === 0 && !loading && query.length >= 2;

  const verLista = open && (results.length > 0 || showEmpty);

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
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
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
                onClick={() => { onSelect(p); setQuery(p.nombre); setOpen(false); }}
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
