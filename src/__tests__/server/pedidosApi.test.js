import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Los pedidos de compra que vienen en camino.
 *
 * Lo que importa aquí es qué cantidad se da por esperada: contra ese número
 * se mide si la mercancía llegó completa, así que una línea de más o una
 * cantidad equivocada convierten la comprobación en ruido.
 */

const pedirReab = vi.hoisted(() => vi.fn());
const pedirTodoReab = vi.hoisted(() => vi.fn());
vi.mock('@/server/reabApi', () => ({
  pedirReab, pedirTodoReab, configReab: () => ({ configurada: true }),
}));

const { pedidosEnCamino, lineasDePedido, ESTADOS_EN_CAMINO } = await import('@/server/pedidosApi');

beforeEach(() => {
  pedirReab.mockReset();
  pedirTodoReab.mockReset();
});

describe('pedidosEnCamino', () => {
  it('pide solo los que están en camino', async () => {
    pedirReab.mockResolvedValue({ datos: [] });
    await pedidosEnCamino();

    const [ruta, consulta] = pedirReab.mock.calls[0];
    expect(ruta).toBe('purchase-orders');
    // Ni los que se están negociando ni los ya recibidos: contra esos no se
    // recibe nada.
    expect(consulta.status_in).toBe('enviado,parcialmente_recibido');
    expect(ESTADOS_EN_CAMINO).toEqual(['enviado', 'parcialmente_recibido']);
  });

  it('sin número de orden usa un trozo del id, no «null»', async () => {
    pedirReab.mockResolvedValue({ datos: [{
      id: 'f7ee879c-8396-428c-95ec-b97651304def', order_number: null,
      supplier_name: 'Quanzhou Jianda', total_items: 4, status: 'enviado',
    }] });

    const [p] = await pedidosEnCamino();
    expect(p.numero).toBe('f7ee879c');
    expect(p.proveedor).toBe('Quanzhou Jianda');
  });
});

describe('lineasDePedido', () => {
  const LINEA = (extra = {}) => ({
    internal_product_code: '7501082780215',
    product_name: 'Champú colágeno Dove 370ml',
    final_qty: 135, suggested_qty: 125, unit_cost: 2.5,
    status: 'included', internal_offer_id: '256954', ...extra,
  });

  it('la cantidad esperada es la final, no la sugerida', async () => {
    // `suggested_qty` es lo que propuso el sistema; `final_qty`, lo que
    // comercial dejó en el pedido. Esperar la sugerida daría una diferencia
    // falsa en cada línea que alguien ajustó a mano.
    pedirTodoReab.mockResolvedValue([LINEA()]);
    const [l] = await lineasDePedido('p1');
    expect(l.cantidad).toBe(135);
    expect(l.codigo).toBe('7501082780215');
  });

  it('las líneas excluidas no se esperan', async () => {
    // Se quitaron del pedido a propósito: contarlas sería esperar algo que
    // nadie compró.
    pedirTodoReab.mockResolvedValue([LINEA(), LINEA({ status: 'excluded', internal_product_code: '999' })]);
    const lineas = await lineasDePedido('p1');
    expect(lineas).toHaveLength(1);
  });

  it('una línea sin código no entra: no hay con qué cruzarla', async () => {
    pedirTodoReab.mockResolvedValue([LINEA({ internal_product_code: null })]);
    expect(await lineasDePedido('p1')).toEqual([]);
  });

  it('una línea con cantidad cero tampoco', async () => {
    pedirTodoReab.mockResolvedValue([LINEA({ final_qty: 0, suggested_qty: 0 })]);
    expect(await lineasDePedido('p1')).toEqual([]);
  });

  it('sin id no se pregunta nada', async () => {
    pedirTodoReab.mockResolvedValue([]);
    expect(await lineasDePedido('x')).toEqual([]);
  });
});
