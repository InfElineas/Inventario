import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Entrada al sistema.
 *
 * Las credenciales van a nuestro propio servidor, nunca al Identity Server
 * desde el navegador: así el token de sesión —de larga duración— queda en una
 * cookie httpOnly que el JavaScript de la página no puede leer.
 *
 * Ya no hay registro ni restablecimiento de contraseña: las cuentas las crea un
 * administrador en el Identity Server, que es también donde se gestionan las
 * contraseñas. Y no se filtra por dominio: quien entra lo decide el IS, según
 * tenga cuenta y un rol asignado en el sistema.
 */
export default function Login() {
  const { isAuthenticated, isLoadingAuth, refrescarSesion } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated) navigate('/');
  }, [isAuthenticated, isLoadingAuth, navigate]);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  const entrar = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const datos = await res.json().catch(() => null);

      if (!res.ok) {
        setError(datos?.error ?? 'No se pudo iniciar sesión.');
        return;
      }

      // La sesión ya está en las cookies; falta que el contexto la lea.
      await refrescarSesion();
      navigate('/');
    } catch {
      setError('No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-[360px] space-y-8">

        {/* Wordmark */}
        <div className="space-y-1">
          <p className="text-[11px] font-mono uppercase tracking-widest text-[#6798ff]">
            Sistema de almacén
          </p>
          <h1 className="text-2xl font-bold text-white tracking-wide">ELÍNEAS</h1>
          <p className="text-sm text-[#7c7c7c]">Sistema de inventario · Almacenes</p>
        </div>

        {/* Card */}
        <div className="space-y-4 p-6 bg-card border border-border rounded-lg">
          <p className="text-[13px] font-medium text-muted-foreground">Iniciar sesión</p>

          {error && (
            <p className="text-[12px] text-[#E24B4A] bg-[#E24B4A]/10 px-3 py-2 rounded-md">{error}</p>
          )}

          <form onSubmit={entrar} className="space-y-3">
            <input
              type="email" placeholder="correo" value={email} required autoComplete="username"
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-[13px] bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-[#6798ff]"
            />
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'} placeholder="Contraseña" value={password} required
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 pr-9 text-[13px] bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-[#6798ff]"
              />
              <button type="button" onClick={() => setShowPwd(v => !v)}
                aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              type="submit" disabled={loading}
              className="w-full py-2.5 text-[13px] font-medium bg-[#6798ff] hover:bg-[#6798ff]/90 text-white rounded-lg disabled:opacity-50 transition-colors"
            >
              {loading ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>

          <p className="text-[11px] text-[#7c7c7c]">
            ¿Olvidaste tu contraseña o necesitas una cuenta? Contacta con el administrador:
            las cuentas se gestionan desde el servidor de identidad de ELíneas.
          </p>

          <div style={{ borderTop: '1px solid #313131', paddingTop: '12px' }}>
            <p className="text-[11px] font-mono text-[#7c7c7c]" style={{ letterSpacing: '0.071em' }}>
              ACCESO RESTRINGIDO — Solo usuarios autorizados
            </p>
          </div>
        </div>

        <p className="text-[11px] text-center text-[#454545]">
          Almacén ELíneas &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
