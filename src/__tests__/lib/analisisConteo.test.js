import { describe, it, expect } from 'vitest';
import { analizarConteo, sugerenciaDeAnalisis, conteoDeRegistro } from '@/lib/analisisConteo';

/**
 * El análisis de la diferencia de un conteo. El conteo se compara con la
 * existencia física (EF = A + T); A es la reserva y T lo que está a la venta.
 */

const analizar = (conteo, enAlmacen, enTienda, existencia) => analizarConteo({ conteo, enAlmacen, enTienda, existencia });

describe('sin diferencia', () => {
  it('el conteo es la existencia física: nada que hacer', () => {
    expect(analizar(107, 21, 86)).toMatchObject({ accion: 'ninguna', resumen: 'Sin diferencia', diferencia: 0 });
  });
});

describe('faltante (conteo < EF)', () => {
  it('la reserva cubre lo que falta: ajuste de disminución, sin mover nada', () => {
    // EF 1575 (A 98, T 1477), contó 1500: faltan 75 y la reserva tiene 98.
    const a = analizar(1500, 98, 1477, 1575);
    expect(a).toMatchObject({ accion: 'ninguna', cantidad: 0, diferencia: -75 });
    expect(a.resumen).toBe('Faltan 75: no hay que mover nada');
  });

  it('la reserva no alcanza: baja de tienda lo que falta por cubrir', () => {
    // Faltan 30, A 10, T 100: 20 hay que bajarlas para que el ajuste las tenga de dónde restar.
    const a = analizar(80, 10, 100);
    expect(a).toMatchObject({ accion: 'bajar', cantidad: 20, condicional: false, diferencia: -30 });
    expect(a.resumen).toBe('Faltan 30: hay que bajar 20 de tienda');
  });

  it('con la reserva vacía baja todo lo que falta', () => {
    expect(analizar(21, 0, 107)).toMatchObject({ accion: 'bajar', cantidad: 86 });
  });

  it('nunca propone bajar más de lo que hay en tienda', () => {
    // Contó 0 con A 5 y T 3: faltan 8, la reserva cubre 5 y quedan 3, que son toda la tienda.
    expect(analizar(0, 5, 3)).toMatchObject({ accion: 'bajar', cantidad: 3 });
    // La EF de TKC es mayor que A + T: aun así, no se baja más de lo que hay en tienda.
    expect(analizar(0, 5, 3, 20)).toMatchObject({ accion: 'bajar', cantidad: 3 });
  });

  it('contar cero con todo en la reserva: nada que mover', () => {
    expect(analizar(0, 40, 0)).toMatchObject({ accion: 'ninguna', diferencia: -40 });
  });
});

describe('sobrante (conteo > EF)', () => {
  it('con tienda: ajuste de aumento y nada más', () => {
    const a = analizar(130, 21, 86);
    expect(a).toMatchObject({ accion: 'ninguna', diferencia: 23 });
    expect(a.resumen).toBe('Sobran 23: ajuste de aumento');
  });

  it('con la tienda agotada, subir es una posibilidad, no una orden', () => {
    const a = analizar(30, 10, 0);
    expect(a).toMatchObject({ accion: 'subir', cantidad: 20, condicional: true, diferencia: 20 });
    expect(a.detalles.join(' ')).toMatch(/tienda está agotada/);
  });
});

describe('la existencia física de TKC manda sobre A + T', () => {
  it('si TKC da EF distinta de A + T, se compara con EF', () => {
    expect(analizar(100, 10, 20, 100)).toMatchObject({ diferencia: 0, existencia: 100 });
  });

  it('sin EF, es A + T', () => {
    expect(analizar(100, 10, 20)).toMatchObject({ diferencia: 70, existencia: 30 });
  });
});

describe('sin datos fiables no se recomienda nada', () => {
  it.each([
    [undefined, 10, 5], [10, undefined, 5], [10, 5, undefined], [NaN, 5, 5], [-1, 5, 5], [10, -5, 5],
  ])('conteo %s, A %s, T %s', (c, a, t) => {
    expect(analizar(c, a, t)).toBeNull();
  });

  it('las cantidades que vienen como texto se leen', () => {
    expect(analizar('80', '10', '100')).toMatchObject({ accion: 'bajar', cantidad: 20 });
  });
});

describe('sugerenciaDeAnalisis', () => {
  it('para el movimiento que se recomienda, la cantidad y el porqué', () => {
    const s = sugerenciaDeAnalisis(analizar(80, 10, 100), 'bajar');
    expect(s.cantidad).toBe(20);
    expect(s.motivo).toMatch(/^Faltan 30: hay que bajar 20 de tienda\. El ajuste de disminución resta de la reserva/);
  });

  it('subir es una posibilidad, y lo dice', () => {
    const s = sugerenciaDeAnalisis(analizar(30, 10, 0), 'subir');
    expect(s.cantidad).toBe(20);
    expect(s.motivo).toMatch(/^Posible: sobran 20: ajuste de aumento/);
  });

  it('para el movimiento que no se recomienda no propone cantidad, pero dice por qué', () => {
    const s = sugerenciaDeAnalisis(analizar(1500, 98, 1477, 1575), 'bajar');
    expect(s.cantidad).toBeUndefined();
    expect(s.motivo).toMatch(/no recomienda bajar: faltan 75: no hay que mover nada/);
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
