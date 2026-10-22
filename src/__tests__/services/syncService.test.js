import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * El sync dejó de hacerse en el navegador.
 *
 * Antes este módulo leía `invGlobal` del segundo proyecto de Supabase por
 * REST, paginaba 55.000 productos, los deduplicaba por código y los mandaba en
 * lotes a un RPC. Ahora `invGlobal` vive en la misma base que `productos` y
 * todo eso es una sentencia SQL en el servidor, así que aquí solo queda
 * disparar la llamada y traducir sus errores.
 *
 * Con ello desaparecen las pruebas de `deduplicateByCodigo`: esa función
 * colapsaba por código de barras, que resultó no ser la identidad del producto
 * (ver fix_clave_producto.sql). Reproducir su comportamiento habría seguido
 * perdiendo anuncios distintos que comparten código.
 */

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', fetchMock);

const { humanizeSyncError, syncFromExternal, fetchAlmacenes } =
  await import('@/services/syncService');

beforeEach(() => { fetchMock.mockReset(); });

describe('humanizeSyncError', () => {
  it('devuelve mensaje genérico si no hay mensaje', () => {
    expect(humanizeSyncError(null)).toMatch(/error desconocido/i);
  });

  it('traduce la sesión caducada', () => {
    expect(humanizeSyncError('Sin sesión')).toMatch(/sesión/i);
    expect(humanizeSyncError('Error 401')).toMatch(/sesión/i);
  });

  it('traduce la falta de permiso', () => {
    expect(humanizeSyncError('Sin permiso para sincronizar')).toMatch(/rol/i);
    expect(humanizeSyncError('Error 403')).toMatch(/rol/i);
  });

  it('traduce los fallos de red', () => {
    expect(humanizeSyncError('fetch failed')).toMatch(/conexión/i);
  });

  it('deja pasar un mensaje que no reconoce, en vez de ocultarlo', () => {
    expect(humanizeSyncError('algo raro del servidor')).toBe('algo raro del servidor');
  });
});

describe('syncFromExternal', () => {
  it('llama al endpoint del servidor con el almacén', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ sincronizados: 100 }) });
    const r = await syncFromExternal('480');

    const [url, opciones] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/sync/productos');
    expect(opciones.credentials).toBe('include');
    expect(JSON.parse(opciones.body)).toEqual({ almacen: '480' });
    expect(r.sincronizados).toBe(100);
  });

  it('traduce la respuesta a los nombres que leen las pantallas', async () => {
    // El servidor dice `sincronizados`; las pantallas leen `synced`. Sin esta
    // traducción el aviso decía «0 productos» y la etiqueta «undefined sync»
    // aunque el sync hubiera funcionado.
    fetchMock.mockResolvedValue({
      ok: true, json: async () => ({ sincronizados: 1076, desactivados: 12, almacen: '789' }),
    });

    const r = await syncFromExternal('789');

    expect(r.synced).toBe(1076);
    expect(r.desactivados).toBe(12);
    // Una sola sentencia SQL: o va entera o lanza. No hay fallos por fila.
    expect(r.errors).toBe(0);
    expect(r.failures).toEqual([]);
  });

  it('una respuesta sin cifras no deja `undefined` suelto', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    const r = await syncFromExternal('789');
    expect(r.synced).toBe(0);
    expect(r.desactivados).toBe(0);
  });

  it('sin almacén sincroniza todos', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await syncFromExternal('');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ almacen: null });
  });

  it('lanza con el mensaje traducido si el servidor rechaza', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'Sin permiso para sincronizar' }) });
    await expect(syncFromExternal('480')).rejects.toThrow(/rol/i);
  });
});

describe('fetchAlmacenes', () => {
  it('pide los valores distintos a la base, no una página de productos', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    await fetchAlmacenes();

    const [url, opciones] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/datos/Producto/distinct');
    expect(JSON.parse(opciones.body)).toEqual({
      campo: 'almacen_num', conditions: { activo: true },
    });
  });

  it('ordena numéricamente', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: ['1000', '480', '593'] }),
    });
    // 1000 después de 593: el orden es numérico, no alfabético.
    expect(await fetchAlmacenes()).toEqual(['480', '593', '1000']);
  });
});
