import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>{children}</select>
  ),
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }) => <>{children}</>,
  SelectItem: ({ value, children }) => <option value={value}>{children}</option>,
}));

const alm = vi.hoisted(() => ({ almacen: '789' }));
vi.mock('@/lib/useAlmacen', async (orig) => ({
  ...(await orig()),
  useAlmacen: () => ({ almacen: alm.almacen, setAlmacen: vi.fn(), almacenesConfig: [] }),
}));

const m = vi.hoisted(() => ({ filter: vi.fn(), count: vi.fn(), buscar: vi.fn() }));
vi.mock('@/api/base44Client', () => ({ base44: { entities: { Merma: m } } }));

const { default: HistorialMermas } = await import('@/components/mermas/HistorialMermas');

const MERMA = { id: 'm1', producto_nombre: 'Aceite 1 L', producto_codigo: '7501', cantidad: 3, clasif_merma: 'Merma-FV',
  total_perdida: 4.5, estado_tarea: 'completado', fecha_inv: '2026-10-29', especialista_nombre: 'Ana' };

function pintar(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><HistorialMermas user={{ email: 'ana@x.com' }} vistaGlobal={false} {...props} /></QueryClientProvider>);
}

beforeEach(() => {
  cleanup();
  alm.almacen = '789';
  m.filter.mockReset().mockResolvedValue([MERMA]);
  m.count.mockReset().mockResolvedValue(1);
  m.buscar.mockReset().mockResolvedValue([MERMA]);
});

describe('HistorialMermas', () => {
  it('lista las mermas del almacén en cualquier estado, y dice cuántas hay', async () => {
    pintar();
    expect((await screen.findAllByText('Aceite 1 L')).length).toBeGreaterThan(0);
    expect(screen.getByText('1 merma')).toBeInTheDocument();
    const [cond, orden] = m.filter.mock.calls[0];
    expect(cond.almacen_num).toBe('789');
    expect(cond.estado_tarea).toBeUndefined();
    expect(orden).toBe('-fecha_inv');
  });

  it('quien no ve a los demás pide solo las suyas; la columna de quién registró no sale', async () => {
    pintar();
    await screen.findAllByText('Aceite 1 L');
    expect(m.filter.mock.calls[0][0].especialista_id).toBe('ana@x.com');
    expect(screen.queryByText('Registró')).toBeNull();
  });

  it('quien supervisa ve las de todos y quién las registró', async () => {
    pintar({ vistaGlobal: true });
    await screen.findAllByText('Aceite 1 L');
    expect(m.filter.mock.calls[0][0].especialista_id).toBeUndefined();
    expect(screen.getAllByText('Registró').length).toBeGreaterThan(0);
  });

  it('las fechas acotan la consulta', async () => {
    const user = userEvent.setup();
    pintar();
    await screen.findAllByText('Aceite 1 L');
    await user.type(screen.getByLabelText('Desde'), '2026-10-01');
    await waitFor(() => expect(m.filter.mock.calls.at(-1)[0].fecha_inv).toEqual({ gte: '2026-10-01' }));
  });

  it('sin almacén pide elegir uno y no consulta', async () => {
    alm.almacen = '';
    pintar();
    expect(await screen.findByText(/Elige un almacén/)).toBeInTheDocument();
    expect(m.filter).not.toHaveBeenCalled();
  });
});
