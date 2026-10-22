import { describe, it, expect } from 'vitest';
import { ESTADO_POR_RESULTADO, estadoContradictorio } from '@/lib/ajusteFact';
import { ESTADO_FACT } from '@/lib/constants';

describe('ESTADO_POR_RESULTADO', () => {
  it('propone el ajuste en el sentido del conteo', () => {
    expect(ESTADO_POR_RESULTADO.sobrante).toBe('Ajuste de aumento');
    expect(ESTADO_POR_RESULTADO.faltante).toBe('Ajuste de disminución');
  });

  it('los dos valores existen en la lista que ve facturación', () => {
    // Si alguien renombra uno en constants.js, el desplegable se quedaría sin
    // la opción propuesta y el formulario abriría con un valor fantasma.
    for (const estado of Object.values(ESTADO_POR_RESULTADO)) {
      expect(ESTADO_FACT).toContain(estado);
    }
  });

  it('un conteo sin diferencia no propone ajuste', () => {
    expect(ESTADO_POR_RESULTADO.ok).toBeUndefined();
  });
});

describe('estadoContradictorio', () => {
  it('avisa cuando el ajuste va al revés que el conteo', () => {
    expect(estadoContradictorio('sobrante', 'Ajuste de disminución')).toBe(true);
    expect(estadoContradictorio('faltante', 'Ajuste de aumento')).toBe(true);
  });

  it('no avisa cuando van en el mismo sentido', () => {
    expect(estadoContradictorio('sobrante', 'Ajuste de aumento')).toBe(false);
    expect(estadoContradictorio('faltante', 'Ajuste de disminución')).toBe(false);
  });

  it('procesamiento vale para los dos: es un intercambio', () => {
    expect(estadoContradictorio('sobrante', 'Procesamiento')).toBe(false);
    expect(estadoContradictorio('faltante', 'Procesamiento')).toBe(false);
  });

  it('los estados del retiro no son contradictorios, describen otra cosa', () => {
    expect(estadoContradictorio('faltante', 'Pendiente a retiro')).toBe(false);
    expect(estadoContradictorio('faltante', 'Retirado')).toBe(false);
    expect(estadoContradictorio('sobrante', 'Recontar')).toBe(false);
  });

  it('sin estado elegido no hay nada que avisar', () => {
    expect(estadoContradictorio('sobrante', '')).toBe(false);
    expect(estadoContradictorio('sobrante', undefined)).toBe(false);
  });

  it('un conteo sin diferencia nunca contradice', () => {
    for (const estado of ESTADO_FACT) {
      expect(estadoContradictorio('ok', estado)).toBe(false);
    }
  });
});
