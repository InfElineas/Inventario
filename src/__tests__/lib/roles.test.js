import { describe, it, expect } from 'vitest';
import { resolveRole, ROLE_PRECEDENCE } from '@/lib/roles';
import { ROLES } from '@/lib/constants';

describe('ROLE_PRECEDENCE', () => {
  it('cubre todos los roles de ROLES salvo ic, que no tiene permisos', () => {
    const esperados = Object.keys(ROLES).filter((r) => r !== 'ic').sort();
    expect([...ROLE_PRECEDENCE].sort()).toEqual(esperados);
  });

  it('no repite roles', () => {
    expect(new Set(ROLE_PRECEDENCE).size).toBe(ROLE_PRECEDENCE.length);
  });
});

describe('resolveRole', () => {
  it('devuelve el único rol asignado', () => {
    expect(resolveRole([{ id: '1', name: 'inv' }])).toBe('inv');
  });

  it('con varios roles gana el de mayor precedencia, no el primero', () => {
    const roles = [{ name: 'inv' }, { name: 'administrador' }, { name: 'fact' }];
    expect(resolveRole(roles)).toBe('administrador');
  });

  it('superadmin gana sobre administrador', () => {
    expect(resolveRole([{ name: 'administrador' }, { name: 'superadmin' }])).toBe('superadmin');
  });

  it('acepta cadenas sueltas además de objetos', () => {
    expect(resolveRole(['auditor'])).toBe('auditor');
    expect(resolveRole(['inv', { name: 'auditor' }])).toBe('auditor');
  });

  it('ignora mayúsculas y espacios', () => {
    expect(resolveRole([{ name: '  Esp_Anuncio ' }])).toBe('esp_anuncio');
  });

  it('ignora roles del IS que la app no conoce', () => {
    expect(resolveRole([{ name: 'vendedor' }, { name: 'inv' }])).toBe('inv');
  });

  it('devuelve null si ningún rol es conocido', () => {
    // El llamador decide si esto es un 403: aquí solo se informa que no hay rol.
    expect(resolveRole([{ name: 'vendedor' }])).toBeNull();
  });

  it('devuelve null sin roles o con entrada inválida', () => {
    expect(resolveRole([])).toBeNull();
    expect(resolveRole(null)).toBeNull();
    expect(resolveRole(undefined)).toBeNull();
    expect(resolveRole('inv')).toBeNull();
  });

  it('tolera entradas malformadas dentro del array', () => {
    expect(resolveRole([null, {}, { name: null }, { name: 'fact' }])).toBe('fact');
  });
});
