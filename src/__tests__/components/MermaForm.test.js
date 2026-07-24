import { describe, it, expect } from 'vitest';
import { validateMerma } from '@/components/mermas/MermaForm';

const producto = { id: 'p1', nombre: 'Producto X', exist_fisica: 50 };

const baseFields = {
  producto,
  cantidad: '10',
  clasif: 'Mal estado',
  fechaInv: '2026-07-17',
  notas: '',
};

describe('validateMerma', () => {
  it('acepta datos válidos', () => {
    expect(validateMerma(baseFields)).toBeNull();
  });

  it('exige seleccionar un producto', () => {
    expect(validateMerma({ ...baseFields, producto: null })).toMatch(/selecciona un producto/i);
  });

  it('exige cantidad cuando está vacía', () => {
    expect(validateMerma({ ...baseFields, cantidad: '' })).toMatch(/cantidad requerida/i);
  });

  it('rechaza cantidad no numérica', () => {
    expect(validateMerma({ ...baseFields, cantidad: 'abc' })).toMatch(/cantidad requerida/i);
  });

  it('rechaza cantidad no entera', () => {
    expect(validateMerma({ ...baseFields, cantidad: '3.5' })).toMatch(/entero positivo/i);
  });

  it('rechaza cantidad menor a 1', () => {
    expect(validateMerma({ ...baseFields, cantidad: '0' })).toMatch(/entero positivo/i);
  });

  it('rechaza cantidad mayor a 100.000', () => {
    expect(validateMerma({ ...baseFields, cantidad: '100001' })).toMatch(/no puede superar 100\.000/i);
  });

  it('rechaza cantidad que supera la existencia física del producto', () => {
    const err = validateMerma({ ...baseFields, cantidad: '51' });
    expect(err).toMatch(/supera la existencia física/i);
    expect(err).toContain('51');
    expect(err).toContain('50');
  });

  it('acepta cantidad exactamente igual a la existencia física (límite inclusive)', () => {
    expect(validateMerma({ ...baseFields, cantidad: '50' })).toBeNull();
  });

  it('trata un producto sin exist_fisica como existencia 0', () => {
    const sinEf = { id: 'p2', nombre: 'Sin EF' };
    expect(validateMerma({ ...baseFields, producto: sinEf, cantidad: '1' })).toMatch(/supera la existencia física/i);
  });

  it('exige clasificación de merma', () => {
    expect(validateMerma({ ...baseFields, clasif: '' })).toMatch(/clasificación requerida/i);
  });

  it('exige fecha del registro', () => {
    expect(validateMerma({ ...baseFields, fechaInv: '' })).toMatch(/fecha requerida/i);
  });

  it('rechaza notas de más de 500 caracteres', () => {
    expect(validateMerma({ ...baseFields, notas: 'x'.repeat(501) })).toMatch(/máximo 500 caracteres/i);
  });

  it('acepta notas de exactamente 500 caracteres (límite inclusive)', () => {
    expect(validateMerma({ ...baseFields, notas: 'x'.repeat(500) })).toBeNull();
  });
});
