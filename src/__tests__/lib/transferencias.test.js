import { describe, it, expect } from 'vitest';
import {
  esDeTransferencia, esBorrador, filtrosDeTransferencias, interpretarTransferencia,
  transferenciasACsv, origenDe, destinoDe,
} from '@/lib/transferencias';

describe('esDeTransferencia', () => {
  it('reconoce las clasificaciones de transferencia, con o sin mayúsculas', () => {
    expect(esDeTransferencia({ clasif_ajuste: 'Transferencia a Latino no registrada' })).toBe(true);
    expect(esDeTransferencia({ clasif_ajuste: 'Transferencia almacén Externo' })).toBe(true);
    expect(esDeTransferencia({ clasif_ajuste: 'transferencia bodegón no registrada' })).toBe(true);
  });
  it('las demás no', () => {
    expect(esDeTransferencia({ clasif_ajuste: 'Robo' })).toBe(false);
    expect(esDeTransferencia({})).toBe(false);
    expect(esDeTransferencia(null)).toBe(false);
  });
});

describe('esBorrador', () => {
  it('solo «editada» se confirma o se cancela', () => {
    expect(esBorrador('editada')).toBe(true);
    expect(esBorrador(' Editada ')).toBe(true);
    expect(esBorrador('en tránsito')).toBe(false);
    expect(esBorrador(undefined)).toBe(false);
  });
});

describe('filtrosDeTransferencias', () => {
  it('el almacén es el origen, o el destino si se miran las entradas', () => {
    expect(filtrosDeTransferencias({ almacen: '789', sentido: 'salidas' })).toEqual({ origen: '789' });
    expect(filtrosDeTransferencias({ almacen: '789', sentido: 'entradas' })).toEqual({ destino: '789' });
  });
  it('lo vacío no se manda', () => {
    expect(filtrosDeTransferencias({
      almacen: '789', sentido: 'salidas', desde: '2026-10-01', hasta: '', status: '', q: '  ab ',
    })).toEqual({ origen: '789', from: '2026-10-01', q: 'ab' });
  });
});

describe('interpretarTransferencia', () => {
  it('montada: el documento viene en `draft`', () => {
    const r = interpretarTransferencia(201, {
      status: 'created', draft: { id: 77, code: 'TKCT1' }, accepted: [{ code: 'A', quantity: 1 }], rejected: [],
    });
    expect(r).toMatchObject({ tipo: 'creado', documento: { id: 77, code: 'TKCT1' } });
    expect(r.aceptadas).toHaveLength(1);
  });
  it('un draft que es solo el id se normaliza', () => {
    expect(interpretarTransferencia(201, { status: 'created', draft: 77 }).documento).toEqual({ id: 77 });
  });
  it('cancelada, confirmada y el resto de casos', () => {
    expect(interpretarTransferencia(200, { status: 'cancelled' }).tipo).toBe('cancelado');
    expect(interpretarTransferencia(200, { status: 'confirmed' }).tipo).toBe('confirmado');
    expect(interpretarTransferencia(202, { status: 'unverified', message: 'x' }).tipo).toBe('sin_verificar');
    expect(interpretarTransferencia(422, { status: 'rejected', rejected: [{ code: 'A' }] }).tipo).toBe('rechazado');
    expect(interpretarTransferencia(403, { error: { code: 'forbidden', message: 'no' } })).toMatchObject({ tipo: 'error', codigo: 'forbidden' });
  });
});

describe('origen y destino de una fila', () => {
  it('usa el nombre si lo trae y cae a los demás campos', () => {
    expect(origenDe({ originName: 'TKC SUB 789', origin: '351' })).toBe('TKC SUB 789');
    expect(origenDe({ origin: '351' })).toBe('351');
    expect(destinoDe({ destination: '726' })).toBe('726');
    expect(destinoDe({})).toBe('');
  });
});

describe('transferenciasACsv', () => {
  it('una fila por documento, con su cabecera', () => {
    const celda = (v) => `"${v ?? ''}"`;
    const csv = transferenciasACsv([{ code: 'T1', status: 'editada', date: '2026-10-02', origin: 'A', destination: 'B' }], celda);
    expect(csv.split('\n')).toHaveLength(2);
    expect(csv.split('\n')[1]).toBe('"T1","editada","2026-10-02","A","B",""');
  });
});
