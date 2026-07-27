/**
 * Catálogo de almacenes de TKC (copiado de `elineas-vd` / `elineas-fetch-from-tkc`).
 *
 * - `key`    : clave corta interna, p. ej. "615", "Latino". Es el mismo string que
 *              guarda `useAlmacen()` en localStorage y el que aparece en
 *              `user.almacenes_config`, así que las restricciones por usuario
 *              siguen funcionando sin cambios.
 * - `value`  : el id que TKC espera en `almacenes[]` del payload.
 * - `nombre` : etiqueta visible.
 *
 * Sustituye a `fetchAlmacenes()` de syncService, que deducía la lista paginando
 * hasta 500k filas de `invGlobal` solo para recoger los "No. Almacén" únicos.
 */

export const WAREHOUSES = [
  { key: '615',    value: '184',  nombre: 'TKC SUB 615' },
  { key: '676',    value: '188',  nombre: 'TKC SUB 676' },
  { key: '480',    value: '223',  nombre: 'TKC SUB 480' },
  { key: '581',    value: '224',  nombre: 'TKC SUB 581' },
  { key: '607',    value: '225',  nombre: 'TKC SUB 607' },
  { key: '610',    value: '226',  nombre: 'TKC SUB 610' },
  { key: '600',    value: '227',  nombre: 'TKC SUB 600' },
  { key: '734',    value: '276',  nombre: 'TKC SUB 734' },
  { key: '789',    value: '351',  nombre: 'TKC SUB 789' },
  { key: '926',    value: '629',  nombre: 'TKC SUB 926' },
  { key: '1000',   value: '708',  nombre: 'TKC SUB 1000' },
  { key: '1003',   value: '722',  nombre: 'TKC SUB 1003' },
  { key: '1005',   value: '726',  nombre: 'TKC SUB 1005' },
  { key: '1053',   value: '797',  nombre: 'TKC SUB 1053' },
  { key: 'Latino', value: '849',  nombre: 'TKC SUB Latino' },
  { key: '1201',   value: '1012', nombre: 'TKC SUB 1201' },
  { key: '1330',   value: '1152', nombre: 'TKC SUB 1330' },
  { key: 'Insumo', value: '1288', nombre: 'TKC SUB Insumo' },
  { key: '593',    value: '127',  nombre: 'TKC SUB 593 UP' },
  { key: '1476',   value: '1366', nombre: 'TKC SUB 1476' },
  { key: '1652',   value: '1572', nombre: 'TKC SUB 1652' },
  { key: '1882',   value: '1825', nombre: 'TKC SUB 1882' },
  { key: '1883',   value: '1826', nombre: 'TKC SUB 1883' },
  { key: '1964',   value: '1940', nombre: 'TKC SUB 1964' },
  { key: '1965',   value: '1941', nombre: 'TKC SUB 1965' },
  { key: '1966',   value: '1942', nombre: 'TKC SUB 1966' },
  { key: '1967',   value: '1943', nombre: 'TKC SUB 1967' },
  { key: '1968',   value: '1944', nombre: 'TKC SUB 1968' },
  { key: '1969',   value: '1945', nombre: 'TKC SUB 1969' },
  { key: '1970',   value: '1946', nombre: 'TKC SUB 1970' },
]

const BY_KEY = new Map(WAREHOUSES.map((w) => [w.key, w]))

/**
 * Traduce la clave de almacén de la app ("789") al id que espera TKC ("351").
 * Devuelve null si la clave no está en el catálogo — el llamador debe tratarlo
 * como "almacén desconocido" y no lanzar la petición: sin `almacenes[]` válido
 * TKC responde 0 filas sin error.
 */
export function keyToTkcValue(key) {
  return BY_KEY.get(String(key ?? '').trim())?.value ?? null
}

/** Nombre visible de un almacén por su clave. */
export function warehouseName(key) {
  return BY_KEY.get(String(key ?? '').trim())?.nombre ?? `Almacén ${key}`
}
