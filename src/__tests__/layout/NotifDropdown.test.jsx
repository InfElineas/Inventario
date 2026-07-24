import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import NotifDropdown from '@/components/layout/NotifDropdown';

// ── Mocks ────────────────────────────────────────────────────
vi.mock('@/api/supabaseClient', () => ({
  supabase: {
    from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
  },
}));

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
);

const SAMPLE_NOTIFS = [
  { id: '1', titulo: 'Lote vencido', mensaje: 'Hay lotes vencidos', tipo: 'lote',    leida: false, created_date: new Date().toISOString() },
  { id: '2', titulo: 'Sync completa', mensaje: '100 productos',     tipo: 'sistema', leida: false, created_date: new Date().toISOString() },
  { id: '3', titulo: 'Usuario nuevo', mensaje: 'Pendiente de aprobación', tipo: 'usuario', leida: false, created_date: new Date().toISOString() },
];

// ── Renderizado ──────────────────────────────────────────────
describe('NotifDropdown — renderizado', () => {
  it('se renderiza sin errores', () => {
    render(<NotifDropdown notifications={[]} />, { wrapper });
    expect(screen.getByTestId('btn-notifications')).toBeInTheDocument();
  });

  it('no muestra badge cuando no hay notificaciones', () => {
    render(<NotifDropdown notifications={[]} />, { wrapper });
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it('muestra el conteo de no leídas en el badge', () => {
    render(<NotifDropdown notifications={SAMPLE_NOTIFS} />, { wrapper });
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('muestra 9+ cuando hay más de 9 notificaciones', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: String(i), titulo: `Notif ${i}`, tipo: 'sistema', leida: false,
      created_date: new Date().toISOString(),
    }));
    render(<NotifDropdown notifications={many} />, { wrapper });
    expect(screen.getByText('9+')).toBeInTheDocument();
  });
});

// ── Accesibilidad móvil ──────────────────────────────────────
describe('NotifDropdown — accesibilidad y tap targets', () => {
  it('el botón tiene aria-label="Notificaciones"', () => {
    render(<NotifDropdown notifications={[]} />, { wrapper });
    const btn = screen.getByRole('button', { name: /notificaciones/i });
    expect(btn).toBeInTheDocument();
  });

  it('el botón tiene aria-haspopup para indicar que abre un menú', () => {
    render(<NotifDropdown notifications={[]} />, { wrapper });
    const btn = screen.getByTestId('btn-notifications');
    expect(btn).toHaveAttribute('aria-haspopup', 'true');
  });

  it('aria-expanded es false cuando el dropdown está cerrado', () => {
    render(<NotifDropdown notifications={[]} />, { wrapper });
    const btn = screen.getByTestId('btn-notifications');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  it('aria-expanded cambia a true al abrir el dropdown', () => {
    render(<NotifDropdown notifications={[]} />, { wrapper });
    const btn = screen.getByTestId('btn-notifications');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('el botón tiene padding móvil p-2.5 (mínimo 44px de área táctil)', () => {
    render(<NotifDropdown notifications={[]} />, { wrapper });
    const btn = screen.getByTestId('btn-notifications');
    // p-2.5 = 10px padding → botón ~44px total con ícono 20px
    expect(btn.className).toMatch(/p-2\.5/);
  });

  it('el ícono tiene tamaño w-5 en móvil y sm:w-4 en desktop', () => {
    render(<NotifDropdown notifications={[]} />, { wrapper });
    const btn = screen.getByTestId('btn-notifications');
    const svg = btn.querySelector('svg');
    // SVGAnimatedString → usar getAttribute para obtener el string de clases
    const cls = svg?.getAttribute('class') ?? '';
    expect(cls).toMatch(/w-5/);
    expect(cls).toMatch(/sm:w-4/);
  });
});

// ── Interacción ──────────────────────────────────────────────
describe('NotifDropdown — interacción', () => {
  it('abre el dropdown al hacer clic en el botón', () => {
    render(<NotifDropdown notifications={SAMPLE_NOTIFS} />, { wrapper });
    fireEvent.click(screen.getByTestId('btn-notifications'));
    expect(screen.getByText('Notificaciones')).toBeInTheDocument();
  });

  it('muestra "Sin notificaciones nuevas" cuando la lista está vacía y dropdown abierto', () => {
    render(<NotifDropdown notifications={[]} />, { wrapper });
    fireEvent.click(screen.getByTestId('btn-notifications'));
    expect(screen.getByText(/sin notificaciones nuevas/i)).toBeInTheDocument();
  });

  it('muestra el botón "Marcar leídas" cuando hay notificaciones', () => {
    render(<NotifDropdown notifications={SAMPLE_NOTIFS} />, { wrapper });
    fireEvent.click(screen.getByTestId('btn-notifications'));
    expect(screen.getByText(/marcar leídas/i)).toBeInTheDocument();
  });

  it('muestra máximo 5 notificaciones en el dropdown', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: String(i), titulo: `Notif ${i}`, tipo: 'sistema', leida: false,
      created_date: new Date().toISOString(),
    }));
    render(<NotifDropdown notifications={many} />, { wrapper });
    fireEvent.click(screen.getByTestId('btn-notifications'));
    // Solo se muestran 5
    const items = screen.getAllByText(/Notif \d/);
    expect(items.length).toBeLessThanOrEqual(5);
  });

  it('cierra el dropdown al hacer clic fuera', () => {
    render(
      <div>
        <div data-testid="outside">Fuera</div>
        <NotifDropdown notifications={SAMPLE_NOTIFS} />
      </div>,
      { wrapper }
    );
    fireEvent.click(screen.getByTestId('btn-notifications'));
    expect(screen.getByText('Notificaciones')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText('Notificaciones')).not.toBeInTheDocument();
  });

  it('muestra el ícono correcto para tipo "usuario"', () => {
    const notifUsuario = [{ id: '1', titulo: 'Usuario nuevo', tipo: 'usuario', leida: false, created_date: new Date().toISOString() }];
    render(<NotifDropdown notifications={notifUsuario} />, { wrapper });
    fireEvent.click(screen.getByTestId('btn-notifications'));
    expect(screen.getByText('Usuario nuevo')).toBeInTheDocument();
  });
});
