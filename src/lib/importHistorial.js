/**
 * Reglas de la importación del historial desde el Excel (hojas «BD Ajuste I-F» y
 * «BD Merma»). Lógica pura, aparte del componente para poder probarla.
 *
 * Lo que se importa es el historial DE QUIEN IMPORTA: cada persona sube su
 * archivo y lo ve en su pestaña Historial. Por eso las filas se guardan a su
 * nombre y con su almacén —las listas buscan por `especialista_id` y por
 * `almacen_num`—, y no como venían del Excel, que no traía ni uno ni otro: el
 * importador contaba «insertados» y el historial seguía vacío.
 */

/** ¿La fecha (YYYY-MM-DD) cae en el plazo? Sin plazo, todo entra; con plazo, lo que no tiene fecha no. */
export function dentroDelPlazo(fecha, desde, hasta) {
  if (!desde && !hasta) return true;
  if (!fecha) return false;
  if (desde && fecha < desde) return false;
  if (hasta && fecha > hasta) return false;
  return true;
}

/** Cómo se reconoce un registro que ya está, para no duplicarlo al importar dos veces el mismo archivo. */
export function claveDuplicado(entidad, fila) {
  const cantidad = entidad === 'Merma' ? fila.cantidad : fila.conteo_real;
  return [fila.almacen_num, fila.producto_id, fila.fecha_inv, Number(cantidad ?? 0)].join('|');
}

/** La fila a guardar: de quien importa y con su almacén. */
export function atribuir(fila, user, almacenPorDefecto) {
  return {
    ...fila,
    almacen_num: fila.almacen_num || almacenPorDefecto || '',
    especialista_id: user?.email,
    especialista_nombre: user?.full_name || fila.especialista_nombre || user?.email,
  };
}

/**
 * De las filas con producto y dentro del plazo, las que se van a guardar y las
 * que ya estaban.
 *
 * @param {'Inventario'|'Merma'} entidad
 * @param {object[]} filas   Ya atribuidas.
 * @param {Set<string>} existentes  Claves de lo que ya hay (ver `claveDuplicado`).
 */
export function separarDuplicados(entidad, filas, existentes) {
  const vistas = new Set(existentes);
  const nuevas = [];
  let duplicadas = 0;
  for (const f of filas) {
    const k = claveDuplicado(entidad, f);
    if (vistas.has(k)) { duplicadas += 1; continue; }
    vistas.add(k);   // también dentro del propio archivo
    nuevas.push(f);
  }
  return { nuevas, duplicadas };
}
