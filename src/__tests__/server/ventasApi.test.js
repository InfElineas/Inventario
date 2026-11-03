import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * El resumen de ventas por período.
 *
 * Lo que se vigila: que un parámetro malo sea un 400 y no un error de SQL, que
 * se lea de la vista con la última corrida de cada día y no de la tabla con
 * todas, y que lo que no son números no llegue como texto.
 */

const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/server/db', () => db);

const { leerParametros, resumenVentas, ErrorParametro, MAX_DIAS } = await import('@/server/ventasApi');

const q = (obj) => new URLSearchParams(obj);

describe('leerParametros', () => {
  const ok = { almacen: '789', desde: '2026-10-01', hasta: '2026-10-31' };

  it('acepta un período normal y cuenta los días con los dos extremos', () => {
    expect(leerParametros(q(ok))).toEqual({ ...ok, dias: 31 });
  });

  it('un solo día es un día', () => {
    expect(leerParametros(q({ ...ok, hasta: '2026-10-01' })).dias).toBe(1);
  });

  it('sin almacén o con uno raro, error', () => {
    expect(() => leerParametros(q({ ...ok, almacen: '' }))).toThrow(ErrorParametro);
    expect(() => leerParametros(q({ ...ok, almacen: '789; DROP TABLE x;--' }))).toThrow(ErrorParametro);
  });

  it('fechas que no existen o mal escritas, error', () => {
    expect(() => leerParametros(q({ ...ok, desde: '2026-02-31' }))).toThrow(/AAAA-MM-DD/);
    expect(() => leerParametros(q({ ...ok, hasta: '31/10/2026' }))).toThrow(/AAAA-MM-DD/);
    expect(() => leerParametros(q({ almacen: '789' }))).toThrow(/AAAA-MM-DD/);
  });

  it('el inicio posterior al final, error', () => {
    expect(() => leerParametros(q({ ...ok, desde: '2026-11-01' }))).toThrow(/posterior/);
  });

  it('más de un año, error', () => {
    expect(() => leerParametros(q({ ...ok, desde: '2025-01-01' }))).toThrow(new RegExp(String(MAX_DIAS)));
    expect(leerParametros(q({ ...ok, desde: '2025-11-01', hasta: '2026-10-31' })).dias).toBe(365);
  });
});

describe('resumenVentas', () => {
  const params = { almacen: '789', desde: '2026-10-01', hasta: '2026-10-03', dias: 3 };

  beforeEach(() => {
    db.query.mockReset();
    db.query.mockImplementation(async (sql) => {
      if (/GROUP BY r\.codigo/.test(sql)) {
        return { rows: [
          { codigo: 'A1', nombre: 'Arroz', cantidad: '10.0000', ordenes: '4', importe: '30.50', costo: '20.25' },
          { codigo: 'B2', nombre: null, cantidad: '5', ordenes: '2', importe: null, costo: null },
        ] };
      }
      if (/GROUP BY r\.report_date/.test(sql)) {
        return { rows: [
          { fecha: '2026-10-01', cantidad: '9', ordenes: '3', importe: '20', costo: '15' },
          { fecha: '2026-10-02', cantidad: '6', ordenes: '3', importe: '10.5', costo: '5.25' },
        ] };
      }
      return { rows: [{ primera: '2025-01-02', ultima: '2026-10-02' }] };
    });
  });

  it('lee de la vista de la última corrida, no de la tabla con todas', async () => {
    await resumenVentas(params);
    for (const [sql] of db.query.mock.calls) {
      expect(sql).toMatch(/rdp_rows_latest/);
      expect(sql).not.toMatch(/public\.rdp_rows\s/);
    }
  });

  it('los números llegan como números, también los vacíos', async () => {
    const r = await resumenVentas(params);
    expect(r.productos[0]).toEqual({ codigo: 'A1', nombre: 'Arroz', cantidad: 10, ordenes: 4, importe: 30.5, costo: 20.25 });
    expect(r.productos[1]).toMatchObject({ nombre: '', importe: 0, costo: 0 });
  });

  it('el total sale de los días', async () => {
    const r = await resumenVentas(params);
    expect(r.total).toEqual({ cantidad: 15, ordenes: 6, importe: 30.5, costo: 20.25 });
  });

  it('dice cuántos días de los pedidos tienen datos y hasta cuándo llega el informe', async () => {
    const { cobertura } = await resumenVentas(params);
    expect(cobertura).toEqual({ diasPedidos: 3, diasConDatos: 2, primera: '2025-01-02', ultima: '2026-10-02' });
  });

  it('pasa los parámetros por separado, nunca pegados al texto', async () => {
    await resumenVentas(params);
    for (const [sql, valores] of db.query.mock.calls) {
      expect(sql).not.toContain('789');
      expect(valores[0]).toBe('789');
    }
  });
});
