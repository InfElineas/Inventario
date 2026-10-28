/**
 * Tests para los botones de acción del header en AppLayout.
 * Se centra en tap targets móviles, accesibilidad y comportamiento de los botones
 * que fueron mejorados para usabilidad móvil.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Suspense } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks de dependencias pesadas ────────────────────────────
vi.mock('@/api/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) }),
    }),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
  },
}));

// Mutable para que cada test fije los contadores que devuelve Postgres.
const contadores = vi.hoisted(() => ({ Merma: 0, Inventario: 0, AnuncioDesact: 0, Lote: 0 }));

vi.mock('@/api/base44Client', () => {
  // count() hace falta desde que los contadores del menú se calculan en Postgres
  // en vez de filtrando registros descargados. Sin él la query fallaba en
  // silencio: react-query se tragaba el "count is not a function", el badge
  // quedaba vacío y los tests seguían pasando igual.
  const entidad = (nombre) => ({
    list:  () => Promise.resolve([]),
    count: () => Promise.resolve(contadores[nombre]),
  });
  return {
    base44: {
      auth: { me: () => Promise.resolve({ email: 'test@test.com', role: 'inv' }) },
      entities: {
        Merma:         entidad('Merma'),
        Inventario:    entidad('Inventario'),
        AnuncioDesact: entidad('AnuncioDesact'),
        Lote:          entidad('Lote'),
      },
    },
  };
});

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'test@test.com', role: 'inv', full_name: 'Test User', avatar_url: null },
    logout: vi.fn(),
  }),
}));

vi.mock('@/lib/useTheme', () => ({
  useTheme: () => ({ isDark: true, toggleTheme: vi.fn() }),
}));

vi.mock('@/lib/useAlmacen', () => ({
  useAlmacen: () => ({ almacen: '001', setAlmacen: vi.fn() }),
}));

vi.mock('@/lib/SyncContext', () => ({
  useSyncManager: () => ({ syncState: null, isRunning: false, syncOne: vi.fn(), syncAll: vi.fn(), lastResults: {} }),
}));

vi.mock('@/lib/notificationService', () => ({
  runSmartNotifications: () => Promise.resolve(),
  requestBrowserPermission: vi.fn(),
}));

vi.mock('@/components/shared/BarcodeScannerModal', () => ({
  default: ({ onClose }) => <div data-testid="scanner-modal"><button onClick={onClose}>Cerrar</button></div>,
}));

vi.mock('@/components/shared/ProfileModal', () => ({
  default: () => null,
}));

// OJO con la ruta: vi.mock resuelve relativo al FICHERO DE TEST, no a AppLayout.
// Estos mocks estaban puestos como './Sidebar' con { virtual: true }, asi que
// nunca sustituian nada — se renderizaba el componente real. Con la ruta del
// alias si aplican.
//
// El de Sidebar expone pendingCounts para poder comprobar que los contadores del
// menu llegan desde las queries de count().
vi.mock('@/components/layout/Sidebar', () => ({
  default: ({ pendingCounts }) => (
    <nav data-testid="sidebar" data-counts={JSON.stringify(pendingCounts ?? {})} />
  ),
}));
vi.mock('@/components/layout/BottomNav', () => ({ default: () => <nav data-testid="bottom-nav" /> }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    Outlet: () => <main data-testid="outlet" />,
  };
});

import AppLayout from '@/components/layout/AppLayout';

// El Suspense refleja el de App.jsx, que envuelve a AppLayout en la app real.
// Hace falta desde que BarcodeScannerModal se carga con lazy(): sin el, montar
// el modal lanzaria en vez de suspender.
const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>
      <Suspense fallback={null}>{children}</Suspense>
    </MemoryRouter>
  </QueryClientProvider>
);

// ── Header — renderizado ─────────────────────────────────────
describe('AppLayout header — renderizado', () => {
  beforeEach(() => {
    render(<AppLayout />, { wrapper });
  });

  it('muestra el header con data-testid', () => {
    expect(screen.getByTestId('app-header')).toBeInTheDocument();
  });

  it('muestra el botón de escanear', () => {
    expect(screen.getByTestId('btn-scanner')).toBeInTheDocument();
  });

  it('muestra el botón de notificaciones', () => {
    expect(screen.getByTestId('btn-notifications')).toBeInTheDocument();
  });

  it('muestra el botón de menú de usuario', () => {
    expect(screen.getByTestId('btn-user-menu')).toBeInTheDocument();
  });
});

// ── Tap targets móviles ──────────────────────────────────────
describe('AppLayout header — tap targets móviles (WCAG 2.1 mínimo 44px)', () => {
  beforeEach(() => {
    render(<AppLayout />, { wrapper });
  });

  it('el botón de escanear tiene clase p-2.5 para área táctil móvil', () => {
    const btn = screen.getByTestId('btn-scanner');
    expect(btn.className).toMatch(/p-2\.5/);
  });

  it('el botón de escanear tiene clase sm:p-1.5 para desktop', () => {
    const btn = screen.getByTestId('btn-scanner');
    expect(btn.className).toMatch(/sm:p-1\.5/);
  });

  it('el ícono del escáner es más grande en móvil (w-5 sm:w-4)', () => {
    const btn = screen.getByTestId('btn-scanner');
    const svg = btn.querySelector('svg');
    // SVGAnimatedString → usar getAttribute para obtener el string de clases
    const cls = svg?.getAttribute('class') ?? '';
    expect(cls).toMatch(/w-5/);
    expect(cls).toMatch(/sm:w-4/);
  });

  it('el avatar del usuario es más grande en móvil (w-8 sm:w-6)', () => {
    const btn = screen.getByTestId('btn-user-menu');
    const avatar = btn.firstElementChild;
    expect(avatar?.className).toMatch(/w-8/);
    expect(avatar?.className).toMatch(/sm:w-6/);
  });

  it('el header tiene altura móvil h-14 (56px) y sm:h-[52px] en desktop', () => {
    const header = screen.getByTestId('app-header');
    expect(header.className).toMatch(/h-14/);
    expect(header.className).toMatch(/sm:h-\[52px\]/);
  });
});

// ── Accesibilidad ────────────────────────────────────────────
describe('AppLayout header — accesibilidad', () => {
  beforeEach(() => {
    render(<AppLayout />, { wrapper });
  });

  it('botón escáner tiene aria-label descriptivo', () => {
    const btn = screen.getByRole('button', { name: /escanear código/i });
    expect(btn).toBeInTheDocument();
  });

  it('botón usuario tiene aria-label descriptivo', () => {
    const btn = screen.getByRole('button', { name: /menú de usuario/i });
    expect(btn).toBeInTheDocument();
  });

  it('botón usuario tiene aria-expanded', () => {
    const btn = screen.getByTestId('btn-user-menu');
    expect(btn).toHaveAttribute('aria-expanded');
  });

  it('aria-expanded del menú usuario empieza en false', () => {
    const btn = screen.getByTestId('btn-user-menu');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });
});

// ── Interacción ──────────────────────────────────────────────
describe('AppLayout header — interacción', () => {
  // find* en vez de get*: BarcodeScannerModal se carga con lazy(), asi que
  // aparece un microtask despues del clic, no en el mismo tick.
  it('abre el modal de escáner al clicar el botón', async () => {
    render(<AppLayout />, { wrapper });
    expect(screen.queryByTestId('scanner-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('btn-scanner'));
    expect(await screen.findByTestId('scanner-modal')).toBeInTheDocument();
  });

  it('cierra el modal de escáner al llamar onClose', async () => {
    render(<AppLayout />, { wrapper });
    fireEvent.click(screen.getByTestId('btn-scanner'));
    fireEvent.click(await screen.findByText('Cerrar'));
    expect(screen.queryByTestId('scanner-modal')).not.toBeInTheDocument();
  });

  it('abre el menú de usuario al clicar el botón y aria-expanded cambia a true', () => {
    render(<AppLayout />, { wrapper });
    const btn = screen.getByTestId('btn-user-menu');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('el menú de usuario muestra las opciones al abrirse', () => {
    render(<AppLayout />, { wrapper });
    fireEvent.click(screen.getByTestId('btn-user-menu'));
    expect(screen.getByText(/perfil y preferencias/i)).toBeInTheDocument();
    expect(screen.getByText(/cerrar sesión/i)).toBeInTheDocument();
  });
});

// ── Contadores del menú ──────────────────────────────────────
describe('AppLayout — contadores del menú', () => {
  const leerCounts = async () =>
    JSON.parse((await screen.findByTestId('sidebar')).dataset.counts);

  beforeEach(() => {
    Object.assign(contadores, { Merma: 0, Inventario: 0, AnuncioDesact: 0, Lote: 0 });
  });

  it('pasa a Sidebar lo que devuelve count(), sin descargar registros', async () => {
    Object.assign(contadores, { Merma: 3, Inventario: 1, AnuncioDesact: 7, Lote: 2 });
    render(<AppLayout />, { wrapper });
    await vi.waitFor(async () => {
      // Las entradas de facturación cuentan lo mismo pero por su estado; el
      // mock devuelve una cifra por entidad, así que repiten la suya.
      expect(await leerCounts()).toEqual({
        '/mermas': 3, '/inventario': 1, '/anuncios': 7, '/lotes': 2,
        '/facturacion/mermas': 3, '/facturacion/inventario': 1,
      });
    });
  });

  it('omite las rutas con cero, para que no salga un badge vacío', async () => {
    Object.assign(contadores, { Merma: 5 });
    render(<AppLayout />, { wrapper });
    await vi.waitFor(async () => {
      expect(await leerCounts()).toEqual({ '/mermas': 5, '/facturacion/mermas': 5 });
    });
  });

  it('no rompe mientras las queries aún no han resuelto', async () => {
    render(<AppLayout />, { wrapper });
    // count() empieza en undefined; `undefined > 0` es false, no NaN ni crash.
    expect(await leerCounts()).toEqual({});
  });
});
