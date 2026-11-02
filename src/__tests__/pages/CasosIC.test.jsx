import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * La pantalla de casos de IC.
 *
 * Lo que se vigila: que cada uno vea lo que le toca —el inventarista, lo
 * suyo; comercial, todo—, que solo comercial responda, que rechazar exija una
 * razón y que quien lo mandó se entere de la respuesta.
 */

const m = vi.hoisted(() => ({
  me: vi.fn(), filter: vi.fn(), count: vi.fn(), update: vi.fn(), remove: vi.fn(), notificar: vi.fn(),
}));

vi.mock('@/api/base44Client', () => ({
  base44: {
    auth: { me: m.me },
    entities: { LoteIC: { filter: m.filter, buscar: m.filter, count: m.count, update: m.update, delete: m.remove } },
  },
}));
vi.mock('@/lib/useAlmacen', async (importOriginal) => ({
  ...(await importOriginal()),
  useAlmacen: () => ({ almacen: '789', setAlmacen: () => {}, almacenesConfig: null }),
}));
vi.mock('@/lib/notificationService', () => ({ notifyUsuario: m.notificar }));

const { default: CasosIC } = await import('@/pages/CasosIC');

const CASO = {
  id: 'c1', producto_nombre: 'Mostaza Heinz', producto_codigo: '0130', no_lote: 'L1', almacen_num: '789',
  cant_x_vencer: 6, fecha_vencimiento: '2026-11-20', precio_actual: 10, propuesta_precio_ic: 8,
  estado_tarea: 'pendiente', especialista_inv_id: 'ana@mercadoelineas.com', especialista_inv_nombre: 'Ana',
  fecha_deteccion: '2026-11-01',
};

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><CasosIC /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const usuario = (role, email) => ({ email, role, roles: [role] });

beforeEach(() => {
  cleanup();
  Object.values(m).forEach((f) => f.mockReset());
  m.filter.mockResolvedValue([CASO]);
  m.count.mockResolvedValue(1);
  m.update.mockResolvedValue({});
  m.notificar.mockResolvedValue();
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

describe('CasosIC', () => {
  it('el inventarista pide solo los casos que él mandó', async () => {
    m.me.mockResolvedValue(usuario('inv', 'ana@mercadoelineas.com'));
    montar();
    await screen.findAllByText('Mostaza Heinz');
    expect(m.filter.mock.calls[0][0]).toMatchObject({ especialista_inv_id: 'ana@mercadoelineas.com', almacen_num: '789' });
  });

  it('comercial pide los de todos', async () => {
    m.me.mockResolvedValue(usuario('ca', 'ca@mercadoelineas.com'));
    montar();
    await screen.findAllByText('Mostaza Heinz');
    expect(m.filter.mock.calls[0][0]).not.toHaveProperty('especialista_inv_id');
  });

  it('el inventarista abre su caso y no puede responderlo, pero sí retirarlo', async () => {
    m.me.mockResolvedValue(usuario('inv', 'ana@mercadoelineas.com'));
    montar();
    await userEvent.click((await screen.findAllByText('Mostaza Heinz'))[0]);

    expect(await screen.findByRole('button', { name: /retirar caso/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aprobar rebaja/i })).not.toBeInTheDocument();
  });

  it('comercial aprueba: se escribe la respuesta y se avisa a quien lo mandó', async () => {
    m.me.mockResolvedValue(usuario('ca', 'ca@mercadoelineas.com'));
    montar();
    await userEvent.click((await screen.findAllByText('Mostaza Heinz'))[0]);
    await userEvent.type(await screen.findByPlaceholderText(/respuesta de comercial/i), 'adelante');
    await userEvent.click(screen.getByRole('button', { name: /aprobar rebaja/i }));

    await waitFor(() => expect(m.update).toHaveBeenCalledTimes(1));
    expect(m.update.mock.calls[0][0]).toBe('c1');
    expect(m.update.mock.calls[0][1]).toMatchObject({
      estado_tarea: 'aprobado', notas_ic: 'adelante', respondido_por: 'ca@mercadoelineas.com',
    });
    await waitFor(() => expect(m.notificar).toHaveBeenCalled());
    expect(m.notificar.mock.calls[0][0]).toBe('ana@mercadoelineas.com');
    expect(m.notificar.mock.calls[0][2]).toMatch(/aprobada/i);
  });

  it('«No procede» no se puede pulsar sin una razón', async () => {
    m.me.mockResolvedValue(usuario('ca', 'ca@mercadoelineas.com'));
    montar();
    await userEvent.click((await screen.findAllByText('Mostaza Heinz'))[0]);

    const noProcede = await screen.findByRole('button', { name: /no procede/i });
    expect(noProcede).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText(/respuesta de comercial/i), 'ya está en oferta');
    expect(noProcede).toBeEnabled();
  });

  it('un caso ya respondido enseña la respuesta y no deja responder otra vez', async () => {
    m.me.mockResolvedValue(usuario('ca', 'ca@mercadoelineas.com'));
    m.filter.mockResolvedValue([{ ...CASO, estado_tarea: 'rechazado', notas_ic: 'ya está en oferta', respondido_por: 'ca@mercadoelineas.com' }]);
    montar();
    await userEvent.click((await screen.findAllByText('Mostaza Heinz'))[0]);

    expect(await screen.findByText(/ya está en oferta/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aprobar rebaja/i })).not.toBeInTheDocument();
  });
});
