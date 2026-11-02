import { ESTADO_TAREA, ESTADO_RECEPCION } from '@/lib/constants';

/**
 * @param {{ status: string, vocabulario?: 'tarea'|'recepcion' }} props
 *   Una recepción no está «devuelta» ni «completada»: tiene su propio
 *   vocabulario, que dice lo que de verdad pasó con la mercancía.
 */
export default function StatusBadge({ status, vocabulario, className: classNameRaw }) {
  const className = classNameRaw ?? '';
  const tabla = vocabulario === 'recepcion' ? ESTADO_RECEPCION : ESTADO_TAREA;
  const config = tabla[status] || ESTADO_TAREA.pendiente;
  // Punto y palabra, sin pastilla.
  //
  // El fondo de color no añadía nada que el punto no dijera ya, y cobraba
  // caro: cinco píldoras en una fila de tabla son cinco manchas de color
  // compitiendo con el dato, y cada una se llevaba 20 px de ancho y 8 de
  // alto que en una lista de cincuenta filas se notan. El color sigue
  // estando donde hace falta —en el punto y en la palabra—, que es lo que
  // se busca al repasar una columna de estados.
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${config.text} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />
      {config.label}
    </span>
  );
}