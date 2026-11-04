/**
 * Barreras contra el error al contar (poka-yoke). Lógica pura.
 *
 * La idea es la de las tarjetas SIM con la esquina cortada: el sistema no confía
 * en que nadie se equivoque, está hecho de modo que el error no pase. Un dedazo
 * al teclear —un cero de más, una cifra de menos— produce una diferencia enorme
 * y falsa, que luego se factura, se ajusta en TKC y se audita. Es mucho más
 * barato frenarlo aquí, cuando quien contó todavía tiene el producto delante.
 */

/** Por debajo de esto la diferencia no se frena: son errores de uno o dos, no dedazos. */
export const UMBRAL_UNIDADES = 20;
/** Sin existencia en TKC, contar tanto o más hace pensar en una cifra mal tecleada. */
export const UMBRAL_SIN_EXISTENCIA = 50;
/** Cuántas veces más (o la fracción) de lo que dice TKC se considera descabellado. */
export const RAZON_MAXIMA = 5;

/**
 * ¿Es esta cifra tan lejana a la existencia que lo más probable es un dedazo?
 *
 * Es el patrón del cero de más —1500 contra 107— o del cero de menos. No dice
 * que esté mal, dice que hay que repetirla: quien sí contó 1500 la escribe otra
 * vez en dos segundos, y quien se equivocó se da cuenta.
 *
 * @param {{ conteo: number, existencia: number }} datos
 * @returns {null | { motivo: string }} `null` si la cifra es razonable.
 */
export function cifraSospechosa({ conteo, existencia }) {
  const c = Number(conteo);
  const e = Number(existencia);
  if (!Number.isFinite(c) || !Number.isFinite(e) || c < 0 || e < 0) return null;
  if (Math.abs(c - e) < UMBRAL_UNIDADES) return null;

  if (e === 0) {
    return c >= UMBRAL_SIN_EXISTENCIA ? { motivo: `TKC dice que no hay nada y has contado ${c}.` } : null;
  }
  const razon = c / e;
  if (razon >= RAZON_MAXIMA) {
    return { motivo: `Has contado ${c} y TKC tiene ${e}: ${Number(razon.toFixed(1))} veces más.` };
  }
  if (c > 0 && razon <= 1 / RAZON_MAXIMA) {
    return { motivo: `Has contado ${c} y TKC tiene ${e}: la quinta parte o menos.` };
  }
  return null;
}

/**
 * ¿Falta repetir la cifra? Con una cifra sospechosa, solo se puede seguir cuando
 * lo que se escribió la segunda vez es igual al conteo.
 *
 * @param {{ sospecha: object|null, repetida: string, conteo: number }} datos
 */
export const faltaRepetir = ({ sospecha, repetida, conteo }) =>
  Boolean(sospecha) && !(String(repetida ?? '').trim() !== '' && Number(repetida) === Number(conteo));
