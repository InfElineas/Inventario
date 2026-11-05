import { describe, it, expect } from 'vitest';
import { ordenarCriticos } from '@/components/dashboard/CriticosReabastecimiento';

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
