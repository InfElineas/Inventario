import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import AlertBanner from '@/components/shared/AlertBanner';
import { useAuth } from '@/lib/AuthContext';
import { useAlmacen } from '@/lib/useAlmacen';
import { debeElegirAlmacenes } from '@/lib/roles';
import { WAREHOUSES } from '@/services/tkc/warehouses';

/**
 * Al entrar, quien no es jefe de departamento tiene que elegir SU almacén. Es uno
 * solo: el que elige es el que se le muestra, y con el que trabaja hasta que lo
 * cambie en Configuración. No se puede cerrar ni saltar: sin elegir, la persona ve
 * todos y termina contando o ajustando en uno que no es el suyo.
 *
 * Se guarda en su perfil (`almacenes_config`) y pasa a ser el almacén activo de la
 * aplicación.
 */
export default function ElegirAlmacenesDialog() {
  const { user, refrescarSesion } = useAuth();
  const { setAlmacen } = useAlmacen();
  const [elegido, setElegido] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  if (!debeElegirAlmacenes(user)) return null;

  async function aceptar() {
    if (!elegido) return;
    setGuardando(true);
    setError('');
    try {
      const res = await fetch('/api/auth/perfil', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ almacenes_config: [elegido], almacen_num: elegido }),
      });
      if (!res.ok) {
        const datos = await res.json().catch(() => null);
        throw new Error(datos?.error ?? 'No se pudo guardar.');
      }
      // Es el almacén que se le muestra desde ahora.
      setAlmacen(elegido);
      // El perfil nuevo trae el almacén: con eso el diálogo deja de salir.
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
        {/* Todo dentro de un contenedor: `[&>button]:hidden` oculta la X del diálogo, y
            también cualquier botón que sea hijo directo suyo, como «Aceptar». */}
        <div className="space-y-4">
        <DialogTitle className="text-base font-medium">¿En qué almacén trabajas?</DialogTitle>
        <DialogDescription className="text-sm">
          Elige tu almacén. Es el que verás en toda la aplicación; lo puedes cambiar después en Configuración.
        </DialogDescription>

        <div role="radiogroup" aria-label="Almacén" className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-[45vh] overflow-y-auto">
          {WAREHOUSES.map((w) => {
            const activo = elegido === w.key;
            return (
              <button key={w.key} type="button" role="radio" aria-checked={activo} onClick={() => setElegido(w.key)}
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

        <Button onClick={aceptar} disabled={!elegido || guardando} style={{ borderRadius: 'var(--r-ctl)' }}>
          {guardando && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
          Aceptar
        </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
