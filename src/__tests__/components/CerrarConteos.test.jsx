import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Dar por procesados los conteos que el documento resolvió.
 *
 * Lo que se vigila: que solo entren los conteos que TKC aceptó, que se escriba
 * el documento que los resolvió, que un fallo no tumbe a los demás y que un
 * reintento no vuelva a procesar los que ya se hicieron.
 */

const m = vi.hoisted(() => ({ update: vi.fn(), me: vi.fn(), create: vi.fn() }));
vi.mock('@/api/base44Client', () => ({
  base44: {
    auth: { me: m.me },
    entities: new Proxy({}, { get: () => ({ update: m.update, create: m.create, filter: vi.fn() }) }),
  },
}));

const { default: CerrarConteos } = await import('@/components/ajustes/CerrarConteos');

const conteo = (id, codigo, extra = {}) => ({
  id, almacen_num: '789', producto_id: `p-${id}`, producto_codigo: codigo, producto_nombre: `Prod ${codigo}`,
  diferencia: 3, resultado: 'sobrante', clasif_ajuste: 'Robo', fecha_inv: '2026-11-02', especialista_id: 'inv@x.com',
  ...extra,
});

function pintar(props) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CerrarConteos documento="TKCE001" aceptadas={[]} conteos={[]} {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  m.update.mockReset().mockResolvedValue({});
  m.create.mockReset().mockResolvedValue({});
  m.me.mockReset().mockResolvedValue({ email: 'fact@x.com', full_name: 'Fran', role: 'fact' });
});
afterEach(cleanup);

describe('CerrarConteos', () => {
  it('sin conteos no enseña nada', () => {
    const { container } = pintar({});
    expect(container).toBeEmptyDOMElement();
  });

  it('solo entran los conteos que TKC aceptó; los demás se quedan pendientes y se dice', async () => {
    pintar({
      conteos: [{ conteo: conteo('a', '7501'), anteriores: [] }, { conteo: conteo('b', '7502'), anteriores: [] }],
      aceptadas: [{ line: 1, code: '7501', quantity: 3 }],
    });
    expect(await screen.findByRole('button', { name: /Enviar a auditoría \(1\)/i })).toBeInTheDocument();
    expect(screen.getByText(/no entró en el documento \(7502\)/i)).toBeInTheDocument();
  });

  it('escribe el documento, cómo se resolvió y quién, y pasa el conteo a auditoría', async () => {
    pintar({
      conteos: [{ conteo: conteo('a', '7501'), anteriores: [] }],
      aceptadas: [{ line: 1, code: '7501', quantity: 3 }],
    });
    await userEvent.type(screen.getByPlaceholderText(/notas de facturación/i), 'conciliado');
    await userEvent.click(await screen.findByRole('button', { name: /Enviar a auditoría/i }));

    await waitFor(() => expect(m.update).toHaveBeenCalledTimes(1));
    expect(m.update.mock.calls[0][0]).toBe('a');
    expect(m.update.mock.calls[0][1]).toMatchObject({
      fact_no_factura: 'TKCE001', fact_clasif: 'Robo', fact_estado: 'Ajuste de aumento', fact_notas: 'conciliado',
      fact_especialista_id: 'fact@x.com', estado_tarea: 'en_auditoria',
    });
    expect(await screen.findByText(/1 conteo quedó procesado con el documento TKCE001/i)).toBeInTheDocument();
  });

  it('los conteos anteriores del mismo producto se cierran sin ajuste', async () => {
    pintar({
      conteos: [{ conteo: conteo('nuevo', '7501'), anteriores: [conteo('viejo', '7501', { fecha_inv: '2026-10-20' })] }],
      aceptadas: [{ line: 1, code: '7501', quantity: 3 }],
    });
    await userEvent.click(await screen.findByRole('button', { name: /Enviar a auditoría/i }));

    await waitFor(() => expect(m.update).toHaveBeenCalledTimes(2));
    expect(m.update.mock.calls[0][0]).toBe('nuevo');
    expect(m.update.mock.calls[1][0]).toBe('viejo');
    expect(m.update.mock.calls[1][1]).toMatchObject({ estado_tarea: 'completado', fact_estado: 'No Procesar x Fact' });
  });

  it('si un conteo falla, los demás se escriben y el reintento solo repite el que falló', async () => {
    m.update.mockImplementation(async (id) => {
      if (id === 'b') throw new Error('Sin permiso');
      return {};
    });
    pintar({
      conteos: [{ conteo: conteo('a', '7501'), anteriores: [] }, { conteo: conteo('b', '7502'), anteriores: [] }],
      aceptadas: [{ code: '7501' }, { code: '7502' }],
    });
    await userEvent.click(await screen.findByRole('button', { name: /Enviar a auditoría \(2\)/i }));

    expect(await screen.findByText(/No se pudo escribir en 1 conteo: 7502 \(Sin permiso\)/i)).toBeInTheDocument();
    expect(m.update.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);

    // El reintento: «a» ya está hecho y no se vuelve a procesar.
    m.update.mockClear().mockResolvedValue({});
    await userEvent.click(await screen.findByRole('button', { name: /Enviar a auditoría \(1\)/i }));
    await waitFor(() => expect(m.update).toHaveBeenCalledTimes(1));
    expect(m.update.mock.calls[0][0]).toBe('b');
  });
});
