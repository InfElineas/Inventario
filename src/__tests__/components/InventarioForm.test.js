import { describe, it, expect } from 'vitest';
import { validateInventario } from '@/components/inventario/InventarioForm';

const producto = { id: 'p1', nombre: 'Producto X', exist_fisica: 20 };

const baseFields = {
  producto,
  detalles: [{ fecha_vencimiento: '2026-08-01', no_lote: 'L1', cantidad: 10 }],
  fechaInv: '2026-07-17',
  notas: '',
};

describe('validateInventario', () => {
  it('acepta datos válidos', () => {
    expect(validateInventario(baseFields)).toBeNull();
  });

  it('exige seleccionar un producto', () => {
    expect(validateInventario({ ...baseFields, producto: null })).toMatch(/selecciona un producto/i);
  });

  it('acepta una línea de detalle con cantidad 0 (líneas sin contar se descartan al enviar, no al validar)', () => {
    const fields = { ...baseFields, detalles: [{ fecha_vencimiento: '', no_lote: '', cantidad: 0 }] };
    expect(validateInventario(fields)).toBeNull();
  });

  it('rechaza cantidad negativa en cualquier línea', () => {
    const fields = { ...baseFields, detalles: [{ cantidad: -1 }] };
    expect(validateInventario(fields)).toMatch(/no negativos/i);
  });

  it('rechaza cantidad no numérica en cualquier línea', () => {
    const fields = { ...baseFields, detalles: [{ cantidad: 'abc' }] };
    expect(validateInventario(fields)).toMatch(/no negativos/i);
  });

  it('rechaza cantidad mayor a 100.000 en cualquier línea', () => {
    const fields = { ...baseFields, detalles: [{ cantidad: 100001 }] };
    expect(validateInventario(fields)).toMatch(/máxima por línea: 100\.000/i);
  });

  it('valida cada línea del arreglo, no solo la primera', () => {
    const fields = {
      ...baseFields,
      detalles: [
        { cantidad: 5 },
        { cantidad: -3 }, // la segunda línea es la inválida
      ],
    };
    expect(validateInventario(fields)).toMatch(/no negativos/i);
  });

  it('exige fecha del conteo', () => {
    expect(validateInventario({ ...baseFields, fechaInv: '' })).toMatch(/fecha requerida/i);
  });

  it('rechaza notas de más de 500 caracteres', () => {
    expect(validateInventario({ ...baseFields, notas: 'x'.repeat(501) })).toMatch(/máximo 500 caracteres/i);
  });

  it('acepta notas de exactamente 500 caracteres (límite inclusive)', () => {
    expect(validateInventario({ ...baseFields, notas: 'x'.repeat(500) })).toBeNull();
  });
});
