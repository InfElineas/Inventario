import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { Eye, EyeOff } from 'lucide-react';

export default function ActualizarPassword() {
  const navigate = useNavigate();
  const [ready, setReady]           = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword]     = useState('');
  const [password2, setPassword2]   = useState('');
  const [showPwd, setShowPwd]       = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [done, setDone]             = useState(false);

  useEffect(() => {
    // El enlace de recuperación crea una sesión temporal automáticamente;
    // esperamos a que el cliente de Supabase termine de procesarla.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
      setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
      setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (password !== password2) { setError('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    setTimeout(() => navigate('/'), 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-[360px] space-y-8">
        <div className="space-y-1">
          <p className="text-[11px] font-mono uppercase tracking-widest text-[#6798ff]">Sistema de almacén</p>
          <h1 className="text-2xl font-bold text-white tracking-wide">ELÍNEAS</h1>
          <p className="text-sm text-[#7c7c7c]">Actualizar contraseña</p>
        </div>

        <div className="space-y-4 p-6 bg-card border border-border rounded-lg">
          {!ready && (
            <p className="text-[13px] text-muted-foreground">Verificando enlace…</p>
          )}

          {ready && !hasSession && (
            <>
              <p className="text-[13px] font-medium text-muted-foreground">Enlace inválido o expirado</p>
              <p className="text-[12px] text-[#7c7c7c]">Solicita un nuevo enlace de recuperación desde la pantalla de inicio de sesión.</p>
              <button
                onClick={() => navigate('/login')}
                className="w-full py-2.5 text-[13px] font-medium bg-[#6798ff] hover:bg-[#6798ff]/90 text-white rounded-lg transition-colors"
              >
                Volver a iniciar sesión
              </button>
            </>
          )}

          {ready && hasSession && !done && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <p className="text-[13px] font-medium text-muted-foreground">Elige tu nueva contraseña</p>

              {error && (
                <p className="text-[12px] text-[#E24B4A] bg-[#E24B4A]/10 px-3 py-2 rounded-md">{error}</p>
              )}

              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'} placeholder="Nueva contraseña (mín. 8 caracteres)" value={password} required
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-9 text-[13px] bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#6798ff]"
                />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <input
                type={showPwd ? 'text' : 'password'} placeholder="Confirmar contraseña" value={password2} required
                onChange={(e) => setPassword2(e.target.value)}
                className="w-full px-3 py-2 text-[13px] bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#6798ff]"
              />
              <button
                type="submit" disabled={loading}
                className="w-full py-2.5 text-[13px] font-medium bg-[#6798ff] hover:bg-[#6798ff]/90 text-white rounded-lg disabled:opacity-50 transition-colors"
              >
                {loading ? 'Guardando…' : 'Guardar contraseña'}
              </button>
            </form>
          )}

          {done && (
            <p className="text-[12px] text-[#4ade80] bg-[#4ade80]/10 px-3 py-2 rounded-md">
              Contraseña actualizada. Entrando…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
