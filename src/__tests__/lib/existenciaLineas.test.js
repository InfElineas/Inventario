import { describe, it, expect } from 'vitest';
import { evaluarLinea, resumirComprobacion, firmaDeLineas } from '@/lib/existenciaLineas';

const hay = (fisica, enAlmacen, enTienda) => ({ fisica, enAlmacen, enTienda });

describe('evaluarLinea — disminución', () => {
  it('hay de sobra en la reserva: se puede', () => {
    expect(evaluarLinea({ cantidad: 5, existencia: hay(100, 40, 60) }, 'disminucion'))
      .toMatchObject({ estado: 'ok', bloquea: false });
  });

  it('justo lo que hay en la reserva: se puede', () => {
    expect(evaluarLinea({ cantidad: 40, existencia: hay(100, 40, 60) }, 'disminucion').estado).toBe('ok');
  });

  it('hay en total pero no en la reserva: hay que bajar de tienda antes, y dice cuánto', () => {
    const e = evaluarLinea({ cantidad: 70, existencia: hay(100, 40, 60) }, 'disminucion');
    expect(e).toMatchObject({ estado: 'bajar', bajar: 30, bloquea: true });
    expect(e.motivo).toMatch(/reserva \(A\) tiene 40 y se piden 70.*bajar 30 de tienda/);
  });

  it('más de lo que hay en total: no alcanza, sin salida', () => {
    const e = evaluarLinea({ cantidad: 150, existencia: hay(100, 40, 60) }, 'disminucion');
    expect(e).toMatchObject({ estado: 'excede', bloquea: true });
    expect(e.motivo).toMatch(/Hay 100 en total y se piden 150/);
  });
});

describe('evaluarLinea — transferencia', () => {
  it('solo cuenta lo que hay en total: no resta de la reserva', () => {
    expect(evaluarLinea({ cantidad: 70, existencia: hay(100, 40, 60) }, 'transferencia').estado).toBe('ok');
    expect(evaluarLinea({ cantidad: 101, existencia: hay(100, 40, 60) }, 'transferencia').estado).toBe('excede');
  });
});

describe('evaluarLinea — sin dato', () => {
  it('lo que no se pudo comprobar no bloquea, y dice por qué', () => {
    const e = evaluarLinea({ cantidad: 5, existencia: null, motivoSinDato: 'No está en el catálogo' }, 'disminucion');
    expect(e).toEqual({ estado: 'sin_dato', motivo: 'No está en el catálogo', bloquea: false });
    expect(evaluarLinea({ cantidad: 5, existencia: null }, 'transferencia').motivo).toMatch(/No se pudo comprobar/);
  });
});

describe('resumirComprobacion', () => {
  const fila = (cantidad, existencia) => ({ evaluacion: evaluarLinea({ cantidad, existencia }, 'disminucion') });

  it('se puede montar si ninguna línea bloquea; las sin dato no cuentan', () => {
    const r = resumirComprobacion([fila(5, hay(100, 40, 60)), fila(5, null)]);
    expect(r).toEqual({ total: 2, bloqueadas: 0, sinDato: 1, ok: 1, puedeMontar: true });
  });

  it('con una sola línea que no se puede, no se monta nada', () => {
    const r = resumirComprobacion([fila(5, hay(100, 40, 60)), fila(70, hay(100, 40, 60)), fila(500, hay(100, 40, 60))]);
    expect(r).toMatchObject({ bloqueadas: 2, puedeMontar: false });
  });
});

describe('firmaDeLineas', () => {
  const lines = [{ code: 'A', quantity: 2 }];

  it('cambia con el almacén, un código o una cantidad: la comprobación deja de valer', () => {
    const base = firmaDeLineas({ almacen: '789', lines });
    expect(firmaDeLineas({ almacen: '789', lines: [{ code: 'A', quantity: 2 }] })).toBe(base);
    expect(firmaDeLineas({ almacen: '1005', lines })).not.toBe(base);
    expect(firmaDeLineas({ almacen: '789', lines: [{ code: 'A', quantity: 3 }] })).not.toBe(base);
    expect(firmaDeLineas({ almacen: '789', lines: [{ code: 'B', quantity: 2 }] })).not.toBe(base);
  });
});
