import { describe, it, expect } from 'vitest';
import { estadoDeVigencia, diasHasta, temperaturaDe } from '@/server/lotesApi';

/**
 * Vigencia de un lote.
 *
 * De estos cortes depende qué se manda a intervención comercial y qué se deja
 * correr. Equivocarlos por un día se paga en mercancía que vence en el
 * almacén.
 */

const HOY = new Date('2026-10-30T15:00:00Z');

describe('diasHasta', () => {
  it('cuenta días de calendario, no horas', () => {
    // El lote vence el día entero, no a una hora: comparar instantes haría
    // que un lote que vence mañana saliera como vencido esta tarde.
    expect(diasHasta('2026-10-31', HOY)).toBe(1);
    expect(diasHasta('2026-10-30', HOY)).toBe(0);
    expect(diasHasta('2026-10-29', HOY)).toBe(-1);
  });

  it('acepta la fecha con hora pegada, como viene del informe', () => {
    expect(diasHasta('2026-11-29T00:00:00.000Z', HOY)).toBe(30);
  });

  it('sin fecha o ilegible devuelve null, no cero', () => {
    // Cero diría «vence hoy», que es lo contrario de «no se sabe».
    expect(diasHasta(null, HOY)).toBeNull();
    expect(diasHasta('', HOY)).toBeNull();
    expect(diasHasta('no se sabe', HOY)).toBeNull();
  });
});

describe('estadoDeVigencia', () => {
  it('reparte igual que la vista que había antes', () => {
    expect(estadoDeVigencia(null)).toBe('sin_fecha');
    expect(estadoDeVigencia(-1)).toBe('vencido');
    expect(estadoDeVigencia(0)).toBe('vencido');
    expect(estadoDeVigencia(1)).toBe('critico');
    expect(estadoDeVigencia(15)).toBe('critico');
    expect(estadoDeVigencia(16)).toBe('por_vencer');
    expect(estadoDeVigencia(30)).toBe('por_vencer');
    expect(estadoDeVigencia(31)).toBe('vigente');
  });
});

describe('temperaturaDe', () => {
  it('reconoce el frío, se escriba como se escriba', () => {
    for (const t of ['REFRIGERADO', 'Congelado', 'frio', 'FRÍO', 'Chilled']) {
      expect(temperaturaDe(t)).toBe('chilled');
    }
  });

  it('lo demás es ambiente, incluso si no viene', () => {
    expect(temperaturaDe('SECO')).toBe('ambient');
    expect(temperaturaDe(null)).toBe('ambient');
  });
});
