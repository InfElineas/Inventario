import { describe, it, expect } from 'vitest';
import {
  severidadSinId, primeraEntrada, textoDias, construirAlertas, DIAS_CRITICO,
} from '@/lib/alertasPanel';

describe('severidadSinId', () => {
  it('lleva un mes o más: crítica', () => {
    expect(severidadSinId({ dias: DIAS_CRITICO, ef: 3, valor: 5 })).toBe('critica');
    expect(severidadSinId({ dias: 50, ef: 1, valor: 1 })).toBe('critica');
  });

  it('mucha existencia o mucho valor: crítica aunque sea reciente', () => {
    expect(severidadSinId({ dias: 2, ef: 1056, valor: 10 })).toBe('critica');
    expect(severidadSinId({ dias: 2, ef: 10, valor: 800 })).toBe('critica');
  });

  it('poco y reciente, o sin saber desde cuándo: atención', () => {
    expect(severidadSinId({ dias: 5, ef: 10, valor: 20 })).toBe('atencion');
    expect(severidadSinId({ dias: null, ef: 10, valor: 20 })).toBe('atencion');
  });
});

describe('primeraEntrada: desde cuándo tiene existencia, según el submayor', () => {
  const ahora = new Date(2026, 10, 6, 12);   // 06/11/2026

  it('la primera entrada del periodo, con sus días', () => {
    const r = primeraEntrada([
      { fecha: '17/09/2026', entrada: 1056 },
      { fecha: '02/10/2026', entrada: 5 },
    ], ahora);
    expect(r.dias).toBe(50);
    expect(r.desde.getMonth()).toBe(8);
  });

  it('ignora las salidas y los movimientos sin entrada', () => {
    const r = primeraEntrada([
      { fecha: '01/09/2026', entrada: null, salida: 3 },
      { fecha: '20/10/2026', entrada: 10 },
    ], ahora);
    expect(r.dias).toBe(17);
  });

  it('sin entradas, o con fechas raras, no hay dato', () => {
    expect(primeraEntrada([], ahora)).toBeNull();
    expect(primeraEntrada(undefined, ahora)).toBeNull();
    expect(primeraEntrada([{ fecha: 'ayer', entrada: 4 }], ahora)).toBeNull();
  });
});

describe('textoDias', () => {
  it('se dice en palabras', () => {
    expect(textoDias(0)).toBe('menos de un día');
    expect(textoDias(1)).toBe('1 día');
    expect(textoDias(12)).toBe('12 días');
    expect(textoDias(61)).toBe('2 meses');
    expect(textoDias(null)).toBe('');
  });
});

describe('construirAlertas', () => {
  const sinId = (filas, total = filas.length) => ({
    total, unidades: filas.reduce((s, f) => s + (f.ef ?? 0), 0), filas,
  });

  it('sin nada que avisar, no hay alertas', () => {
    expect(construirAlertas({ sinId: sinId([], 0), casos: {} })).toEqual([]);
  });

  it('productos sin ID con existencia: la alerta toma la gravedad del peor y dice cuánto lleva', () => {
    const [a] = construirAlertas({
      sinId: sinId([
        { severidad: 'atencion', dias: 3, ef: 10 },
        { severidad: 'critica', dias: 50, ef: 1056 },
      ]),
      casos: {},
    });
    expect(a.clave).toBe('sin-id');
    expect(a.severidad).toBe('critica');
    expect(a.titulo).toBe('2 productos con existencia y sin ID de tienda');
    expect(a.detalle).toMatch(/1[.,]?066 unidades/);
    expect(a.detalle).toContain('50 días');
  });

  it('uno solo, en singular', () => {
    const [a] = construirAlertas({ sinId: sinId([{ severidad: 'atencion', dias: null, ef: 4 }]), casos: {} });
    expect(a.titulo).toBe('1 producto con existencia y sin ID de tienda');
    expect(a.severidad).toBe('atencion');
  });

  it('los casos de anuncio abiertos suman alertas de atención', () => {
    const r = construirAlertas({
      sinId: sinId([], 0),
      casos: { muertoConExistencia: 3, desactivadoConExistencia: 2, activoSinExistencia: 1 },
    });
    expect(r.map((x) => x.clave)).toEqual(['anuncio-desactivado', 'activo-sin-existencia']);
    expect(r[0].cantidad).toBe(5);
    expect(r.every((x) => x.severidad === 'atencion')).toBe(true);
  });

  it('las críticas van antes que las de atención', () => {
    const r = construirAlertas({
      sinId: sinId([{ severidad: 'critica', dias: 60, ef: 9 }]),
      casos: { activoSinExistencia: 4 },
    });
    expect(r[0].clave).toBe('sin-id');
    expect(r[0].severidad).toBe('critica');
  });
});
