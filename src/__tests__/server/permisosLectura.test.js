import { describe, it, expect } from 'vitest';
import { restringirLectura } from '@/server/permisos';

const inv = { rol: 'inv', roles: ['inv'], email: 'ana@x.com', almacenes: ['789'] };

describe('restringirLectura — cada quien ve lo suyo', () => {
  it('un inventarista lee solo sus conteos y sus mermas, aunque pida otra cosa', () => {
    for (const tabla of ['inventarios', 'mermas']) {
      const c = restringirLectura(inv, tabla, { estado_tarea: 'en_curso', especialista_id: 'otro@x.com' });
      expect(c.especialista_id).toBe('ana@x.com');
      expect(c.estado_tarea).toBe('en_curso');
    }
  });

  it('solo de los almacenes que tiene configurados', () => {
    expect(restringirLectura(inv, 'inventarios', {}).almacen_num).toEqual(['789']);
  });

  it('si pide uno de sus almacenes, se respeta; si pide otro, no devuelve nada', () => {
    expect(restringirLectura(inv, 'mermas', { almacen_num: '789' }).almacen_num).toEqual(['789']);
    expect(restringirLectura(inv, 'mermas', { almacen_num: '1005' }).almacen_num).toEqual([]);
  });

  it('sin almacenes configurados, solo se le filtra por lo suyo', () => {
    const c = restringirLectura({ ...inv, almacenes: [] }, 'mermas', {});
    expect(c).toEqual({ especialista_id: 'ana@x.com' });
  });

  it.each(['fact', 'auditor', 'administrador', 'superadmin', 'jefe_depto', 'jefe_inventario', 'jefe_facturacion'])(
    'el rol %s ve todo, sin filtro añadido', (rol) => {
      const c = restringirLectura({ rol, roles: [rol], email: 'x@x.com', almacenes: ['789'] }, 'inventarios', { almacen_num: '1005' });
      expect(c).toEqual({ almacen_num: '1005' });
    },
  );

  it('con varios roles basta uno que vea todo: inventarista y además jefe', () => {
    const c = restringirLectura({ rol: 'jefe_depto', roles: ['jefe_depto', 'inv'], email: 'j@x.com', almacenes: ['789'] }, 'mermas', {});
    expect(c).toEqual({});
  });

  describe('quién contó esto hoy: lo único que se enseña de los conteos de otros', () => {
    const AHORA = new Date('2026-11-06T15:00:00Z').getTime();
    const CAMPOS = ['id', 'producto_id', 'especialista_id', 'especialista_nombre', 'estado_tarea'];
    const aviso = { almacen_num: '789', fecha_inv: '2026-11-06' };

    it('con esas columnas, de un día cercano a hoy y de un almacén suyo, no se filtra por quién', () => {
      const c = restringirLectura(inv, 'inventarios', aviso, { campos: CAMPOS, ahora: AHORA });
      expect(c.especialista_id).toBeUndefined();
      expect(c.almacen_num).toEqual(['789']);
    });

    it('de un almacén que no es suyo no devuelve nada', () => {
      const c = restringirLectura(inv, 'inventarios', { ...aviso, almacen_num: '1005' }, { campos: CAMPOS, ahora: AHORA });
      expect(c.almacen_num).toEqual([]);
    });

    it('pidiendo otras columnas, o sin columnas, sigue siendo solo lo suyo', () => {
      expect(restringirLectura(inv, 'inventarios', aviso, { campos: [...CAMPOS, 'conteo_real'], ahora: AHORA }).especialista_id).toBe('ana@x.com');
      expect(restringirLectura(inv, 'inventarios', aviso, { ahora: AHORA }).especialista_id).toBe('ana@x.com');
    });

    it('de un día lejano, o un rango, o de mermas, sigue siendo solo lo suyo', () => {
      expect(restringirLectura(inv, 'inventarios', { ...aviso, fecha_inv: '2026-09-01' }, { campos: CAMPOS, ahora: AHORA }).especialista_id).toBe('ana@x.com');
      expect(restringirLectura(inv, 'inventarios', { ...aviso, fecha_inv: { gte: '2026-11-06' } }, { campos: CAMPOS, ahora: AHORA }).especialista_id).toBe('ana@x.com');
      expect(restringirLectura(inv, 'mermas', aviso, { campos: CAMPOS, ahora: AHORA }).especialista_id).toBe('ana@x.com');
    });
  });

  it('otras tablas no se tocan', () => {
    const cond = { activo: true };
    expect(restringirLectura(inv, 'productos', cond)).toBe(cond);
  });
});
