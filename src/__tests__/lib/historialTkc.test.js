import { describe, it, expect } from 'vitest';
import {
  rangoPorDefecto, esVentaDirecta, sePuedeConfirmar, filtrosDeHistorial, historialACsv,
  tipoDeDocumento, observacionDe,
} from '@/lib/historialTkc';

describe('rangoPorDefecto', () => {
  it('siete días atrás hasta hoy, en la hora del navegador', () => {
    expect(rangoPorDefecto(new Date(2026, 10, 3, 15, 0, 0))).toEqual({ desde: '2026-10-27', hasta: '2026-11-03' });
  });

  it('cruza el cambio de año', () => {
    expect(rangoPorDefecto(new Date(2027, 0, 3, 9, 0, 0))).toEqual({ desde: '2026-12-27', hasta: '2027-01-03' });
  });
});

describe('esVentaDirecta y sePuedeConfirmar', () => {
  it('una venta directa se reconoce por su tipo', () => {
    expect(esVentaDirecta({ type: 'Venta Directa' })).toBe(true);
    expect(esVentaDirecta({ type: 'Ajuste Disminucion' })).toBe(false);
    expect(esVentaDirecta({})).toBe(false);
  });

  it('solo se confirma un ajuste «editada»; una venta directa es solo lectura', () => {
    expect(sePuedeConfirmar({ status: 'editada', type: 'Ajuste Disminucion' })).toBe(true);
    expect(sePuedeConfirmar({ status: 'editada', type: 'Venta Directa' })).toBe(false);
    expect(sePuedeConfirmar({ status: 'confirmada', type: 'Ajuste Aumento' })).toBe(false);
  });
});

describe('filtrosDeHistorial', () => {
  const base = { desde: '2026-10-01', hasta: '2026-10-31', status: '', q: '', tipoSalida: 'all' };

  it('lo vacío no se manda', () => {
    expect(filtrosDeHistorial({ ...base, tipo: 'aumento' })).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('el tipo de salida solo existe en las disminuciones', () => {
    expect(filtrosDeHistorial({ ...base, tipo: 'aumento' })).not.toHaveProperty('type');
    expect(filtrosDeHistorial({ ...base, tipo: 'disminucion' })).toMatchObject({ type: 'all' });
  });

  it('estado y búsqueda, recortada', () => {
    expect(filtrosDeHistorial({ ...base, tipo: 'disminucion', status: 'editada', q: '  FACT 5939 ' }))
      .toMatchObject({ status: 'editada', q: 'FACT 5939' });
  });
});

describe('historialACsv', () => {
  it('una fila por documento, con cliente en las ventas directas', () => {
    const csv = historialACsv([
      { id: 1, code: 'TKCS202646172', type: 'Venta Directa', status: 'confirmada', date: '2026-11-03',
        accountingDate: '2026-11-03', client: 'Elizabeth', warehouse: 'B23 Electrocuba', amount: '4.34' },
    ]);
    const [cab, fila] = csv.split('\n');
    expect(cab).toBe('Documento,Tipo,Estado,Fecha,Fecha contable,Almacén,Cliente,Monto,Observaciones');
    expect(fila).toBe('TKCS202646172,Venta Directa,confirmada,2026-11-03,2026-11-03,B23 Electrocuba,Elizabeth,4.34,');
  });

  it('con el tipo de la pantalla, el CSV lleva el tipo de documento y la observación', () => {
    const [, ajuste, vd] = historialACsv([
      { code: 'T1', type: '', status: 'editada', observacion: 'RETIRO POR MERMA' },
      { code: 'T2', type: 'Venta Directa', status: 'confirmada' },
    ], 'disminucion').split('\n');
    expect(ajuste).toContain('Ajuste de disminución');
    expect(ajuste).toContain('RETIRO POR MERMA');
    expect(vd).toContain('Venta directa');
  });

  it('el monto con coma de miles va entrecomillado y las fórmulas se neutralizan', () => {
    const [, fila] = historialACsv([{ code: 'T1', type: '=X', amount: '1,094.85' }]).split('\n');
    expect(fila).toContain('"1,094.85"');
    expect(fila).toContain("'=X");
  });
});

describe('tipoDeDocumento y observacionDe', () => {
  it('una venta directa lo es; lo demás, el ajuste de la pantalla', () => {
    expect(tipoDeDocumento({ type: 'Venta Directa' }, 'disminucion')).toBe('Venta directa');
    expect(tipoDeDocumento({ type: 'Ajuste' }, 'disminucion')).toBe('Ajuste de disminución');
    expect(tipoDeDocumento({}, 'aumento')).toBe('Ajuste de aumento');
  });

  it('la observación, con el nombre que la dé la API', () => {
    expect(observacionDe({ observacion: ' FACT 5939 ' })).toBe('FACT 5939');
    expect(observacionDe({ notes: 'Conteo' })).toBe('Conteo');
    expect(observacionDe({})).toBe('');
  });
});
