import { AlertTriangle, Info, CheckCircle } from 'lucide-react';

const variants = {
  warning: { bg: 'bg-[var(--c-warn)]/6', border: 'border-[var(--c-warn)]/20', text: 'text-[var(--c-warn)]', Icon: AlertTriangle },
  danger: { bg: 'bg-[var(--c-bad)]/6', border: 'border-[var(--c-bad)]/20', text: 'text-[var(--c-bad)]', Icon: AlertTriangle },
  info: { bg: 'bg-[var(--c-info)]/6', border: 'border-[var(--c-info)]/20', text: 'text-[var(--c-info)]', Icon: Info },
  success: { bg: 'bg-[var(--c-ok-dim)]/6', border: 'border-[var(--c-ok-dim)]/20', text: 'text-[var(--c-ok-dim)]', Icon: CheckCircle },
};

export default function AlertBanner({ variant: variantRaw, message }) {
  const variant = variantRaw ?? 'warning';
  const v = variants[variant];
  const IconComp = v.Icon;
  return (
    <div className={`flex items-center gap-2.5 px-4 py-3 rounded-lg border ${v.bg} ${v.border}`}
      style={{ borderRadius: 'var(--r-ctl)' }}>
      <IconComp className={`w-4 h-4 ${v.text} shrink-0`} />
      <p className={`text-sm ${v.text}`}>{message}</p>
    </div>
  );
}