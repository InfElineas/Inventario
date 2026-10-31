/**
 * Un número grande con su etiqueta.
 *
 * Los tamaños van en píxeles y no en `rem` a propósito: son decisiones
 * tipográficas de este componente, no texto corrido que deba seguir la escala
 * del resto. Lo que sí cambia con la pantalla es cuánto ocupa, porque cinco
 * de estas a 26 px y con 20 px de aire alrededor se comían el móvil entero
 * antes de que apareciera un solo dato.
 */
export default function KPICard({ title, value, icon: Icon, color: colorRaw, bgColor: bgColorRaw, subtitle }) {
  const color = colorRaw ?? 'text-[#4ade80]'
  const bgColor = bgColorRaw ?? 'bg-[#4ade80]/10'
  return (
    <div className="p-3 sm:p-5 rounded-lg bg-card border border-border">
      <div className="flex items-start justify-between mb-1.5 sm:mb-3 gap-2">
        <p className="text-[10px] sm:text-[11px] font-medium text-muted-foreground uppercase tracking-wider sm:tracking-widest leading-tight min-w-0">
          {title}
        </p>
        {Icon && (
          <div className={`p-1 sm:p-1.5 rounded-lg shrink-0 ${bgColor}`}>
            <Icon className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${color}`} />
          </div>
        )}
      </div>
      <p className="text-[20px] sm:text-[26px] font-semibold text-foreground leading-none tabular-nums"
        style={{ letterSpacing: '-0.03em' }}>
        {value}
      </p>
      {subtitle && (
        <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-1.5 sm:mt-2">{subtitle}</p>
      )}
    </div>
  );
}
