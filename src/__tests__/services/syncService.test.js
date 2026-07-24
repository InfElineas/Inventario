import { describe, it, expect } from 'vitest';
import { humanizeSyncError, deduplicateByCodigo } from '@/services/syncService';

describe('humanizeSyncError', () => {
  it('devuelve mensaje genérico si no hay mensaje', () => {
    expect(humanizeSyncError(null)).toMatch(/error desconocido/i);
  });

  it('detecta falta de índice único / ON CONFLICT', () => {
    const msg = humanizeSyncError('there is no unique or exclusion constraint matching the ON CONFLICT specification');
    expect(msg).toMatch(/migration_v26/i);
  });

  it('detecta violación de constraint único (duplicado)', () => {
    expect(humanizeSyncError('duplicate key value violates unique constraint')).toMatch(/duplicado/i);
  });

  it('detecta campo obligatorio faltante', () => {
    expect(humanizeSyncError('null value in column "codigo_producto" violates not-null constraint')).toMatch(/obligatorio/i);
  });

  it('detecta errores de conexión/timeout', () => {
    expect(humanizeSyncError('fetch failed: connection timeout')).toMatch(/conexión/i);
  });

  it('detecta acceso denegado (HTTP 4xx)', () => {
    expect(humanizeSyncError('HTTP 403')).toMatch(/acceso denegado/i);
  });

  it('cae al mensaje genérico con detalle técnico truncado para casos no reconocidos', () => {
    const msg = humanizeSyncError('algo raro que no matchea ninguna regla');
    expect(msg).toMatch(/error al guardar el producto/i);
  });
});

describe('deduplicateByCodigo', () => {
  it('deja pasar filas sin codigo_producto sin tocarlas', () => {
    const rows = [{ codigo_producto: null, nombre: 'sin código' }];
    expect(deduplicateByCodigo(rows)).toEqual(rows);
  });

  it('no toca filas con código único', () => {
    const rows = [
      { codigo_producto: 'A1', id_tienda: '1' },
      { codigo_producto: 'B2', id_tienda: '2' },
    ];
    expect(deduplicateByCodigo(rows)).toHaveLength(2);
  });

  it('cuando hay duplicados, prefiere la fila que trae id_tienda', () => {
    const rows = [
      { codigo_producto: 'A1', id_tienda: null,  nombre: 'sin id_tienda' },
      { codigo_producto: 'A1', id_tienda: '999', nombre: 'con id_tienda' },
    ];
    const result = deduplicateByCodigo(rows);
    expect(result).toHaveLength(1);
    expect(result[0].nombre).toBe('con id_tienda');
  });

  it('si ninguna de las duplicadas tiene id_tienda, gana la primera del arreglo', () => {
    const rows = [
      { codigo_producto: 'A1', id_tienda: null, nombre: 'primera' },
      { codigo_producto: 'A1', id_tienda: null, nombre: 'segunda' },
    ];
    const result = deduplicateByCodigo(rows);
    expect(result).toHaveLength(1);
    expect(result[0].nombre).toBe('primera');
  });

  it('si ambas duplicadas tienen id_tienda, gana la primera (no hay criterio de desempate adicional)', () => {
    const rows = [
      { codigo_producto: 'A1', id_tienda: '111', nombre: 'primera' },
      { codigo_producto: 'A1', id_tienda: '222', nombre: 'segunda' },
    ];
    const result = deduplicateByCodigo(rows);
    expect(result).toHaveLength(1);
    expect(result[0].nombre).toBe('primera');
  });
});
