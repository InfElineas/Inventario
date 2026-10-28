import { describe, it, expect } from 'vitest';
import { aLineas } from '@/components/mermas/BajarMermasDialog';

/**
 * Lo que se le manda a TKC al bajar mermas de tienda.
 *
 * Cada línea mueve mercancía de verdad, así que importa qué entra y con qué
 * cantidad: de más deja la existencia del piso de tienda sin cuadrar, y de
 * menos deja contado algo que ya no se puede vender.
 */
describe('aLineas', () => {
  it('una merma por línea, con su cantidad', () => {
    expect(aLineas([
      { producto_codigo: '7501', cantidad: 2 },
      { producto_codigo: '7502', cantidad: 5 },
    ])).toEqual([
      { code: '7501', quantity: 2 },
      { code: '7502', quantity: 5 },
    ]);
  });

  it('dos mermas del mismo producto se suman', () => {
    // Mandarlas por separado sería pedir dos bajadas del mismo código en el
    // mismo envío, y no hay forma de saber cómo lo resolvería TKC.
    expect(aLineas([
      { producto_codigo: '7501', cantidad: 2 },
      { producto_codigo: '7501', cantidad: 3 },
    ])).toEqual([{ code: '7501', quantity: 5 }]);
  });

  it('sin código o sin cantidad no entra', () => {
    expect(aLineas([
      { producto_codigo: '', cantidad: 4 },
      { producto_codigo: '7501', cantidad: 0 },
      { producto_codigo: '7502' },
      { cantidad: 3 },
    ])).toEqual([]);
  });

  it('una cantidad negativa se baja igual, en positivo', () => {
    // Una merma es una pérdida: el signo con que se registró no cambia que
    // haya que sacar esas unidades de la tienda.
    expect(aLineas([{ producto_codigo: '7501', cantidad: -3 }]))
      .toEqual([{ code: '7501', quantity: 3 }]);
  });

  it('una lista vacía no produce líneas', () => {
    expect(aLineas([])).toEqual([]);
    expect(aLineas(null)).toEqual([]);
  });
});
