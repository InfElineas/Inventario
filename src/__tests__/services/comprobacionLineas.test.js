import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({ producto: vi.fn(), existencia: vi.fn() }));
vi.mock('@/api/base44Client', () => ({ base44: { entities: { Producto: { filter: m.producto } } } }));
vi.mock('@/services/tkcService', () => ({ fetchExistenciaTkc: m.existencia }));

const { comprobarLineas } = await import('@/services/comprobacionLineas');

beforeEach(() => {
  m.producto.mockReset().mockResolvedValue([{ id: 'p', id_tienda: 'T1', nombre: 'Aceite' }]);
  m.existencia.mockReset().mockResolvedValue({ existencia: { fisica: 100, enAlmacen: 40, enTienda: 60 } });
});

describe('comprobarLineas', () => {
  it('trae la existencia de TKC de cada línea, del almacén que se pide', async () => {
    const r = await comprobarLineas({ almacen: '789', lines: [{ code: 'A', quantity: 2 }, { code: 'B', quantity: 3 }] });

    expect(r.map((x) => [x.code, x.quantity, x.existencia.enAlmacen])).toEqual([['A', 2, 40], ['B', 3, 40]]);
    expect(m.producto).toHaveBeenCalledWith({ codigo_producto: 'A', almacen_num: '789', activo: true }, '-updated_date', 5);
    expect(m.existencia).toHaveBeenCalledWith(expect.objectContaining({ almacen: '789', idTienda: 'T1' }));
  });

  it('un producto que no está en el catálogo sale sin dato y con su motivo, sin tumbar los demás', async () => {
    m.producto.mockImplementation(async ({ codigo_producto: c }) => (c === 'X' ? [] : [{ id_tienda: 'T1' }]));
    const r = await comprobarLineas({ almacen: '789', lines: [{ code: 'A', quantity: 1 }, { code: 'X', quantity: 1 }] });

    expect(r[0].existencia).not.toBeNull();
    expect(r[1]).toMatchObject({ code: 'X', existencia: null });
    expect(r[1].motivoSinDato).toMatch(/catálogo/);
  });

  it('un producto sin id de tienda (insumo) se comprueba por su código', async () => {
    m.producto.mockResolvedValue([{ id: 'p', id_tienda: null }]);
    const r = await comprobarLineas({ almacen: '789', lines: [{ code: 'A', quantity: 1 }] });
    expect(m.existencia).toHaveBeenCalledWith({ almacen: '789', idTienda: null, codigo: 'A' });
    expect(r[0].existencia).not.toBeNull();
  });

  it('un código que no está en el catálogo del almacén no se puede comprobar', async () => {
    m.producto.mockResolvedValue([]);
    const r = await comprobarLineas({ almacen: '789', lines: [{ code: 'A', quantity: 1 }] });
    expect(r[0].existencia).toBeNull();
    expect(m.existencia).not.toHaveBeenCalled();
  });

  it('si TKC falla en una línea, esa sale sin dato y dice el error', async () => {
    m.existencia.mockRejectedValueOnce(new Error('TKC caído')).mockResolvedValue({ existencia: { fisica: 1, enAlmacen: 1, enTienda: 0 } });
    const r = await comprobarLineas({ almacen: '789', lines: [{ code: 'A', quantity: 1 }, { code: 'B', quantity: 1 }] }, 1);
    expect(r[0].motivoSinDato).toMatch(/TKC caído/);
    expect(r[1].existencia).not.toBeNull();
  });

  it('el submayor sin el producto: sin dato', async () => {
    m.existencia.mockResolvedValue(null);
    const r = await comprobarLineas({ almacen: '789', lines: [{ code: 'A', quantity: 1 }] });
    expect(r[0].motivoSinDato).toMatch(/submayor/);
  });

  it('pasado el máximo, las que sobran no se consultan', async () => {
    const lines = Array.from({ length: 103 }, (_, i) => ({ code: `P${i}`, quantity: 1 }));
    const r = await comprobarLineas({ almacen: '789', lines });
    expect(r).toHaveLength(103);
    expect(m.existencia).toHaveBeenCalledTimes(100);
    expect(r[102].existencia).toBeNull();
    expect(r[102].motivoSinDato).toMatch(/demasiadas líneas/i);
  });
});
