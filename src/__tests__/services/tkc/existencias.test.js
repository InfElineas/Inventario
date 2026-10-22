import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * El mapa de existencias de un almacén.
 *
 * Lo que se prueba aquí es el contrato que ve el servidor: qué devuelve según
 * los `ids` que se pidan y cómo progresa mientras se construye. El submayor de
 * TKC va mockeado: no es su comportamiento lo que se está comprobando.
 */

const fetchSubmayorPage = vi.hoisted(() => vi.fn());
vi.mock('@/services/tkc/submayor', () => ({ fetchSubmayorPage }));

const { getExistencias, resetExistenciasCache } =
  await import('@/services/tkc/existencias');

const CONFIG = { tkcBase: 'https://tkc.test', tkcUser: 'u', tkcPass: 'p' };

/** Una fila del submayor tal y como la publica TKC. */
const fila = (id, fisica, almacen, tienda) => ({
  idTienda: id, existencia_fisica: fisica, almacen, tienda,
});

beforeEach(() => {
  fetchSubmayorPage.mockReset();
  resetExistenciasCache();
});

describe('getExistencias', () => {
  it('con ids devuelve solo esos', async () => {
    fetchSubmayorPage.mockResolvedValue({
      data: [fila('A', 5, 2, 3), fila('B', 0, 0, 0)], recordsTotal: 2,
    });

    const r = await getExistencias(CONFIG, { almacen: '789', ids: ['A'] });

    expect(r.existencias).toEqual({ A: { fisica: 5, enAlmacen: 2, enTienda: 3 } });
    expect(r.progreso.listo).toBe(true);
  });

  it('un array vacío no transfiere el mapa, solo construye y reporta', async () => {
    // Es la llamada con la que el navegador calienta el caché al elegir
    // almacén: sin esto devolvía las ~9.000 entradas enteras (~175 KB).
    fetchSubmayorPage.mockResolvedValue({
      data: [fila('A', 5, 2, 3), fila('B', 1, 1, 0)], recordsTotal: 2,
    });

    const r = await getExistencias(CONFIG, { almacen: '789', ids: [] });

    expect(r.existencias).toEqual({});
    expect(r.progreso).toMatchObject({ cargadas: 2, total: 2, listo: true });
  });

  it('sin ids sigue devolviendo el mapa entero', async () => {
    fetchSubmayorPage.mockResolvedValue({
      data: [fila('A', 5, 2, 3), fila('B', 1, 1, 0)], recordsTotal: 2,
    });

    const r = await getExistencias(CONFIG, { almacen: '789' });

    expect(Object.keys(r.existencias).sort()).toEqual(['A', 'B']);
  });

  it('un id que el submayor no tiene se omite, no se inventa un cero', async () => {
    fetchSubmayorPage.mockResolvedValue({ data: [fila('A', 5, 2, 3)], recordsTotal: 1 });

    const r = await getExistencias(CONFIG, { almacen: '789', ids: ['A', 'FANTASMA'] });

    expect(r.existencias).toEqual({ A: { fisica: 5, enAlmacen: 2, enTienda: 3 } });
  });

  it('reutiliza el mapa en la segunda llamada', async () => {
    fetchSubmayorPage.mockResolvedValue({ data: [fila('A', 5, 2, 3)], recordsTotal: 1 });

    await getExistencias(CONFIG, { almacen: '789', ids: [] });
    await getExistencias(CONFIG, { almacen: '789', ids: ['A'] });

    expect(fetchSubmayorPage).toHaveBeenCalledTimes(1);
  });

  it('responde con la primera página aunque falten las demás', async () => {
    // El recorrido no bloquea: el cliente pinta lo que haya y sigue sondeando.
    let soltarSegundaPagina;
    // Ojo con la firma: fetchSubmayorPage(config, { start, length, almacen }).
    fetchSubmayorPage.mockImplementation(async (_config, { start }) =>
      start === 0
        ? { data: [fila('A', 5, 2, 3)], recordsTotal: 900 }
        : new Promise((resolve) => { soltarSegundaPagina = resolve; })
    );

    const r = await getExistencias(CONFIG, { almacen: '789', ids: ['A'] });

    // Ya hay respuesta con la primera página, mientras la segunda sigue en el aire.
    expect(r.existencias.A).toEqual({ fisica: 5, enAlmacen: 2, enTienda: 3 });
    expect(r.progreso.listo).toBe(false);
    expect(r.progreso.total).toBe(900);

    soltarSegundaPagina({ data: [fila('B', 1, 1, 0)], recordsTotal: 900 });
  });
});
