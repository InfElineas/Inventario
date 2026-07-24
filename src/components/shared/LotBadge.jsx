import { ESTADO_FV } from '@/lib/constants';

export default function LotBadge({ estado, dias, className = '' }) {
  const config = ESTADO_FV[estado] || ESTADO_FV.sin_fecha;
  const diasLabel = dias != null ? `${dias}d` : '';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${config.bg} ${config.text} ${className}`}
      style={{ borderRadius: '4px' }}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label} {diasLabel && <span className="opacity-75">({diasLabel})</span>}
    </span>
  );
}