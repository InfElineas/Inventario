import { describe, it, expect } from 'vitest';
import { calcEstadoAnuncio, grupoAnuncio, codigoFlagsMatch } from '@/lib/anuncioEstado';

describe('calcEstadoAnuncio', () => {
  it('sin id de tienda y sin existencia → SIN ID EF=0', () => {
    expect(calcEstadoAnuncio('', 0, 0, 0)).toBe('SIN ID EF=0');
  });

  it('sin id de tienda pero con existencia → SIN ID EF>0', () => {
    expect(calcEstadoAnuncio('', 5, 5, 0)).toBe('SIN ID EF>0');
  });

  it('con id, nada en almacén y más de 6 en tienda → MUERTO EF=0', () => {
    expect(calcEstadoAnuncio('123', 10, 0, 7)).toBe('DESACTIVADO MUERTO EF=0');
  });

  it('con id, nada en tienda y más de 10 física → MUERTO EF>0', () => {
    expect(calcEstadoAnuncio('123', 11, 11, 0)).toBe('DESACTIVADO MUERTO EF>0');
  });

  it('con id y sin existencia → DESACTIVADO EF=0', () => {
    expect(calcEstadoAnuncio('123', 0, 0, 3)).toBe('DESACTIVADO EF=0');
  });

  it('con id y con existencia repartida → ACTIVADO', () => {
    expect(calcEstadoAnuncio('123', 5, 3, 2)).toBe('ACTIVADO');
  });

  it('existencia negativa cae en el caso por defecto, no en ACTIVADO', () => {
    // Antes las dos copias divergían aquí: Productos devolvía
    // 'DESACTIVADO EF=0' y BdTkc 'DESACTIVADO' (sin estilo ni label).
    expect(calcEstadoAnuncio('123', -3, 1, 1)).toBe('DESACTIVADO EF=0');
  });
});

describe('grupoAnuncio', () => {
  it('colapsa los dos estados MUERTO en un solo grupo', () => {
    expect(grupoAnuncio('123', 10, 0, 7)).toBe('MUERTO');
    expect(grupoAnuncio('123', 11, 11, 0)).toBe('MUERTO');
  });

  it('distingue DESACTIVADO de MUERTO', () => {
    expect(grupoAnuncio('123', 0, 0, 3)).toBe('DESACTIVADO');
  });

  it('ACTIVADO y SIN ID quedan fuera de los grupos con problema', () => {
    expect(grupoAnuncio('123', 5, 3, 2)).toBe('ACTIVADO');
    expect(grupoAnuncio('', 0, 0, 0)).toBe('SIN ID');
  });
});

describe('codigoFlagsMatch', () => {
  it('devuelve el fragmento que aparece en el código', () => {
    expect(codigoFlagsMatch('ABC-XX-99', ['XX'])).toEqual(['XX']);
  });

  it('no distingue mayúsculas', () => {
    expect(codigoFlagsMatch('abc-xx-99', ['XX'])).toEqual(['XX']);
    expect(codigoFlagsMatch('ABC-XX-99', ['xx'])).toEqual(['XX']);
  });

  it('devuelve todos los fragmentos que coinciden', () => {
    expect(codigoFlagsMatch('XX-ZZ-1', ['XX', 'ZZ', 'QQ'])).toEqual(['XX', 'ZZ']);
  });

  it('vacío si no hay coincidencia', () => {
    expect(codigoFlagsMatch('ABC-123', ['XX'])).toEqual([]);
  });

  it('ignora fragmentos en blanco para no marcar todos los códigos', () => {
    // '' está contenido en cualquier string: sin filtrar, marcaría todo.
    expect(codigoFlagsMatch('ABC-123', ['', '   '])).toEqual([]);
  });

  it('tolera código o lista ausentes', () => {
    expect(codigoFlagsMatch(null, ['XX'])).toEqual([]);
    expect(codigoFlagsMatch('ABC', null)).toEqual([]);
    expect(codigoFlagsMatch('ABC', [])).toEqual([]);
  });

  it('recorta espacios alrededor del fragmento configurado', () => {
    expect(codigoFlagsMatch('ABC-XX-9', [' XX '])).toEqual(['XX']);
  });
});
