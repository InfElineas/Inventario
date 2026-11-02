import { describe, it, expect } from 'vitest';
import { puedeEliminarConteo, revisionesDeConteo } from '@/lib/conteos';

const usuario = (role, email = 'a@x.com') => ({ role, email });
const conteo = (estado, dueño = 'a@x.com') => ({ estado_tarea: estado, especialista_id: dueño });

describe('puedeEliminarConteo', () => {
  it('el superadministrador siempre', () => {
    expect(puedeEliminarConteo(conteo('completado'), usuario('superadmin'))).toBe(true);
  });

  it('el administrador, salvo lo completado', () => {
    expect(puedeEliminarConteo(conteo('pend_fact'), usuario('administrador'))).toBe(true);
    expect(puedeEliminarConteo(conteo('completado'), usuario('administrador'))).toBe(false);
  });

  it('el inventarista, solo su borrador sin enviar', () => {
    expect(puedeEliminarConteo(conteo('en_curso'), usuario('inv'))).toBe(true);
    expect(puedeEliminarConteo(conteo('en_curso', 'otro@x.com'), usuario('inv'))).toBe(false);
    expect(puedeEliminarConteo(conteo('pend_fact'), usuario('inv'))).toBe(false);
  });

  it('facturación no elimina', () => {
    expect(puedeEliminarConteo(conteo('pend_fact'), usuario('fact'))).toBe(false);
  });
});

describe('revisionesDeConteo', () => {
  const base = { almacen_num: '789', producto_codigo: 'SC1', fecha_inv: '2026-11-02' };
  const user = usuario('inv');

  it('cada línea con fecha corrige su lote', () => {
    const r = revisionesDeConteo({
      ...base,
      detalles: [
        { fecha_vencimiento: '2027-01-15', no_lote: ' L1 ', cantidad: 4 },
        { fecha_vencimiento: '2027-03-01', no_lote: 'L2', cantidad: 2 },
      ],
    }, user);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({
      almacen_num: '789', producto_codigo: 'SC1', no_lote: 'L1',
      fecha_vencimiento: '2027-01-15', revisado_por: 'a@x.com',
    });
  });

  it('una línea sin fecha no escribe nada: no pisa una fecha buena con vacío', () => {
    expect(revisionesDeConteo({
      ...base, detalles: [{ fecha_vencimiento: '', no_lote: 'L1', cantidad: 4 }],
    }, user)).toEqual([]);
  });

  it('sin número de lote, la clave es la vacía, como en el informe', () => {
    const [r] = revisionesDeConteo({
      ...base, detalles: [{ fecha_vencimiento: '2027-01-15', cantidad: 1 }],
    }, user);
    expect(r.no_lote).toBe('');
  });

  it('un conteo sin detalles no da nada', () => {
    expect(revisionesDeConteo(base, user)).toEqual([]);
  });
});
