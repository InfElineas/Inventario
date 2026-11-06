import { describe, it, expect } from 'vitest';
import { buscarEnHistorial, normalizar, observacionDeFila } from '@/lib/busquedaHistorial';

const FILAS = [
  { code: 'TKCS1', type: 'Venta Directa', status: 'confirmada', client: 'Cliente Uno', observacion: 'VD facturas 5922, 5923' },
  { code: 'TKCS2', type: 'Ajuste Disminución', status: 'editada', observation: 'RETIRO POR MERMA' },
  { code: 'TKCE9', type: 'Ajuste Aumento', status: 'confirmada', notes: 'Sobrante de inventario' },
];

describe('buscarEnHistorial', () => {
  it('sin texto devuelve todo', () => {
    expect(buscarEnHistorial(FILAS, '')).toBe(FILAS);
    expect(buscarEnHistorial(FILAS, '   ')).toBe(FILAS);
  });

  it('busca en la observación, con cualquiera de los nombres que la dé la API', () => {
    expect(buscarEnHistorial(FILAS, 'merma').map((f) => f.code)).toEqual(['TKCS2']);
    expect(buscarEnHistorial(FILAS, 'sobrante').map((f) => f.code)).toEqual(['TKCE9']);
    expect(buscarEnHistorial(FILAS, '5923').map((f) => f.code)).toEqual(['TKCS1']);
  });

  it('también por código, cliente, estado y tipo', () => {
    expect(buscarEnHistorial(FILAS, 'tkce9')).toHaveLength(1);
    expect(buscarEnHistorial(FILAS, 'cliente uno')).toHaveLength(1);
    expect(buscarEnHistorial(FILAS, 'editada')).toHaveLength(1);
    expect(buscarEnHistorial(FILAS, 'venta directa')).toHaveLength(1);
  });

  it('sin importar mayúsculas ni tildes', () => {
    expect(buscarEnHistorial(FILAS, 'DISMINUCION')).toHaveLength(1);
    expect(buscarEnHistorial(FILAS, 'Disminución')).toHaveLength(1);
  });

  it('con varias palabras, hacen falta todas, en cualquier orden', () => {
    expect(buscarEnHistorial(FILAS, 'merma retiro')).toHaveLength(1);
    expect(buscarEnHistorial(FILAS, 'merma facturas')).toHaveLength(0);
  });

  it('lo que no está, no sale', () => {
    expect(buscarEnHistorial(FILAS, 'zzz')).toEqual([]);
  });
});

describe('utilidades', () => {
  it('normaliza y lee la observación', () => {
    expect(normalizar(' ÁÉÍ ñ ')).toBe('aei n');
    expect(observacionDeFila({ observaciones: ' hola ' })).toBe('hola');
    expect(observacionDeFila({})).toBe('');
  });
});
