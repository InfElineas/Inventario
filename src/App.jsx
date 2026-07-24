import { useEffect, Suspense, lazy } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { SyncProvider } from '@/lib/SyncContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AccessDenied from '@/components/shared/AccessDenied';
import AppLayout from '@/components/layout/AppLayout';
import Login from '@/pages/Login';
import ActualizarPassword from '@/pages/ActualizarPassword';

// Páginas autenticadas cargadas bajo demanda — cada una queda en su propio
// chunk, así el login inicial no descarga el código de Reportes, Productos,
// etc. antes de que el usuario los visite.
const Dashboard     = lazy(() => import('@/pages/Dashboard'));
const Inventario    = lazy(() => import('@/pages/Inventario'));
const Mermas        = lazy(() => import('@/pages/Mermas'));
const Lotes         = lazy(() => import('@/pages/Lotes'));
const Recepciones   = lazy(() => import('@/pages/Recepciones'));
const Anuncios      = lazy(() => import('@/pages/Anuncios'));
const Reportes      = lazy(() => import('@/pages/Reportes'));
const Notificaciones= lazy(() => import('@/pages/Notificaciones'));
const Productos     = lazy(() => import('@/pages/Productos'));
const Auditoria     = lazy(() => import('@/pages/Auditoria'));
const AdminUsuarios = lazy(() => import('@/pages/AdminUsuarios'));
const SuperAdmin    = lazy(() => import('@/pages/SuperAdmin'));
const Configuracion = lazy(() => import('@/pages/Configuracion'));
const Supervision   = lazy(() => import('@/pages/Supervision'));
const PageNotFound  = lazy(() => import('./lib/PageNotFound'));

function RouteLoading() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ── Guard de rol: renderiza el elemento solo si el usuario tiene el rol requerido
const RoleGuard = ({ element, roles }) => {
  const { user, isLoadingAuth } = useAuth();
  if (isLoadingAuth) return null;
  if (!user) return <AccessDenied />;
  if (user.role === 'superadmin') return element; // superadmin bypasses all role restrictions
  if (!roles.includes(user.role)) return <AccessDenied />;
  return element;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated, authError } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoadingAuth && !isAuthenticated && !authError) {
      navigate('/login');
    }
  }, [isLoadingAuth, isAuthenticated, authError, navigate]);

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (authError?.type === 'user_not_registered') return <UserNotRegisteredError />;
  if (!isAuthenticated) return null;

  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/"               element={<Dashboard />} />
          <Route path="/inventario"     element={<Inventario />} />
          <Route path="/mermas"         element={<Mermas />} />
          <Route path="/lotes"          element={<Lotes />} />
          <Route path="/recepciones"    element={<Recepciones />} />
          <Route path="/anuncios"       element={<RoleGuard element={<Anuncios />} roles={['inv','ca','auditor','jefe_depto','administrador','superadmin']} />} />
          <Route path="/notificaciones" element={<Notificaciones />} />
          <Route path="/productos"      element={<Productos />} />
          <Route path="/bd-tkc"          element={<Productos initialSource="tkc" />} />
          <Route path="/configuracion"  element={<Configuracion />} />
          <Route
            path="/supervision"
            element={<RoleGuard element={<Supervision />} roles={['jefe_depto', 'administrador', 'superadmin']} />}
          />
          <Route
            path="/auditoria"
            element={<RoleGuard element={<Auditoria />} roles={['auditor', 'administrador', 'superadmin']} />}
          />
          <Route
            path="/reportes"
            element={<RoleGuard element={<Reportes />} roles={['auditor', 'administrador', 'superadmin']} />}
          />
          {/* Rutas de administrador — verificación en servidor (RLS) y cliente (RoleGuard) */}
          <Route
            path="/admin/usuarios"
            element={<RoleGuard element={<AdminUsuarios />} roles={['administrador', 'superadmin']} />}
          />
          <Route
            path="/superadmin"
            element={<RoleGuard element={<SuperAdmin />} roles={['superadmin']} />}
          />
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <SyncProvider>
            <Routes>
              <Route path="/login"                element={<Login />} />
              <Route path="/actualizar-password"  element={<ActualizarPassword />} />
              <Route path="*"                     element={<AuthenticatedApp />} />
            </Routes>
          </SyncProvider>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
