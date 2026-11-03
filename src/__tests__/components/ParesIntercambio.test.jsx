import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Los intercambios esperando procesamiento: las dos mitades juntas, como un
 * solo caso, y el origen siempre el producto que falta.
 */

const m = vi.hoisted(() => ({ filter: vi.fn(), update: vi.fn(), me: vi.fn() }));
vi.mock('@/api/base44Client', () => ({
  base44: {
    auth: { me: m.me },
    entities: new Proxy({}, { get: () => ({ filter: m.filter, update: m.update, create: vi.fn() }) }),
  },
}));

const { default: ParesIntercambio } = await import('@/components/ajustes/ParesIntercambio');

const falta = (extra = {}) => ({
  id: 'f', almacen_num: '789', producto_id: 'pa', producto_codigo: 'A', producto_nombre: 'Aceite pequeño',
  diferencia: -5, resultado: 'faltante', intercambio_id: 's', clasif_ajuste: 'Intercambio de Producto',
  fecha_inv: '2026-11-02', ...extra,
});
const sobra = (extra = {}) => ({
  id: 's', almacen_num: '789', producto_id: 'pb', producto_codigo: 'B', producto_nombre: 'Aceite grande',
  diferencia: 5, resultado: 'sobrante', intercambio_id: 'f', clasif_ajuste: 'Intercambio de Producto',
  fecha_inv: '2026-11-02', ...extra,
});

function pintar(props) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ParesIntercambio almacen="789" onUsar={() => {}} {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  m.filter.mockReset().mockResolvedValue([]);
  m.update.mockReset().mockResolvedValue({});
  m.me.mockReset().mockResolvedValue({ email: 'fact@x.com', full_name: 'Fran' });
});
afterEach(cleanup);

describe('ParesIntercambio', () => {
  it('pide los conteos de intercambio pendientes de facturación del almacén', async () => {
    pintar({});
    await waitFor(() => expect(m.filter).toHaveBeenCalled());
    expect(m.filter.mock.calls[0][0]).toMatchObject({
      almacen_num: '789', estado_tarea: 'pend_fact', clasif_ajuste: 'Intercambio de Producto',
    });
  });

  it('sin intercambios pendientes no ocupa sitio', async () => {
    const { container } = pintar({});
    // Mientras carga se ve «Cargando…»; sin nada, desaparece.
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('enseña las dos mitades como un caso: el que falta, la cantidad y el que sobra', async () => {
    m.filter.mockResolvedValue([sobra(), falta()]);
    pintar({});

    expect(await screen.findByText('Aceite pequeño')).toBeInTheDocument();
    expect(screen.getByText('Aceite grande')).toBeInTheDocument();
    expect(screen.getByText('-5')).toBeInTheDocument();
    expect(screen.getByText('+5')).toBeInTheDocument();
  });

  it('pasa al formulario ORIGEN>DESTINO*CANTIDAD y los pares, con el faltante de origen', async () => {
    m.filter.mockResolvedValue([sobra(), falta()]);
    const onUsar = vi.fn();
    pintar({ onUsar });

    await userEvent.click(await screen.findByRole('button', { name: /Pasarlos al formulario \(1\)/i }));
    expect(onUsar.mock.calls[0][0]).toBe('A>B*5');
    expect(onUsar.mock.calls[0][1][0].origen.id).toBe('f');
    expect(onUsar.mock.calls[0][1][0].destino.id).toBe('s');
  });

  it('una mitad sin su par se avisa y no se propone', async () => {
    m.filter.mockResolvedValue([falta()]);
    const onUsar = vi.fn();
    pintar({ onUsar });

    expect(await screen.findByText(/no tiene su par entre lo pendiente/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pasarlos al formulario/i })).not.toBeInTheDocument();
  });

  it('devolver un par devuelve los dos conteos con el mismo motivo', async () => {
    m.filter.mockResolvedValue([sobra(), falta()]);
    pintar({});

    await userEvent.click((await screen.findAllByRole('button', { name: /^Acciones: Aceite/ }))[0]);
    await userEvent.click(screen.getByText('Devolver los dos conteos a inventario'));
    await userEvent.type(screen.getByPlaceholderText(/qué hay que corregir/i), 'No son productos parecidos');
    await userEvent.click(screen.getByRole('button', { name: /^Devolver$/ }));

    await waitFor(() => expect(m.update).toHaveBeenCalledTimes(2));
    expect(m.update.mock.calls.map((c) => c[0]).sort()).toEqual(['f', 's']);
    expect(m.update.mock.calls[0][1]).toMatchObject({ estado_tarea: 'devuelto', fact_notas: 'No son productos parecidos' });
  });
});
