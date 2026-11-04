import { esIntercambio } from '@/lib/conteosFact';

/**
 * Lo que el panel cuenta de las tareas: qué espera a facturación, qué te
 * devolvieron. Lógica pura, sin red ni React.
 */

/** «Buenos días», «Buenas tardes» o «Buenas noches» según la hora. */
export function saludoDe(fecha = new Date()) {
  const h = fecha.getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** La primera palabra de un nombre completo; vacío si no hay. */
export const primerNombre = (nombre) => String(nombre ?? '').trim().split(/\s+/)[0] ?? '';

const de = (filas, estado) => filas.filter((f) => f.estado_tarea === estado);

/**
 * Lo que espera a facturación, repartido por la pantalla que lo resuelve: un
 * sobrante es un ajuste de aumento, un faltante uno de disminución y un
 * intercambio un procesamiento. Las mermas ya bajadas de tienda tienen la suya.
 *
 * @returns {{ aumento: number, disminucion: number, procesamiento: number,
 *             mermas: number, total: number, enAuditoria: number, enCurso: number }}
 */
export function resumenFacturacion(inventarios, mermas) {
  const pendientes = de(inventarios, 'pend_fact');
  const aumento = pendientes.filter((i) => !esIntercambio(i) && i.resultado === 'sobrante').length;
  const disminucion = pendientes.filter((i) => !esIntercambio(i) && i.resultado === 'faltante').length;
  const procesamiento = pendientes.filter(esIntercambio).length;
  const deMermas = de(mermas, 'pend_fact').length;
  return {
    aumento, disminucion, procesamiento, mermas: deMermas,
    total: aumento + disminucion + procesamiento + deMermas,
    enAuditoria: de(inventarios, 'en_auditoria').length + de(mermas, 'en_auditoria').length,
    enCurso: de(inventarios, 'en_curso').length,
  };
}

/**
 * Lo que te devolvieron para corregir, con el motivo si lo dieron.
 *
 * @returns {{ total: number, filas: Array<{ id: string, tipo: 'conteo'|'merma', nombre: string, nota: string, enlace: string }> }}
 */
export function devueltosDe(inventarios, mermas, limite = 4) {
  const filas = [
    ...de(inventarios, 'devuelto').map((i) => ({
      id: `i-${i.id}`, tipo: 'conteo', nombre: i.producto_nombre || i.producto_codigo || 'Conteo',
      nota: i.fact_notas || i.nota_auditor || '', enlace: '/inventario',
    })),
    ...de(mermas, 'devuelto').map((m) => ({
      id: `m-${m.id}`, tipo: 'merma', nombre: m.producto_nombre || m.producto_codigo || 'Merma',
      nota: m.fact_notas || m.nota_auditor || '', enlace: '/ajustes/disminucion?tab=mermas',
    })),
  ];
  return { total: filas.length, filas: filas.slice(0, limite) };
}
