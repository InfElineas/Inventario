/**
 * Los filtros del historial de conteos de una persona, como los entiende la API
 * de datos (igualdades, y rangos con `gte`/`lte`). Lógica pura.
 *
 * Lo vacío no se manda, y el estado «todos» tampoco: un filtro puesto sin querer
 * esconde conteos que sí existen.
 *
 * @param {{ persona: string, almacen?: string, estado?: string, desde?: string, hasta?: string }} f
 */
export function condicionesDeHistorial({ persona, almacen, estado, desde, hasta }) {
  const c = { especialista_id: persona };
  if (almacen) c.almacen_num = almacen;
  if (estado && estado !== 'all') c.estado_tarea = estado;
  if (desde || hasta) {
    c.fecha_inv = {};
    if (desde) c.fecha_inv.gte = desde;
    if (hasta) c.fecha_inv.lte = hasta;
  }
  return c;
}
