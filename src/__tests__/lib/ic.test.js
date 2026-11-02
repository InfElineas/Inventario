import { describe, it, expect } from 'vitest';
import {
  puedeResponderIC, puedeEliminarIC, respuestaIC, descuentoIC, casosICaCsv,
} from '@/lib/ic';

const con = (...roles) => ({ email: 'yo@mercadoelineas.com', roles });
const caso = (extra = {}) => ({ estado_tarea: 'pendiente', especialista_inv_id: 'yo@mercadoelineas.com', ...extra });

describe('puedeResponderIC', () => {
  it('comercial y administradores, y solo un caso pendiente', () => {
    expect(puedeResponderIC(caso(), con('ca'))).toBe(true);
    expect(puedeResponderIC(caso(), con('administrador'))).toBe(true);
    expect(puedeResponderIC(caso({ estado_tarea: 'aprobado' }), con('ca'))).toBe(false);
  });

  it('inventario no responde lo suyo', () => {
    expect(puedeResponderIC(caso(), con('inv'))).toBe(false);
  });
});

describe('puedeEliminarIC', () => {
  it('quien lo mandó, mientras está pendiente', () => {
    expect(puedeEliminarIC(caso(), con('inv'))).toBe(true);
    expect(puedeEliminarIC(caso({ estado_tarea: 'rechazado' }), con('inv'))).toBe(false);
    expect(puedeEliminarIC(caso({ especialista_inv_id: 'otro@mercadoelineas.com' }), con('inv'))).toBe(false);
  });

  it('el superadministrador, siempre; comercial no', () => {
    expect(puedeEliminarIC(caso({ estado_tarea: 'aprobado' }), con('superadmin'))).toBe(true);
    expect(puedeEliminarIC(caso(), con('ca'))).toBe(false);
  });
});

describe('respuestaIC', () => {
  const user = { email: 'ca@mercadoelineas.com' };
  const ahora = new Date('2026-11-03T10:00:00Z');

  it('aprobar escribe estado, nota, quién y cuándo', () => {
    const r = respuestaIC({ estado: 'aprobado', nota: '  vale  ', user, ahora });
    expect(r.cambios).toEqual({
      estado_tarea: 'aprobado', notas_ic: 'vale',
      respondido_por: 'ca@mercadoelineas.com', fecha_respuesta: '2026-11-03T10:00:00.000Z',
    });
  });

  it('aprobar sin nota vale', () => {
    expect(respuestaIC({ estado: 'aprobado', nota: '', user, ahora }).cambios.notas_ic).toBe('');
  });

  it('rechazar sin decir por qué no vale', () => {
    expect(respuestaIC({ estado: 'rechazado', nota: '   ', user, ahora }).error).toMatch(/por qué/i);
    expect(respuestaIC({ estado: 'rechazado', nota: 'ya está en oferta', user, ahora }).cambios.estado_tarea).toBe('rechazado');
  });

  it('un estado cualquiera no vale', () => {
    expect(respuestaIC({ estado: 'completado', nota: 'x', user, ahora }).error).toBeDefined();
  });
});

describe('descuentoIC', () => {
  it('sobre el precio actual', () => {
    expect(descuentoIC({ precio_actual: 10, propuesta_precio_ic: 7.5 })).toBeCloseTo(25);
  });

  it('sin precios que comparar, nada', () => {
    expect(descuentoIC({ precio_actual: 0, propuesta_precio_ic: 5 })).toBeNull();
    expect(descuentoIC({ precio_actual: 10 })).toBeNull();
  });
});

describe('casosICaCsv', () => {
  it('una fila por caso, con el estado en castellano y la respuesta', () => {
    const csv = casosICaCsv([caso({
      almacen_num: '789', producto_codigo: 'C1', producto_nombre: 'Mostaza', no_lote: 'L1',
      cant_x_vencer: 4, fecha_vencimiento: '2026-11-20T00:00:00Z', precio_actual: 10, propuesta_precio_ic: 8,
      estado_tarea: 'aprobado', especialista_inv_nombre: 'Ana', fecha_deteccion: '2026-11-01',
      clasif_inv: 'Rebaja', nota_inv: 'sale poco', notas_ic: 'ok', respondido_por: 'ca@x.com',
      fecha_respuesta: '2026-11-02T08:00:00Z',
    })]);
    const [cab, fila] = csv.split('\n');
    expect(cab).toContain('Respuesta de comercial');
    expect(fila).toBe('789,C1,Mostaza,L1,4,2026-11-20,10.00,8.00,20.0,Rebaja aprobada,Ana,2026-11-01,Rebaja,sale poco,ok,ca@x.com,2026-11-02');
  });

  it('entrecomilla y neutraliza fórmulas, como el de lotes', () => {
    const [, fila] = casosICaCsv([caso({ producto_nombre: '=SUMA(1)', nota_inv: 'a, b' })]).split('\n');
    expect(fila).toContain("'=SUMA(1)");
    expect(fila).toContain('"a, b"');
  });
});
