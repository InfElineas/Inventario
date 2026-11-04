import { describe, it, expect } from 'vitest';
import { saludoDe, primerNombre, resumenFacturacion, devueltosDe } from '@/lib/panelTareas';

const inv = (id, estado, extra = {}) => ({ id, estado_tarea: estado, ...extra });

describe('saludoDe', () => {
  it('según la hora', () => {
    expect(saludoDe(new Date(2026, 10, 3, 8))).toBe('Buenos días');
    expect(saludoDe(new Date(2026, 10, 3, 12))).toBe('Buenas tardes');
    expect(saludoDe(new Date(2026, 10, 3, 18, 59))).toBe('Buenas tardes');
    expect(saludoDe(new Date(2026, 10, 3, 21))).toBe('Buenas noches');
  });
});

describe('primerNombre', () => {
  it('la primera palabra, o nada', () => {
    expect(primerNombre('Joules Herrera')).toBe('Joules');
    expect(primerNombre('  Ana  ')).toBe('Ana');
    expect(primerNombre(undefined)).toBe('');
    expect(primerNombre('')).toBe('');
  });
});

describe('resumenFacturacion', () => {
  const inventarios = [
    inv(1, 'pend_fact', { resultado: 'sobrante' }),
    inv(2, 'pend_fact', { resultado: 'sobrante' }),
    inv(3, 'pend_fact', { resultado: 'faltante' }),
    // Un intercambio es un procesamiento, sea sobrante o faltante.
    inv(4, 'pend_fact', { resultado: 'faltante', clasif_ajuste: 'Intercambio de Producto' }),
    inv(5, 'pend_fact', { resultado: 'sobrante', intercambio_id: 4 }),
    inv(6, 'en_auditoria', { resultado: 'faltante' }),
    inv(7, 'en_curso'),
    inv(8, 'completado', { resultado: 'sobrante' }),
  ];
  const mermas = [inv(1, 'pend_fact'), inv(2, 'en_auditoria'), inv(3, 'devuelto')];

  it('cada conteo, en la pantalla que lo resuelve', () => {
    expect(resumenFacturacion(inventarios, mermas)).toEqual({
      aumento: 2, disminucion: 1, procesamiento: 2, mermas: 1, total: 6, enAuditoria: 2, enCurso: 1,
    });
  });

  it('sin nada, ceros', () => {
    expect(resumenFacturacion([], [])).toMatchObject({ total: 0, enAuditoria: 0, enCurso: 0 });
  });
});

describe('devueltosDe', () => {
  it('conteos y mermas devueltos, con su motivo y a dónde ir', () => {
    const d = devueltosDe(
      [inv(1, 'devuelto', { producto_nombre: 'Aceite', fact_notas: 'Falta el pasillo 3' }), inv(2, 'pend_fact')],
      [inv(9, 'devuelto', { producto_codigo: 'X1', nota_auditor: 'Sin foto' })],
    );
    expect(d.total).toBe(2);
    expect(d.filas).toEqual([
      { id: 'i-1', tipo: 'conteo', nombre: 'Aceite', nota: 'Falta el pasillo 3', enlace: '/inventario' },
      { id: 'm-9', tipo: 'merma', nombre: 'X1', nota: 'Sin foto', enlace: '/ajustes/disminucion?tab=mermas' },
    ]);
  });

  it('enseña unos pocos pero cuenta todos', () => {
    const muchos = Array.from({ length: 7 }, (_, i) => inv(i, 'devuelto', { producto_nombre: `P${i}` }));
    const d = devueltosDe(muchos, [], 4);
    expect(d.total).toBe(7);
    expect(d.filas).toHaveLength(4);
  });
});
