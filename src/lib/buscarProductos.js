/**
 * Las dos búsquedas de un buscador de productos, juntas.
 *
 * Quien cuenta, registra una merma o recibe mercancía busca casi siempre un
 * producto que TIENE existencia. El catálogo ya lo hace por defecto, y el
 * buscador de los formularios no: ordenaba por nombre y se quedaba con los
 * primeros quince, así que una búsqueda como «café» se llenaba de productos sin
 * existencia (todas las «Bebida instantánea…») y los que sí había quedaban fuera
 * de la lista o al final.
 *
 * Se piden dos cosas —lo que tiene existencia y todo— y se juntan: primero los
 * que tienen, y detrás el resto hasta completar. Los que no tienen siguen
 * saliendo, porque contar un producto en cero es legítimo; solo van después.
 */

/** Los campos donde se busca. Más que el nombre y el código: se pega el ID de tienda, o se escribe la marca. */
export const CAMPOS_BUSQUEDA_FORMULARIO = ['nombre', 'codigo_producto', 'codigo_pyme', 'id_tienda', 'marca'];

/** Cuántos resultados enseña la lista. */
export const LIMITE_RESULTADOS = 15;

/**
 * @param {object[]} conExistencia  Los que tienen existencia, en su orden.
 * @param {object[]} todos          Todos los que coinciden, en su orden (incluye los de arriba).
 * @param {number} [limite]
 * @returns {object[]} Primero los que tienen existencia; luego el resto, sin repetir.
 */
export function priorizarExistencia(conExistencia, todos, limite = LIMITE_RESULTADOS) {
  const primeros = conExistencia ?? [];
  const vistos = new Set(primeros.map((p) => p.id));
  const resto = (todos ?? []).filter((p) => !vistos.has(p.id));
  return [...primeros, ...resto].slice(0, limite);
}

/** ¿Este producto tiene existencia? Para distinguirlo en la lista. */
export const tieneExistencia = (p) => Number(p?.exist_fisica) > 0;
