import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const invalidar = vi.hoisted(() => vi.fn());
vi.mock('@/lib/query-client', () => ({ queryClientInstance: { invalidateQueries: invalidar }, SIN_SONDEO: {} }));
vi.mock('@/lib/tkcCredenciales', () => ({
  conCredencialesTkc: async (llamar) => ({ body: null, ...(await llamar()) }),
}));

const { fetchExistenciaTkc } = await import('@/services/tkcService');

function responde(status, datos) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => datos }));
}

beforeEach(() => invalidar.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe('fetchExistenciaTkc: si el servidor corrigió la copia, las listas se releen', () => {
  it('con actualizado: true invalida el catálogo y «por contar»', async () => {
    responde(200, { existencia: { fisica: 8 }, actualizado: true });
    await fetchExistenciaTkc({ almacen: '789', idTienda: '1' });

    expect(invalidar).toHaveBeenCalledTimes(1);
    const { predicate } = invalidar.mock.calls[0][0];
    expect(predicate({ queryKey: ['catalogo', '789'] })).toBe(true);
    expect(predicate({ queryKey: ['por-contar', '789'] })).toBe(true);
    expect(predicate({ queryKey: ['mermas'] })).toBe(false);
  });

  it('si la copia ya coincidía, no se relee nada', async () => {
    responde(200, { existencia: { fisica: 8 }, actualizado: false });
    await fetchExistenciaTkc({ almacen: '789', idTienda: '1' });
    expect(invalidar).not.toHaveBeenCalled();
  });
});
