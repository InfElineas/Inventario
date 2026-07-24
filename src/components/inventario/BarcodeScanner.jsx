import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera, CameraOff, Search, X, RefreshCw } from 'lucide-react';

/**
 * BarcodeScanner
 * Props:
 *  - onResult(code: string) — called when a barcode/QR is detected or manually entered
 *  - onClose() — called when the user dismisses the scanner
 */
export default function BarcodeScanner({ onResult, onClose }) {
  const videoRef       = useRef(null);
  const readerRef      = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [manualCode,   setManualCode]   = useState('');
  const [error,        setError]        = useState('');
  const [cameras,      setCameras]      = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');

  const stopCamera = () => {
    if (readerRef.current) {
      BrowserMultiFormatReader.releaseAllStreams();
      readerRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async (deviceId = '') => {
    setError('');
    try {
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      setCameraActive(true);

      const onDecode = (result) => {
        if (result) { stopCamera(); onResult(result.getText()); }
      };

      if (deviceId) {
        // Cámara específica seleccionada por el usuario
        await reader.decodeFromVideoDevice(deviceId, videoRef.current, onDecode);
      } else {
        // Sin deviceId: usar constraints con cámara trasera (ideal para móvil)
        // Esto dispara el diálogo de permisos del navegador correctamente
        await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } },
          videoRef.current,
          onDecode
        );
      }

      // Enumerar cámaras DESPUÉS de que el permiso fue concedido
      BrowserMultiFormatReader.listVideoInputDevices()
        .then(devs => { if (devs.length > 1) setCameras(devs); })
        .catch(() => {});

    } catch (e) {
      setCameraActive(false);
      const name = e?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Permiso de cámara denegado. Habilítalo en Configuración del navegador.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('No se encontró ninguna cámara en este dispositivo.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setError('La cámara está en uso por otra app. Ciérrala e intenta de nuevo.');
      } else {
        setError('No se pudo acceder a la cámara. Verifica los permisos.');
      }
    }
  };

  const switchCamera = async (deviceId) => {
    setSelectedCamera(deviceId);
    stopCamera();
    await startCamera(deviceId);
  };

  useEffect(() => () => stopCamera(), []);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualCode.trim()) onResult(manualCode.trim());
  };

  return (
    <div className="border rounded-xl p-4 space-y-4 bg-card" style={{ borderWidth: '0.5px' }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Escáner de código</p>
        <Button variant="ghost" size="sm" onClick={() => { stopCamera(); onClose(); }}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Visor */}
      <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '4/3', minHeight: 200 }}>
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        {!cameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <Camera className="w-10 h-10 opacity-40" />
            <p className="text-xs opacity-60">Cámara inactiva</p>
          </div>
        )}
        {cameraActive && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-48 h-24">
              {[
                'top-0 left-0 border-t-2 border-l-2',
                'top-0 right-0 border-t-2 border-r-2',
                'bottom-0 left-0 border-b-2 border-l-2',
                'bottom-0 right-0 border-b-2 border-r-2',
              ].map((cls, i) => (
                <div key={i} className={`absolute w-5 h-5 border-primary ${cls} rounded-sm`} />
              ))}
              <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-primary opacity-75 animate-pulse" />
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Botones cámara */}
      <div className="flex gap-2">
        {!cameraActive ? (
          <Button onClick={() => startCamera(selectedCamera)} className="flex-1" style={{ borderRadius: '8px' }}>
            <Camera className="w-4 h-4 mr-1.5" /> Activar cámara
          </Button>
        ) : (
          <>
            <Button onClick={stopCamera} variant="outline" className="flex-1" style={{ borderRadius: '8px' }}>
              <CameraOff className="w-4 h-4 mr-1.5" /> Detener
            </Button>
            {cameras.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const idx = cameras.findIndex(c => c.deviceId === selectedCamera);
                  const next = cameras[(idx + 1) % cameras.length];
                  switchCamera(next.deviceId);
                }}
                style={{ borderRadius: '8px' }}
                title="Cambiar cámara"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            )}
          </>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground">o ingresa manualmente</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Entrada manual */}
      <form onSubmit={handleManualSubmit} className="flex gap-2">
        <Input
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="Código de barras / código producto"
          style={{ borderRadius: '8px' }}
          inputMode="text"
          autoComplete="off"
        />
        <Button type="submit" variant="outline" style={{ borderRadius: '8px' }}>
          <Search className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
