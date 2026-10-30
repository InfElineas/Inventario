/**
 * Reducir una foto antes de guardarla.
 *
 * La toma un teléfono en el muelle de carga: cuatro mil píxedes de ancho y
 * cuatro megas. De eso solo hace falta reconocer la presentación del
 * producto, así que se reescala y se recomprime en el navegador antes de que
 * salga a la red. Sin esto, una recepción de cien líneas serían cuatrocientos
 * megas en la base.
 */

/** A partir de aquí se vuelve a comprimir, más bajo. */
const TOPE_BYTES = 700 * 1024
const CALIDADES = [0.7, 0.55, 0.4]

/** Bytes aproximados de un data URL en base64. */
const pesa = (url) => Math.ceil((url.length - url.indexOf(',') - 1) * 0.75)

/**
 * @param {File|Blob} archivo
 * @param {{ maxLado?: number }} [opciones] Lado mayor en píxeles.
 * @returns {Promise<string>} data URL JPEG
 */
export async function comprimirImagen(archivo, { maxLado = 1280 } = {}) {
  const bitmap = await createImageBitmap(archivo)
  try {
    const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height))
    const ancho = Math.max(1, Math.round(bitmap.width * escala))
    const alto = Math.max(1, Math.round(bitmap.height * escala))

    const lienzo = document.createElement('canvas')
    lienzo.width = ancho
    lienzo.height = alto
    const ctx = lienzo.getContext('2d')
    if (!ctx) throw new Error('El navegador no pudo preparar la imagen.')
    // Fondo blanco: un PNG con transparencia quedaría negro al pasar a JPEG.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, ancho, alto)
    ctx.drawImage(bitmap, 0, 0, ancho, alto)

    // La primera calidad que quepa. La última se acepta aunque no quepa: más
    // vale una foto fea guardada que ninguna.
    let url = ''
    for (const calidad of CALIDADES) {
      url = lienzo.toDataURL('image/jpeg', calidad)
      if (pesa(url) <= TOPE_BYTES) break
    }
    return url
  } finally {
    bitmap.close?.()
  }
}
