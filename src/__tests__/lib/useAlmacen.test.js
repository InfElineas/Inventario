import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockUser = vi.hoisted(() => ({ current: null }));
vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: mockUser.current }),
}));

import { useAlmacen, filterAlmacenesByConfig } from '@/lib/useAlmacen';

const STORAGE_KEY = 'elineas_almacen_activo';

beforeEach(() => {
  localStorage.clear();
  mockUser.current = null;
});

describe('useAlmacen', () => {
  it('sin usuario ni localStorage, empieza vacío', () => {
    const { result } = renderHook(() => useAlmacen());
    expect(result.current.almacen).toBe('');
    expect(result.current.almacenesConfig).toEqual([]);
  });

  it('usa el valor de localStorage si ya existe', () => {
    localStorage.setItem(STORAGE_KEY, '7');
    const { result } = renderHook(() => useAlmacen());
    expect(result.current.almacen).toBe('7');
  });

  it('sin localStorage, toma el almacen_num del perfil como semilla', () => {
    mockUser.current = { almacen_num: '3', almacenes_config: ['3', '9'] };
    const { result } = renderHook(() => useAlmacen());
    expect(result.current.almacen).toBe('3');
  });

  it('auto-selecciona cuando el usuario tiene exactamente 1 almacén configurado', () => {
    mockUser.current = { almacen_num: '', almacenes_config: ['5'] };
    const { result } = renderHook(() => useAlmacen());
    expect(result.current.almacen).toBe('5');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('5');
  });

  it('regresión: descarta el almacén guardado si ya no está en almacenesConfig', () => {
    localStorage.setItem(STORAGE_KEY, '1');
    mockUser.current = { almacen_num: '1', almacenes_config: ['2', '3'] };
    const { result } = renderHook(() => useAlmacen());
    // '1' ya no es válido para este usuario — no debe quedarse viendo ese almacén
    expect(result.current.almacen).not.toBe('1');
    expect(result.current.almacen).toBe('');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('regresión: si tras el descarte queda exactamente 1 almacén válido, cae en ese', () => {
    localStorage.setItem(STORAGE_KEY, '99');
    mockUser.current = { almacen_num: '99', almacenes_config: ['4'] };
    const { result } = renderHook(() => useAlmacen());
    expect(result.current.almacen).toBe('4');
  });

  it('no descarta el almacén si sigue estando entre los configurados', () => {
    localStorage.setItem(STORAGE_KEY, '2');
    mockUser.current = { almacen_num: '2', almacenes_config: ['1', '2', '3'] };
    const { result } = renderHook(() => useAlmacen());
    expect(result.current.almacen).toBe('2');
  });

  it('setAlmacen persiste en localStorage y actualiza el estado', () => {
    const { result } = renderHook(() => useAlmacen());
    act(() => result.current.setAlmacen('8'));
    expect(result.current.almacen).toBe('8');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('8');
  });

  it('setAlmacen con valor vacío limpia localStorage', () => {
    localStorage.setItem(STORAGE_KEY, '8');
    const { result } = renderHook(() => useAlmacen());
    act(() => result.current.setAlmacen(''));
    expect(result.current.almacen).toBe('');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('filterAlmacenesByConfig', () => {
  it('sin restricción (config vacía), devuelve todos los almacenes', () => {
    expect(filterAlmacenesByConfig(['1', '2', '3'], [])).toEqual(['1', '2', '3']);
    expect(filterAlmacenesByConfig(['1', '2', '3'], null)).toEqual(['1', '2', '3']);
  });

  it('con restricción, solo devuelve los almacenes configurados', () => {
    expect(filterAlmacenesByConfig(['1', '2', '3'], ['2'])).toEqual(['2']);
  });

  it('ignora almacenes configurados que no existen en la lista general', () => {
    expect(filterAlmacenesByConfig(['1', '2'], ['2', '99'])).toEqual(['2']);
  });
});
