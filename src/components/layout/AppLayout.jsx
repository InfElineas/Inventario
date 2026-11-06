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
import { useAlmacen } from '@/lib/useAlmacen';
import { fetchResumenLotes } from '@/services/lotesService';
import { SIN_SONDEO } from '@/lib/query-client';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import ElegirAlmacenesDialog from '@/components/layout/ElegirAlmacenesDialog';
import AvisoActualizacion from '@/components/layout/AvisoActualizacion';
import NovedadesDialog from '@/components/layout/NovedadesDialog';
import { EsqueletoRuta } from '@/components/shared/Esqueleto';
import { ROLES } from '@/lib/constants';
import { tieneRol, rolesDe, debeElegirAlmacenes } from '@/lib/roles';
import { ROLES_RESPONDE_IC } from '@/lib/ic';
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
          <RefreshCw className="w-4 h-4 text-[var(--c-ok)] animate-spin shrink-0" />
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
                  <span className="text-[var(--c-bad)] ml-1">· {progress.errors} err</span>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="w-full h-1.5 rounded-full overflow-hidden bg-muted">
          <div
            className="h-full bg-[var(--c-ok)] transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        {isAll && (
          <div className="w-full h-0.5 rounded-full overflow-hidden bg-muted">
            <div
              className="h-full bg-[var(--c-info-2)] transition-all duration-500"
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
  '/transferencias':         'Transferencias',
  '/lotes':          'Vencimientos',
  '/ic':             'Casos de IC',
  '/ventas':             'Resumen de ventas',
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
  const { almacen }  = useAlmacen();
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

  // Del informe central: los recuentos por estado y unos pocos de cada uno.
  // La misma clave que el panel, así que entrar cuesta UNA consulta y no dos.
  // Antes se pedía «vencidos, críticos y por vencer» con un tope de 200, y los
  // vencidos se lo comían: ni los avisos ni el contador veían un solo crítico.
  const { data: resumenLotes } = useQuery({
    queryKey: ['lotes-resumen', almacen],
    queryFn:  () => fetchResumenLotes({ almacen }),
    enabled: Boolean(almacen),
    retry: false,
    ...SIN_SONDEO,
  });
  const lotes = resumenLotes?.lotes ?? [];
  const conteosLotes = resumenLotes?.conteos ?? null;

  // ── Contadores del menú ──────────────────────────────────
  // El estado que cuenta como "pendiente" depende del rol.
  //
  // Con TODOS los roles de la persona, no solo `user.role`, que es el de más
  // autoridad: un jefe de facturación con `jefe_depto` y `fact` salía con los
  // contadores de inventario.
  const suyos = rolesDe(user);
  const esFact    = suyos.includes('fact');
  const veFact    = esFact || suyos.includes('administrador');
  const esAuditor = suyos.includes('auditor');
  const veCA      = suyos.includes('ca') || suyos.includes('administrador');
  const estadoPendiente = {
    mermas:      veFact ? 'pend_fact' : esAuditor ? 'en_auditoria' : 'reconteo_solicitado',
    inventarios: veFact ? 'pend_fact' : esAuditor ? 'en_auditoria' : 'devuelto',
    anuncios:    veCA   ? 'pend_ca'   : esAuditor ? 'en_auditoria' : 'pendiente',
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
  // Los de facturación son suyos pase lo que pase el rol de quien mira: esas
  // dos entradas del menú existen para eso.
  const { data: mermasFact }      = useQuery(contador('mermas-fact', 'Merma',      { estado_tarea: 'pend_fact' }));
  // Los conteos por facturar ya no tienen pantalla propia: cada uno espera en su
  // ajuste, según dé sobrante o faltante.
  const { data: sobrantesFact }   = useQuery(contador('inv-fact-sobrante', 'Inventario', { estado_tarea: 'pend_fact', resultado: 'sobrante' }));
  const { data: faltantesFact }   = useQuery(contador('inv-fact-faltante', 'Inventario', { estado_tarea: 'pend_fact', resultado: 'faltante' }));
  // Acotado al almacén activo, igual que la página de Anuncios. Antes el
  // contador era global y la página no: el menú marcaba 1.185 y al entrar
  // salían cuarenta, sin que nada explicara la diferencia.
  const { data: anunciosPending } = useQuery(contador(
    'anuncios', 'AnuncioDesact',
    { estado_tarea: estadoPendiente.anuncios, ...(almacen ? { almacen_num: almacen } : {}) },
  ));
  // Los casos de IC esperando respuesta: solo le dicen algo a quien responde.
  const { data: icPending } = useQuery({
    ...contador('ic', 'LoteIC', { estado_tarea: 'pendiente' }),
    enabled: !!user?.email && tieneRol(user, ROLES_RESPONDE_IC),
  });
  // Del resumen y no de la tabla `lotes`, que ya no llena nadie y contaba cero siempre.
  const lotesCriticos = conteosLotes ? (conteosLotes.critico ?? 0) + (conteosLotes.vencido ?? 0) : 0;

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
    runSmartNotifications({ user, productos: prodAlerts, lotes, conteosLotes, mermas, inventarios, anuncios })
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
  if (invPending      > 0) pendingCounts['/inventario'] = invPending;
  if (anunciosPending > 0) pendingCounts['/anuncios']   = anunciosPending;
  if (lotesCriticos   > 0) pendingCounts['/lotes']      = lotesCriticos;
  if (icPending       > 0) pendingCounts['/ic']         = icPending;
  if (sobrantesFact   > 0) pendingCounts['/ajustes/aumento']     = sobrantesFact;
  // Las mermas son ajustes de disminución: su pendiente va en la misma entrada,
  // junto a los faltantes. Facturación cuenta las que esperan su ajuste; el
  // resto, las que le tocan por su rol.
  const mermasDeAqui = (esFact ? mermasFact : mermasPending) ?? 0;
  const disminucion = (faltantesFact ?? 0) + (esFact ? mermasDeAqui : 0);
  if (disminucion > 0) pendingCounts['/ajustes/disminucion'] = disminucion;
  // Quien no es facturación las ve en su propia entrada de Inventario.
  if (!esFact && mermasDeAqui > 0) pendingCounts['/mermas'] = mermasDeAqui;

  return (
    <div className="min-h-screen bg-background">

      <ElegirAlmacenesDialog />
      <AvisoActualizacion />
      {/* Tras elegir almacén: dos diálogos a la vez se pisan. */}
      {!debeElegirAlmacenes(user) && <NovedadesDialog />}

      <Sidebar
        user={user}
        pendingCounts={pendingCounts}
        isCollapsed={isCollapsed}
        onToggle={() => setIsCollapsed(v => !v)}
        hoverMode={role === 'superadmin'}
      />

      <div
        className={`flex flex-col min-h-[100dvh] pb-[calc(56px+env(safe-area-inset-bottom,0px))] lg:pb-0
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
                  borderRadius: 'var(--r-ctl)',
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
                    className="w-8 h-8 sm:w-6 sm:h-6 rounded-full object-cover shrink-0 border border-[var(--c-ok)]/30" />
                ) : (
                  <div className="w-8 h-8 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[11px] sm:text-[10px] font-bold text-black shrink-0"
                    style={{ background: 'var(--c-ok)' }}>
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
                          className="w-8 h-8 rounded-full object-cover shrink-0 border border-[var(--c-ok)]/30" />
                      ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-black shrink-0"
                          style={{ background: 'var(--c-ok)' }}>
                          {initials}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-foreground truncate leading-tight">
                          {user?.nickname || user?.full_name || 'Usuario'}
                        </p>
                        <p className="text-[10px] text-[var(--c-ok)] font-mono leading-tight" style={{ letterSpacing: '0.06em' }}>
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
        {/* Hueco extra al final en el movil: el boton flotante vive sobre el
            contenido y, sin el, tapaba la ultima fila de cada listado. */}
        <main className="flex-1 p-4 pb-20 lg:p-6 lg:pb-6">
          <div className="max-w-[1400px] mx-auto">
            {/* El fallo de una pantalla queda dentro: el menú, el encabezado y
                la navegación siguen en pie. La `key` reinicia el límite al
                cambiar de ruta; sin ella, el error se quedaría pegado y
                navegar a otro sitio seguiría mostrándolo. */}
            <ErrorBoundary key={location.pathname}>
              {/* La espera del código de la pantalla se queda DENTRO del
                  armazón: el menú y la cabecera siguen en pie y solo el
                  contenido enseña su esqueleto. Antes el límite estaba por
                  encima de todo, y al navegar o se veía la pantalla vieja
                  como congelada o desaparecía hasta el menú. */}
              <Suspense fallback={<EsqueletoRuta />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>

      <BottomNav user={user} pendingCounts={pendingCounts} />

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
