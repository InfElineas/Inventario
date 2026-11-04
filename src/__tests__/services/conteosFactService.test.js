import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({ update: vi.fn() }));
const merma = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('@/api/base44Client', () => ({
  base44: { entities: { Inventario: { update: m.update }, Merma: { update: merma.update } } },
}));
vi.mock('@/lib/workflowService', () => ({
  logTransicion: vi.fn().mockResolvedValue(undefined),
  notificarTransicion: vi.fn().mockResolvedValue(undefined),
  avisarConteoReemplazado: vi.fn().mockResolvedValue(undefined),
}));

const { procesarConteos } = await import('@/services/conteosFactService');

const USER = { email: 'fact@x.com', full_name: 'Fran' };
const conteo = (id, resultado) => ({ id, producto_codigo: id, resultado, diferencia: resultado === 'faltante' ? -2 : 2, clasif_ajuste: 'Robo' });

beforeEach(() => m.update.mockReset().mockResolvedValue({}));

describe('procesarConteos — mermas', () => {
  it('una merma se escribe en su entidad, con su clasificación, y pasa a auditoría', async () => {
    merma.update.mockReset().mockResolvedValue({});
    const m1 = { id: 'm1', producto_codigo: '111', resultado: 'faltante', origen_registro: 'merma', clasif_merma: 'Roto' };
    const r = await procesarConteos({ conteos: [{ conteo: m1 }], documento: 'TKCS9', sentido: 'disminucion', user: USER });

    expect(r.hechos).toHaveLength(1);
    expect(m.update).not.toHaveBeenCalled();
    expect(merma.update).toHaveBeenCalledWith('m1', expect.objectContaining({
      fact_no_factura: 'TKCS9', fact_clasif: 'Roto', estado_tarea: 'en_auditoria',
    }));
  });
});

describe('procesarConteos — poka-yoke del sentido', () => {
  it('un faltante no se da por resuelto con un ajuste de aumento: no se escribe y se dice por qué', async () => {
    const r = await procesarConteos({
      conteos: [{ conteo: conteo('a', 'sobrante') }, { conteo: conteo('b', 'faltante') }],
      documento: 'TKCE1', sentido: 'aumento', user: USER,
    });

    expect(r.hechos.map((c) => c.id)).toEqual(['a']);
    expect(r.fallos).toHaveLength(1);
    expect(r.fallos[0].conteo.id).toBe('b');
    expect(r.fallos[0].motivo).toMatch(/es un faltante y este documento va en sentido contrario/);
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.update.mock.calls[0][0]).toBe('a');
  });

  it('la disminución y la transferencia solo resuelven faltantes', async () => {
    for (const sentido of ['disminucion', 'transferencia']) {
      m.update.mockClear();
      const r = await procesarConteos({ conteos: [{ conteo: conteo('s', 'sobrante') }], documento: 'D', sentido, user: USER });
      expect(r.hechos).toEqual([]);
      expect(r.fallos).toHaveLength(1);
      expect(m.update).not.toHaveBeenCalled();
    }
  });

  it('sin sentido, como antes: todo se procesa (un procesamiento de intercambio lleva sobrantes y faltantes)', async () => {
    const r = await procesarConteos({
      conteos: [{ conteo: conteo('s', 'sobrante') }, { conteo: conteo('f', 'faltante') }], documento: 'TKCP1', user: USER,
    });
    expect(r.hechos).toHaveLength(2);
    expect(r.fallos).toEqual([]);
  });
});
