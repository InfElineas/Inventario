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
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${config.bg} ${config.text} ${className}`}
      style={{ borderRadius: '4px' }}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}