import { describe, it, expect } from 'vitest';
import { priorizarExistencia, tieneExistencia, LIMITE_RESULTADOS } from '@/lib/buscarProductos';

const p = (id, existencia = 0) => ({ id, nombre: `Producto ${id}`, exist_fisica: existencia });

describe('priorizarExistencia', () => {
  it('primero los que tienen existencia, y detrás el resto, cada grupo en su orden', () => {
    const conExistencia = [p('c', 5), p('e', 1)];
    const todos = [p('a'), p('b'), p('c', 5), p('d'), p('e', 1)];
    expect(priorizarExistencia(conExistencia, todos).map((x) => x.id)).toEqual(['c', 'e', 'a', 'b', 'd']);
  });

  it('un producto no sale dos veces', () => {
    const r = priorizarExistencia([p('x', 3)], [p('x', 3), p('y')]);
    expect(r.map((x) => x.id)).toEqual(['x', 'y']);
  });

  it('los que no tienen existencia siguen saliendo: contar un producto en cero es legítimo', () => {
    expect(priorizarExistencia([], [p('a'), p('b')]).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('el límite corta al final: la existencia nunca queda fuera por culpa del orden por nombre', () => {
    // Quince sin existencia que van antes por nombre, y uno con existencia.
    const sin = Array.from({ length: LIMITE_RESULTADOS }, (_, i) => p(`a${i}`));
    const con = [p('z', 9)];
    const r = priorizarExistencia(con, [...sin, p('z', 9)]);
    expect(r).toHaveLength(LIMITE_RESULTADOS);
    expect(r[0].id).toBe('z');
  });

  it('sin resultados de una de las dos búsquedas', () => {
    expect(priorizarExistencia(undefined, undefined)).toEqual([]);
    expect(priorizarExistencia([p('a', 1)], [])).toHaveLength(1);
  });
});

describe('tieneExistencia', () => {
  it('solo con existencia mayor que cero; vacía o nula no cuenta', () => {
    expect(tieneExistencia(p('a', 3))).toBe(true);
    expect(tieneExistencia(p('a', 0))).toBe(false);
    expect(tieneExistencia({ exist_fisica: null })).toBe(false);
    expect(tieneExistencia(undefined)).toBe(false);
  });
});
