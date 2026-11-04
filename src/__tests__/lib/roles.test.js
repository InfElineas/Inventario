import { describe, it, expect } from 'vitest';
import { resolveRole, resolveRoles, tieneRol, departamentosACargo, ROLE_PRECEDENCE } from '@/lib/roles';
import { ROLES } from '@/lib/constants';

describe('ROLE_PRECEDENCE', () => {
  it('cubre todos los roles de ROLES salvo ic, que no tiene permisos', () => {
    // La inclusión se comprueba en un solo sentido: todo rol de la aplicación
    // debe tener precedencia, o un usuario con ese rol se quedaría sin acceso.
    // Al revés se admite: la precedencia puede nombrar roles que ya existen en
    // el Identity Server pero cuya rama de funcionalidad aún no se ha
    // fusionado aquí.
    const esperados = Object.keys(ROLES).filter((r) => r !== 'ic');
    for (const rol of esperados) {
      expect(ROLE_PRECEDENCE).toContain(rol);
    }
  });

  it('no repite roles', () => {
    expect(new Set(ROLE_PRECEDENCE).size).toBe(ROLE_PRECEDENCE.length);
  });
});

describe('resolveRole', () => {
  it('devuelve el único rol asignado', () => {
    expect(resolveRole([{ id: '1', name: 'inv' }])).toBe('inv');
  });

  it('con varios roles gana el de mayor precedencia, no el primero', () => {
    const roles = [{ name: 'inv' }, { name: 'administrador' }, { name: 'fact' }];
    expect(resolveRole(roles)).toBe('administrador');
  });

  it('superadmin gana sobre administrador', () => {
    expect(resolveRole([{ name: 'administrador' }, { name: 'superadmin' }])).toBe('superadmin');
  });

  it('acepta cadenas sueltas además de objetos', () => {
    expect(resolveRole(['auditor'])).toBe('auditor');
    expect(resolveRole(['inv', { name: 'auditor' }])).toBe('auditor');
  });

  it('ignora mayúsculas y espacios', () => {
    expect(resolveRole([{ name: '  Esp_Anuncio ' }])).toBe('esp_anuncio');
  });

  it('ignora roles del IS que la app no conoce', () => {
    expect(resolveRole([{ name: 'vendedor' }, { name: 'inv' }])).toBe('inv');
  });

  it('devuelve null si ningún rol es conocido', () => {
    // El llamador decide si esto es un 403: aquí solo se informa que no hay rol.
    expect(resolveRole([{ name: 'vendedor' }])).toBeNull();
  });

  it('devuelve null sin roles o con entrada inválida', () => {
    expect(resolveRole([])).toBeNull();
    expect(resolveRole(null)).toBeNull();
    expect(resolveRole(undefined)).toBeNull();
    expect(resolveRole('inv')).toBeNull();
  });

  it('tolera entradas malformadas dentro del array', () => {
    expect(resolveRole([null, {}, { name: null }, { name: 'fact' }])).toBe('fact');
  });

  it('resuelve el payload real de /api/user-roles/me, con el sistema anidado', () => {
    // Forma verificada contra MyUserRoleSchema del IS (elineas-auth).
    const roles = [{
      id: '8c1f0a52-0000-4000-8000-000000000001',
      name: 'supervisor',
      description: null,
      system: { id: '8c1f0a52-0000-4000-8000-000000000002', slug: 'inventario', name: 'Inventario' },
    }];
    expect(resolveRole(roles)).toBe('supervisor');
  });
});

describe('resolveRoles y tieneRol', () => {
  it('devuelve todos los conocidos, de más a menos autoridad', () => {
    expect(resolveRoles([{ name: 'inv' }, { name: 'fact' }])).toEqual(['fact', 'inv']);
  });

  it('descarta los que este sistema no conoce', () => {
    expect(resolveRoles([{ name: 'vendedor' }, { name: 'inv' }])).toEqual(['inv']);
  });

  it('sin roles, lista vacía', () => {
    expect(resolveRoles([])).toEqual([]);
    expect(resolveRoles(null)).toEqual([]);
  });

  it('tieneRol mira la lista entera, no solo el principal', () => {
    // Es el caso que rompía: `role` dice 'fact' y Recepciones pide 'inv'.
    const usuario = { role: 'fact', roles: ['fact', 'inv'] };
    expect(tieneRol(usuario, ['inv'])).toBe(true);
    expect(tieneRol(usuario, ['auditor'])).toBe(false);
  });

  it('un usuario sin la lista cae en su rol suelto', () => {
    expect(tieneRol({ role: 'inv' }, ['inv'])).toBe(true);
    expect(tieneRol({ role: 'inv' }, ['fact'])).toBe(false);
    expect(tieneRol({}, ['inv'])).toBe(false);
  });
});

describe('jefes de departamento, con su departamento en el rol', () => {
  it('los roles jefe_inventario, jefe_facturacion y jefe_ca existen y tienen precedencia', () => {
    for (const r of ['jefe_inventario', 'jefe_facturacion', 'jefe_ca']) {
      expect(ROLE_PRECEDENCE).toContain(r);
      expect(ROLES[r]).toBeDefined();
    }
  });

  it('ser jefe de un departamento es ser también jefe_depto, que es lo que mira todo lo demás', () => {
    expect(resolveRoles([{ name: 'jefe_facturacion' }])).toEqual(['jefe_depto', 'jefe_facturacion']);
    expect(resolveRole([{ name: 'jefe_ca' }, { name: 'inv' }])).toBe('jefe_depto');
  });

  it('un jefe puede tener además un rol operativo, y un administrador gana al jefe', () => {
    expect(resolveRoles([{ name: 'inv' }, { name: 'jefe_inventario' }])).toEqual(['jefe_depto', 'jefe_inventario', 'inv']);
    expect(resolveRole([{ name: 'jefe_inventario' }, { name: 'administrador' }])).toBe('administrador');
  });

  it('un jefe_depto de antes no se duplica ni cambia', () => {
    expect(resolveRoles([{ name: 'jefe_depto' }])).toEqual(['jefe_depto']);
  });
});

describe('departamentosACargo', () => {
  it('sale del rol de jefe, no de una columna', () => {
    expect(departamentosACargo({ roles: ['jefe_depto', 'jefe_facturacion'] })).toEqual(['facturacion']);
    expect(departamentosACargo({ roles: ['jefe_depto', 'jefe_inventario', 'jefe_ca'] })).toEqual(['inventario', 'ca']);
  });

  it('un rol operativo no hace jefe: ser de facturación no es dirigirla', () => {
    expect(departamentosACargo({ roles: ['jefe_depto', 'jefe_facturacion', 'inv'] })).toEqual(['facturacion']);
    expect(departamentosACargo({ roles: ['fact'] })).toEqual([]);
  });

  it('un jefe de antes conserva el departamento puesto a mano; sin rol de jefe, nada', () => {
    expect(departamentosACargo({ role: 'jefe_depto', departamento: 'ca' })).toEqual(['ca']);
    expect(departamentosACargo({ role: 'inv', departamento: 'ca' })).toEqual([]);
    expect(departamentosACargo(undefined)).toEqual([]);
  });

  it('los roles de jefe mandan sobre el departamento de antes', () => {
    expect(departamentosACargo({ roles: ['jefe_depto', 'jefe_facturacion'], departamento: 'inventario' })).toEqual(['facturacion']);
  });
});
