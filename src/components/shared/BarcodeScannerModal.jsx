import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { supabase } from '@/api/supabaseClient';
import { supabaseExterna } from '@/api/externalSupabase';
import { useAlmacen } from '@/lib/useAlmacen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera, CameraOff, Search, X, ScanLine, CheckCircle2, AlertCircle, ChevronDown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * BarcodeScannerModal
 * Props:
 *  - onSelect(producto) — called when a product is found
 *  - onClose()
 */
export default function BarcodeScannerModal({ onSelect, onClose }) {
  const { almacen } = useAlmacen();
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [status, setStatus] = useState(null); // { type: 'success'|'error', message }
  const [scanning, setScanning] = useState(false);

  const handleCode = async (code) => {
    const clean = code.trim();

    // 1. Buscar primero en BD interna por codigo_producto
    let q = supabase
      .from('productos')
      .select('id, nombre, codigo_producto, id_tienda, exist_fisica, almacen, tienda, suministrador')
      .eq('activo', true)
      .eq('codigo_producto', clean);
    if (almacen) q = q.eq('almacen_num', almacen);
    const { data: interno } = await q.limit(1);

    if (interno?.[0]) {
      setStatus({ type: 'success', message: `✓ ${interno[0].nombre}` });
      setTimeout(() => { onSelect(interno[0]); onClose(); }, 800);
      return;
    }

    // 2. Fallback: buscar en BD externa (catálogo completo) por campo codigo
    if (supabaseExterna) {
      const { data: externo } = await supabaseExterna
        .from('products')
        .select('id, codigo, nombre, suministrador')
        .eq('codigo', clean)
        .limit(1);

      if (externo?.[0]) {
        // Producto existe en catálogo pero no está importado en este almacén
        setStatus({
          type: 'error',
          message: `"${externo[0].nombre}" existe en el catálogo pero no está importado en el almacén${almacen ? ` ${almacen}` : ''}.`,
        });
        return;
      }
    }

    setStatus({ type: 'error', message: `Sin coincidencia para: "${clean}"` });
  };

  const startCamera = async (deviceId = selectedCamera) => {
    setStatus(null);
    try {
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      setCameraActive(true);
      setScanning(true);

      const onDecode = (result) => {
        if (result) { stopCamera(); handleCode(result.getText()).catch(() => {}); }
      };

      if (deviceId) {
        await reader.decodeFromVideoDevice(deviceId, videoRef.current, onDecode);
      } else {
        // Sin deviceId: constraints con cámara trasera — dispara el diálogo de permisos
        // y funciona en móvil y escritorio sin enumerar dispositivos antes del permiso
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
      setScanning(false);
      const name = e?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setStatus({ type: 'error', message: 'Permiso de cámara denegado. Habilítalo en Configuración del navegador.' });
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setStatus({ type: 'error', message: 'No se encontró ninguna cámara en este dispositivo.' });
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setStatus({ type: 'error', message: 'La cámara está en uso por otra app. Ciérrala e intenta de nuevo.' });
      } else {
        setStatus({ type: 'error', message: 'No se pudo acceder a la cámara. Verifica los permisos.' });
      }
    }
  };

  const stopCamera = () => {
    if (readerRef.current) { BrowserMultiFormatReader.releaseAllStreams(); readerRef.current = null; }
    setCameraActive(false);
    setScanning(false);
  };

  // Auto-iniciar cámara al montar (pequeño delay para que el video esté en el DOM)
  useEffect(() => {
    const t = setTimeout(() => { if (videoRef.current) startCamera(); }, 250);
    return () => { clearTimeout(t); stopCamera(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualCode.trim()) { handleCode(manualCode.trim()); }
  };

  return (
    // Backdrop
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" style={{ borderWidth: '0.5px', border: '1px solid hsl(var(--border))' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Escáner de código de barras</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { stopCamera(); onClose(); }}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-5 space-y-4">
          {/* Viewfinder */}
          <div className="relative bg-black rounded-xl overflow-hidden" style={{ aspectRatio: '4/3' }}>
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />

            {/* Inactive overlay */}
            {!cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                  <Camera className="w-8 h-8 text-white opacity-60" />
                </div>
                <p className="text-white/50 text-xs">Cámara inactiva</p>
              </div>
            )}

            {/* Scanning frame animation */}
            {scanning && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-56 h-32">
                  {/* Corners */}
                  {[
                    'top-0 left-0 border-t-2 border-l-2',
                    'top-0 right-0 border-t-2 border-r-2',
                    'bottom-0 left-0 border-b-2 border-l-2',
                    'bottom-0 right-0 border-b-2 border-r-2',
                  ].map((cls, i) => (
                    <div key={i} className={`absolute w-6 h-6 border-primary ${cls} rounded-sm`} />
                  ))}
                  {/* Scan line */}
                  <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-primary opacity-75 animate-pulse" />
                </div>
              </div>
            )}

            {/* Success overlay */}
            {status?.type === 'success' && (
              <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                <div className="bg-white rounded-full p-3">
                  <CheckCircle2 className="w-10 h-10 text-green-600" />
                </div>
              </div>
            )}
          </div>

          {/* Camera selector — shown only if multiple cameras */}
          {cameras.length > 1 && (
            <Select value={selectedCamera} onValueChange={v => { setSelectedCamera(v); stopCamera(); setTimeout(() => startCamera(v), 150); }}>
              <SelectTrigger style={{ borderRadius: '8px' }}>
                <SelectValue placeholder="Seleccionar cámara" />
              </SelectTrigger>
              <SelectContent>
                {cameras.map(c => <SelectItem key={c.deviceId} value={c.deviceId}>{c.label || c.deviceId}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {/* Status feedback */}
          {status && (
            <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${status.type === 'success' ? 'bg-green-500/10 text-green-700' : 'bg-destructive/10 text-destructive'}`} style={{ borderRadius: '8px' }}>
              {status.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
              {status.message}
            </div>
          )}

          {/* Camera button */}
          <Button
            onClick={cameraActive ? stopCamera : startCamera}
            variant={cameraActive ? 'outline' : 'default'}
            className="w-full"
            style={{ borderRadius: '8px' }}
          >
            {cameraActive
              ? <><CameraOff className="w-4 h-4 mr-1.5" /> Detener cámara</>
              : <><Camera className="w-4 h-4 mr-1.5" /> Activar cámara</>
            }
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">o ingresa el código</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Manual entry */}
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <Input
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              placeholder="Código de barras / código producto"
              style={{ borderRadius: '8px' }}
            />
            <Button type="submit" variant="outline" style={{ borderRadius: '8px' }}>
              <Search className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}