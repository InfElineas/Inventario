import { describe, it, expect } from 'vitest';
import {
  CLASIFICACIONES, CLASIF_AJUSTE, CLASIF_FACT, ALL_CLASIF_MERMA, CLASIF_MERMA_SIN_FACT, conValorActual,
} from '@/lib/constants';
import { CLASIF_INTERCAMBIO } from '@/lib/conteosFact';

describe('clasificaciones: una sola lista para conteos, mermas y facturación', () => {
  it('conteos, mermas y facturación usan exactamente la misma', () => {
    expect(CLASIF_AJUSTE).toBe(CLASIFICACIONES);
    expect(CLASIF_FACT).toBe(CLASIFICACIONES);
    expect(ALL_CLASIF_MERMA).toBe(CLASIFICACIONES);
  });

  it('sin repetidas ni vacías', () => {
    expect(new Set(CLASIFICACIONES).size).toBe(CLASIFICACIONES.length);
    expect(CLASIFICACIONES.every((c) => c.trim() === c && c.length > 0)).toBe(true);
  });

  it('tiene las de Clasificación Ajuste TKC, empezando por la primera y acabando por la última', () => {
    expect(CLASIFICACIONES[0]).toBe('Faltante Inventario');
    expect(CLASIFICACIONES.at(-1)).toBe('Devolucion por Merma FF-Yeya');
    expect(CLASIFICACIONES).toEqual(expect.arrayContaining([
      'Merma-FV', 'Mal estado-sin calidad', 'Salida de insumos-Mantenimiento',
      'Cuenta casa administrativa-Rene', 'Procesamiento-Fact', 'Sobrante de Origen', 'En investigación',
    ]));
  });

  it('las clasificaciones viejas de merma ya no se ofrecen', () => {
    for (const vieja of ['Mal estado — Roto', 'Donación', 'Robo / hurto', 'Avería en transporte', 'Faltante sin justificar']) {
      expect(CLASIFICACIONES).not.toContain(vieja);
    }
  });

  it('la de intercambio sigue existiendo: de ella depende el emparejado de conteos', () => {
    expect(CLASIFICACIONES).toContain(CLASIF_INTERCAMBIO);
  });

  it('un valor guardado de antes sigue saliendo en su desplegable', () => {
    expect(conValorActual(CLASIFICACIONES, 'Mal estado — Roto')[0]).toBe('Mal estado — Roto');
    expect(conValorActual(CLASIFICACIONES, 'Robo')).toBe(CLASIFICACIONES);
  });
});

describe('mermas que no pasan por facturación', () => {
  it('las del vocabulario nuevo', () => {
    for (const c of ['Cuenta casa atenciones', 'Cuenta casa administrativa-Eli', 'Fitosanitario e Higiene', 'Higiene', 'Creación de anuncio']) {
      expect(CLASIF_MERMA_SIN_FACT).toContain(c);
    }
  });

  it('y las de antes de unificar: las mermas ya guardadas no empiezan a pedir facturación', () => {
    expect(CLASIF_MERMA_SIN_FACT).toContain('Cuenta casa — Administrativa Eli');
    expect(CLASIF_MERMA_SIN_FACT).toContain('Cuenta casa — Atenciones');
  });

  it('una merma normal (robo, vencida, mal estado) sí pasa por facturación', () => {
    for (const c of ['Robo', 'Merma-FV', 'Mal estado-sin calidad', 'Salida de insumos-Mantenimiento']) {
      expect(CLASIF_MERMA_SIN_FACT).not.toContain(c);
    }
  });
});
