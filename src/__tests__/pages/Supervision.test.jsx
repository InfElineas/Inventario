import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Radix Select no se deja manejar en jsdom: se sustituye por un <select> nativo.
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="" />{children}
    </select>
  ),
  SelectTrigger: ({ 'aria-label': etiqueta }) => <span data-aria={etiqueta} />,
  SelectValue: () => null,
  SelectContent: ({ children }) => <>{children}</>,
  SelectItem: ({ value, children }) => <option value={value}>{children}</option>,
}));

const m = vi.hoisted(() => ({
  user: { email: 'jefe@x.com', full_name: 'Jefa Inventario', role: 'jefe_depto', departamento: 'inventario' },
  lista: vi.fn(), filtrar: vi.fn(), crear: vi.fn(), notificar: vi.fn(),
}));

vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: m.user }) }));
vi.mock('@/lib/notificationService', () => ({ notificarComentario: m.notificar }));
vi.mock('@/api/base44Client', () => ({
  base44: {
    entities: new Proxy({}, {
      get: (_, nombre) => (nombre === 'ComentarioSupervision'
        ? { filter: m.filtrar, create: m.crear }
        : { list: m.lista }),
    }),
  },
}));

const { default: Supervision } = await import('@/pages/Supervision');

const CONTEO = {
  id: 'c1', producto_nombre: 'Aceite 1 L', producto_codigo: '7501', especialista_nombre: 'Ana',
  estado_tarea: 'pend_fact', fecha_inv: '2026-10-29',
};

function pintar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><Supervision /></QueryClientProvider>);
}

beforeEach(() => {
  cleanup();
  m.lista.mockReset().mockResolvedValue([CONTEO]);
  m.filtrar.mockReset().mockResolvedValue([]);
  m.crear.mockReset().mockResolvedValue({});
  m.notificar.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

async function abrirConteo(user) {
  await user.click(await screen.findByText('Aceite 1 L'));
  return screen.findByPlaceholderText(/Elige para quién es/);
}

describe('Supervisión — comentarios con destinatario', () => {
  it('sin elegir para quién, el comentario no se puede enviar', async () => {
    const user = userEvent.setup();
    pintar();
    const caja = await abrirConteo(user);
    await user.type(caja, 'Revisen esto');

    expect(screen.getByRole('button', { name: 'Enviar comentario' })).toBeDisabled();
    expect(screen.getByText(/Sin elegir un destinatario no se puede enviar/)).toBeInTheDocument();
  });

  it('se elige el departamento entre los cuatro posibles', async () => {
    const user = userEvent.setup();
    pintar();
    await abrirConteo(user);
    const selector = screen.getAllByRole('combobox').at(-1);
    for (const nombre of ['Inventario', 'Facturación', 'Creación de Anuncio', 'Auditoría']) {
      expect(Array.from(selector.options).some((o) => o.textContent === nombre), nombre).toBe(true);
    }
  });

  it('el comentario se guarda PARA el departamento y se le avisa', async () => {
    const user = userEvent.setup();
    pintar();
    const caja = await abrirConteo(user);
    await user.selectOptions(screen.getAllByRole('combobox').at(-1), 'facturacion');
    await user.type(await screen.findByPlaceholderText(/Escribe un comentario para Facturación/), 'Falta el número de factura');
    expect(caja).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Enviar comentario' }));

    await waitFor(() => expect(m.crear).toHaveBeenCalledTimes(1));
    expect(m.crear.mock.calls[0][0]).toEqual({
      tabla: 'inventarios', registro_id: 'c1', autor_id: 'jefe@x.com', autor_nombre: 'Jefa Inventario',
      para_depto: 'facturacion', comentario: 'Falta el número de factura',
    });

    // El aviso: a los roles del departamento, sin el autor, con el texto y un enlace al registro.
    await waitFor(() => expect(m.notificar).toHaveBeenCalledTimes(1));
    expect(m.notificar.mock.calls[0][0]).toMatchObject({
      para: 'facturacion', roles: ['fact'], autor: 'jefe@x.com', enlace: '/inventario',
    });
    expect(m.notificar.mock.calls[0][0].titulo).toMatch(/Jefa Inventario comentó un conteo para Facturación/);
    expect(m.notificar.mock.calls[0][0].mensaje).toMatch(/Aceite 1 L: Falta el número de factura/);
  });

  it('que falle el aviso no deshace el comentario', async () => {
    m.notificar.mockRejectedValue(new Error('sin red'));
    const user = userEvent.setup();
    pintar();
    await abrirConteo(user);
    await user.selectOptions(screen.getAllByRole('combobox').at(-1), 'auditoria');
    await user.type(await screen.findByPlaceholderText(/Escribe un comentario para Auditoría/), 'Mírenlo');
    await user.click(screen.getByRole('button', { name: 'Enviar comentario' }));
    await waitFor(() => expect(m.crear).toHaveBeenCalledTimes(1));
  });

  it('cada comentario enseña para quién es, y los de antes dicen que no tienen destinatario', async () => {
    m.filtrar.mockResolvedValue([
      { id: 1, autor_nombre: 'Jefa', para_depto: 'facturacion', comentario: 'nuevo', created_date: '2026-11-03T10:00:00Z' },
      { id: 2, autor_nombre: 'Jefa', para_depto: null, comentario: 'viejo', created_date: '2026-10-01T10:00:00Z' },
    ]);
    const user = userEvent.setup();
    pintar();
    await abrirConteo(user);

    expect(await screen.findByText('para Facturación')).toBeInTheDocument();
    expect(screen.getByText('sin destinatario')).toBeInTheDocument();
  });
});
