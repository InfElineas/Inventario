/**
 * Barreras contra pedir más de lo que hay (poka-yoke). Lógica pura.
 *
 * Un ajuste de disminución o una transferencia que resta más de lo que hay no
 * se puede aplicar: TKC lo rechaza, o peor, lo acepta a medias y deja el
 * documento a medio montar. Es el mismo razonamiento que el análisis de subir y
 * bajar de tienda: la existencia se reparte entre la reserva (A, lo que no está
 * a la venta) y la tienda (T), y un ajuste de disminución resta de la reserva.
 * Antes de montar se comprueba cada línea contra lo que TKC tiene AHORA, y lo
 * que no se puede hacer no se deja montar.
 */

/** Cuántas líneas se comprueban, como mucho: cada una es una consulta a TKC. */
export const MAX_COMPROBAR = 100;

/**
 * Qué pasa con una línea.
 *
 *   ok       — hay de sobra.
 *   bajar    — hay en total, pero no en la reserva: hay que bajar de tienda antes.
 *   excede   — se pide más de lo que hay en total.
 *   sin_dato — no se pudo comprobar. No bloquea: que falle TKC o no haya anuncio
 *              no es motivo para impedir un ajuste que la API sabrá rechazar.
 *
 * @param {{ cantidad: number, existencia: null | { fisica: number, enAlmacen: number, enTienda: number },
 *           motivoSinDato?: string }} linea
 * @param {'disminucion'|'transferencia'} tipo
 * @returns {{ estado: 'ok'|'bajar'|'excede'|'sin_dato', motivo: string, bajar?: number, bloquea: boolean }}
 */
export function evaluarLinea({ cantidad, existencia, motivoSinDato }, tipo) {
  if (!existencia) {
    return { estado: 'sin_dato', motivo: motivoSinDato || 'No se pudo comprobar la existencia.', bloquea: false };
  }
  const { fisica, enAlmacen } = existencia;

  if (cantidad > fisica) {
    return { estado: 'excede', motivo: `Hay ${fisica} en total y se piden ${cantidad}.`, bloquea: true };
  }
  // Solo la disminución resta de la reserva. Una transferencia mueve existencia
  // física y la API decide de dónde sale.
  if (tipo === 'disminucion' && cantidad > enAlmacen) {
    const bajar = cantidad - enAlmacen;
    return {
      estado: 'bajar', bajar, bloquea: true,
      motivo: `La reserva (A) tiene ${enAlmacen} y se piden ${cantidad}: hay que bajar ${bajar} de tienda antes.`,
    };
  }
  return { estado: 'ok', motivo: '', bloquea: false };
}

/** Lo que dice la comprobación entera: cuántas líneas se pueden montar y cuántas no. */
export function resumirComprobacion(filas) {
  const bloqueadas = filas.filter((f) => f.evaluacion.bloquea).length;
  const sinDato = filas.filter((f) => f.evaluacion.estado === 'sin_dato').length;
  return { total: filas.length, bloqueadas, sinDato, ok: filas.length - bloqueadas - sinDato, puedeMontar: bloqueadas === 0 };
}

/**
 * Lo que se comprobó, resumido en una firma: si cambia el almacén, una cantidad o
 * un código, la comprobación ya no vale y hay que repetirla.
 */
export const firmaDeLineas = ({ almacen, lines }) =>
  JSON.stringify({ almacen, lines: lines.map((l) => [l.code, l.quantity]) });
