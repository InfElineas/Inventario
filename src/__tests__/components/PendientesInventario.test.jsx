import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * El puente entre inventario y facturación.
 *
 * Lo que se prueba es que cada pantalla pida lo suyo —un sobrante se resuelve
 * con un aumento y un faltante con una disminución— y que las líneas que pasa
 * al formulario lleven la cantidad que midió el conteo.
 */

const filter = vi.hoisted(() => vi.fn());
vi.mock('@/api/base44Client', () => ({
  base44: { entities: new Proxy({}, { get: () => ({ filter }) }) },
}));

const { default: PendientesInventario } = await import('@/components/ajustes/PendientesInventario');

const conteo = (extra = {}) => ({
  id: 'c1', producto_nombre: 'Aceite 1 L', producto_codigo: '7501',
  diferencia: 3, especialista_nombre: 'Ada', fecha_inv: '2026-10-27', ...extra,
});

function pintar(props) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PendientesInventario almacen="789" onUsar={() => {}} {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => { filter.mockReset().mockResolvedValue([]); });
afterEach(cleanup);

describe('PendientesInventario', () => {
  it('la pantalla de aumento pide sobrantes', async () => {
    pintar({ tipo: 'aumento' });
    await waitFor(() => expect(filter).toHaveBeenCalled());
    expect(filter.mock.calls[0][0]).toMatchObject({
      almacen_num: '789', resultado: 'sobrante', estado_tarea: 'pend_fact',
    });
  });

  it('la de disminución pide faltantes', async () => {
    pintar({ tipo: 'disminucion' });
    await waitFor(() => expect(filter).toHaveBeenCalled());
    expect(filter.mock.calls[0][0]).toMatchObject({ resultado: 'faltante' });
  });

  it('sin almacén no consulta nada', () => {
    pintar({ tipo: 'aumento', almacen: '' });
    expect(filter).not.toHaveBeenCalled();
  });

  it('dice que no hay nada en vez de quedarse en blanco', async () => {
    pintar({ tipo: 'aumento' });
    expect(await screen.findByText(/Ningún conteo/i)).toBeInTheDocument();
  });

  it('lista los conteos con su diferencia', async () => {
    filter.mockResolvedValue([
      conteo(),
      conteo({ id: 'c2', producto_nombre: 'Arroz', diferencia: -5, especialista_nombre: 'Lin' }),
    ]);
    pintar({ tipo: 'aumento' });

    expect(await screen.findByText('Aceite 1 L')).toBeInTheDocument();
    expect(screen.getByText('Arroz')).toBeInTheDocument();
    // El signo importa: un sobrante suma y un faltante resta.
    expect(screen.getByText('+3')).toBeInTheDocument();
    expect(screen.getByText('-5')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Lin')).toBeInTheDocument();
  });

  it('pasa al formulario el código y la cantidad medida, en valor absoluto', async () => {
    // Un faltante viene con diferencia negativa, pero el ajuste de
    // disminución resta: la línea lleva cuánto, no en qué sentido.
    filter.mockResolvedValue([
      conteo({ producto_codigo: '7501', diferencia: -4 }),
      conteo({ id: 'c2', producto_codigo: '7502', diferencia: -1 }),
    ]);
    const onUsar = vi.fn();
    pintar({ tipo: 'disminucion', onUsar });

    await userEvent.click(await screen.findByRole('button', { name: /Pasarlos al formulario/i }));
    expect(onUsar).toHaveBeenCalledWith('7501*4\n7502*1');
  });

  it('descarta los conteos sin código o sin diferencia', async () => {
    filter.mockResolvedValue([
      conteo({ producto_codigo: '7501', diferencia: 2 }),
      conteo({ id: 'c2', producto_codigo: '', diferencia: 9 }),
      conteo({ id: 'c3', producto_codigo: '7503', diferencia: 0 }),
    ]);
    const onUsar = vi.fn();
    pintar({ tipo: 'aumento', onUsar });

    await userEvent.click(await screen.findByRole('button', { name: /Pasarlos/i }));
    expect(onUsar).toHaveBeenCalledWith('7501*2');
  });
});
