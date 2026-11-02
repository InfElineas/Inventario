import { tieneRol } from '@/lib/roles';

/**
 * Quién puede eliminar un conteo.
 *
 * El superadministrador, siempre; el administrador, mientras no esté
 * completado; y el inventarista solo su borrador sin enviar. Lo comprueba
 * también el servidor: esto decide qué se le enseña, no qué se le permite.
 */
export function puedeEliminarConteo(inv, user) {
  return tieneRol(user, ['superadmin'])
    || (tieneRol(user, ['administrador']) && inv.estado_tarea !== 'completado')
    || (tieneRol(user, ['inv']) && inv.estado_tarea === 'en_curso' && inv.especialista_id === user?.email);
}

/**
 * Quién puede eliminar una merma: el superadministrador, o el inventarista que
 * la registró mientras nadie del flujo la haya tocado (ni facturación ni
 * auditoría). Lo comprueba también el servidor.
 */
export function puedeEliminarMerma(merma, user) {
  return tieneRol(user, ['superadmin'])
    || (tieneRol(user, ['inv'])
      && merma.especialista_id === user?.email
      && ['pend_fact', 'en_auditoria'].includes(merma.estado_tarea)
      && !merma.fact_no_factura
      && !merma.auditor_id);
}

/**
 * Las fechas de vencimiento que un conteo trae, como correcciones de lote.
 *
 * Los lotes vienen del informe central, donde no se puede escribir; la fecha
 * que inventario lee del envase se anota en `lote_revisiones` y se superpone
 * al leer, y con ella se recalcula el estado de vigencia. Un conteo que dice
 * «este lote vence el X» es esa misma lectura, así que se registra igual.
 *
 * Solo las líneas con fecha: una línea sin ella no corrige nada, y
 * escribirla vacía pisaría una fecha buena con la ausencia de fecha.
 */
export function revisionesDeConteo(conteo, user) {
  return (conteo.detalles ?? [])
    .filter((d) => d.fecha_vencimiento)
    .map((d) => ({
      almacen_num: conteo.almacen_num,
      producto_codigo: conteo.producto_codigo,
      no_lote: String(d.no_lote ?? '').trim(),
      fecha_vencimiento: d.fecha_vencimiento,
      nota: `Registrada en el conteo del ${conteo.fecha_inv ?? '—'}`,
      revisado_por: user?.email,
    }));
}
