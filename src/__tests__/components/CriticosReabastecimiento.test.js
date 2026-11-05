import { describe, it, expect } from 'vitest';
import { ordenarCriticos, duracionLegible, ritmoLegible } from '@/components/dashboard/CriticosReabastecimiento';

const f = (id, estadoTienda, existencia, cobertura, estadoAnuncio = 'ACTIVADO') => ({ id, estadoTienda, existencia, cobertura, estadoAnuncio });

describe('ordenarCriticos — lo que se acaba primero', () => {
  it('los agotados no entran: ya se acabaron', () => {
    const r = ordenarCriticos([f('a', 'AGOTADO', 0, 0), f('b', 'DISPONIBLE', 0, 0), f('c', 'DISPONIBLE', 4, 2)]);
    expect(r.map((x) => x.id)).toEqual(['c']);
  });

  it('primero las últimas piezas, y después los de menos cobertura', () => {
    const r = ordenarCriticos([
      f('disp1', 'DISPONIBLE', 9, 1.5),
      f('ult2', 'ULTIMAS PIEZAS', 3, 4),
      f('disp2', 'PROXIMO', 7, 3),
      f('ult1', 'ULTIMAS PIEZAS', 2, 1),
    ]);
    expect(r.map((x) => x.id)).toEqual(['ult1', 'ult2', 'disp1', 'disp2']);
  });

  it('sigue exigiendo el anuncio activado', () => {
    expect(ordenarCriticos([f('m', 'ULTIMAS PIEZAS', 2, 1, 'MUERTO')])).toEqual([]);
  });
});

describe('texto legible', () => {
  it('la duración se dice en palabras, no en décimas de día', () => {
    expect(duracionLegible(0.1)).toBe('Se acaba hoy');
    expect(duracionLegible(1.4)).toBe('Alcanza para 1 día');
    expect(duracionLegible(3.6)).toBe('Alcanza para 4 días');
    expect(duracionLegible(9)).toBe('Alcanza para 1 semana');
    expect(duracionLegible(15)).toBe('Alcanza para 2 semanas');
  });

  it('el ritmo de venta pasa a la unidad que se entiende', () => {
    expect(ritmoLegible(3.2)).toBe('unas 3 al día');
    expect(ritmoLegible(0.5)).toBe('unas 4 por semana');
    expect(ritmoLegible(0.04)).toBe('unas 1 al mes');
    expect(ritmoLegible(0)).toBe('casi no se vende');
  });
});
