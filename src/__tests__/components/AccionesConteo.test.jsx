import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Las acciones del catálogo sobre la fila de un conteo.
 *
 * Lo que se prueba es el cableado: que la existencia se busque antes de abrir
 * el diálogo, que la diferencia del conteo llegue como sugerencia y que un
 * fallo de TKC no deje abrir un diálogo con cifras inventadas.
 */

const mocks = vi.hoisted(() => ({
  producto: vi.fn(), existencia: vi.fn(),
}));
vi.mock('@/api/base44Client', () => ({
  base44: { entities: { Producto: { filter: mocks.producto } } },
}));
vi.mock('@/services/tkcService', () => ({ fetchExistenciaTkc: mocks.existencia }));
vi.mock('@/services/tiendaService', () => ({
  planearTienda: vi.fn(() => new Promise(() => {})), ejecutarTienda: vi.fn(), esperarTrabajo: vi.fn(),
}));

const { default: DialogosConteo } = await import('@/components/inventario/AccionesConteo');

const INV = {
  producto_id: 'p1', producto_nombre: 'Abrazadera', producto_codigo: 'SC1',
  almacen_num: '789', diferencia: 5, exist_fisica_tkc: 20,
};

function montar(accion) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <DialogosConteo accion={accion} onHecho={() => {}} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  mocks.producto.mockReset().mockResolvedValue([{ id: 'p1', id_tienda: 'T1' }]);
  mocks.existencia.mockReset();
});

describe('DialogosConteo', () => {
  it('bajar: el análisis propone lo que hay de más en el almacén, con tope lo que hay en tienda', async () => {
    mocks.existencia.mockResolvedValue({ existencia: { fisica: 20, enAlmacen: 15, enTienda: 3 } });
    montar({ tipo: 'bajar', inv: INV });

    expect(await screen.findByText(/Bajar 3 de tienda\. Hay 25 en el almacén y TKC dice 15/i)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /cantidad a mover/i })).toHaveValue(3);
    expect(mocks.existencia).toHaveBeenCalledWith({ almacen: '789', idTienda: 'T1' });
  });

  it('avisa si la existencia cambió desde el conteo', async () => {
    mocks.existencia.mockResolvedValue({ existencia: { fisica: 18, enAlmacen: 10, enTienda: 8 } });
    montar({ tipo: 'bajar', inv: INV });

    expect(await screen.findByText(/20 → 18/)).toBeInTheDocument();
  });

  it('si TKC falla no abre el diálogo de mover', async () => {
    mocks.existencia.mockRejectedValue(new Error('TKC caído'));
    montar({ tipo: 'bajar', inv: INV });

    expect(await screen.findByText(/TKC caído/)).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('una fila sin producto ni código lo dice y no consulta nada', async () => {
    montar({ tipo: 'subir', inv: { ...INV, producto_id: null, producto_codigo: null } });

    expect(await screen.findByText(/no está ligada a un producto/i)).toBeInTheDocument();
    expect(mocks.existencia).not.toHaveBeenCalled();
  });

  it('un faltante sin nada que bajar: no propone cantidad y dice por qué', async () => {
    // Contó 21 y TKC dice que el almacén tiene 107 y la tienda 0: es un faltante real.
    mocks.existencia.mockResolvedValue({ existencia: { fisica: 107, enAlmacen: 107, enTienda: 0 } });
    montar({ tipo: 'bajar', inv: { ...INV, diferencia: -86, exist_fisica_tkc: 107, conteo_real: 21 } });

    expect(await screen.findByText(/no recomienda bajar: faltan 86 en el almacén/i)).toBeInTheDocument();
    // Sin sugerencia: la cantidad de siempre (con nada en tienda, 1).
    expect(screen.getByRole('spinbutton', { name: /cantidad a mover/i })).toHaveValue(1);
  });

  it('un faltante en el almacén: subir propone la cantidad que falta, como posibilidad', async () => {
    mocks.existencia.mockResolvedValue({ existencia: { fisica: 107, enAlmacen: 107, enTienda: 0 } });
    montar({ tipo: 'subir', inv: { ...INV, diferencia: -86, exist_fisica_tkc: 107, conteo_real: 21 } });

    expect(await screen.findByText(/posible: faltan 86 en el almacén; solo si están en el piso de la tienda/i)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /cantidad a mover/i })).toHaveValue(86);
  });

  it('el conteo coincide con el almacén: la diferencia es la tienda y no se propone bajar', async () => {
    // El caso de la captura: EF 107, contó 21. Si el almacén tiene 21 y la tienda 86, no falta nada.
    mocks.existencia.mockResolvedValue({ existencia: { fisica: 107, enAlmacen: 21, enTienda: 86 } });
    montar({ tipo: 'bajar', inv: { ...INV, diferencia: -86, exist_fisica_tkc: 107, conteo_real: 21 } });

    expect(await screen.findByText(/no recomienda bajar: no hay faltante en el almacén/i)).toBeInTheDocument();
  });

  it('un lote del informe, sin id de producto, se busca por código y usa su propia sugerencia', async () => {
    mocks.existencia.mockResolvedValue({ existencia: { fisica: 20, enAlmacen: 15, enTienda: 6 } });
    const lote = { producto_nombre: 'Mostaza', producto_codigo: 'SC1', almacen_num: '789', no_lote: 'L9', estado_fv: 'critico', cantidad: 4 };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <DialogosConteo accion={{ tipo: 'bajar', inv: lote }}
          sugerir={(t) => ({ cantidad: Math.min(lote.cantidad, t), motivo: 'Lote L9 crítico: se propone bajar 4.' })}
          onHecho={() => {}} onClose={() => {}} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/lote L9 crítico: se propone bajar 4/i)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /cantidad a mover/i })).toHaveValue(4);
    expect(mocks.producto).toHaveBeenCalledWith(
      { codigo_producto: 'SC1', almacen_num: '789', activo: true }, '-updated_date', 5);
  });
});
