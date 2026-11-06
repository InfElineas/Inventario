import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import ListaCambios from '@/components/novedades/ListaCambios';
import { RELEASES } from '@/data/releases';
import { leerReleaseVista, marcarReleaseVista, releaseSinVer } from '@/lib/version';

/**
 * Lo que cambió, una sola vez: la primera vez que alguien abre la web con una
 * entrada de novedades que no ha visto. Al cerrarla se recuerda en ese navegador y
 * no vuelve a salir hasta la siguiente. Todo el histórico está en Novedades.
 *
 * @param {{ releases?: typeof RELEASES, vista?: string|null }} props  Para pruebas.
 */
export default function NovedadesDialog({ releases = RELEASES, vista }) {
  const [release, setRelease] = useState(
    () => releaseSinVer(vista === undefined ? leerReleaseVista() : vista, releases),
  );

  if (!release) return null;

  const cerrar = () => { marcarReleaseVista(release.version); setRelease(null); };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) cerrar(); }}>
      <DialogContent className="max-w-md">
        <DialogTitle className="text-base font-medium flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--c-ok)]" /> Novedades
        </DialogTitle>
        <DialogDescription className="text-sm">{release.titulo}</DialogDescription>

        <div className="max-h-[50vh] overflow-y-auto">
          <ListaCambios cambios={release.cambios} />
        </div>

        <div className="flex justify-between items-center gap-2">
          <Button asChild variant="ghost" size="sm" onClick={cerrar}>
            <Link to="/novedades">Ver todas las novedades</Link>
          </Button>
          <Button onClick={cerrar} style={{ borderRadius: 'var(--r-ctl)' }}>Entendido</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
