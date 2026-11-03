import { describe, it, expect } from 'vitest';
import {
  tipoDeMovimiento, fechaIso, clasificarMovimientos, desdeFecha, cambioDeExistencia,
  resumirMovimientos, unidadesDespachadas, compararVentas,
} from '@/lib/movimientosSubmayor';

/** Los movimientos de la captura de TKC, tal como los lee `parsearHistorial`. */
const MOVS = [
  { fecha: '05/10/2026', documento: 'Salida - Despacho - 541493', saldoInicial: 8, entrada: null, salida: 1, saldoFinal: 7, usuario: 'luism.pavia' },
  { fecha: '05/10/2026', documento: 'Salida - Despacho - 541494', saldoInicial: 7, entrada: null, salida: 2, saldoFinal: 5, usuario: 'luism.pavia' },
  { fecha: '06/10/2026', documento: 'Rebaja a Tienda', saldoInicial: null, entrada: null, salida: -4, saldoFinal: null, usuario: 'daniel.asael' },
  { fecha: '06/10/2026', documento: 'Salida - Transferencia Salida - TKCT202632477', saldoInicial: 5, entrada: null, salida: 4, saldoFinal: 1, usuario: 'daniel.asael' },
  { fecha: '06/10/2026', documento: 'Subida a Tienda', saldoInicial: null, entrada: 1, salida: null, saldoFinal: null, usuario: 'luism.pavia' },
  { fecha: '07/10/2026', documento: 'Salida - Despacho - 543829', saldoInicial: 1, entrada: null, salida: 1, saldoFinal: 0, usuario: 'alba.rosa' },
  { fecha: '30/10/2026', documento: 'Entrada - Ajuste Aumento - TKCE202668743', saldoInicial: 0, entrada: 180, salida: null, saldoFinal: 180, usuario: 'yeraldind.perez' },
  { fecha: '03/11/2026', documento: 'Subida a Tienda', saldoInicial: null, entrada: 165, salida: null, saldoFinal: null, usuario: 'yeraldind.perez' },
];

describe('tipoDeMovimiento', () => {
  it('reconoce los documentos que se ven en el submayor', () => {
    expect(tipoDeMovimiento('Salida - Despacho - 541493')).toBe('venta');
    expect(tipoDeMovimiento('Salida - Transferencia Salida - TKCT202632477')).toBe('transferencia');
    expect(tipoDeMovimiento('Entrada - Ajuste Aumento - TKCE202668743')).toBe('ajuste_aumento');
    expect(tipoDeMovimiento('Subida a Tienda')).toBe('interno');
    expect(tipoDeMovimiento('Rebaja a Tienda')).toBe('interno');
  });

  it('una venta directa no es un despacho, aunque sea una venta', () => {
    expect(tipoDeMovimiento('Salida - Venta Directa - TKCS2026123')).toBe('venta_directa');
  });

  it('el ajuste de disminución y el procesamiento, con o sin acentos y mayúsculas', () => {
    expect(tipoDeMovimiento('Salida - Ajuste Disminución - TKCS1')).toBe('ajuste_disminucion');
    expect(tipoDeMovimiento('SALIDA - AJUSTE DE DISMINUCION')).toBe('ajuste_disminucion');
    expect(tipoDeMovimiento('Entrada - Procesamiento - TKCP1')).toBe('procesamiento');
    expect(tipoDeMovimiento('Entrada - Procesar entrada - TKCP202611562')).toBe('procesamiento');
  });

  it('lo que no se reconoce es «otros», no una suposición', () => {
    expect(tipoDeMovimiento('Algo nuevo de TKC')).toBe('otros');
    expect(tipoDeMovimiento('')).toBe('otros');
    expect(tipoDeMovimiento(undefined)).toBe('otros');
  });
});

describe('fechaIso', () => {
  it('pasa la fecha de TKC a ISO', () => {
    expect(fechaIso('05/10/2026')).toBe('2026-10-05');
    expect(fechaIso('5/1/2026')).toBe('2026-01-05');
    expect(fechaIso('2026-10-05')).toBe('2026-10-05');
    expect(fechaIso('')).toBe('');
    expect(fechaIso('ayer')).toBe('');
  });
});

