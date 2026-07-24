import { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useAlmacen } from '@/lib/useAlmacen';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Search, Package } from 'lucide-react';

export default function ProductSearch({ onSelect, placeholder = 'Buscar producto por nombre o código...' }) {
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
      let q = supabase
        .from('productos')
        .select('id, nombre, codigo_producto, suministrador, exist_fisica, precio_costo, id_tienda, almacen_num, fotos')
        .eq('activo', true)
        .limit(15);

      if (almacen) q = q.eq('almacen_num', almacen);

      // Búsqueda por nombre o código
      q = q.or(`nombre.ilike.%${val}%,codigo_producto.ilike.%${val}%`);

      const { data } = await q.order('nombre', { ascending: true });
      setResults(data ?? []);
      setOpen(true);
    } catch {}
    setLoading(false);
  };

  const showEmpty = open && results.length === 0 && !loading && query.length >= 2;

  return (
    // Popover en vez de un <div absolute> propio: así el menú se renderiza en un
    // portal (document.body) y no lo recorta ningún ancestro con overflow-y-auto
    // (por ejemplo, el contenido de un Dialog/modal).
    <Popover open={open && (results.length > 0 || showEmpty)} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
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
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="w-[var(--radix-popover-trigger-width)] p-0 max-h-60 overflow-auto bg-card"
        style={{ borderRadius: '12px', borderWidth: '0.5px' }}
      >
        {results.length > 0 ? (
          results.map((p) => (
            <button
              key={p.id}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-left"
              onClick={() => { onSelect(p); setQuery(p.nombre); setOpen(false); }}
            >
              <Package className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{p.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {p.codigo_producto} · {p.suministrador?.replace('SEL ', '') || '—'} · EF: {p.exist_fisica ?? 0} · ${(p.precio_costo ?? 0).toFixed(2)}
                </p>
              </div>
            </button>
          ))
        ) : (
          showEmpty && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No se encontraron productos{almacen ? ` en el almacén ${almacen}` : ''}
            </div>
          )
        )}
      </PopoverContent>
    </Popover>
  );
}
