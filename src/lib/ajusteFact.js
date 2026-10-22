/**
 * Cómo resuelve facturación cada resultado de un conteo.
 *
 * Un sobrante se ajusta hacia arriba y un faltante hacia abajo. Se PROPONE, no
 * se impone: 'Procesamiento' —intercambio con un producto similar— es legítimo
 * en ambos casos, y el resto de ESTADO_FACT describe el retiro, que es otro
 * asunto. Lo único que no tiene sentido es ajustar en el sentido contrario al
 * que dio el conteo, y eso es lo que se avisa.
 *
 * Con qué producto se intercambió y a qué precio va en las notas: el registro
 * de inventario guarda un solo producto, así que no hay forma de comprobar
 * automáticamente que los precios se parezcan.
 */

export const ESTADO_POR_RESULTADO = {
  sobrante: 'Ajuste de aumento',
  faltante: 'Ajuste de disminución',
}

/** true si el ajuste elegido va en sentido contrario al conteo. */
export function estadoContradictorio(resultado, estado) {
  if (!estado) return false
  if (resultado === 'sobrante') return estado === ESTADO_POR_RESULTADO.faltante
  if (resultado === 'faltante') return estado === ESTADO_POR_RESULTADO.sobrante
  return false
}
