import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const auth = vi.hoisted(() => ({ user: null }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));

const m = vi.hoisted(() => ({ filter: vi.fn(), buscar: vi.fn(), count: vi.fn(), usuarios: vi.fn() }));
vi.mock('@/api/base44Client', () => ({
  base44: {
    entities: {
      Inventario: { filter: m.filter, buscar: m.buscar, count: m.count },
      Usuario: { filter: m.usuarios },
    },
  },
}));

const { default: HistorialPorUsuario } = await import('@/components/inventario/HistorialPorUsuario');

const CONTEO = (extra = {}) => ({
  id: 'c1', producto_nombre: 'Aceite 1 L', producto_codigo: '7501', almacen_num: '789',
  exist_fisica_tkc: 10, conteo_real: 8, diferencia: -2, estado_tarea: 'completado', fecha_inv: '2026-10-29',
  clasif_ajuste: 'Robo', ...extra,
});

function pintar(props) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <HistorialPorUsuario user={{ email: 'ana@x.com', full_name: 'Ana Pérez', role: 'inv' }}
        vistaGlobal={false} pestanas={<div>pestañas</div>} {...props} />
    </QueryClientProvider>,
  );
}

/** Los conteos que la base cuenta por resultado. */
const cuentaPorResultado = (n) => (cond) => Promise.resolve(
  cond.resultado ? (n[cond.resultado] ?? 0) : (n.total ?? 0),
);

beforeEach(() => {
  cleanup();
  localStorage.clear();
  auth.user = { role: 'inv', almacenes_config: [] };
  m.filter.mockReset().mockResolvedValue([CONTEO()]);
  m.buscar.mockReset().mockResolvedValue([CONTEO()]);
  m.count.mockReset().mockImplementation(cuentaPorResultado({ total: 12, sobrante: 3, faltante: 5, ok: 4 }));
  m.usuarios.mockReset().mockResolvedValue([
    { email: 'ana@x.com', full_name: 'Ana Pérez' },
    { email: 'luis@x.com', full_name: 'Luis Gómez' },
  ]);
});

describe('HistorialPorUsuario', () => {
  it('un inventarista ve SUS conteos, de cualquier estado, y no puede elegir a otra persona', async () => {
    pintar();

    expect((await screen.findAllByText('Aceite 1 L')).length).toBeGreaterThan(0);
    expect(screen.getByText(/Tus conteos hechos/)).toBeInTheDocument();
    expect(m.filter.mock.calls[0][0]).toEqual({ especialista_id: 'ana@x.com' });
    // Sin filtro de estado: también lo ya completado.
    expect(m.filter.mock.calls[0][0]).not.toHaveProperty('estado_tarea');
    expect(screen.queryByRole('combobox', { name: 'Persona' })).not.toBeInTheDocument();
    expect(m.usuarios).not.toHaveBeenCalled();
  });

  it('el resumen cuenta la base entera, no la página', async () => {
    pintar();
    await screen.findAllByText('Aceite 1 L');

    await waitFor(() => expect(screen.getAllByText('5').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Faltantes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sobrantes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('12').length).toBeGreaterThan(0);
    expect(m.count.mock.calls.some(([c]) => c.resultado === 'faltante')).toBe(true);
  });

  it('quien sigue al equipo elige de quién, y empieza por sí mismo', async () => {
    pintar({ vistaGlobal: true, user: { email: 'jefe@x.com', full_name: 'Jefa', role: 'jefe_depto' } });
    await screen.findAllByText('Aceite 1 L');
    expect(m.filter.mock.calls[0][0]).toEqual({ especialista_id: 'jefe@x.com' });

    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Persona' }), 'luis@x.com');
    await waitFor(() => expect(m.filter.mock.calls.at(-1)[0]).toEqual({ especialista_id: 'luis@x.com' }));
    expect(screen.getByText(/Conteos hechos por Luis Gómez/)).toBeInTheDocument();
  });

  it('los filtros llegan a la consulta: almacén y fechas', async () => {
    pintar();
    await screen.findAllByText('Aceite 1 L');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Almacén' }), '789');
    await waitFor(() => expect(m.filter.mock.calls.at(-1)[0]).toMatchObject({ almacen_num: '789' }));

    await userEvent.type(screen.getByLabelText('Desde'), '2026-10-01');
    await waitFor(() => expect(m.filter.mock.calls.at(-1)[0].fecha_inv).toEqual({ gte: '2026-10-01' }));
  });

  it('sin conteos, lo dice', async () => {
    m.filter.mockResolvedValue([]);
    m.count.mockResolvedValue(0);
    pintar();
    expect(await screen.findByText(/no tienes conteos con estos filtros/i)).toBeInTheDocument();
  });
});
