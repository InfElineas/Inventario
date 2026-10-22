import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Un código de barras no identifica un producto.
 *
 * Varios anuncios de TKC comparten `Cód. Prod.` con distinto nombre,
 * suministrador y existencia. Dar eso por bueno es lo que destruía 456
 * anuncios en el sync (supabase/fix_clave_producto.sql), y los tres escáneres
 * del sistema repetían el mismo error: pedían una fila y se quedaban con ella.
 */

const filter = vi.hoisted(() => vi.fn());
vi.mock('@/api/base44Client', () => ({
  base44: { entities: new Proxy({}, { get: () => ({ filter }) }) },
}));

const { buscarPorCodigo, avisoSinCoincidencia } = await import('@/lib/buscarPorCodigo');

const producto = (id, nombre, almacen_num = '480') =>
  ({ id, nombre, almacen_num, codigo_producto: '7501', id_tienda: `T${id}` });

beforeEach(() => { filter.mockReset(); });

describe('buscarPorCodigo', () => {
  it('devuelve TODAS las coincidencias del almacén, no la primera', async () => {
    filter.mockResolvedValueOnce([producto(1, 'Aceite 1 L'), producto(2, 'Aceite 500 ml')]);

    const r = await buscarPorCodigo('7501', '480');

    expect(r.enAlmacen).toHaveLength(2);
    expect(r.codigo).toBe('7501');
    // Sin límite: un límite de 1 es justo el fallo que esto corrige.
    expect(filter).toHaveBeenCalledWith(
      { codigo_producto: '7501', activo: true, almacen_num: '480' }, 'nombre',
    );
  });

  it('recorta el código antes de buscar', async () => {
    filter.mockResolvedValueOnce([producto(1, 'Aceite')]);
    const r = await buscarPorCodigo('  7501\n', '480');
    expect(r.codigo).toBe('7501');
  });

  it('un código vacío no consulta nada', async () => {
    const r = await buscarPorCodigo('   ', '480');
    expect(r).toEqual({ codigo: '', enAlmacen: [], enOtros: [] });
    expect(filter).not.toHaveBeenCalled();
  });

  it('solo mira otros almacenes si en el activo no hay nada', async () => {
    filter.mockResolvedValueOnce([producto(1, 'Aceite')]);
    await buscarPorCodigo('7501', '480');
    expect(filter).toHaveBeenCalledTimes(1);
  });

  it('si no hay nada aquí, busca en el resto para poder explicarlo', async () => {
    filter
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([producto(9, 'Aceite', '593')]);

    const r = await buscarPorCodigo('7501', '480');

    expect(r.enAlmacen).toEqual([]);
    expect(r.enOtros).toHaveLength(1);
  });

  it('sin almacén activo no hay "otros almacenes" que mirar', async () => {
    filter.mockResolvedValueOnce([]);
    const r = await buscarPorCodigo('7501', '');
    expect(r.enOtros).toEqual([]);
    expect(filter).toHaveBeenCalledTimes(1);
  });
});

describe('avisoSinCoincidencia', () => {
  it('no avisa si hay algo que elegir', () => {
    expect(avisoSinCoincidencia(
      { codigo: '7501', enAlmacen: [producto(1, 'Aceite')], enOtros: [] }, '480',
    )).toBeNull();
  });

  it('distingue "no existe" de "existe pero no aquí"', () => {
    const otroAlmacen = avisoSinCoincidencia(
      { codigo: '7501', enAlmacen: [], enOtros: [producto(9, 'Aceite', '593')] }, '480',
    );
    expect(otroAlmacen).toMatch(/593/);
    expect(otroAlmacen).toMatch(/no en el almacén 480/);

    expect(avisoSinCoincidencia({ codigo: '7501', enAlmacen: [], enOtros: [] }, '480'))
      .toMatch(/No se encontró/);
  });

  it('cuenta los productos cuando hay varios en otros almacenes', () => {
    const aviso = avisoSinCoincidencia({
      codigo: '7501', enAlmacen: [],
      enOtros: [producto(9, 'A', '593'), producto(10, 'B', '615')],
    }, '480');
    expect(aviso).toMatch(/2 productos/);
    expect(aviso).toMatch(/593, 615/);
  });
});
