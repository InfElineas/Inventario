import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const auth = vi.hoisted(() => ({ user: { email: 'a@x.com', tiene_tkc: true } }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));

const base = vi.hoisted(() => ({ filter: vi.fn(), count: vi.fn(), casos: vi.fn() }));
vi.mock('@/api/base44Client', () => ({
  base44: { entities: { Producto: { filter: base.filter, count: base.count }, AnuncioDesact: { count: base.casos } } },
}));

const tkc = vi.hoisted(() => ({ fetchHistorialTkc: vi.fn() }));
vi.mock('@/services/tkcService', () => tkc);
vi.mock('@/components/productos/HistorialSubmayorDialog', () => ({
  default: ({ producto }) => <div>historial de {producto.nombre}</div>,
}));

const { default: AlertasCriticas } = await import('@/components/dashboard/AlertasCriticas');

const ABRAZADERA = { id: 'p1', nombre: 'Abrazadera intermedia', codigo_producto: 'SC789', exist_fisica: 1056, precio_costo: 0.5 };

function pintar(almacen = '789') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AlertasCriticas almacen={almacen} />} />
          <Route path="/anuncios" element={<p>pantalla de anuncios</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  auth.user = { email: 'a@x.com', tiene_tkc: true };
  base.filter.mockReset().mockResolvedValue([ABRAZADERA]);
  base.count.mockReset().mockResolvedValue(1);
  base.casos.mockReset().mockResolvedValue(0);
  tkc.fetchHistorialTkc.mockReset().mockResolvedValue({ movimientos: [{ fecha: '01/09/2026', entrada: 1056 }] });
});

describe('AlertasCriticas', () => {
  it('un producto con mucha existencia, sin ID y de hace meses, sale como alerta crítica', async () => {
    pintar();
    expect(await screen.findByText('1 producto con existencia y sin ID de tienda')).toBeInTheDocument();
    expect(screen.getByText('Crítica')).toBeInTheDocument();
    const [cond] = base.filter.mock.calls[0];
    expect(cond).toMatchObject({ almacen_num: '789', estado_tienda: 'SIN ID', activo: true, exist_fisica: { gt: 0 } });
  });

  it('pregunta la edad al submayor por código (no tiene ID) y la enseña en el detalle', async () => {
    const user = userEvent.setup();
    pintar();
    await user.click(await screen.findByText('1 producto con existencia y sin ID de tienda'));

    expect(await screen.findByText('Con existencia y sin ID de tienda')).toBeInTheDocument();
    await waitFor(() => expect(tkc.fetchHistorialTkc).toHaveBeenCalledWith(expect.objectContaining({ almacen: '789', codigo: 'SC789' })));
    expect((await screen.findAllByText(/\d+ (días|meses)/)).length).toBeGreaterThan(0);
  });

  it('desde el detalle se abre el historial del submayor del producto', async () => {
    const user = userEvent.setup();
    pintar();
    await user.click(await screen.findByText('1 producto con existencia y sin ID de tienda'));
    await user.click(await screen.findByRole('button', { name: /Historial de Abrazadera/ }));
    expect(screen.getByText('historial de Abrazadera intermedia')).toBeInTheDocument();
  });

  it('sin cuenta de TKC no se puede saber cuánto llevan, pero la alerta sale por la existencia', async () => {
    auth.user = { email: 'a@x.com', tiene_tkc: false };
    pintar();
    expect(await screen.findByText('Crítica')).toBeInTheDocument();   // 1056 unidades
    expect(tkc.fetchHistorialTkc).not.toHaveBeenCalled();
  });

  it('los casos de anuncio abiertos suman alertas que llevan a Anuncios', async () => {
    base.filter.mockResolvedValue([]);
    base.count.mockResolvedValue(0);
    base.casos.mockImplementation(async (c) => (c.tipo_caso === 'activo_ef_cero' ? 4 : 0));
    const user = userEvent.setup();
    pintar();
    await user.click(await screen.findByText('4 anuncios activos sin existencia'));
    expect(await screen.findByText('pantalla de anuncios')).toBeInTheDocument();
  });

  it('sin nada que avisar no pinta el bloque', async () => {
    base.filter.mockResolvedValue([]);
    base.count.mockResolvedValue(0);
    pintar();
    await waitFor(() => expect(base.count).toHaveBeenCalled());
    expect(screen.queryByText('Alertas')).toBeNull();
  });
});
