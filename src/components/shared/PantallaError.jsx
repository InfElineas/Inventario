import { Link } from 'react-router-dom';
import { Compass, RefreshCw, ServerOff, ShieldOff, TriangleAlert, WifiOff } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * Cada error tiene su pantalla: qué pasó, de quién es la culpa y qué puede
 * hacer la persona ahora. Un «algo falló» igual para todo obliga a adivinar si
 * toca esperar, volver, pedir permiso o llamar a soporte.
 *
 * `accion`: 'reintentar' (el botón llama a `onReintentar`) o 'inicio' (enlace a `/`).
 */
export const PANTALLAS_ERROR = {
  noEncontrada: {
    codigo: '404', icono: Compass, color: 'var(--c-warn)',
    titulo: 'Esta página no existe',
    texto: 'La dirección no corresponde a ninguna sección. Puede estar mal escrita o ser un enlace que ya no vale.',
    accion: 'inicio',
  },
  sinAcceso: {
    codigo: '403', icono: ShieldOff, color: 'var(--c-bad)',
    titulo: 'Sin acceso',
    texto: 'Tu rol no tiene permiso para ver esta sección. Si crees que debería, díselo a quien administra los roles.',
    accion: 'inicio',
  },
  fallo: {
    codigo: '500', icono: TriangleAlert, color: 'var(--c-bad)',
    titulo: 'Esta pantalla no se pudo mostrar',
    texto: 'El resto del sistema sigue funcionando. Si vuelve a pasar, copia este mensaje y pásalo a soporte.',
    accion: 'reintentar',
  },
  servidor: {
    codigo: '503', icono: ServerOff, color: 'var(--c-bad)',
    titulo: 'El servidor no responde',
    texto: 'No se pudo hablar con el servidor. Tus datos no se han perdido: espera un momento e inténtalo de nuevo.',
    accion: 'reintentar',
  },
  sinConexion: {
    codigo: 'Sin red', icono: WifiOff, color: 'var(--c-warn)',
    titulo: 'Sin conexión a internet',
    texto: 'Comprueba tu wifi o tus datos. Cuando vuelva la conexión, reintenta.',
    accion: 'reintentar',
  },
};

/**
 * Qué pantalla le toca a un error capturado. Sin red, lo primero: el resto de
 * fallos son consecuencia de eso.
 */
export function clasificarError(error, enLinea = typeof navigator === 'undefined' ? true : navigator.onLine) {
  if (!enLinea) return 'sinConexion';
  const m = String(error?.message ?? '');
  if (error?.name === 'TypeError' && /failed to fetch|networkerror|load failed/i.test(m)) return 'servidor';
  if (/\bError 5\d\d\b/.test(m)) return 'servidor';
  return 'fallo';
}

/**
 * @param {object} props
 * @param {keyof typeof PANTALLAS_ERROR} props.tipo
 * @param {string} [props.detalle]       El mensaje técnico, para pasarlo a soporte.
 * @param {() => void} [props.onReintentar]
 * @param {boolean} [props.pagina]       Ocupa toda la ventana (fuera del layout).
 */
export default function PantallaError({ tipo, detalle, onReintentar, pagina = false }) {
  const p = PANTALLAS_ERROR[tipo] ?? PANTALLAS_ERROR.fallo;
  const Icono = p.icono;

  return (
    <div role="alert" className={`flex items-center justify-center px-6 ${pagina ? 'min-h-screen bg-background' : 'py-20'}`}>
      <Card className="w-full max-w-md p-8 text-center space-y-4" style={{ borderRadius: 'var(--r-card)', borderWidth: '0.5px' }}>
        <div className="flex justify-center">
          <div className="p-3 rounded-full" style={{ background: `color-mix(in srgb, ${p.color} 12%, transparent)` }}>
            <Icono className="w-6 h-6" style={{ color: p.color }} />
          </div>
        </div>
        <p className="text-3xl font-light tabular-nums text-muted-foreground">{p.codigo}</p>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{p.titulo}</p>
          <p className="text-xs text-muted-foreground">{p.texto}</p>
        </div>
        {detalle && (
          <code className="block text-[11px] text-[var(--c-bad)] bg-[var(--c-bad)]/10 px-3 py-2 rounded-md break-all">{detalle}</code>
        )}
        {p.accion === 'reintentar' && onReintentar && (
          <Button variant="outline" size="sm" onClick={onReintentar} style={{ borderRadius: 'var(--r-ctl)' }}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Reintentar
          </Button>
        )}
        {p.accion === 'inicio' && (
          <Button asChild variant="outline" size="sm" style={{ borderRadius: 'var(--r-ctl)' }}>
            <Link to="/">Volver al inicio</Link>
          </Button>
        )}
      </Card>
    </div>
  );
}
