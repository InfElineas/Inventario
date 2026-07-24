/**
 * Tests para los botones de acción del header en AppLayout.
 * Se centra en tap targets móviles, accesibilidad y comportamiento de los botones
 * que fueron mejorados para usabilidad móvil.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

vi.mock('@/api/base44Client', () => ({
  base44: {
    auth: { me: () => Promise.resolve({ email: 'test@test.com', role: 'inv' }) },
    entities: {
      Merma:       { list: () => Promise.resolve([]) },
      Inventario:  { list: () => Promise.resolve([]) },
      AnuncioDesact:{ list: () => Promise.resolve([]) },
      Lote:        { list: () => Promise.resolve([]) },
    },
  },
}));

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

vi.mock('./Sidebar', () => ({ default: () => <nav data-testid="sidebar" /> }), { virtual: true });
vi.mock('./BottomNav', () => ({ default: () => <nav data-testid="bottom-nav" /> }), { virtual: true });
vi.mock('./NotifDropdown', () => ({
  default: ({ notifications }) => (
    <button data-testid="btn-notifications" aria-label="Notificaciones">
      {notifications.length > 0 && <span>{notifications.length}</span>}
    </button>
  ),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    Outlet: () => <main data-testid="outlet" />,
  };
});

import AppLayout from '@/components/layout/AppLayout';

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{children}</MemoryRouter>
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
  it('abre el modal de escáner al clicar el botón', () => {
    render(<AppLayout />, { wrapper });
    expect(screen.queryByTestId('scanner-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('btn-scanner'));
    expect(screen.getByTestId('scanner-modal')).toBeInTheDocument();
  });

  it('cierra el modal de escáner al llamar onClose', () => {
    render(<AppLayout />, { wrapper });
    fireEvent.click(screen.getByTestId('btn-scanner'));
    fireEvent.click(screen.getByText('Cerrar'));
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
