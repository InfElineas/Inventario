import { describe, it, expect } from 'vitest';
import {
  interpretarProceso, interpretarAnalisis, codigoBase, ROLES_PROCESAMIENTOS,
} from '@/lib/procesamientos';
import { ROLES_AJUSTES } from '@/lib/ajustes';

describe('interpretarProceso', () => {
  const base = { groups: [{ warehouse: '188' }], rejected: [], done: 1, failed: 0, unverified: 0 };

  it('created → procesado, con los recuentos', () => {
    expect(interpretarProceso(201, { status: 'created', ...base }))
      .toMatchObject({ tipo: 'procesado', hechas: 1, falladas: 0, sinVerificar: 0 });
  });

  it('partial → parcial', () => {
    expect(interpretarProceso(207, { status: 'partial', ...base, failed: 1 }).tipo).toBe('parcial');
  });

  it('rejected: nada se envió y trae el motivo y las líneas rechazadas', () => {
    const r = interpretarProceso(422, {
      status: 'rejected', groups: [], rejected: [{ line: 1, code: 'MAL', reason: 'x' }],
      done: 0, failed: 0, unverified: 0, error: 'No hay nada que procesar.',
    });
    expect(r).toMatchObject({ tipo: 'rechazado', mensaje: 'No hay nada que procesar.' });
    expect(r.rechazadas).toHaveLength(1);
  });

  it('failed → fallo', () => {
    expect(interpretarProceso(502, { status: 'failed', error: 'TKC no lo aceptó' }))
      .toMatchObject({ tipo: 'fallo', mensaje: 'TKC no lo aceptó' });
  });

  it('unverified (cuerpo, error.code o 504) → sin_verificar: no repetir', () => {
    expect(interpretarProceso(202, { status: 'unverified', message: 'm' }).tipo).toBe('sin_verificar');
    expect(interpretarProceso(500, { error: { code: 'unverified', message: 'm' } }).tipo).toBe('sin_verificar');
    expect(interpretarProceso(504, { error: { code: 'x', message: 'm' } }).tipo).toBe('sin_verificar');
  });

  it('un error de la API (permisos, validación) es error, con su código', () => {
    expect(interpretarProceso(403, { error: { code: 'forbidden', message: 'no' } }))
      .toMatchObject({ tipo: 'error', codigo: 'forbidden', status: 403 });
  });

  it('una respuesta que no se entiende es error', () => {
    expect(interpretarProceso(200, {}).tipo).toBe('error');
    expect(interpretarProceso(200, null).tipo).toBe('error');
  });
});

describe('interpretarAnalisis', () => {
  it('cuenta las procesables', () => {
    const r = interpretarAnalisis(200, {
      lines: [{ processable: true }, { processable: false }, { processable: true }], rejected: [],
    });
    expect(r).toMatchObject({ tipo: 'analizado', procesables: 2 });
  });

  it('error de la API o cuerpo sin líneas es error', () => {
    expect(interpretarAnalisis(403, { error: { code: 'forbidden', message: 'no' } }).tipo).toBe('error');
    expect(interpretarAnalisis(200, {}).tipo).toBe('error');
  });
});

describe('codigoBase', () => {
  it('quita NoMT sin importar mayúsculas: es el mismo producto', () => {
    expect(codigoBase('NoMT10157977')).toBe('10157977');
    expect(codigoBase('nomt10157977')).toBe('10157977');
    expect(codigoBase(' 10157977 ')).toBe('10157977');
  });
});

it('los roles son los de facturación (ajustes)', () => {
  expect(ROLES_PROCESAMIENTOS).toEqual(ROLES_AJUSTES);
});
