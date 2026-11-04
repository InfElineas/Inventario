import { describe, it, expect } from 'vitest';
import { cifraSospechosa, faltaRepetir } from '@/lib/barrerasConteo';

describe('cifraSospechosa — el cero de más', () => {
  it('1500 contra 107 es un dedazo', () => {
    const s = cifraSospechosa({ conteo: 1500, existencia: 107 });
    expect(s.motivo).toMatch(/Has contado 1500 y TKC tiene 107: 14\.0?\d? veces más|14 veces más/);
  });

  it('también el cero de menos: contar 12 cuando hay 150', () => {
    expect(cifraSospechosa({ conteo: 12, existencia: 150 }).motivo).toMatch(/la quinta parte o menos/);
  });

  it('una diferencia pequeña no se frena, aunque sea proporcionalmente grande', () => {
    expect(cifraSospechosa({ conteo: 12, existencia: 2 })).toBeNull();     // ×6, pero son 10 unidades
    expect(cifraSospechosa({ conteo: 25, existencia: 6 })).toBeNull();     // ×4,2 y 19 unidades
  });

  it('lo razonable pasa: un faltante o un sobrante normales', () => {
    expect(cifraSospechosa({ conteo: 80, existencia: 107 })).toBeNull();
    expect(cifraSospechosa({ conteo: 130, existencia: 107 })).toBeNull();
    expect(cifraSospechosa({ conteo: 107, existencia: 107 })).toBeNull();
  });

  it('no encontrar nada (contar cero) es un faltante legítimo, no un dedazo', () => {
    expect(cifraSospechosa({ conteo: 0, existencia: 300 })).toBeNull();
  });

  it('sin existencia en TKC, una cifra grande sí se frena y una pequeña no', () => {
    expect(cifraSospechosa({ conteo: 60, existencia: 0 }).motivo).toMatch(/no hay nada y has contado 60/);
    expect(cifraSospechosa({ conteo: 30, existencia: 0 })).toBeNull();
  });

  it('lo que no son números no se juzga', () => {
    expect(cifraSospechosa({ conteo: NaN, existencia: 10 })).toBeNull();
    expect(cifraSospechosa({ conteo: 10, existencia: undefined })).toBeNull();
    expect(cifraSospechosa({ conteo: -5, existencia: 10 })).toBeNull();
  });
});

describe('faltaRepetir', () => {
  const sospecha = { motivo: 'x' };

  it('sin sospecha no falta nada', () => {
    expect(faltaRepetir({ sospecha: null, repetida: '', conteo: 10 })).toBe(false);
  });

  it('con sospecha, hasta repetirla igual', () => {
    expect(faltaRepetir({ sospecha, repetida: '', conteo: 1500 })).toBe(true);
    expect(faltaRepetir({ sospecha, repetida: '150', conteo: 1500 })).toBe(true);
    expect(faltaRepetir({ sospecha, repetida: '1500', conteo: 1500 })).toBe(false);
    expect(faltaRepetir({ sospecha, repetida: ' 1500 ', conteo: 1500 })).toBe(false);
  });

  it('si el conteo cambia, lo repetido antes ya no vale', () => {
    expect(faltaRepetir({ sospecha, repetida: '1500', conteo: 1600 })).toBe(true);
  });
});
