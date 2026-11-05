import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import AlertBanner from '@/components/shared/AlertBanner';
import { useAuth } from '@/lib/AuthContext';
import { debeElegirAlmacenes } from '@/lib/roles';
import { WAREHOUSES } from '@/services/tkc/warehouses';

/**
 * Al entrar, quien no es jefe de departamento tiene que elegir con qué almacenes
 * trabaja. No se puede cerrar ni saltar: sin elegir, la persona ve todos y termina
 * contando o ajustando en uno que no es el suyo. Se guarda en su perfil, igual que
 * en Configuración → Mis almacenes de trabajo, donde se puede cambiar después.
 */
export default function ElegirAlmacenesDialog() {
  const { user, refrescarSesion } = useAuth();
  const [elegidos, setElegidos] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  if (!debeElegirAlmacenes(user)) return null;

  const alternar = (k) => setElegidos((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  async function guardar() {
    setGuardando(true);
    setError('');
    try {
      const res = await fetch('/api/auth/perfil', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ almacenes_config: elegidos, almacen_num: elegidos[0] }),
      });
      if (!res.ok) {
        const datos = await res.json().catch(() => null);
        throw new Error(datos?.error ?? 'No se pudo guardar.');
      }
      // El perfil nuevo trae los almacenes: con eso el modal deja de salir.
      await refrescarSesion();
    } catch (e) {
      setError(e.message || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    // Sin cerrar: ni la X, ni Escape, ni pulsar fuera.
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="max-w-lg [&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="text-base font-medium">¿Con qué almacenes trabajas?</DialogTitle>
        <DialogDescription className="text-sm">
          Elige al menos uno. Solo verás y contarás en los que marques; lo puedes cambiar después en Configuración.
        </DialogDescription>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-[50vh] overflow-y-auto">
          {WAREHOUSES.map((w) => {
            const activo = elegidos.includes(w.key);
            return (
              <button key={w.key} type="button" onClick={() => alternar(w.key)} aria-pressed={activo}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  activo
                    ? 'bg-[var(--c-ok)]/10 border-[var(--c-ok)]/40 text-[var(--c-ok)]'
                    : 'bg-background border-border text-muted-foreground hover:border-[var(--c-ok)]/30 hover:text-foreground'}`}>
                <span className="truncate">{w.nombre}</span>
                {activo && <Check className="w-3 h-3 shrink-0 ml-1" />}
              </button>
            );
          })}
        </div>

        {error && <AlertBanner variant="danger" message={error} />}

        <Button onClick={guardar} disabled={elegidos.length === 0 || guardando} style={{ borderRadius: 'var(--r-ctl)' }}>
          {guardando && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
          {elegidos.length === 0 ? 'Elige al menos un almacén' : `Guardar (${elegidos.length})`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
