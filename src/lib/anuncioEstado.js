// ── Clasificación del estado de anuncio de un producto ────────
// Fuente única de verdad. Antes esta lógica estaba duplicada en
// Productos.jsx y BdTkc.jsx, y las dos copias ya habían divergido en el
// caso por defecto ('DESACTIVADO EF=0' vs 'DESACTIVADO', este último sin
// estilo ni label en sus mapas). Se conserva la variante de Productos,
// que es la que sí está representada en la UI.
//
// Parámetros en todas las funciones:
//   idTienda  id online del producto ('' si no tiene)
//   ef        existencia física
//   a         existencia en almacén
//   t         existencia en tienda

export function calcEstadoAnuncio(idTienda, ef, a, t) {
  const hasId = idTienda && String(idTienda).trim() !== '';
  if (!hasId && ef === 0)          return 'SIN ID EF=0';
  if (!hasId && ef > 0)            return 'SIN ID EF>0';
  if (hasId && a === 0 && t > 6)   return 'DESACTIVADO MUERTO EF=0';
  if (hasId && t === 0 && ef > 10) return 'DESACTIVADO MUERTO EF>0';
  if (hasId && ef === 0)           return 'DESACTIVADO EF=0';
  if (hasId && ef > 0)             return 'ACTIVADO';
  return 'DESACTIVADO EF=0';
}

/** Colapsa el estado detallado a los 4 grupos que interesan al especialista. */
export function grupoAnuncio(idTienda, ef, a, t) {
  const full = calcEstadoAnuncio(idTienda, ef, a, t);
  if (full === 'ACTIVADO') return 'ACTIVADO';
  if (full.includes('MUERTO')) return 'MUERTO';
  if (full.startsWith('DESACTIVADO')) return 'DESACTIVADO';
  return 'SIN ID';
}

/**
 * Fragmentos de código configurados por el especialista que aparecen en un
 * código de producto. Comparación sin distinguir mayúsculas ni espacios.
 * @returns {string[]} los fragmentos que coinciden (vacío si ninguno)
 */
export function codigoFlagsMatch(codigo, flags) {
  if (!codigo || !Array.isArray(flags) || flags.length === 0) return [];
  const c = String(codigo).toUpperCase();
  return flags
    .map(f => String(f ?? '').trim().toUpperCase())
    .filter(f => f !== '' && c.includes(f));
}