describe('clasificarMovimientos', () => {
  it('añade tipo, fecha ISO y las unidades con signo, y una rebaja en negativo cuenta como salida', () => {
    const c = clasificarMovimientos(MOVS);
    expect(c[0]).toMatchObject({ tipo: 'venta', iso: '2026-10-05', unidades: -1 });
    expect(c[2]).toMatchObject({ tipo: 'interno', unidades: -4 });
    expect(c[6]).toMatchObject({ tipo: 'ajuste_aumento', unidades: 180 });
  });

  it('sin movimientos, vacío', () => {
    expect(clasificarMovimientos(undefined)).toEqual([]);
  });
});

describe('desdeFecha y cambioDeExistencia', () => {
  const c = clasificarMovimientos(MOVS);

  it('solo lo que pasó desde el día del conteo, incluido ese día', () => {
    expect(desdeFecha(c, '2026-10-07')).toHaveLength(3);
    expect(desdeFecha(c, '')).toHaveLength(8);
  });

  it('la existencia cambia con lo que no es subir o bajar de tienda', () => {
    // −1 −2 −4 (transferencia) −1 +180 = 172; las subidas y rebajas no cuentan.
    expect(cambioDeExistencia(c)).toBe(172);
    expect(cambioDeExistencia(desdeFecha(c, '2026-10-30'))).toBe(180);
  });
});

describe('resumirMovimientos', () => {
  const r = resumirMovimientos(clasificarMovimientos(MOVS));

  it('totales por tipo, sin contar las subidas y bajadas de tienda', () => {
    expect(r.entradas).toBe(180);
    expect(r.salidas).toBe(8);
    expect(r.neto).toBe(172);
    expect(r.internos).toBe(3);
    expect(r.porTipo.map((t) => [t.clave, t.movimientos, t.entradas, t.salidas])).toEqual([
      ['venta', 3, 0, 4],
      ['ajuste_aumento', 1, 180, 0],
      ['transferencia', 1, 0, 4],
    ]);
  });

  it('por usuario, el que más movió primero', () => {
    expect(r.porUsuario[0]).toMatchObject({ usuario: 'yeraldind.perez', entradas: 180 });
    expect(r.porUsuario.find((u) => u.usuario === 'luism.pavia')).toMatchObject({ movimientos: 2, salidas: 3 });
  });

  it('por usuario, desde y hasta cuándo: el primer y el último movimiento', () => {
    const luis = r.porUsuario.find((u) => u.usuario === 'luism.pavia');
    expect([luis.primera.fecha, luis.ultima.fecha]).toEqual(['05/10/2026', '05/10/2026']);
    const dani = r.porUsuario.find((u) => u.usuario === 'daniel.asael');
    expect(dani.primera.fecha).toBe('06/10/2026');
    const varios = resumirMovimientos(clasificarMovimientos([
      { fecha: '31/10/2026', documento: 'Salida - Despacho - 2', salida: 1, usuario: 'x' },
      { fecha: '08/10/2026', documento: 'Salida - Despacho - 1', salida: 1, usuario: 'x' },
    ])).porUsuario[0];
    expect([varios.primera.fecha, varios.ultima.fecha]).toEqual(['08/10/2026', '31/10/2026']);
  });

  it('lo no reconocido se lista para que se vea', () => {
    const o = resumirMovimientos(clasificarMovimientos([
      { fecha: '01/10/2026', documento: 'Salida - Cosa rara - 1', salida: 2, usuario: 'x' },
    ]));
    expect(o.otros).toEqual(['Salida - Cosa rara - 1']);
    expect(o.porTipo[0].clave).toBe('otros');
  });
});

describe('ventas contra despachos', () => {
  it('los despachos son las salidas de tipo venta', () => {
    expect(unidadesDespachadas(clasificarMovimientos(MOVS))).toBe(4);
  });

  it('cuadran, o dice hacia dónde no cuadran', () => {
    expect(compararVentas({ vendido: 4, despachado: 4 })).toMatchObject({ diferencia: 0 });
    expect(compararVentas({ vendido: 4, despachado: 7 }).mensaje).toMatch(/3 unidades más como despacho/);
    expect(compararVentas({ vendido: 9, despachado: 4 }).mensaje).toMatch(/5 unidades más de las que salieron/);
  });
});
