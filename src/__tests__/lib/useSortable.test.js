import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSortable, applySortable, strCmp, numCmp, dateCmp } from '@/lib/useSortable';

describe('useSortable', () => {
  it('empieza con la clave y dirección por defecto', () => {
    const { result } = renderHook(() => useSortable('nombre', 'desc'));
    expect(result.current.sort).toEqual({ key: 'nombre', dir: 'desc' });
  });

  it('onSort con una clave nueva ordena ascendente', () => {
    const { result } = renderHook(() => useSortable('nombre', 'desc'));
    act(() => result.current.onSort('fecha'));
    expect(result.current.sort).toEqual({ key: 'fecha', dir: 'asc' });
  });

  it('onSort dos veces con la misma clave invierte la dirección', () => {
    const { result } = renderHook(() => useSortable());
    act(() => result.current.onSort('nombre'));
    expect(result.current.sort.dir).toBe('asc');
    act(() => result.current.onSort('nombre'));
    expect(result.current.sort.dir).toBe('desc');
    act(() => result.current.onSort('nombre'));
    expect(result.current.sort.dir).toBe('asc');
  });

  it('cambiar a otra clave reinicia la dirección a asc', () => {
    const { result } = renderHook(() => useSortable());
    act(() => result.current.onSort('nombre'));
    act(() => result.current.onSort('nombre')); // ahora desc
    act(() => result.current.onSort('fecha'));  // clave nueva
    expect(result.current.sort).toEqual({ key: 'fecha', dir: 'asc' });
  });
});

describe('applySortable', () => {
  const rows = [{ n: 'Banana' }, { n: 'Apple' }, { n: 'Cherry' }];
  const comparators = { n: strCmp((r) => r.n) };

  it('devuelve el arreglo sin tocar si no hay sort.key', () => {
    expect(applySortable(rows, { key: '', dir: 'asc' }, comparators)).toBe(rows);
  });

  it('devuelve el arreglo sin tocar si la clave no tiene comparador', () => {
    expect(applySortable(rows, { key: 'inexistente', dir: 'asc' }, comparators)).toBe(rows);
  });

  it('ordena ascendente con el comparador dado', () => {
    const sorted = applySortable(rows, { key: 'n', dir: 'asc' }, comparators);
    expect(sorted.map((r) => r.n)).toEqual(['Apple', 'Banana', 'Cherry']);
  });

  it('ordena descendente cuando dir es desc', () => {
    const sorted = applySortable(rows, { key: 'n', dir: 'desc' }, comparators);
    expect(sorted.map((r) => r.n)).toEqual(['Cherry', 'Banana', 'Apple']);
  });

  it('no muta el arreglo original', () => {
    const original = [...rows];
    applySortable(rows, { key: 'n', dir: 'asc' }, comparators);
    expect(rows).toEqual(original);
  });
});

describe('comparadores (strCmp, numCmp, dateCmp)', () => {
  it('strCmp compara strings alfabéticamente y trata null/undefined como vacío', () => {
    const cmp = strCmp((x) => x.n);
    expect(cmp({ n: 'a' }, { n: 'b' })).toBeLessThan(0);
    expect(cmp({ n: null }, { n: 'a' })).toBeLessThan(0);
  });

  it('numCmp compara números y trata null/undefined como 0', () => {
    const cmp = numCmp((x) => x.n);
    expect(cmp({ n: 5 }, { n: 10 })).toBeLessThan(0);
    expect(cmp({ n: null }, { n: 5 })).toBeLessThan(0);
    expect(cmp({ n: 5 }, { n: 5 })).toBe(0);
  });

  it('dateCmp compara strings de fecha ISO lexicográficamente', () => {
    const cmp = dateCmp((x) => x.fecha);
    expect(cmp({ fecha: '2026-01-01' }, { fecha: '2026-06-01' })).toBeLessThan(0);
  });
});
