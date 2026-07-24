import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Eye, EyeOff } from 'lucide-react';

const COMPANY_DOMAIN = '@mercadoelineas.com';

export default function Login() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated) navigate('/');
  }, [isAuthenticated, isLoadingAuth, navigate]);

  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [info, setInfo]           = useState(null);
  const [mode, setMode]           = useState('email-login'); // 'email-login' | 'email-register'
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [password2, setPassword2] = useState('');
  const [showPwd, setShowPwd]     = useState(false);
  const [showPwd2, setShowPwd2]   = useState(false);

  const validateEmail = (v) => {
    if (!v.toLowerCase().endsWith(COMPANY_DOMAIN))
      return `Solo se permiten correos con dominio ${COMPANY_DOMAIN}`;
    return null;
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError(null); setInfo(null);
    const domErr = validateEmail(email);
    if (domErr) { setError(domErr); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? 'Correo o contraseña incorrectos.'
        : error.message);
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    setError(null); setInfo(null);
    const domErr = validateEmail(email);
    if (domErr || !email) { setError('Escribe tu correo arriba y vuelve a intentar.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/actualizar-password`,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setInfo('Si la cuenta existe, te enviamos un correo con instrucciones para restablecer tu contraseña.');
  };

  const handleEmailRegister = async (e) => {
    e.preventDefault();
    setError(null); setInfo(null);
    const domErr = validateEmail(email);
    if (domErr) { setError(domErr); return; }
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (password !== password2) { setError('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
    } else if (data?.user) {
      // "Confirm email" está desactivado: la cuenta queda creada y confirmada
      // de inmediato. El único filtro restante es la aprobación manual de un
      // administrador (activo=false hasta que alguien la apruebe en Admin → Usuarios).
      setInfo('Cuenta creada. Un administrador debe aprobar tu acceso antes de que puedas iniciar sesión.');
      setMode('email-login');
    }
    setLoading(false);
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
          {info && (
            <p className="text-[12px] text-[#4ade80] bg-[#4ade80]/10 px-3 py-2 rounded-md">{info}</p>
          )}

          {/* ── Email login ── */}
          {mode === 'email-login' && (
            <form onSubmit={handleEmailLogin} className="space-y-3">
              <input
                type="email" placeholder={`correo${COMPANY_DOMAIN}`} value={email} required
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-[13px] bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#6798ff]"
              />
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'} placeholder="Contraseña" value={password} required
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-9 text-[13px] bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#6798ff]"
                />
                <button type="button" onClick={() => setShowPwd(v => !v)}
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
              <div className="flex justify-between text-[11px] text-[#7c7c7c]">
                <button type="button" onClick={handleForgotPassword} disabled={loading} className="hover:text-foreground">
                  ¿Olvidaste tu contraseña?
                </button>
                <button type="button" onClick={() => { setMode('email-register'); setError(null); setInfo(null); }} className="hover:text-foreground">
                  Crear cuenta →
                </button>
              </div>
            </form>
          )}

          {/* ── Email register ── */}
          {mode === 'email-register' && (
            <form onSubmit={handleEmailRegister} className="space-y-3">
              <p className="text-[11px] text-muted-foreground">
                Solo correos con dominio <span className="text-[#6798ff]">{COMPANY_DOMAIN}</span>
              </p>
              <input
                type="email" placeholder={`correo${COMPANY_DOMAIN}`} value={email} required
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-[13px] bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#6798ff]"
              />
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'} placeholder="Contraseña (mín. 8 caracteres)" value={password} required
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-9 text-[13px] bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#6798ff]"
                />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPwd2 ? 'text' : 'password'} placeholder="Confirmar contraseña" value={password2} required
                  onChange={(e) => setPassword2(e.target.value)}
                  className="w-full px-3 py-2 pr-9 text-[13px] bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#6798ff]"
                />
                <button type="button" onClick={() => setShowPwd2(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPwd2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                type="submit" disabled={loading}
                className="w-full py-2.5 text-[13px] font-medium bg-[#6798ff] hover:bg-[#6798ff]/90 text-white rounded-lg disabled:opacity-50 transition-colors"
              >
                {loading ? 'Creando cuenta…' : 'Crear cuenta'}
              </button>
              <button
                type="button" onClick={() => { setMode('email-login'); setError(null); setInfo(null); }}
                className="w-full text-[11px] text-[#7c7c7c] hover:text-foreground"
              >
                ← Ya tengo cuenta
              </button>
            </form>
          )}

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
