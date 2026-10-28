/**
 * De quién es cada tarea: de inventario o de facturación.
 *
 * Las dos áreas trabajan sobre las mismas filas en momentos distintos, y hasta
 * ahora las veían todas juntas en la misma pantalla. A quien solo cuenta le
 * sobra lo que ya mandó, y a quien solo factura le sobra lo que todavía se
 * está contando; para un administrador, que lo ve todo, la lista era ruido.
 *
 * El estado dice a quién le toca. No se duplica la pantalla: la misma, con el
 * filtro puesto, se abre desde una sección o desde la otra.
 */

export const AMBITOS = ['inventario', 'facturacion']

/**
 * Estados en los que la fila está en manos de cada área.
 *
 * `en_auditoria` y `completado` no son de ninguna de las dos: ya pasaron por
 * aquí. Se ven eligiendo «Todos los estados».
 */
export const ESTADOS_AMBITO = {
  inventario:  ['en_curso', 'devuelto', 'reconteo_solicitado'],
  facturacion: ['pend_fact'],
}

export const ETIQUETA_AMBITO = {
  inventario: 'Tareas de inventario',
  facturacion: 'Tareas de facturación',
}

/**
 * ¿Entra esta fila en lo que se está mirando?
 *
 * @param {string} filtro `'ambito'` (lo que le toca al área), `'all'`, o un
 *        estado concreto.
 */
export function pasaFiltro(fila, filtro, ambito) {
  if (filtro === 'all') return true
  if (filtro === 'ambito') return (ESTADOS_AMBITO[ambito] ?? []).includes(fila?.estado_tarea)
  return fila?.estado_tarea === filtro
}
