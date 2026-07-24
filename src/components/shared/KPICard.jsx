export default function KPICard({ title, value, icon: Icon, color = 'text-[#4ade80]', bgColor = 'bg-[#4ade80]/10', subtitle }) {
  return (
    <div className="p-5 rounded-lg bg-card border border-border">
      <div className="flex items-start justify-between mb-3">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest leading-tight">
          {title}
        </p>
        {Icon && (
          <div className={`p-1.5 rounded-lg ${bgColor}`}>
            <Icon className={`w-3.5 h-3.5 ${color}`} />
          </div>
        )}
      </div>
      <p className="text-[26px] font-semibold text-foreground leading-none" style={{ letterSpacing: '-0.03em' }}>
        {value}
      </p>
      {subtitle && (
        <p className="text-[11px] text-muted-foreground mt-2">{subtitle}</p>
      )}
    </div>
  );
}
