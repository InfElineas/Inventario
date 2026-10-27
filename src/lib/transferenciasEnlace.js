import { keyToTkcValue } from '@/services/tkc/warehouses'

/**
 * Enlaces profundos a elineas-transferencia.
 *
 * Subir y bajar de tienda ya existen allí como módulos completos —analizar,
 * ejecutar, reanudar, recuperar corridas— y escriben en TKC. Rehacerlos aquí
 * sería la cuarta copia de algo que ya está mantenido, después de las tres que
 * esta misma sesión ha tenido que deshacer.
 *
 * Su canal de entrada por enlace tiene además una propiedad que importa:
 * **solo carga la entrada**. No analiza ni ejecuta nada; la persona revisa y
 * pulsa en la herramienta de siempre, con sus diálogos. Nosotros preparamos el
 * trabajo, no disparamos un movimiento de existencia desde aquí.
 *
 * El contrato está en docs/integracion.md de ese repo. Dos detalles que es
 * fácil equivocar:
 *
 *  · `warehouse` es el id NUMÉRICO de TKC, no nuestra clave: el almacén «789»
 *    es el 351 para ellos.
 *  · `text` va en formato `CODIGO*CANTIDAD`, una línea por producto, y la URL
 *    tiene tope. Para lotes grandes su canal es `postMessage`, no el enlace.
 */

// Público y de un solo despliegue, así que no hace falta una variable: el
// navegador es quien abre el enlace, y volver a meter variables de compilación
// solo para esto sería peor.
const BASE = 'https://transferencias.mercadoelineas.com'

/** Por encima de esto la URL se vuelve frágil; su canal para lotes es otro. */
export const MAX_LINEAS_ENLACE = 60

/**
 * @param {'up-shop'|'down-shop'} modulo
 * @param {string} almacen  nuestra clave de almacén («789»)
 * @param {Array<{codigo: string, cantidad?: number}>} [productos]
 * @returns {string|null} null si el almacén no existe en el catálogo de TKC
 */
export function enlaceTransferencias(modulo, almacen, productos = []) {
  const idTkc = keyToTkcValue(almacen)
  if (!idTkc) return null

  const url = new URL(`/${modulo}`, BASE)
  url.searchParams.set('warehouse', idTkc)

  const lineas = productos
    .filter((p) => p?.codigo)
    .slice(0, MAX_LINEAS_ENLACE)
    .map((p) => `${p.codigo}*${Math.max(1, Math.trunc(Number(p.cantidad) || 1))}`)

  if (lineas.length > 0) url.searchParams.set('text', lineas.join('\n'))
  return url.toString()
}
