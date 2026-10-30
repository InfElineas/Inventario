import { describe, it, expect } from 'vitest';
import { incidenciasDe, hayIncidencia, resumenIncidencias } from '@/lib/incidenciasRecepcion';

/**
 * Lo que salió mal en una recepción.
 *
 * De aquí sale lo que se le reclama al proveedor y lo que facturación usa
 * para cuadrar su factura, así que una incidencia que no aparece es dinero
 * que se paga por mercancía que no entró.
 */

const LINEA = (extra = {}) => ({
  producto_nombre: 'Champú colágeno Dove 370ml',
  producto_codigo: '7501082780215',
  cant_esperada: 100,
  cant_recibida: 100,
  diferencia: 0,
  contada: true,
  gramaje: '370 ml',
  unidades_por_caja: 12,
  fecha_vencimiento: '2027-05-01',
  foto_id: 'f1',
  calidad_ok: true,
  cant_merma_origen: 0,
  ...extra,
});

const recepcion = (...lineas) => ({ no_recepcion: 'REC-2026-0001', detalles: lineas });

describe('incidenciasDe', () => {
  it('una recepción limpia no tiene nada que reportar', () => {
    expect(incidenciasDe(recepcion(LINEA()))).toEqual([]);
  });

  it('el faltante dice cuánto se pidió y cuánto llegó', () => {
    const [i] = incidenciasDe(recepcion(LINEA({ cant_recibida: 70, diferencia: -30 })));
    expect(i.tipo).toBe('faltante');
    expect(i.gravedad).toBe('alta');
    expect(i.detalle).toContain('Faltaron 30');
    expect(i.detalle).toContain('se pidieron 100 y llegaron 70');
  });

  it('el sobrante también se reporta, pero pesa menos', () => {
    const [i] = incidenciasDe(recepcion(LINEA({ cant_recibida: 120, diferencia: 20 })));
    expect(i.tipo).toBe('sobrante');
    expect(i.gravedad).toBe('media');
  });

  it('una línea sin contar no es una línea que llegó a cero', () => {
    // De esta no se sabe nada, y cerrar sin saberlo es peor que un faltante.
    const [i] = incidenciasDe(recepcion(LINEA({ contada: false })));
    expect(i.tipo).toBe('sin_contar');
    expect(i.gravedad).toBe('alta');
  });

  it('la merma de origen sube a grave cuando toca devolver', () => {
    const suave = incidenciasDe(recepcion(LINEA({ cant_merma_origen: 5 })));
    expect(suave[0].tipo).toBe('merma_origen');
    expect(suave[0].gravedad).toBe('media');
    expect(suave[0].detalle).toContain('5% de lo recibido');

    const grave = incidenciasDe(recepcion(
      LINEA({ cant_merma_origen: 30, recomienda_devolucion: true }),
    ));
    expect(grave[0].gravedad).toBe('alta');
    expect(grave[0].detalle).toContain('devolver al proveedor');
  });

  it('la calidad deficiente lleva la nota de quien la marcó', () => {
    const [i] = incidenciasDe(recepcion(
      LINEA({ calidad_ok: false, nota_calidad: 'Cajas mojadas' }),
    ));
    expect(i.tipo).toBe('calidad');
    expect(i.detalle).toBe('Cajas mojadas');
  });

  it('un producto nuevo queda con su código completo', () => {
    const [i] = incidenciasDe(recepcion(
      LINEA({ nuevo_en_tkc: true, codigo_completo: '7501082780215' }),
    ));
    expect(i.tipo).toBe('producto_nuevo');
    expect(i.detalle).toContain('7501082780215');
  });

  it('lo que inventario no confirmó se lista, pero sin marcar la recepción', () => {
    const lista = incidenciasDe(recepcion(
      LINEA({ gramaje: '', fecha_vencimiento: '', unidades_por_caja: 0, foto_id: null }),
    ));
    expect(lista).toHaveLength(1);
    expect(lista[0].tipo).toBe('datos_incompletos');
    expect(lista[0].detalle).toBe('Sin gramaje, fecha de vencimiento, unidades por caja, foto de la presentación.');
    // Si esto marcara la recepción, todas saldrían en rojo.
    expect(hayIncidencia(lista)).toBe(false);
  });

  it('las graves van delante', () => {
    const lista = incidenciasDe(recepcion(
      LINEA({ gramaje: '' }),
      LINEA({ cant_recibida: 70, diferencia: -30 }),
      LINEA({ cant_recibida: 120, diferencia: 20 }),
    ));
    expect(lista.map((i) => i.gravedad)).toEqual(['alta', 'media', 'baja']);
  });

  it('una recepción sin líneas no reporta nada', () => {
    expect(incidenciasDe({})).toEqual([]);
    expect(incidenciasDe(recepcion())).toEqual([]);
  });
});

describe('resumenIncidencias', () => {
  it('cuenta por tipo y deja fuera lo que no marca', () => {
    const lista = incidenciasDe(recepcion(
      LINEA({ cant_recibida: 70, diferencia: -30 }),
      LINEA({ cant_recibida: 0, diferencia: -100 }),
      LINEA({ calidad_ok: false }),
      LINEA({ gramaje: '' }),
    ));
    expect(resumenIncidencias(lista)).toBe('2 faltante, 1 calidad deficiente');
  });
});
