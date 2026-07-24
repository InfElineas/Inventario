import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { calcDias } from '@/components/reportes/ReporteVencimientos';

// Regresión del bug de UTC/local: new Date('YYYY-MM-DD') se interpreta como
// medianoche UTC, mientras que "hoy" se calculaba en hora local — en zonas
// horarias distintas de UTC esto desplazaba el conteo de días ±1.
describe('calcDias', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Fijamos "hoy" a mediodía local (no medianoche) para verificar que el
    // cálculo ignora la hora del día, solo compara fechas de calendario.
    vi.setSystemTime(new Date(2026, 6, 17, 12, 0, 0)); // 17 jul 2026, 12:00 hora local
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('devuelve null si no hay fecha', () => {
    expect(calcDias(null)).toBeNull();
    expect(calcDias('')).toBeNull();
  });

  it('devuelve 0 para el día de hoy', () => {
    expect(calcDias('2026-07-17')).toBe(0);
  });

  it('devuelve un número positivo para una fecha futura', () => {
    expect(calcDias('2026-07-24')).toBe(7);
  });

  it('devuelve un número negativo para una fecha ya vencida', () => {
    expect(calcDias('2026-07-10')).toBe(-7);
  });

  it('no se desfasa por la hora incluida en un datetime completo (ISO con Z)', () => {
    // Antes del fix, parsear con new Date(fechaStr) directamente podía
    // desplazar el resultado ±1 día según la zona horaria del navegador.
    expect(calcDias('2026-07-24T00:00:00.000Z')).toBe(7);
  });

  it('funciona igual en un mes/año distinto (no es un caso especial de julio 2026)', () => {
    vi.setSystemTime(new Date(2027, 0, 1, 23, 59, 0)); // 1 ene 2027, 23:59 hora local
    expect(calcDias('2027-01-15')).toBe(14);
    expect(calcDias('2026-12-25')).toBe(-7);
  });
});
