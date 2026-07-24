import { AlertTriangle, Info, CheckCircle } from 'lucide-react';

const variants = {
  warning: { bg: 'bg-[#BA751710]', border: 'border-[#BA7517]/20', text: 'text-[#BA7517]', Icon: AlertTriangle },
  danger: { bg: 'bg-[#E24B4A10]', border: 'border-[#E24B4A]/20', text: 'text-[#E24B4A]', Icon: AlertTriangle },
  info: { bg: 'bg-[#378ADD10]', border: 'border-[#378ADD]/20', text: 'text-[#378ADD]', Icon: Info },
  success: { bg: 'bg-[#1D9E7510]', border: 'border-[#1D9E75]/20', text: 'text-[#1D9E75]', Icon: CheckCircle },
};

export default function AlertBanner({ variant = 'warning', message }) {
  const v = variants[variant];
  const IconComp = v.Icon;
  return (
    <div className={`flex items-center gap-2.5 px-4 py-3 rounded-lg border ${v.bg} ${v.border}`}
      style={{ borderRadius: '8px' }}>
      <IconComp className={`w-4 h-4 ${v.text} flex-shrink-0`} />
      <p className={`text-sm ${v.text}`}>{message}</p>
    </div>
  );
}