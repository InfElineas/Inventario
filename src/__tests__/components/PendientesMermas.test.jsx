import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const base = vi.hoisted(() => ({ filter: vi.fn(), update: vi.fn() }));
vi.mock('@/api/base44Client', () => ({
  base44: { entities: { Merma: { filter: base.filter, update: base.update }, Inventario: { update: vi.fn() } } },
}));

const { default: PendientesMermas } = await import('@/components/ajustes/PendientesMermas');

const MERMAS = [
  { id: 'm1', producto_codigo: '111', producto_nombre: 'Anillo', cantidad: 3, clasif_merma: 'Roto', estado_tarea: 'pend_fact' },
  { id: 'm2', producto_codigo: '222', producto_nombre: 'Collar', cantidad: 5, estado_tarea: 'pend_fact' },
  { id: 'm3', producto_codigo: '', producto_nombre: 'Sin código', cantidad: 1, estado_tarea: 'pend_fact' },
];

function montar(onUsar = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><PendientesMermas almacen="789" onUsar={onUsar} /></QueryClientProvider>);
  return onUsar;
}

beforeEach(() => {
  cleanup();
  base.filter.mockReset().mockResolvedValue(MERMAS);
});

describe('PendientesMermas', () => {
  it('pide solo las pend_fact del almacén y deja fuera las que no tienen código', async () => {
    montar();
    expect(await screen.findByText('Anillo')).toBeTruthy();
    expect(base.filter).toHaveBeenCalledWith({ almacen_num: '789', estado_tarea: 'pend_fact' }, '-created_date', 500);
    expect(screen.queryByText('Sin código')).toBeNull();
  });

  it('pasa al formulario las líneas CODIGO*CANTIDAD, como faltantes de tipo merma', async () => {
    const user = userEvent.setup();
    const onUsar = montar();
    await screen.findByText('Anillo');
    await user.click(screen.getByRole('button', { name: /Pasarlas al formulario \(2\)/ }));

    const [lineas, conteos] = onUsar.mock.calls[0];
    expect(lineas).toBe('111*3\n222*5');
    expect(conteos[0].conteo).toMatchObject({ id: 'm1', resultado: 'faltante', origen_registro: 'merma' });
  });

  it('las desmarcadas no van', async () => {
    const user = userEvent.setup();
    const onUsar = montar();
    await screen.findByText('Anillo');
    await user.click(screen.getByLabelText('Incluir Collar'));
    await user.click(screen.getByRole('button', { name: /Pasarlas al formulario \(1\)/ }));
    expect(onUsar.mock.calls[0][0]).toBe('111*3');
  });

  it('sin mermas esperando lo dice', async () => {
    base.filter.mockResolvedValue([]);
    montar();
    expect(await screen.findByText(/Ninguna merma de este almacén/)).toBeTruthy();
  });
});
