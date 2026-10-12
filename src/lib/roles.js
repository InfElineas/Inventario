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
  if (!Array.isArray(isRoles)) return null;

  const nombres = new Set(
    isRoles
      .map((r) => (typeof r === 'string' ? r : r?.name))
      .filter((n) => typeof n === 'string')
      .map((n) => n.trim().toLowerCase())
  );

  // Recorre por precedencia, no por el orden en que vinieron: el primero que
  // aparezca en la lista es el de mayor autoridad.
  return ROLE_PRECEDENCE.find((rol) => nombres.has(rol)) ?? null;
}
