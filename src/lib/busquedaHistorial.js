/**
 * Búsqueda de texto en el historial de documentos de TKC (ajustes y ventas directas).
 *
 * El buscador de la pantalla dice «código, observaciones…», pero la API de
 * transferencias solo casaba algunos campos: escribir una observación —«RETIRO POR
 * MERMA», o el número de una factura que la observación nombra— no devolvía nada.
 * Ahora el servidor pide el periodo entero a la API, SIN el texto, y lo filtra él con
 * esto.
 *
 * Sin imports a propósito: lo usa el servidor, que no entiende el alias `@/`.
 */

/** La observación del documento, con el nombre que la dé la API. */
export const observacionDeFila = (fila) => String(
  fila?.observation ?? fila?.observations ?? fila?.notes ?? fila?.observacion ?? fila?.observaciones ?? '',
).trim();

/** Minúsculas y sin tildes: «Mermá» y «merma» son lo mismo al buscar. */
export const normalizar = (texto) => String(texto ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim();

/** Todo lo que se puede buscar de una fila, en un solo texto. */
function pajar(fila) {
  return normalizar([
    fila?.code, fila?.status, fila?.type, fila?.client, fila?.warehouse,
    fila?.date, fila?.accountingDate, fila?.amount, fila?.reference, fila?.invoice,
    observacionDeFila(fila),
  ].filter((v) => v !== undefined && v !== null && v !== '').join(' '));
}

/**
 * Las filas que contienen TODAS las palabras buscadas, en cualquier orden y en
 * cualquier campo. Sin texto devuelve todas.
 */
export function buscarEnHistorial(filas, texto) {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return filas;
  return filas.filter((f) => {
    const texto = pajar(f);
    return palabras.every((p) => texto.includes(p));
  });
}
