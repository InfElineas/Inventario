import { describe, it, expect } from 'vitest';
import { analizarConteo, sugerenciaDeAnalisis, conteoDeRegistro } from '@/lib/analisisConteo';

/**
 * El análisis de la diferencia de un conteo. Supone que el conteo es el del
 * almacén y lo compara con A, no con la existencia total.
 */

const analizar = (conteo, enAlmacen, enTienda) => analizarConteo({ conteo, enAlmacen, enTienda });

describe('hay en el almacén más de lo que TKC dice que tiene (conteo > A)', () => {
  it('lo que sobra del almacén está en la tienda: bajar, sin pasar de lo que hay en tienda', () => {
    // Contó 40 en el almacén; TKC: A 10, T 100. Esas 30 están en realidad en el almacén.
    const a = analizar(40, 10, 100);
    expect(a).toMatchObject({ accion: 'bajar', cantidad: 30, condicional: false, diferencia: -70 });
    expect(a.resumen).toBe('Bajar 30 de tienda');
  });

  it('con menos en tienda de lo que sobra: baja lo que hay y el resto es un sobrante real', () => {
    // Contó 40; A 10, T 5: puede bajar 5 y quedan 25 de más sobre el total (15).
    const a = analizar(40, 10, 5);
    expect(a).toMatchObject({ accion: 'bajar', cantidad: 5 });
    expect(a.detalles.join(' ')).toMatch(/quedan 25 de más sobre la existencia total \(15\).*ajuste de aumento/);
  });

  it('con nada en tienda no hay qué bajar: es un sobrante real', () => {
    const a = analizar(40, 10, 0);
    expect(a).toMatchObject({ accion: 'ninguna', cantidad: 0 });
    expect(a.resumen).toBe('Sobrante real de 30');
  });
});

describe('el conteo coincide con el almacén (conteo = A)', () => {
  it('con tienda: la diferencia son las unidades de la tienda, que no se contaron', () => {
    // El caso de la captura: EF 107, contó 21, el almacén tiene 21 y la tienda 86.
    const a = analizar(21, 21, 86);
    expect(a).toMatchObject({ accion: 'ninguna', diferencia: -86 });
    expect(a.resumen).toBe('No hay faltante en el almacén');
    expect(a.detalles[0]).toMatch(/86 de la tienda, que no se contaron/);
  });

  it('sin tienda: sin diferencia', () => {
    expect(analizar(21, 21, 0)).toMatchObject({ accion: 'ninguna', resumen: 'Sin diferencia', diferencia: 0 });
  });
});

describe('faltan unidades en el almacén (conteo < A)', () => {
  it('propone subir lo que falta, pero solo como posibilidad: depende de dónde estén', () => {
    // Contó 21; TKC: A 107, T 0. Faltan 86 en el almacén.
    const a = analizar(21, 107, 0);
    expect(a).toMatchObject({ accion: 'subir', cantidad: 86, condicional: true, diferencia: -86 });
    expect(a.resumen).toBe('Faltan 86 en el almacén');
    expect(a.detalles[0]).toMatch(/si esas 86 están en el piso de la tienda.*faltante real.*ajuste de disminución/i);
  });

  it('avisa de que lo que hay en tienda no entra en el conteo', () => {
    expect(analizar(21, 107, 5).detalles.join(' ')).toMatch(/Las 5 que TKC tiene en tienda no entran/);
  });
});

describe('sin datos fiables no se recomienda nada', () => {
  it.each([
    [undefined, 10, 5], [10, undefined, 5], [10, 5, undefined], [NaN, 5, 5], [-1, 5, 5], [10, -5, 5],
  ])('conteo %s, A %s, T %s', (c, a, t) => {
    expect(analizar(c, a, t)).toBeNull();
  });

  it('las cantidades que vienen como texto se leen', () => {
    expect(analizar('40', '10', '100')).toMatchObject({ accion: 'bajar', cantidad: 30 });
  });
});

describe('sugerenciaDeAnalisis', () => {
  it('para el movimiento que se recomienda, la cantidad y el porqué', () => {
    const s = sugerenciaDeAnalisis(analizar(40, 10, 100), 'bajar');
    expect(s.cantidad).toBe(30);
    expect(s.motivo).toMatch(/^Bajar 30 de tienda\. Hay 40 en el almacén y TKC dice 10/);
  });

  it('subir es una posibilidad, y lo dice', () => {
    const s = sugerenciaDeAnalisis(analizar(21, 107, 0), 'subir');
    expect(s.cantidad).toBe(86);
    expect(s.motivo).toMatch(/^Posible: faltan 86 en el almacén; solo si están en el piso de la tienda/);
  });

  it('para el movimiento contrario no propone cantidad, pero dice por qué no', () => {
    const s = sugerenciaDeAnalisis(analizar(21, 107, 0), 'bajar');
    expect(s.cantidad).toBeUndefined();
    expect(s.motivo).toMatch(/no recomienda bajar: faltan 86 en el almacén/);
  });

  it('sin análisis, nada', () => {
    expect(sugerenciaDeAnalisis(null, 'bajar')).toBeNull();
  });
});

describe('conteoDeRegistro', () => {
  it('el conteo real, si lo trae', () => {
    expect(conteoDeRegistro({ conteo_real: 21, exist_fisica_tkc: 107, diferencia: -86 })).toBe(21);
    expect(conteoDeRegistro({ conteo_real: 0, exist_fisica_tkc: 107, diferencia: -107 })).toBe(0);
  });

  it('en un conteo antiguo, sale de la existencia y la diferencia', () => {
    expect(conteoDeRegistro({ exist_fisica_tkc: 107, diferencia: -86 })).toBe(21);
  });

  it('en una merma o un lote, que no son conteos, no se sabe', () => {
    expect(conteoDeRegistro({ producto_codigo: 'X' })).toBeNaN();
  });
});
