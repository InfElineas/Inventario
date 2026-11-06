import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import ListaCambios from '@/components/novedades/ListaCambios';
import { BUILD_ID, hayVersionNueva, leerVersionRemota } from '@/lib/version';

/**
 * Avisa de que hay una versión nueva de la web mientras alguien la tiene abierta.
 *
 * Una pestaña abierta desde antes de un despliegue sigue con el código viejo hasta
 * que se recarga, y la persona no tiene cómo saberlo. Aquí se consulta
 * `/version.json` al volver a la pestaña y cada cinco minutos: si el servidor tiene
 * otra compilación, sale un aviso con lo que cambia y un botón para actualizar.
 *
 * No obliga: «Más tarde» lo cierra y no vuelve a salir hasta que haya OTRA versión
 * más nueva. Recargar a mitad de un conteo a medio escribir se lo perdería, así que
 * decide la persona.
 *
 * @param {{ cada?: number, buildId?: string }} props  `cada`: ms entre consultas
 *   (por defecto 5 min). `buildId`: para pruebas.
 */
export default function AvisoActualizacion({ cada = 5 * 60 * 1000, buildId = BUILD_ID }) {
  const [nueva, setNueva] = useState(null);         // lo publicado, cuando es distinto
  const [descartada, setDescartada] = useState(''); // la compilación que dijo «más tarde»

  useEffect(() => {
    if (buildId === 'dev') return undefined;
    let vivo = true;
    let ultimaVez = 0;

    const comprobar = async () => {
      ultimaVez = Date.now();
      const remota = await leerVersionRemota();
      if (vivo && hayVersionNueva(buildId, remota)) setNueva(remota);
    };
    const alVolver = () => {
      // Al volver a la pestaña, no más de una vez por minuto.
      if (document.visibilityState === 'visible' && Date.now() - ultimaVez > 60_000) comprobar();
    };

    comprobar();
    const periodico = setInterval(() => { if (document.visibilityState === 'visible') comprobar(); }, cada);
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    return () => {
      vivo = false;
      clearInterval(periodico);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
    };
  }, [cada, buildId]);

  const abierto = Boolean(nueva) && nueva.build !== descartada;
  if (!abierto) return null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) setDescartada(nueva.build); }}>
      <DialogContent className="max-w-md">
        <DialogTitle className="text-base font-medium flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-[var(--c-ok)]" /> Hay una versión nueva
        </DialogTitle>
        <DialogDescription className="text-sm">
          {nueva.release?.titulo ?? 'La web se actualizó.'} Actualiza para usarla; si estás en medio de algo,
          termínalo antes.
        </DialogDescription>

        {nueva.release?.cambios?.length > 0 && (
          <div className="max-h-[40vh] overflow-y-auto">
            <ListaCambios cambios={nueva.release.cambios} />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDescartada(nueva.build)} style={{ borderRadius: 'var(--r-ctl)' }}>
            Más tarde
          </Button>
          <Button onClick={() => window.location.reload()} style={{ borderRadius: 'var(--r-ctl)' }}>
            Actualizar ahora
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
