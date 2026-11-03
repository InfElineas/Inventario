import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * El resumen de lotes del panel y del menú.
 *
 * Lo que se vigila: que los vencidos no se lleven el sitio de los demás
 * estados —eran los cincuenta primeros y no salía ni un crítico— y que la
 * consulta pesada no se repita en cada petición.
 */

const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/server/db', () => db);

const { resumenLotes, lotesDe, olvidarLotes } = await import('@/server/lotesApi');

/** Las consultas de lotes: cada llenado de la caché hace además una pequeña por la última corrida. */
const deLotes = () => db.query.mock.calls.filter(([sql]) => /ultima AS/.test(sql));

const dia = (n) => {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
let seq = 0;
const fila = (dias, extra = {}) => ({
  fila_id: `f${seq++}`, almacen_num: '789', codigo: `C${seq}`, producto: `P${seq}`,
  no_lote: 'L', fecha_venc: dias === null ? null : dia(dias), cantidad: 5,
  rev_fecha: null, ...extra,
});

beforeEach(() => {
  olvidarLotes();
  db.query.mockReset();
});

describe('resumenLotes', () => {
  it('cuenta cada estado aunque los vencidos sean muchísimos', async () => {
    db.query.mockResolvedValue({
      rows: [
        ...Array.from({ length: 80 }, (_, i) => fila(-10 - i)),
        ...Array.from({ length: 3 }, () => fila(8)),
        ...Array.from({ length: 2 }, () => fila(25)),
        ...Array.from({ length: 4 }, () => fila(null)),
        fila(200),
      ],
    });
    const { conteos, lotes } = await resumenLotes({ almacen: '789', porEstado: 6 });

    expect(conteos).toEqual({ vencido: 80, critico: 3, por_vencer: 2, vigente: 1, sin_fecha: 4 });
    // Seis vencidos como mucho, pero los críticos y los sin fecha siguen saliendo.
    expect(lotes.filter((l) => l.estado_fv === 'vencido')).toHaveLength(6);
    expect(lotes.filter((l) => l.estado_fv === 'critico')).toHaveLength(3);
    expect(lotes.filter((l) => l.estado_fv === 'por_vencer')).toHaveLength(2);
    expect(lotes.filter((l) => l.estado_fv === 'sin_fecha')).toHaveLength(4);
    expect(lotes.some((l) => l.estado_fv === 'vigente')).toBe(false);
  });

  it('una fecha corregida por inventario cambia el estado', async () => {
    db.query.mockResolvedValue({ rows: [fila(-30, { rev_fecha: dia(10) })] });
    const { conteos } = await resumenLotes({ almacen: '789' });
    expect(conteos.critico).toBe(1);
    expect(conteos.vencido).toBe(0);
  });
});

describe('caché de filas', () => {
  it('peticiones seguidas del mismo almacén hacen una sola consulta', async () => {
    db.query.mockResolvedValue({ rows: [fila(8)] });
    await Promise.all([resumenLotes({ almacen: '789' }), lotesDe({ almacen: '789' }), lotesDe({ almacen: '789' })]);
    expect(deLotes()).toHaveLength(1);
  });

  it('otro almacén es otra consulta', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await lotesDe({ almacen: '789' });
    await lotesDe({ almacen: '790' });
    expect(deLotes()).toHaveLength(2);
  });

  it('olvidarLotes fuerza a leer de nuevo: una corrección recién guardada se ve', async () => {
    db.query.mockResolvedValue({ rows: [fila(-5)] });
    await lotesDe({ almacen: '789' });
    olvidarLotes();
    db.query.mockResolvedValue({ rows: [fila(-5, { rev_fecha: dia(40) })] });
    const [l] = await lotesDe({ almacen: '789' });
    expect(l.estado_fv).toBe('vigente');
    expect(deLotes()).toHaveLength(2);
  });

  it('un fallo no se queda guardado', async () => {
    db.query.mockRejectedValueOnce(new Error('caído'));
    await expect(lotesDe({ almacen: '789' })).rejects.toThrow('caído');
    db.query.mockResolvedValue({ rows: [fila(8)] });
    await expect(lotesDe({ almacen: '789' })).resolves.toHaveLength(1);
  });
});

describe('de qué corrida sale cada almacén', () => {
  it('con un almacén, de la corrida más reciente que lo trae: no de la vista, que toma la última sin más', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await lotesDe({ almacen: '789' });

    const sql = deLotes()[0][0];
    expect(sql).toMatch(/EXISTS/);
    expect(sql).not.toMatch(/lot_rows_latest/);
    expect(deLotes()[0][1]).toEqual(['789']);
  });

  it('sin almacén, la más reciente de cada uno', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await lotesDe({});
    expect(deLotes()[0][0]).toMatch(/DISTINCT ON/);
    expect(deLotes()[0][1]).toEqual([null]);
  });

  const responder = (corridaSeq, ultima) => db.query.mockImplementation(async (sql) => (
    /MAX\(seq\)/.test(sql)
      ? { rows: [{ ultima }] }
      : { rows: [fila(8, { corrida_seq: corridaSeq, corrida_inicio: '2026-11-02T20:01:47Z' })] }
  ));

  it('un lote de una corrida anterior a la última se marca: el último informe no traía ese almacén', async () => {
    // Pasó con el 789: la corrida 96 salió con 15 000 filas y sin él, y la
    // pantalla se quedó en cero aunque la 95 estaba entera.
    responder(95, 96);
    const [l] = await lotesDe({ almacen: '789' });
    expect(l.informe_actual).toBe(false);
    expect(l.informe_fecha).toBe('2026-11-02T20:01:47Z');
  });

  it('un lote de la última corrida no se marca', async () => {
    responder(96, 96);
    const [l] = await lotesDe({ almacen: '789' });
    expect(l.informe_actual).toBe(true);
  });
});

