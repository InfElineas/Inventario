import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Subir y bajar de tienda desde el navegador.
 *
 * Lo que importa aquí son dos cosas que, mal hechas, mueven mercancía de más:
 * que analizar y ejecutar sean llamadas distintas, y que esperar un trabajo no
 * se dé por bueno antes de tiempo.
 */

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', fetchMock);

const { planearTienda, ejecutarTienda, esperarTrabajo } =
  await import('@/services/tiendaService');

const responde = (cuerpo, ok = true) =>
  fetchMock.mockResolvedValueOnce({ ok, json: async () => cuerpo });

const ultima = () => {
  const [url, opciones] = fetchMock.mock.calls.at(-1);
  return { url, opciones, cuerpo: opciones?.body ? JSON.parse(opciones.body) : undefined };
};

beforeEach(() => { fetchMock.mockReset(); });

describe('planear y ejecutar', () => {
  const DATOS = { almacen: '789', lineas: [{ code: '7501', quantity: 2 }] };

  it('analizar va a su ruta y manda las cookies', async () => {
    responde({ jobId: 'j1' });
    await planearTienda('subir', DATOS);

    const { url, opciones } = ultima();
    expect(url).toBe('/api/tienda/subir/plan');
    expect(opciones.method).toBe('POST');
    // Sin esto el servidor no ve la sesión y todo responde 401.
    expect(opciones.credentials).toBe('include');
  });

  it('ejecutar va a otra ruta distinta: no se encadenan solos', async () => {
    responde({ jobId: 'j2' });
    await ejecutarTienda('bajar', { ...DATOS, idempotencyKey: 'k1' });

    const { url, cuerpo } = ultima();
    expect(url).toBe('/api/tienda/bajar/ejecutar');
    expect(cuerpo.idempotencyKey).toBe('k1');
  });

  it('un error de la API llega con su mensaje, no con un código suelto', async () => {
    responde({ error: { code: 'forbidden', message: 'Tu rol no puede subir ni bajar de tienda.' } }, false);
    await expect(planearTienda('subir', DATOS)).rejects.toThrow(/no puede subir ni bajar/i);
  });
});

describe('esperarTrabajo', () => {
  it('usa la espera larga en vez de sondear', async () => {
    responde({ status: 'succeeded' });
    await esperarTrabajo('j1');
    expect(ultima().url).toContain('wait=20');
  });

  it('sigue esperando mientras el trabajo corre', async () => {
    responde({ status: 'running' });
    responde({ status: 'running' });
    responde({ status: 'succeeded', detail: '2 unidades' });

    const r = await esperarTrabajo('j1');
    expect(r.detail).toBe('2 unidades');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('un fallo del trabajo se devuelve, no se reintenta en bucle', async () => {
    responde({ status: 'failed', detail: 'TKC rechazó la línea' });
    const r = await esperarTrabajo('j1');
    expect(r.status).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('al agotarse la espera NO dice que falló: sigue corriendo en TKC', async () => {
    // Decirle a la persona que falló la empujaría a repetirlo, y repetir un
    // movimiento que sí se hizo lo duplica.
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: 'running' }) });
    await expect(esperarTrabajo('j1', { maxSegundos: 0 }))
      .rejects.toThrow(/sigue en curso/i);
  });

  it('se puede cancelar la espera', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(esperarTrabajo('j1', { señal: ac.signal })).rejects.toThrow(/cancelado/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
