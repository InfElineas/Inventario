import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * El catálogo servido desde nuestra base.
 *
 * Lo que se prueba aquí es la traducción: filtros de la pantalla → condiciones
 * para la API de datos, y fila de `productos` → la forma que espera la tabla.
 * Es donde un error no da excepción sino resultados silenciosamente mal.
 */

const filter = vi.hoisted(() => vi.fn());
const buscar = vi.hoisted(() => vi.fn());
const count = vi.hoisted(() => vi.fn());
vi.mock('@/api/base44Client', () => ({
  base44: { entities: new Proxy({}, { get: () => ({ filter, buscar, count }) }) },
}));

const { fetchCatalogo } = await import('@/services/catalogoService');

const fila = (extra = {}) => ({
  id: 'u1', id_tienda: 'T9', codigo_producto: '7501', nombre: 'Aceite',
  suministrador: 'SEL ITH', proveedor: 'ELíneas', marca: 'Bergen',
  precio_costo: '12.50', exist_fisica: '7', almacen: '2', tienda: '5',
  estado_tienda: 'DISPONIBLE', estado_anuncio_tkc: 'ACTIVADO', prioridad_tienda: 7,
  fotos: ['http://x/1.jpg'], ...extra,
});

/** Condiciones con las que se llamó a la API. */
const cond = () => filter.mock.calls.at(-1)?.[0];

beforeEach(() => {
  filter.mockReset().mockResolvedValue([]);
  buscar.mockReset().mockResolvedValue([]);
  count.mockReset().mockResolvedValue(0);
});

describe('fetchCatalogo', () => {
  it('sin almacén no consulta nada', async () => {
    const r = await fetchCatalogo({ almacen: '' });
    expect(r.rows).toEqual([]);
    expect(filter).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it('acota siempre a los activos del almacén', async () => {
    await fetchCatalogo({ almacen: '789' });
    expect(cond()).toMatchObject({ activo: true, almacen_num: '789' });
  });

  it('traduce el filtro de existencia', async () => {
    await fetchCatalogo({ almacen: '789', filtros: { existencia: 'existencia' } });
    expect(cond().exist_fisica).toEqual({ gt: 0 });

    await fetchCatalogo({ almacen: '789', filtros: { existencia: 'no-existencia' } });
    expect(cond().exist_fisica).toBe(0);

    await fetchCatalogo({ almacen: '789', filtros: { existencia: 'todos' } });
    expect(cond().exist_fisica).toBeUndefined();
  });

  it('filtra por estado de tienda y por el anuncio de TKC', async () => {
    await fetchCatalogo({
      almacen: '789',
      filtros: { estadoTienda: 'SIN RESERVA', estadoAnuncio: 'DESACTIVADO MUERTO EF>0', suministrador: 'SEL ITH' },
    });
    expect(cond()).toMatchObject({
      estado_tienda: 'SIN RESERVA',
      estado_anuncio_tkc: 'DESACTIVADO MUERTO EF>0',
      suministrador: 'SEL ITH',
    });
  });

  it('«todos» no es un valor: no debe llegar como condición', async () => {
    await fetchCatalogo({
      almacen: '789',
      filtros: { estadoTienda: 'all', estadoAnuncio: 'all', suministrador: '' },
    });
    expect(cond().estado_tienda).toBeUndefined();
    expect(cond().estado_anuncio_tkc).toBeUndefined();
    expect(cond().suministrador).toBeUndefined();
  });

  it('el orden descendente lleva guion, y una clave desconocida cae en nombre', async () => {
    await fetchCatalogo({ almacen: '789', sortBy: 'precio', sortDir: 'desc' });
    expect(filter.mock.calls.at(-1)[1]).toBe('-precio_costo');

    await fetchCatalogo({ almacen: '789', sortBy: 'inventada' });
    expect(filter.mock.calls.at(-1)[1]).toBe('nombre');
  });

  it('EF/A/T son ordenables: salen de columnas nuestras, no del submayor', async () => {
    await fetchCatalogo({ almacen: '789', sortBy: 'ef', sortDir: 'desc' });
    expect(filter.mock.calls.at(-1)[1]).toBe('-exist_fisica');
  });

  it('se puede ordenar por prioridad y por los dos estados', async () => {
    // La prioridad es el orden de trabajo de las hojas de inventario, así que
    // ordenar por ella es el caso de uso, no un extra.
    await fetchCatalogo({ almacen: '789', sortBy: 'prioridad' });
    expect(filter.mock.calls.at(-1)[1]).toBe('prioridad_tienda');

    await fetchCatalogo({ almacen: '789', sortBy: 'estadoTienda' });
    expect(filter.mock.calls.at(-1)[1]).toBe('estado_tienda');

    await fetchCatalogo({ almacen: '789', sortBy: 'estadoAnuncio', sortDir: 'desc' });
    expect(filter.mock.calls.at(-1)[1]).toBe('-estado_anuncio_tkc');
  });

  it('calcula el desplazamiento a partir de la página', async () => {
    await fetchCatalogo({ almacen: '789', page: 3, limit: 50 });
    expect(filter.mock.calls.at(-1)[3]).toBe(100);
  });

  it('con texto usa la búsqueda y cuenta lo mismo', async () => {
    count.mockResolvedValue(3);
    await fetchCatalogo({ almacen: '789', search: '  aceite ' });

    expect(buscar).toHaveBeenCalled();
    expect(filter).not.toHaveBeenCalled();
    expect(buscar.mock.calls[0][0]).toBe('aceite');
    // El total tiene que ser el de lo encontrado, o sobran páginas vacías.
    expect(count.mock.calls[0][1]).toMatchObject({ texto: 'aceite' });
  });

  it('traduce la fila a lo que la tabla espera', async () => {
    filter.mockResolvedValue([fila()]);
    const { rows } = await fetchCatalogo({ almacen: '789' });

    expect(rows[0]).toMatchObject({
      idOnline: 'T9', codigo: '7501', nombre: 'Aceite',
      proveedor: 'ELíneas', marca: 'Bergen',
      precio: 12.5, ef: 7, enAlmacen: 2, enTienda: 5,
      imagen: 'http://x/1.jpg',
      estadoTienda: 'DISPONIBLE', estadoAnuncio: 'ACTIVADO', prioridad: 7,
    });
  });

  it('los nulos del origen no se cuelan como NaN ni undefined', async () => {
    filter.mockResolvedValue([fila({
      proveedor: null, marca: null, exist_fisica: null, precio_costo: null, fotos: null,
    })]);
    const { rows } = await fetchCatalogo({ almacen: '789' });

    expect(rows[0].proveedor).toBe('');
    expect(rows[0].marca).toBe('');
    expect(rows[0].ef).toBe(0);
    expect(rows[0].precio).toBe(0);
    expect(rows[0].imagen).toBe('');
  });

  it('las páginas salen del total, no de la longitud de la página', async () => {
    count.mockResolvedValue(101);
    const { pagination } = await fetchCatalogo({ almacen: '789', limit: 50 });
    expect(pagination).toMatchObject({ total: 101, pages: 3 });
  });
});
