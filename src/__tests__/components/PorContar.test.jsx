import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { format } from 'date-fns';

vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>{children}</select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }) => <>{children}</>,
  SelectItem: ({ value, children }) => <option value={value}>{children}</option>,
}));

const alm = vi.hoisted(() => ({ almacen: '789' }));
vi.mock('@/lib/useAlmacen', async (orig) => ({
  ...(await orig()),
  useAlmacen: () => ({ almacen: alm.almacen, setAlmacen: vi.fn(), almacenesConfig: [] }),
}));

const cat = vi.hoisted(() => ({ fetchCatalogo: vi.fn() }));
vi.mock('@/services/catalogoService', () => cat);

const base = vi.hoisted(() => ({ distinct: vi.fn(), filterProducto: vi.fn(), filterInv: vi.fn() }));
vi.mock('@/api/base44Client', () => ({
  base44: { entities: {
    Producto: { distinct: base.distinct, filter: base.filterProducto },
    Inventario: { filter: base.filterInv },
  } },
}));

const { default: PorContar } = await import('@/components/inventario/PorContar');

const FILA = (id, nombre, prioridad, estadoTienda, extra = {}) => ({
  id, nombre, codigo: `C${id}`, suministrador: 'SEL PUCARA', prioridad, estadoTienda, ef: 5, enAlmacen: 3, enTienda: 2, ...extra,
});

function montar(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><PorContar pestanas={null} onContar={vi.fn()} {...props} /></QueryClientProvider>);
}

beforeEach(() => {
  cleanup();
  alm.almacen = '789';
  Object.values(cat).forEach((f) => f.mockReset());
  Object.values(base).forEach((f) => f.mockReset());
  cat.fetchCatalogo.mockResolvedValue({
    rows: [FILA('a', 'Anillo plata', 1, 'SIN RESERVA'), FILA('b', 'Collar oro', 7, 'DISPONIBLE')],
    pagination: { total: 2, page: 1, limit: 50, pages: 1 },
  });
  base.distinct.mockResolvedValue(['SEL PUCARA', 'SEL APOLO']);
  base.filterInv.mockResolvedValue([]);
  base.filterProducto.mockResolvedValue([{ id: 'a', nombre: 'Anillo plata', codigo_producto: 'Ca' }]);
});

describe('PorContar', () => {
  it('pide el almacén por prioridad, ascendente, y enseña el estado de cada producto', async () => {
    montar();
    expect((await screen.findAllByText('Anillo plata')).length).toBeGreaterThan(0);

    const args = cat.fetchCatalogo.mock.calls[0][0];
    expect(args).toMatchObject({ almacen: '789', sortBy: 'prioridad', sortDir: 'asc' });
    expect(screen.getAllByText(/1 · SIN RESERVA/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/7 · DISPONIBLE/).length).toBeGreaterThan(0);
  });

  it('el suministrador elegido (varios a la vez) va al filtro', async () => {
    const user = userEvent.setup();
    montar();
    await screen.findAllByText('Anillo plata');
    await user.click(screen.getByRole('button', { name: /Suministrador: todos/ }));
    await user.click(await screen.findByRole('option', { name: 'SEL PUCARA' }));
    await user.click(screen.getByRole('option', { name: 'SEL APOLO' }));

    await waitFor(() => {
      expect(cat.fetchCatalogo.mock.calls.at(-1)[0].filtros.suministrador).toEqual(['SEL PUCARA', 'SEL APOLO']);
    });
  });

  it('Contar abre el formulario con la fila entera del producto', async () => {
    const user = userEvent.setup();
    const onContar = vi.fn();
    montar({ onContar });
    await screen.findAllByText('Anillo plata');
    await user.click(screen.getAllByRole('button', { name: 'Contar' })[0]);

    await waitFor(() => expect(onContar).toHaveBeenCalledWith({ id: 'a', nombre: 'Anillo plata', codigo_producto: 'Ca' }));
    expect(base.filterProducto.mock.calls[0][0]).toEqual({ id: 'a' });
  });

  it('un producto contado hoy sale marcado y sin botón: no se cuenta dos veces', async () => {
    base.filterInv.mockResolvedValue([{ producto_id: 'a' }]);
    montar();
    await screen.findAllByText('Anillo plata');

    expect((await screen.findAllByText('Contado hoy')).length).toBeGreaterThan(0);
    // Solo queda el botón del otro producto (tabla y ficha).
    expect(screen.getAllByRole('button', { name: 'Contar' }).length).toBe(2);
    expect(base.filterInv.mock.calls[0][0]).toEqual({ almacen_num: '789', fecha_inv: format(new Date(), 'yyyy-MM-dd') });
  });

  it('quien no cuenta ve la lista sin botones', async () => {
    montar({ onContar: undefined });
    await screen.findAllByText('Anillo plata');
    expect(screen.queryByRole('button', { name: 'Contar' })).toBeNull();
  });

  it('sin almacén pide elegir uno y no consulta', async () => {
    alm.almacen = '';
    montar();
    expect(await screen.findByText(/Elige un almacén/)).toBeTruthy();
    expect(cat.fetchCatalogo).not.toHaveBeenCalled();
  });
});
