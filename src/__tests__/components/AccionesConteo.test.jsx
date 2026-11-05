import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Las acciones del catálogo sobre la fila de un conteo.
 *
 * Lo que se prueba es el cableado: que la existencia se busque antes de abrir
 * el diálogo, que la diferencia del conteo llegue como sugerencia y que un
 * fallo de TKC no deje abrir un diálogo con cifras inventadas.
 */

const mocks = vi.hoisted(() => ({
  producto: vi.fn(), existencia: vi.fn(), historial: vi.fn(), ventas: vi.fn(),
}));
vi.mock('@/api/base44Client', () => ({
  base44: { entities: { Producto: { filter: mocks.producto } } },
}));
vi.mock('@/services/tkcService', () => ({ fetchExistenciaTkc: mocks.existencia, fetchHistorialTkc: mocks.historial }));
vi.mock('@/services/ventasService', () => ({ fetchResumenVentas: mocks.ventas }));
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
  mocks.historial.mockReset();
  mocks.ventas.mockReset();
});

describe('DialogosConteo', () => {
  it('bajar: la reserva no cubre el faltante y el análisis propone bajar lo que falta por cubrir', async () => {
    // Contó 10 (EF 20, A 4, T 16): faltan 10, la reserva tiene 4 → bajar 6.
    mocks.existencia.mockResolvedValue({ existencia: { fisica: 20, enAlmacen: 4, enTienda: 16 } });
    montar({ tipo: 'bajar', inv: { ...INV, diferencia: -10, conteo_real: 10 } });

    expect(await screen.findByText(/Faltan 10: hay que bajar 6 de tienda/i)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /cantidad a mover/i })).toHaveValue(6);
    expect(mocks.existencia).toHaveBeenCalledWith(expect.objectContaining({ almacen: '789', idTienda: 'T1' }));
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

  it('un faltante que la reserva cubre: no propone cantidad y dice por qué', async () => {
    // EF 1575 (A 98, T 1477), contó 1500: faltan 75 y la reserva alcanza.
    mocks.existencia.mockResolvedValue({ existencia: { fisica: 1575, enAlmacen: 98, enTienda: 1477 } });
    montar({ tipo: 'bajar', inv: { ...INV, diferencia: -75, exist_fisica_tkc: 1575, conteo_real: 1500 } });

    expect(await screen.findByText(/no recomienda bajar: faltan 75: no hay que mover nada/i)).toBeInTheDocument();
    // Sin sugerencia, la cantidad de siempre: todo lo que hay en tienda.
    expect(screen.getByRole('spinbutton', { name: /cantidad a mover/i })).toHaveValue(1477);
  });

  it('un sobrante con la tienda agotada: subir propone la cantidad, como posibilidad', async () => {
    mocks.existencia.mockResolvedValue({ existencia: { fisica: 10, enAlmacen: 10, enTienda: 0 } });
    montar({ tipo: 'subir', inv: { ...INV, diferencia: 20, exist_fisica_tkc: 10, conteo_real: 30 } });

    expect(await screen.findByText(/posible: sobran 20: ajuste de aumento/i)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /cantidad a mover/i })).toHaveValue(20);
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

describe('DialogosConteo — analizar diferencia', () => {
  const MOVS = [
    { fecha: '05/10/2026', documento: 'Salida - Despacho - 541493', saldoInicial: 8, entrada: null, salida: 1, saldoFinal: 7, usuario: 'luism.pavia' },
    { fecha: '06/10/2026', documento: 'Subida a Tienda', saldoInicial: null, entrada: 1, salida: null, saldoFinal: null, usuario: 'luism.pavia' },
    { fecha: '07/10/2026', documento: 'Salida - Despacho - 543829', saldoInicial: 7, entrada: null, salida: 2, saldoFinal: 5, usuario: 'alba.rosa' },
    { fecha: '30/10/2026', documento: 'Entrada - Ajuste Aumento - TKCE202668743', saldoInicial: 5, entrada: 180, salida: null, saldoFinal: 185, usuario: 'yeraldind.perez' },
  ];
  const CONTEO = { ...INV, fecha_inv: '2026-10-06', conteo_real: 20, exist_fisica_tkc: 25, diferencia: -5 };

  beforeEach(() => {
    mocks.historial.mockResolvedValue({ titulo: 'x', desde: '', hasta: '', movimientos: MOVS });
    mocks.ventas.mockResolvedValue({ total: { cantidad: 5 }, cobertura: { diasPedidos: 30, diasConDatos: 30, ultima: '2026-11-02' } });
  });

  it('pide el historial del producto, y enseña la diferencia del conteo', async () => {
    montar({ tipo: 'analizar', inv: CONTEO });

    expect(await screen.findByText(/Analizar diferencia/i)).toBeInTheDocument();
    expect(await screen.findByText(/se contó/i)).toHaveTextContent(/TKC tenía 25.*se contó 20.*diferencia -5/);
    expect(mocks.historial).toHaveBeenCalledWith(expect.objectContaining({ almacen: '789', idTienda: 'T1' }));
    expect(mocks.ventas).toHaveBeenCalledWith(expect.objectContaining({ almacen: '789', codigo: 'SC1' }));
  });

  it('desde el conteo: solo lo posterior, y avisa de que la existencia ya cambió', async () => {
    montar({ tipo: 'analizar', inv: CONTEO });

    // 07/10 y 30/10: −2 +180 = +178. El despacho del 05/10 es anterior al conteo.
    expect(await screen.findByText(/ha cambiado en \+178/)).toBeInTheDocument();
    expect(screen.queryByText('Salida - Despacho - 541493')).not.toBeInTheDocument();
    expect(screen.getByText('Salida - Despacho - 543829')).toBeInTheDocument();
  });

  it('origen: totales por tipo, sin contar las subidas de tienda', async () => {
    montar({ tipo: 'analizar', inv: CONTEO });
    await userEvent.click(await screen.findByRole('tab', { name: /^Origen/ }));

    expect(await screen.findByText('Ajustes de aumento')).toBeInTheDocument();
    expect(screen.getByText('Ventas (despachos)')).toBeInTheDocument();
    expect(screen.getByText(/1 subida o bajada de tienda no se cuentan/)).toBeInTheDocument();
    // Por usuario, con la fecha de sus movimientos.
    expect(screen.getByText('yeraldind.perez').closest('tr')).toHaveTextContent('30/10/2026');
  });

  it('ventas directas y ajustes: solo esos documentos', async () => {
    montar({ tipo: 'analizar', inv: CONTEO });
    await userEvent.click(await screen.findByRole('tab', { name: /Ventas directas y ajustes/ }));

    expect(await screen.findByText('Entrada - Ajuste Aumento - TKCE202668743')).toBeInTheDocument();
    expect(screen.queryByText('Salida - Despacho - 543829')).not.toBeInTheDocument();
  });

  it('ventas vs despachos: la plataforma contra las salidas «Despacho»', async () => {
    montar({ tipo: 'analizar', inv: CONTEO });
    await userEvent.click(await screen.findByRole('tab', { name: /Ventas vs despachos/ }));

    // Vendió 5; despachos del período: 1 + 2 = 3.
    const caja = (await screen.findByText('Salió como despacho')).parentElement;
    expect(within(caja).getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/5 unidades más de las que salieron como despacho|2 unidades más/)).toBeInTheDocument();
  });

  it('si las ventas fallan, lo dice y el resto sigue sirviendo', async () => {
    mocks.ventas.mockRejectedValue(new Error('Tu rol no puede ver el resumen de ventas.'));
    montar({ tipo: 'analizar', inv: CONTEO });
    await userEvent.click(await screen.findByRole('tab', { name: /Ventas vs despachos/ }));
    expect(await screen.findByText(/No se pudieron leer las ventas: Tu rol/)).toBeInTheDocument();
  });

  it('una merma, sin conteo: no hay cabecera de diferencia pero sí movimientos', async () => {
    montar({ tipo: 'analizar', inv: { producto_id: 'p1', producto_nombre: 'Abrazadera', producto_codigo: 'SC1', almacen_num: '789' } });
    await userEvent.click(await screen.findByRole('tab', { name: /^Origen/ }));
    expect(await screen.findByText('Ventas (despachos)')).toBeInTheDocument();
    expect(screen.queryByText(/se contó/)).not.toBeInTheDocument();
  });
});
