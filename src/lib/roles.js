// ── Resolución del rol de la aplicación a partir de los roles del IS ──
//
// El Identity Server devuelve un ARRAY de roles por sistema, pero la
// aplicación asume uno solo (usuarios.role). Cuando un usuario tiene varios
// asignados en el sistema "inventario", gana el de mayor precedencia.
//
// Sin módulos importados a propósito: lo usan tanto el frontend (vía el alias
// @/lib/roles) como el backend en Node sin bundler (import relativo), y este
// último no resuelve alias.

/**
 * De mayor a menor autoridad. Los nombres coinciden exactamente con los roles
 * creados en el IS para el sistema "inventario" y con las claves de ROLES en
 * constants.js, así que el mapeo es directo y no hay tabla de equivalencias.
 *
 * 'ic' queda fuera a propósito: está declarado en ROLES pero no tiene permisos
 * en security.js.
 */
export const ROLE_PRECEDENCE = [
  'superadmin',
  'administrador',
  'jefe_depto',
  'auditor',
  'supervisor',
  'fact',
  'ca',
  'esp_anuncio',
  'inv',
];

/**
 * Rol de la aplicación para un conjunto de roles del IS.
 *
 * @param {Array<{name?: string} | string>} isRoles Lo que devuelve
 *        GET /api/user-roles/me. Se aceptan objetos ({ id, name, description })
 *        y cadenas sueltas, porque la forma exacta del payload todavía no está
 *        verificada contra el servidor real.
 * @returns {string|null} La clave del rol, o null si no hay ninguno conocido —
 *          el llamador decide si eso es un 403 o un acceso sin permisos.
 */
export function resolveRole(isRoles) {
  // El primero de la lista ya viene por precedencia: es el de más autoridad.
  return resolveRoles(isRoles)[0] ?? null;
}

/**
 * TODOS los roles conocidos de la persona, de más a menos autoridad.
 *
 * Quedarse solo con el primero quitaba permisos: quien es inventarista y
 * además factura resolvía a `fact`, y perdía Recepciones y Vencimientos, que
 * solo puede `inv`. Lo que puede hacer alguien es la suma de lo que permiten
 * sus roles, no lo que permite el más alto.
 *
 * @param {Array<{name?: string} | string>} isRoles Lo que devuelve
 *        GET /api/user-roles/me. Se aceptan objetos ({ id, name, description })
 *        y cadenas sueltas.
 * @returns {string[]} Puede venir vacío: el llamador decide si eso es un 403.
 */
export function resolveRoles(isRoles) {
  if (!Array.isArray(isRoles)) return [];

  const nombres = new Set(
    isRoles
      .map((r) => (typeof r === 'string' ? r : r?.name))
      .filter((n) => typeof n === 'string')
      .map((n) => n.trim().toLowerCase())
  );

  return ROLE_PRECEDENCE.filter((rol) => nombres.has(rol));
}

/**
 * Los roles de un usuario ya guardado, para decidir permisos.
 *
 * `roles` es la lista completa y `role` el principal, que se sigue usando para
 * lo que tiene que elegir UNO: el saludo, el filtro por defecto de una
 * pantalla, el color de una insignia. Un usuario guardado antes de que
 * existiera la columna solo tiene `role`, y entonces esa es su lista.
 */
export function rolesDe(usuario) {
  const lista = usuario?.roles;
  if (Array.isArray(lista) && lista.length > 0) return lista;
  return usuario?.role ? [usuario.role] : [];
}

/**
 * ¿Alguno de sus roles está en la lista?
 *
 * Un superadministrador cuenta siempre. Es lo que ya hacían el menú y el guard
 * de rutas, pero cada botón repetía la lista a mano y se olvidaba: con un
 * usuario superadmin no salía el formulario de facturación, ni el del auditor,
 * ni el de corregir el propio conteo. Ponerlo aquí evita que vuelva a pasar en
 * el siguiente sitio donde haga falta.
 */
export function tieneRol(usuario, permitidos) {
  const suyos = rolesDe(usuario);
  if (suyos.includes('superadmin')) return true;
  return (permitidos ?? []).some((r) => suyos.includes(r));
}
