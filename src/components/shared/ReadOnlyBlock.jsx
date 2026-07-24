export default function ReadOnlyBlock({ title, children }) {
  return (
    <div className="bg-secondary/50 rounded-lg p-4" style={{ borderRadius: '12px' }}>
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-3">
        {title} — solo lectura
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {children}
      </div>
    </div>
  );
}

export function ReadOnlyField({ label, value }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium text-foreground">{value || '—'}</p>
    </div>
  );
}