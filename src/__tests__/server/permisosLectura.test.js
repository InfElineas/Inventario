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

  it('otras tablas no se tocan', () => {
    const cond = { activo: true };
    expect(restringirLectura(inv, 'productos', cond)).toBe(cond);
  });
});
