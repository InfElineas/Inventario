import { describe, it, expect } from 'vitest';
import { dentroDelPlazo, claveDuplicado, atribuir, separarDuplicados } from '@/lib/importHistorial';

describe('dentroDelPlazo', () => {
  it('sin plazo entra todo, también lo que no tiene fecha', () => {
    expect(dentroDelPlazo('2026-10-01', '', '')).toBe(true);
    expect(dentroDelPlazo(null, '', '')).toBe(true);
  });

  it('con plazo, los extremos entran y lo de fuera o sin fecha no', () => {
    expect(dentroDelPlazo('2026-10-01', '2026-10-01', '2026-10-31')).toBe(true);
    expect(dentroDelPlazo('2026-10-31', '2026-10-01', '2026-10-31')).toBe(true);
    expect(dentroDelPlazo('2026-09-30', '2026-10-01', '2026-10-31')).toBe(false);
    expect(dentroDelPlazo('2026-11-01', '2026-10-01', '2026-10-31')).toBe(false);
    expect(dentroDelPlazo(null, '2026-10-01', '')).toBe(false);
  });

  it('con solo un extremo, acota por ese lado', () => {
    expect(dentroDelPlazo('2026-12-01', '2026-10-01', '')).toBe(true);
    expect(dentroDelPlazo('2026-01-01', '', '2026-10-31')).toBe(true);
    expect(dentroDelPlazo('2026-11-01', '', '2026-10-31')).toBe(false);
  });
});

describe('atribuir', () => {
  const user = { email: 'ana@x.com', full_name: 'Ana' };

  it('la fila queda a nombre de quien importa y con su almacén: así sale en su historial', () => {
    const f = atribuir({ producto_id: 'p1', especialista_nombre: 'Otro' }, user, '789');
    expect(f).toMatchObject({ especialista_id: 'ana@x.com', especialista_nombre: 'Ana', almacen_num: '789', producto_id: 'p1' });
  });

  it('el almacén de la propia fila gana sobre el de la hoja', () => {
    expect(atribuir({ almacen_num: '1005' }, user, '789').almacen_num).toBe('1005');
  });
});

describe('separarDuplicados', () => {
  const fila = (id, fecha, conteo) => ({ almacen_num: '789', producto_id: id, fecha_inv: fecha, conteo_real: conteo });

  it('lo que ya está no se vuelve a guardar, ni lo repetido dentro del propio archivo', () => {
    const existentes = new Set([claveDuplicado('Inventario', fila('a', '2026-10-01', 5))]);
    const { nuevas, duplicadas } = separarDuplicados('Inventario', [
      fila('a', '2026-10-01', 5),   // ya estaba
      fila('b', '2026-10-01', 3),
      fila('b', '2026-10-01', 3),   // repetida en el archivo
      fila('a', '2026-10-02', 5),   // otro día: es otro conteo
    ], existentes);

    expect(nuevas.map((f) => `${f.producto_id}@${f.fecha_inv}`)).toEqual(['b@2026-10-01', 'a@2026-10-02']);
    expect(duplicadas).toBe(2);
  });

  it('en las mermas la cantidad es la de la merma', () => {
    const m = { almacen_num: '789', producto_id: 'a', fecha_inv: '2026-10-01', cantidad: 2 };
    expect(claveDuplicado('Merma', m)).toBe('789|a|2026-10-01|2');
  });
});
