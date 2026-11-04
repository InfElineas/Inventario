import { base44 } from '@/api/base44Client';
import { departamentosACargo } from '@/lib/roles';

/**
 * Los jefes de un departamento, activos.
 *
 * Se trae a los usuarios activos y se filtra aquí por sus roles de jefe
 * (`jefe_inventario`…) y no con un WHERE: el departamento ya no es una columna
 * suelta sino parte de la lista de roles, y quien dirige dos departamentos sale
 * en los dos. Son decenas de usuarios, no miles.
 *
 * @param {string} departamento `inventario`, `facturacion` o `ca`.
 * @returns {Promise<object[]>}
 */
export async function jefesDe(departamento) {
  const gente = await base44.entities.Usuario.filter({ activo: true }, 'email', 500);
  return (gente ?? []).filter((u) => departamentosACargo(u).includes(departamento));
}
