import { describe, it, expect } from 'vitest';
import { rangoPorDefecto, diasDelRango, margen, ventasACsv, etiquetaMes, completarMeses, filtrarProductos } from '@/lib/ventas';

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

describe('etiquetaMes', () => {
  it('el mes corto en español', () => {
    expect(etiquetaMes('2026-10')).toBe('oct');
    expect(etiquetaMes('2026-01')).toBe('ene');
    expect(etiquetaMes('nada')).toBe('nada');
    expect(etiquetaMes(undefined)).toBe('');
  });
});

describe('completarMeses', () => {
  const hoy = new Date(2026, 10, 3); // noviembre de 2026

  it('todos los meses del rango, también los vacíos, hasta el actual', () => {
    const s = completarMeses([{ mes: '2026-09', cantidad: 1620, importe: 9000, dias: 30 }], 4, hoy);
    expect(s.map((m) => m.mes)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);
    expect(s.map((m) => m.cantidad)).toEqual([0, 1620, 0, 0]);
    expect(s.map((m) => m.etiqueta)).toEqual(['ago', 'sep', 'oct', 'nov']);
  });

  it('solo el último es el mes en curso', () => {
    const s = completarMeses([], 3, hoy);
    expect(s.map((m) => m.enCurso)).toEqual([false, false, true]);
  });

  it('cruza el año hacia atrás', () => {
    const s = completarMeses([], 3, new Date(2026, 0, 15));
    expect(s.map((m) => m.mes)).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('sin filas, ceros', () => {
    expect(completarMeses(undefined, 2, hoy).every((m) => m.cantidad === 0)).toBe(true);
  });
});

describe('filtrarProductos', () => {
  const lista = [
    { codigo: '7501', nombre: 'Aceite de oliva' },
    { codigo: '7502', nombre: 'Arroz grano largo' },
    { codigo: 'NoMT9', nombre: 'Café molido' },
  ];

  it('por nombre o por código, sin mirar mayúsculas ni acentos', () => {
    expect(filtrarProductos(lista, 'cafe').map((p) => p.codigo)).toEqual(['NoMT9']);
    expect(filtrarProductos(lista, 'ARROZ').map((p) => p.codigo)).toEqual(['7502']);
    expect(filtrarProductos(lista, '7501').map((p) => p.codigo)).toEqual(['7501']);
    expect(filtrarProductos(lista, 'nomt').map((p) => p.codigo)).toEqual(['NoMT9']);
  });

  it('sin texto, los primeros hasta el límite; sin coincidencias, nada', () => {
    expect(filtrarProductos(lista, '', 2).map((p) => p.codigo)).toEqual(['7501', '7502']);
    expect(filtrarProductos(lista, 'zzz')).toEqual([]);
    expect(filtrarProductos(undefined, 'a')).toEqual([]);
  });
});
