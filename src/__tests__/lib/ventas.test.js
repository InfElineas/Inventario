import { describe, it, expect } from 'vitest';
import { rangoPorDefecto, diasDelRango, margen, ventasACsv } from '@/lib/ventas';

describe('rangoPorDefecto', () => {
  it('treinta días terminados ayer: hoy no, que el informe no lo tiene', () => {
    const { desde, hasta } = rangoPorDefecto(new Date(2026, 10, 3, 15, 0, 0));
    expect(hasta).toBe('2026-11-02');
    expect(desde).toBe('2026-10-04');
    expect(diasDelRango(desde, hasta)).toBe(30);
  });

  it('cruza el cambio de mes y de año', () => {
    const { desde, hasta } = rangoPorDefecto(new Date(2027, 0, 5, 9, 0, 0));
    expect(hasta).toBe('2027-01-04');
    expect(desde).toBe('2026-12-06');
  });
});

describe('diasDelRango', () => {
  it('cuenta los dos extremos', () => {
    expect(diasDelRango('2026-10-01', '2026-10-01')).toBe(1);
    expect(diasDelRango('2026-10-01', '2026-10-31')).toBe(31);
  });

  it('un rango al revés o sin fecha no es un rango', () => {
    expect(diasDelRango('2026-10-31', '2026-10-01')).toBeNull();
    expect(diasDelRango('', '2026-10-01')).toBeNull();
  });
});

describe('margen', () => {
  it('sobre el importe', () => {
    expect(margen(200, 150)).toBeCloseTo(25);
  });

  it('sin importe no hay margen que calcular', () => {
    expect(margen(0, 10)).toBeNull();
  });
});

describe('ventasACsv', () => {
  it('una fila por producto, con el margen', () => {
    const csv = ventasACsv([{ codigo: 'A1', nombre: 'Arroz', cantidad: 10, ordenes: 4, importe: 30, costo: 24 }]);
    const [cab, fila] = csv.split('\n');
    expect(cab).toBe('Código,Producto,Unidades,Órdenes,Importe,Costo,Margen %');
    expect(fila).toBe('A1,Arroz,10,4,30.00,24.00,20.0');
  });

  it('un producto sin importe deja el margen vacío y neutraliza fórmulas en el nombre', () => {
    const [, fila] = ventasACsv([{ codigo: 'B', nombre: '=SUMA(1)', cantidad: 1, ordenes: 1, importe: 0, costo: 0 }]).split('\n');
    expect(fila).toBe("B,'=SUMA(1),1,1,0.00,0.00,");
  });
});
