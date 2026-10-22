import { useState } from 'react';
import { Package } from 'lucide-react';

/**
 * Miniatura de un producto, con marcador de posición si no hay foto o falla.
 * Estaba dentro de InventarioForm; se sacó aquí al necesitarla también el
 * selector de coincidencias de código.
 *
 * El tamaño llega como clases completas (`w-12 h-12`), no interpolado:
 * Tailwind solo ve las clases que aparecen literales en el código.
 */
export default function ProductThumb({ fotos, nombre, className = 'w-16 h-16' }) {
  const [err, setErr] = useState(false);
  const src = Array.isArray(fotos) && fotos.length > 0 ? fotos[0] : null;

  if (!src || err) {
    return (
      <div className={`${className} rounded-lg shrink-0 border border-border bg-muted flex items-center justify-center`}>
        <Package className="w-6 h-6 text-muted-foreground/40" />
      </div>
    );
  }
  return (
    <img src={src} alt={nombre} onError={() => setErr(true)}
      className={`${className} rounded-lg object-cover shrink-0 border border-border bg-muted`} />
  );
}
