import { useState } from 'react';
import { ArrowUpFromLine, ArrowDownToLine, MoreHorizontal, History, ClipboardList, Trash2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * Las acciones de una fila del catálogo.
 *
 * Un menú y no botones sueltos: empezó con subir y bajar de tienda, y la lista
 * va a seguir creciendo. Dos iconos caben en la columna; seis no, y acabarían
 * compitiendo por el sitio con los datos.
 *
 * Lo que una persona no puede hacer no se le enseña apagado: se le quita.
 */
export default function MenuAcciones({ producto, puedeMoverTienda, modulos = ['subir', 'bajar'], onMover, onHistorial, onConteos, onEliminar }) {
  const [abierto, setAbierto] = useState(false);

  const acciones = [];
  if (puedeMoverTienda) {
    // `modulos` deja a cada pantalla ofrecer solo lo que tiene sentido: una
    // merma se baja de tienda, pero subirla no es algo que se haga.
    if (modulos.includes('subir')) {
      acciones.push({ clave: 'subir', etiqueta: 'Subir a tienda', Icono: ArrowUpFromLine, color: 'text-[var(--c-ok)]', al: () => onMover('subir') });
    }
    if (modulos.includes('bajar')) {
      acciones.push({ clave: 'bajar', etiqueta: 'Bajar de tienda', Icono: ArrowDownToLine, color: 'text-[var(--c-warn)]', al: () => onMover('bajar') });
    }
  }

  // El historial lo puede mirar cualquiera: es leer, no mover nada.
  acciones.push({
    clave: 'historial', etiqueta: 'Historial del submayor', Icono: History,
    color: 'text-[var(--c-info-2)]', al: onHistorial,
  });
  // Qué le ha contado inventario a este producto: si aparece cada semana con
  // diferencia, no es el mismo caso que si falló una vez.
  acciones.push({
    clave: 'conteos', etiqueta: 'Conteos de inventario', Icono: ClipboardList,
    color: 'text-[var(--c-purple)]', al: onConteos,
  });

  // Solo donde quien llama la ofrece, y solo a quien puede: borrar no se
  // enseña apagado, se quita.
  if (onEliminar) {
    acciones.push({
      clave: 'eliminar', etiqueta: 'Eliminar', Icono: Trash2,
      color: 'text-[var(--c-bad)]', al: onEliminar,
    });
  }

  if (acciones.length === 0) return <span className="text-muted-foreground/40 text-xs">—</span>;

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Acciones: ${producto.nombre}`}
          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1">
        {acciones.map(({ clave, etiqueta, Icono, color, al }) => (
          <button
            key={clave} type="button"
            onClick={() => { setAbierto(false); al(); }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left hover:bg-secondary transition-colors"
          >
            <Icono className={`w-3.5 h-3.5 ${color}`} />
            {etiqueta}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
