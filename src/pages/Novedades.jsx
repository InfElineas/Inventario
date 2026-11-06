import { Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import ListaCambios from '@/components/novedades/ListaCambios';
import { RELEASES } from '@/data/releases';

/** Todo lo que ha ido cambiando en la web, lo último arriba. */
export default function Novedades() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg sm:text-xl font-medium flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[var(--c-ok)]" /> Novedades
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Lo que va cambiando en la web, con su fecha.</p>
      </div>

      <div className="space-y-4">
        {RELEASES.map((r, i) => (
          <Card key={r.version} className="p-5 space-y-3" style={{ borderRadius: 'var(--r-card)', borderWidth: '0.5px' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-medium">{r.titulo}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(`${r.fecha}T00:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              {i === 0 && (
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide rounded px-1.5 py-0.5 text-[var(--c-ok)] bg-[var(--c-ok)]/10">
                  Última
                </span>
              )}
            </div>
            <ListaCambios cambios={r.cambios} />
          </Card>
        ))}
      </div>
    </div>
  );
}
