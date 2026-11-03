import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Los precios de un producto, uno por fuente.
 *
 * Lo que se vigila: que una fuente que falla no esconda a las demás, que un
 * precio ausente no se confunda con un cero, y que los parámetros no lleguen
 * pegados al SQL.
 */

const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/server/db', () => db);

const { leerParametros, preciosDeProducto, ErrorParametro } = await import('@/server/preciosApi');

const q = (obj) => new URLSearchParams(obj);

describe('leerParametros', () => {
  it('acepta un almacén y un código', () => {
    expect(leerParametros(q({ almacen: '789', codigo: ' 8033576194042 ' }))).toEqual({ almacen: '789', codigo: '8033576194042' });
  });

  it('sin almacén, con uno raro o sin código, error', () => {
    expect(() => leerParametros(q({ codigo: 'A1' }))).toThrow(ErrorParametro);
    expect(() => leerParametros(q({ almacen: "789'; DROP TABLE x;--", codigo: 'A1' }))).toThrow(ErrorParametro);
    expect(() => leerParametros(q({ almacen: '789', codigo: '   ' }))).toThrow(/código/);
    expect(() => leerParametros(q({ almacen: '789', codigo: 'x'.repeat(65) }))).toThrow(/código/);
  });
});

describe('preciosDeProducto', () => {
  const params = { almacen: '789', codigo: '8033576194042' };

  const responder = ({ catalogo, vd }) => db.query.mockImplementation(async (sql) => {
    if (/FROM productos/.test(sql)) {
      if (catalogo instanceof Error) throw catalogo;
      return { rows: catalogo };
    }
    if (/vd_rows_latest/.test(sql)) {
      if (vd instanceof Error) throw vd;
      return { rows: vd };
    }
    return { rows: [] };
  });

  beforeEach(() => db.query.mockReset());

  it('junta las dos fuentes, cada una con sus precios como números', async () => {
    responder({
      catalogo: [{ nombre: 'Aceite Dante', precio_costo: '7.46', precio: '0' }],
      vd: [{ costo: '7.10', venta: '9.99', directa: '8.50', precio_tienda: '9.99' }],
    });
    const r = await preciosDeProducto(params);

    expect(r.nombre).toBe('Aceite Dante');
    expect(r.fuentes.map((f) => f.clave)).toEqual(['catalogo', 'lista_vd']);
    expect(r.fuentes[0].precios).toEqual([{ etiqueta: 'Precio costo', valor: 7.46 }]);
    expect(r.fuentes[1].precios).toEqual([
      { etiqueta: 'Costo', valor: 7.1 }, { etiqueta: 'Venta', valor: 9.99 },
      { etiqueta: 'Directa', valor: 8.5 }, { etiqueta: 'Precio tienda', valor: 9.99 },
    ]);
  });

  it('el precio propio de la aplicación solo sale si es mayor que cero', async () => {
    responder({ catalogo: [{ nombre: 'A', precio_costo: 5, precio: 12 }], vd: [] });
    const { fuentes } = await preciosDeProducto(params);
    expect(fuentes[0].precios.map((p) => p.etiqueta)).toEqual(['Precio costo', 'Precio (campo propio)']);
  });

  it('un precio ausente es null, no cero', async () => {
    responder({ catalogo: [{ nombre: 'A', precio_costo: null, precio: 0 }], vd: [{ costo: null, venta: 3, directa: null, precio_tienda: null }] });
    const { fuentes } = await preciosDeProducto(params);
    expect(fuentes[0].precios[0].valor).toBeNull();
    expect(fuentes[1].precios.find((p) => p.etiqueta === 'Costo').valor).toBeNull();
    expect(fuentes[1].precios.find((p) => p.etiqueta === 'Venta').valor).toBe(3);
  });

  it('si la lista VD falla, el catálogo se sigue viendo y la fuente dice qué le pasó', async () => {
    responder({
      catalogo: [{ nombre: 'A', precio_costo: 5, precio: 0 }],
      vd: Object.assign(new Error('permission denied'), { code: '42501' }),
    });
    const { fuentes } = await preciosDeProducto(params);

    expect(fuentes[0].precios).toHaveLength(1);
    expect(fuentes[0].error).toBeUndefined();
    expect(fuentes[1].precios).toEqual([]);
    expect(fuentes[1].error).toMatch(/permiso/i);
  });

  it('el error de una fuente no filtra el mensaje de la base', async () => {
    responder({ catalogo: new Error('relation "productos" secret detail'), vd: [] });
    const { fuentes } = await preciosDeProducto(params);
    expect(fuentes[0].error).toBe('No se pudo leer esta fuente.');
    expect(JSON.stringify(fuentes)).not.toMatch(/secret/);
  });

  it('un producto que no está en una fuente la deja vacía, sin error', async () => {
    responder({ catalogo: [], vd: [] });
    const { fuentes, nombre } = await preciosDeProducto(params);
    expect(nombre).toBe('');
    expect(fuentes.every((f) => f.precios.length === 0 && !f.error)).toBe(true);
  });

  it('pasa almacén y código como parámetros, nunca pegados al texto', async () => {
    responder({ catalogo: [], vd: [] });
    await preciosDeProducto(params);
    for (const [sql, valores] of db.query.mock.calls) {
      expect(sql).not.toContain('789');
      expect(sql).not.toContain('8033576194042');
      expect(valores).toEqual(['789', '8033576194042']);
    }
  });
});
