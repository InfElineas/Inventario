/**
 * Acceso del navegador al cierre de despachos de TKC (`/api/despachos/*`, ver
 * `src/server/despachosApi.js`). Mismo contrato que `ajustesService.js`:
 * devuelve `{ status, body }` aunque sea un 4xx/5xx, y las credenciales de TKC
 * de la persona viajan en su cookie, no desde aquí.
 */

import { pedir } from '@/services/ajustesService'

const RUTA = '/api/despachos'

/** Los almacenes que tienen un proveedor de TKC asignado. */
export const listarAlmacenesDespachos = () => pedir(`${RUTA}/almacenes`)

/** Lo que se cerraría en ese almacén. Solo lee. */
export const pendientesDespachos = (almacen) => pedir(`${RUTA}/pendientes?almacen=${encodeURIComponent(almacen)}`)

/** Cierra los despachos de ese almacén en TKC. **No se puede deshacer.** `maximo`: solo los N más antiguos. */
export const cerrarDespachos = ({ almacen, maximo }) =>
  pedir(`${RUTA}/cerrar`, { method: 'POST', body: { almacen, ...(maximo ? { maximo } : {}) } })

/** El avance de un cierre en marcha, o su resultado. */
export const trabajoDespachos = (id) => pedir(`${RUTA}/trabajo?id=${encodeURIComponent(id)}`)

/** Para el cierre entre un despacho y el siguiente. */
export const cancelarDespachos = (id) => pedir(`${RUTA}/cancelar?id=${encodeURIComponent(id)}`, { method: 'POST', body: {} })
