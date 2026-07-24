import { ESTADO_TAREA } from '@/lib/constants';

export default function StatusBadge({ status, className = '' }) {
  const config = ESTADO_TAREA[status] || ESTADO_TAREA.pendiente;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${config.bg} ${config.text} ${className}`}
      style={{ borderRadius: '4px' }}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}