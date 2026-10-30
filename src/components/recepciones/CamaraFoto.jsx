import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import AlertBanner from '@/components/shared/AlertBanner';
import { Camera, Loader2, RotateCcw } from 'lucide-react';
import { comprimirImagen } from '@/lib/imagen';

/**
 * La cámara, no la galería.
 *
 * La foto es la prueba de qué había en la caja, así que tiene que tomarse
 * delante de la caja. Un `<input type="file">` deja elegir cualquier imagen
 * del teléfono —una de hace tres meses, una de otro producto— y entonces deja
 * de probar nada. Aquí el único origen posible es la cámara en vivo.
 *
 * Se pide la trasera (`environment`); si el aparato solo tiene una, el
 * navegador da la que haya.
 */
export default function CamaraFoto({ abierta, onCerrar, onTomar }) {
  const video = useRef(null);
  const stream = useRef(null);
  const [error, setError] = useState('');
  const [tomando, setTomando] = useState(false);
  const [previa, setPrevia] = useState(null);

  useEffect(() => {
    if (!abierta) return undefined;

    let vivo = true;
    setError('');
    setPrevia(null);

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Este navegador no da acceso a la cámara.');
        }
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        // Se cerró el diálogo mientras se pedía permiso: soltar la cámara o
        // se queda encendida con el piloto puesto.
        if (!vivo) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        if (video.current) video.current.srcObject = s;
      } catch (e) {
        if (vivo) setError(mensaje(e));
      }
    })();

    return () => {
      vivo = false;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [abierta]);

  const disparar = async () => {
    const v = video.current;
    if (!v?.videoWidth) return;
    setTomando(true);
    try {
      const lienzo = document.createElement('canvas');
      lienzo.width = v.videoWidth;
      lienzo.height = v.videoHeight;
      lienzo.getContext('2d').drawImage(v, 0, 0);
      const bruto = await new Promise((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.92));
      setPrevia(await comprimirImagen(bruto));
    } catch (e) {
      setError(`No se pudo tomar la foto: ${e.message}`);
    } finally {
      setTomando(false);
    }
  };

  const usar = () => { onTomar(previa); onCerrar(); };

  return (
    <Dialog open={abierta} onOpenChange={(o) => { if (!o) onCerrar(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle className="text-sm">Foto de la presentación</DialogTitle></DialogHeader>

        {error ? (
          <AlertBanner variant="warning" message={error} />
        ) : (
          <div className="rounded-lg overflow-hidden bg-black" style={{ borderRadius: '10px' }}>
            {previa
              ? <img src={previa} alt="Foto tomada" className="w-full" />
              : <video ref={video} autoPlay playsInline muted className="w-full" />}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCerrar} style={{ borderRadius: '8px' }}>Cancelar</Button>
          {previa ? (
            <>
              <Button variant="outline" onClick={() => setPrevia(null)} style={{ borderRadius: '8px' }}>
                <RotateCcw className="w-4 h-4 mr-1.5" /> Repetir
              </Button>
              <Button onClick={usar} style={{ borderRadius: '8px' }}>Usar esta</Button>
            </>
          ) : (
            <Button onClick={disparar} disabled={Boolean(error) || tomando} style={{ borderRadius: '8px' }}>
              {tomando
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Tomando…</>
                : <><Camera className="w-4 h-4 mr-1.5" /> Tomar foto</>}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Lo que falló, dicho de forma que se pueda hacer algo al respecto. */
function mensaje(e) {
  if (e?.name === 'NotAllowedError') {
    return 'No diste permiso para usar la cámara. Actívalo en el candado de la barra de direcciones y vuelve a intentarlo.';
  }
  if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') {
    return 'Este aparato no tiene cámara disponible. La foto hay que tomarla desde el móvil.';
  }
  if (e?.name === 'NotReadableError') {
    return 'Otra aplicación está usando la cámara. Ciérrala y vuelve a intentarlo.';
  }
  return e?.message ?? 'No se pudo abrir la cámara.';
}
