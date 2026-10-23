/**
 * Cabeceras de seguridad de todas las respuestas.
 *
 * Antes estaban en `<meta http-equiv>` de index.html, donde el navegador las
 * ignora (X-Frame-Options lo avisa por consola): solo valen como cabecera HTTP.
 *
 * Permissions-Policy deja `camera` en `self` porque el escáner de códigos de
 * barras usa la cámara de la propia página; `camera=()` lo bloquearía.
 */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
}

/** Aplica las cabeceras a una respuesta de `node:http`. */
export function aplicarCabecerasSeguridad(res) {
  for (const [nombre, valor] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(nombre, valor)
  }
}
