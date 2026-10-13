import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect, lazy, Suspense} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { runSmartNotifications, requestBrowserPermission } from '@/lib/notificationService';
import { Search, Calendar, ScanLine, LogOut, ChevronDown, Sun, Moon, UserCircle, RefreshCw } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { useTheme } from '@/lib/useTheme';
import ProfileModal from '@/components/shared/ProfileModal';
import { useSyncManager } from '@/lib/SyncContext';
import { ROLES } from '@/lib/constants';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import NotifDropdown from './NotifDropdown';
const BarcodeScannerModal = lazy(() => import('@/components/shared/BarcodeScannerModal'));

const toArray = (data) => Array.isArray(data) ? data : [];

function SyncProgressBanner() {
  const { syncState } = useSyncManager()
  if (!syncState) return null
  const { type, current, idx: idxRaw, total: totalRaw, progress } = syncState
  const idx = idxRaw ?? 0;
  const total = totalRaw ?? 1;
  const isAll = type === 'all'
  const pct = progress
    ? progress.stage === 'fetch' ? 20
    : progress.total ? 20 + (progress.synced / progress.total) * 80 : 50
    : 5
  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-72 rounded-xl shadow-2xl overflow-hidden"
      style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
    >
      <div className="px-4 pt-3 pb-3 space-y-2">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-4 h-4 text-[#4ade80] animate-spin shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground leading-tight">
              {isAll
                ? `Sincronizando todos · ${idx + 1}/${total}`
                : `Sincronizando almacén ${current}`}
            </p>
            {progress && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {progress.stage === 'fetch'
                  ? `Descargando… ${progress.fetched ?? 0} productos`
                  : `Guardando… ${progress.synced ?? 0} / ${progress.total ?? '?'}`}
                {progress.errors > 0 && (
                  <span className="text-[#e24b4a] ml-1">· {progress.errors} err</span>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="w-full h-1.5 rounded-full overflow-hidden bg-muted">
          <div
            className="h-full bg-[#4ade80] transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        {isAll && (
          <div className="w-full h-0.5 rounded-full overflow-hidden bg-muted">
            <div
              className="h-full bg-[#60a5fa] transition-all duration-500"
              style={{ width: `${(idx / total) * 100}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

const ROUTE_TITLES = {
  '/':               'Panel de Control General',
  '/productos':      'Catálogo',
  '/bd-tkc':         'Catálogo — BD TKC',
  '/inventario':     'Inventario',
  '/mermas':         'Mermas',
  '/lotes':          'Vencimientos',
  '/recepciones':    'Recepciones',
  '/anuncios':       'Anuncios',
  '/reportes':       'Reportes',
  '/auditoria':      'Auditoría',
  '/notificaciones': 'Notificaciones',
  '/admin/usuarios': 'Usuarios',
  '/configuracion':  'Configuración',
};

export default function AppLayout() {
  const navigate     = useNavigate();
  const location     = useLocation();
  const { logout, user: authUser } = useAuth();
  const queryClient  = useQueryClient();

  const [isCollapsed, setIsCollapsed]   = useState(false);
  const [showScanner, setShowScanner]   = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProfile, setShowProfile]   = useState(false);
  const [search, setSearch]             = useState('');
  const { isDark, toggleTheme }         = useTheme();
  const userMenuRef                     = useRef(null);
  const smartRanRef                     = useRef(false);  // run smart notifs once per session
  const prevNotifsRef                   = useRef(null);   // toast on new incoming notifications

  const pageTitle = ROUTE_TITLES[location.pathname] || 'ELíneas';

  useEffect(() => {
    const fn = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const handleScanSelect = (producto) => {
    setShowScanner(false);
    navigate(`/productos?scan=${producto.id}`);
  };

  // ── Usuario desde AuthContext (tiene avatar_url, nickname, role real)
  // Fallback a base44 para compatibilidad con queries de pending counts
  const { data: base44User } = useQuery({
    queryKey: ['currentUser'],
    queryFn:  () => base44.auth.me(),
  });

  // Usar authUser (tiene avatar_url y nickname) para display; base44User para pending counts
  const user      = authUser || base44User;
  const role      = user?.role || 'inv';
  const displayName = user?.nickname || user?.full_name || user?.email || 'Usuario';
  const initials  = displayName.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const roleLabel = ROLES[role]?.label || 'Usuario';

  const { data: notifsRaw, isFetched: notifsFetched } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn:  async () => {
      if (!user?.email) return [];
      // El servidor impone el filtro por usuario; aquí solo se pide no leídas.
      return base44.entities.Notificacion.filter({ leida: false }, '-created_date', 50);
    },
    enabled:        !!user?.email,
    refetchInterval: 15000,
    select:          toArray,
  });
  const notifs = notifsRaw ?? [];

  // Estas cuatro listas alimentan SOLO a runSmartNotifications, que corre una
  // vez por sesión (guarda smartRanRef). Por eso no llevan refetchInterval: antes
  // repetían las cuatro cada 60 s, unos 500 registros por minuto en todas las
  // páginas, y lo único que se recalculaba con ellos eran los contadores del
  // menú — que ahora salen de las queries de count de más abajo.
  const { data: mermasRaw } = useQuery({
    queryKey: ['pending-mermas'],
    queryFn:  () => base44.entities.Merma.list('-created_date', 200),
    select: toArray,
  });
  const mermas = mermasRaw ?? [];

  const { data: inventariosRaw } = useQuery({
    queryKey: ['pending-inventarios'],
    queryFn:  () => base44.entities.Inventario.list('-created_date', 100),
    select: toArray,
  });
  const inventarios = inventariosRaw ?? [];

  const { data: anunciosRaw } = useQuery({
    queryKey: ['pending-anuncios'],
    queryFn:  () => base44.entities.AnuncioDesact.list('-created_date', 100),
    select: toArray,
  });
  const anuncios = anunciosRaw ?? [];

  const { data: lotesRaw } = useQuery({
    queryKey: ['pending-lotes'],
    queryFn:  () => base44.entities.Lote.list('-updated_date', 100),
    select: toArray,
  });
  const lotes = lotesRaw ?? [];

  // ── Contadores del menú ──────────────────────────────────
  // El estado que cuenta como "pendiente" depende del rol.
  const estadoPendiente = {
    mermas:      role === 'fact' || role === 'administrador' ? 'pend_fact'
               : role === 'auditor'                          ? 'en_auditoria'
               : 'reconteo_solicitado',
    inventarios: role === 'fact' || role === 'administrador' ? 'pend_fact'
               : role === 'auditor'                          ? 'en_auditoria'
               : 'devuelto',
    anuncios:    role === 'ca'   || role === 'administrador' ? 'pend_ca'
               : role === 'auditor'                          ? 'en_auditoria'
               : 'pendiente',
  };

  // Cuentan contra la tabla entera y no traen ni una fila. Son las únicas que
  // siguen refrescándose cada 60 s, que es lo que el menú necesita de verdad.
  const contador = (key, entidad, condiciones) => ({
    queryKey: ['count', key, ...Object.values(condiciones).flat()],
    queryFn:  () => base44.entities[entidad].count(condiciones),
    refetchInterval: 60000,
    enabled:  !!user?.email,
  });

  const { data: mermasPending }   = useQuery(contador('mermas',      'Merma',         { estado_tarea: estadoPendiente.mermas }));
  const { data: invPending }      = useQuery(contador('inventarios', 'Inventario',    { estado_tarea: estadoPendiente.inventarios }));
  const { data: anunciosPending } = useQuery(contador('anuncios',    'AnuncioDesact', { estado_tarea: estadoPendiente.anuncios }));
  const { data: lotesCriticos }   = useQuery(contador('lotes',       'Lote',          { estado_fv: ['critico', 'vencido'] }));

  // Productos sólo para alertas de stock (no reemplaza el query de páginas)
  const { data: prodAlertsRaw } = useQuery({
    queryKey: ['alert-productos'],
    queryFn:  async () => {
      return base44.entities.Producto.filter({ activo: true }, undefined, 500);
    },
    staleTime: 5 * 60 * 1000,
    enabled:   !!user?.email,
  });
  const prodAlerts = prodAlertsRaw ?? [];

  // ── Smart notifications + browser permission (una vez) ───
  useEffect(() => {
    if (!user?.email || smartRanRef.current) return;
    if (!lotes.length && !mermas.length && !prodAlerts.length) return; // wait for data
    smartRanRef.current = true;
    requestBrowserPermission();
    runSmartNotifications({ user, productos: prodAlerts, lotes, mermas, inventarios, anuncios })
      .then(() => queryClient.invalidateQueries({ queryKey: ['notifications-unread'] }))
      .catch(console.error);
  }, [user?.email, lotes.length, mermas.length, prodAlerts.length]);

  // ── Toast para notificaciones entrantes ─────────────────
  useEffect(() => {
    if (!notifsFetched) return
    if (prevNotifsRef.current === null) {
      prevNotifsRef.current = new Set(notifs.map(n => n.id))
      return
    }
    const newNotifs = notifs.filter(n => !prevNotifsRef.current.has(n.id))
    prevNotifsRef.current = new Set(notifs.map(n => n.id))
    if (!newNotifs.length) return
    for (const n of newNotifs) {
      const link = n.link || null
      toast({
        title:       n.titulo,
        description: n.mensaje,
        action: link
          ? <ToastAction altText="Ver" onClick={() => navigate(link)}>Ver</ToastAction>
          : undefined,
      })
    }
    const tipos = new Set(newNotifs.map(n => n.tipo))
    if (tipos.has('Merma'))      queryClient.invalidateQueries({ queryKey: ['mermas'] })
    if (tipos.has('Inventario')) queryClient.invalidateQueries({ queryKey: ['inventarios'] })
   
  }, [notifs, notifsFetched])

  // ── Pending sidebar counts ───────────────────────────────
  const pendingCounts = {};
  if (mermasPending   > 0) pendingCounts['/mermas']     = mermasPending;
  if (invPending      > 0) pendingCounts['/inventario'] = invPending;
  if (anunciosPending > 0) pendingCounts['/anuncios']   = anunciosPending;
  if (lotesCriticos   > 0) pendingCounts['/lotes']      = lotesCriticos;

  return (
    <div className="min-h-screen bg-background">

      <Sidebar
        user={user}
        pendingCounts={pendingCounts}
        isCollapsed={isCollapsed}
        onToggle={() => setIsCollapsed(v => !v)}
        hoverMode={role === 'superadmin'}
      />

      <div
        className={`flex flex-col min-h-screen pb-14 lg:pb-0
          transition-[margin-left] duration-200 ease-in-out
          ${role === 'superadmin' ? 'lg:ml-[52px]' : isCollapsed ? 'lg:ml-[52px]' : 'lg:ml-[220px]'}`}
      >
        {/* ── Top bar ─────────────────────────────────── */}
        <header
          data-testid="app-header"
          className="sticky top-0 z-30 flex items-center justify-between px-4 lg:px-6 h-14 sm:h-[52px]"
          style={{
            background: 'color-mix(in srgb, hsl(var(--background)) 92%, transparent)',
            borderBottom: '1px solid hsl(var(--border))',
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* Left */}
          <div className="flex items-center gap-2 lg:gap-3">
            <h1 className="text-[14px] font-semibold text-foreground" style={{ letterSpacing: '-0.01em' }}>
              {pageTitle}
            </h1>
            <div
              className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground px-2.5 py-1 rounded-md"
              style={{ background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))' }}
            >
              <Calendar className="w-3 h-3" />
              <span>Último mes</span>
            </div>
          </div>

          {/* Right — gap más amplio en móvil para separar botones táctiles */}
          <div className="flex items-center gap-1 sm:gap-0.5">

            {/* Scanner — mínimo 44×44 px en móvil (WCAG 2.1) */}
            <button
              onClick={() => setShowScanner(true)}
              aria-label="Escanear código"
              data-testid="btn-scanner"
              className="p-2.5 sm:p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            >
              <ScanLine className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>

            {/* Search */}
            <div className="relative hidden sm:block mx-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="text-[12px] text-foreground placeholder:text-muted-foreground pl-7 pr-3 py-1.5 outline-hidden transition-colors"
                style={{
                  background: 'hsl(var(--input))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  width: '140px',
                }}
              />
            </div>

            {/* Notification dropdown */}
            <NotifDropdown notifications={notifs} />

            {/* User dropdown */}
            <div className="relative ml-0.5" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(v => !v)}
                aria-label="Menú de usuario"
                aria-expanded={showUserMenu}
                data-testid="btn-user-menu"
                className="flex items-center gap-1 p-2.5 sm:px-1.5 sm:py-1 rounded-md hover:bg-accent transition-colors"
              >
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt={initials}
                    className="w-8 h-8 sm:w-6 sm:h-6 rounded-full object-cover shrink-0 border border-[#4ade80]/30" />
                ) : (
                  <div className="w-8 h-8 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[11px] sm:text-[10px] font-bold text-black shrink-0"
                    style={{ background: '#4ade80' }}>
                    {initials}
                  </div>
                )}
                <ChevronDown
                  className="w-3 h-3 text-muted-foreground transition-transform hidden sm:block"
                  style={{ transform: showUserMenu ? 'rotate(180deg)' : 'none' }}
                />
              </button>

              {showUserMenu && (
                <div
                  className="absolute right-0 top-[38px] w-56 rounded-lg shadow-xl z-50"
                  style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                >
                  <div className="px-4 py-3" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                    <div className="flex items-center gap-2.5 mb-1">
                      {user?.avatar_url ? (
                        <img src={user.avatar_url} alt={initials}
                          className="w-8 h-8 rounded-full object-cover shrink-0 border border-[#4ade80]/30" />
                      ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-black shrink-0"
                          style={{ background: '#4ade80' }}>
                          {initials}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-foreground truncate leading-tight">
                          {user?.nickname || user?.full_name || 'Usuario'}
                        </p>
                        <p className="text-[10px] text-[#4ade80] font-mono leading-tight" style={{ letterSpacing: '0.06em' }}>
                          {roleLabel.toUpperCase()}
                        </p>
                      </div>
                    </div>
                    {user?.email && (
                      <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                    )}
                  </div>
                  <div className="p-1">
                    {/* Perfil */}
                    <button
                      onClick={() => { setShowUserMenu(false); setShowProfile(true); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                    >
                      <UserCircle className="w-3.5 h-3.5" />
                      Perfil y preferencias
                    </button>
                    {/* Tema */}
                    <button
                      onClick={() => { toggleTheme(); setShowUserMenu(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                    >
                      {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                      {isDark ? 'Modo claro' : 'Modo oscuro'}
                    </button>
                    {/* Logout */}
                    <button
                      onClick={() => { setShowUserMenu(false); logout(); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Cerrar sesión
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── Content ─────────────────────────────────── */}
        <main className="flex-1 p-4 lg:p-6">
          <div className="max-w-[1400px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      <BottomNav role={role} pendingCounts={pendingCounts} />

      <ProfileModal user={user} open={showProfile} onClose={() => setShowProfile(false)} />

      <SyncProgressBanner />

      {/* Suspense propio, y no el de App.jsx: aquel envuelve <Routes> entera, asi
          que al suspender el modal la pagina completa parpadearia con
          RouteLoading mientras baja el chunk del escaner. Con este limite local
          la pagina se queda quieta y solo aparece el modal al estar listo. */}
      {showScanner && (
        <Suspense fallback={null}>
          <BarcodeScannerModal onSelect={handleScanSelect} onClose={() => setShowScanner(false)} />
        </Suspense>
      )}
    </div>
  );
}
