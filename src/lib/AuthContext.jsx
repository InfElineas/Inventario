import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/api/supabaseClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser]                   = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError]         = useState(null);
  const pendingUserRef                    = useRef(null); // guarda la sesión de Google mientras espera aprobación

  const loadUserProfile = async (supabaseUser) => {
    // Extraer avatar directamente del session (Google OAuth lo incluye siempre)
    const googleAvatar =
      supabaseUser.user_metadata?.avatar_url ||
      supabaseUser.user_metadata?.picture    ||
      supabaseUser.identities?.[0]?.identity_data?.avatar_url ||
      supabaseUser.identities?.[0]?.identity_data?.picture    ||
      '';

    const { data: perfil, error } = await supabase
      .from('usuarios')
      .select('id, email, full_name, role, activo, almacen_num, nickname, avatar_url, almacenes_config, sync_config, departamento')
      .eq('email', supabaseUser.email)
      .single();

    if (error || !perfil || !perfil.activo) {
      pendingUserRef.current = supabaseUser; // conservar para el polling
      setAuthError({ type: 'user_not_registered' });
      setIsAuthenticated(false);
      setUser(null);
      return;
    }
    pendingUserRef.current = null; // aprobado — limpiar

    // Si en la tabla no hay avatar guardado, usar el de Google Y guardarlo para la próxima vez
    const resolvedAvatar = perfil.avatar_url || googleAvatar;
    if (!perfil.avatar_url && googleAvatar) {
      supabase.from('usuarios')
        .update({ avatar_url: googleAvatar })
        .eq('email', supabaseUser.email)
        .then(() => {})  // best-effort, no bloquear el login
    }

    setUser({
      id:               supabaseUser.id,
      email:            supabaseUser.email,
      full_name:        perfil.full_name || supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || '',
      role:             perfil.role,
      almacen_num:      perfil.almacen_num || '',
      almacenes_config: Array.isArray(perfil.almacenes_config) ? perfil.almacenes_config : [],
      sync_config:      perfil.sync_config && typeof perfil.sync_config === 'object' ? perfil.sync_config : {},
      nickname:         perfil.nickname    || '',
      avatar_url:       resolvedAvatar,
      departamento:     perfil.departamento || null,
    });
    setIsAuthenticated(true);
    setAuthError(null);
  };

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        await loadUserProfile(session.user);
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError(null);
      }
      if (mounted) setIsLoadingAuth(false);
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  // Cuando el admin aprueba al usuario, la sesión ya está activa pero el perfil quedó en error.
  // Cada 20 s se reintenta cargar el perfil para que el acceso se habilite sin que el usuario
  // tenga que cerrar sesión manualmente.
  useEffect(() => {
    if (authError?.type !== 'user_not_registered' || !pendingUserRef.current) return;
    const id = setInterval(() => {
      loadUserProfile(pendingUserRef.current);
    }, 20000);
    return () => clearInterval(id);
  }, [authError]);

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
    setAuthError(null);
  };

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated, isLoadingAuth,
      isLoadingPublicSettings: false,
      authError, appPublicSettings: null, authChecked: !isLoadingAuth,
      logout,
      navigateToLogin: () => { window.location.href = '/login'; },
      checkUserAuth: async () => {},
      checkAppState: async () => {},
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
