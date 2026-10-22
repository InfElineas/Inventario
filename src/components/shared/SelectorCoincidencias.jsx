import ProductThumb from '@/components/shared/ProductThumb';
import { Button } from '@/components/ui/button';
import { ScanLine, X } from 'lucide-react';

/**
 * Elegir entre los productos que comparten un código de barras.
 *
 * Un código puede corresponder a varios anuncios distintos —distinto nombre,
 * suministrador y existencia— y solo quien tiene el producto delante sabe cuál
 * es. Antes el sistema elegía el primero sin avisar.
 *
 * Se muestran los datos que permiten distinguirlos: ID de tienda, que es la
 * identidad real, más suministrador y existencia física.
 */
export default function SelectorCoincidencias({ codigo, productos, onSelect, onCancel }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden" style={{ borderRadius: '8px' }}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-secondary/60 border-b border-border">
        <p className="text-xs font-medium flex items-center gap-1.5 min-w-0">
          <ScanLine className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {productos.length} productos con el código{' '}
            <span className="font-mono">{codigo}</span>
          </span>
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}
          className="h-7 px-2 shrink-0" title="Cancelar">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <p className="px-3 py-2 text-[11px] text-muted-foreground border-b border-border">
        El código de barras no distingue estos anuncios. Elige el que tienes delante.
      </p>

      <ul className="max-h-72 overflow-y-auto divide-y divide-border">
        {productos.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onSelect(p)}
              className="w-full text-left px-3 py-2.5 flex gap-3 items-center hover:bg-secondary/60 transition-colors">
              <ProductThumb fotos={p.fotos} nombre={p.nombre} className="w-12 h-12" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium line-clamp-2">{p.nombre}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {p.suministrador || 'Sin suministrador'}
                  {p.categoria_elineas ? ` · ${p.categoria_elineas}` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-muted-foreground uppercase">ID tienda</p>
                <p className="text-xs font-mono">{p.id_tienda || '—'}</p>
                <p className="text-xs tabular-nums mt-0.5">
                  EF <span className="font-medium">{p.exist_fisica ?? 0}</span>
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
