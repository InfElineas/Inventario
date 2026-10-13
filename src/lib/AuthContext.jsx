import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Sesión del usuario.
 *
 * Antes se apoyaba en `supabase.auth.onAuthStateChange`, que mantenía la sesión
 * en el navegador y avisaba de sus cambios. Ahora la sesión vive en cookies
 * httpOnly que el JavaScript de la página no puede leer, así que el único modo
 * de saber si hay sesión es preguntárselo al servidor.
 *
 * No hay suscripción a cambios porque no hay nada que observar en el cliente:
 * el estado se consulta al montar y después de cada login o logout.
 */

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  /**
   * Pregunta al servidor quién es el usuario.
   *
   * El servidor renueva el JWT por dentro si había caducado, así que aquí solo
   * caben dos respuestas: hay sesión o no la hay. El antiguo estado intermedio
   * de "registrado pero pendiente de aprobación" desaparece: con el Identity
   * Server el alta no es autoservicio, y quien no tenga rol en el sistema
   * `inventario` no llega siquiera a tener sesión.
   */
  const refrescar = useCallback(async () => {
    try {
      const perfil = await base44.auth.me();
      setUser(perfil);
      setIsAuthenticated(Boolean(perfil));
      return perfil;
    } catch {
      setUser(null);
      setIsAuthenticated(false);
      return null;
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  useEffect(() => { refrescar(); }, [refrescar]);

  const logout = async () => {
    await base44.auth.logout();
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated, isLoadingAuth,
      authChecked: !isLoadingAuth,
      // Se conserva para que App.jsx no tenga que cambiar: ya nunca hay un
      // usuario autenticado a la espera de aprobación.
      authError: null,
      isLoadingPublicSettings: false,
      appPublicSettings: null,
      logout,
      refrescarSesion: refrescar,
      navigateToLogin: () => { window.location.href = '/login'; },
      checkUserAuth: refrescar,
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
