import { tieneRol } from '@/lib/roles';
import { celdaCsv } from '@/lib/lotes';

/**
 * Los casos de intervención comercial (IC): lo que inventario abre sobre un
 * lote por vencer para que comercial decida si se rebaja.
 */

/** Quién responde: comercial. Los administradores pasan por encima de todo. */
export const ROLES_RESPONDE_IC = ['ca', 'administrador', 'superadmin'];

/** Quién ve los casos de todos. El inventarista, solo los que él mandó. */
export const VISTA_GLOBAL_IC = ['ca', 'jefe_depto', 'auditor', 'administrador', 'superadmin'];

export const ESTADOS_IC = [
  { valor: 'pendiente', label: 'Pendientes' },
  { valor: 'aprobado', label: 'Aprobados' },
  { valor: 'rechazado', label: 'No proceden' },
];

const ESTADO_TEXTO = { pendiente: 'Pendiente', aprobado: 'Rebaja aprobada', rechazado: 'No procede' };

/** Solo un caso pendiente se responde, y solo lo responde comercial. */
export const puedeResponderIC = (caso, user) =>
  caso.estado_tarea === 'pendiente' && tieneRol(user, ROLES_RESPONDE_IC);

/**
 * Retirar un caso: el superadministrador siempre, y quien lo mandó mientras
 * nadie lo haya respondido —un envío equivocado se arregla sin pedir favores.
 * Lo comprueba también el servidor.
 */
export const puedeEliminarIC = (caso, user) =>
  tieneRol(user, ['superadmin'])
  || (tieneRol(user, ['inv'])
    && caso.estado_tarea === 'pendiente'
    && caso.especialista_inv_id === user?.email);

/**
 * Lo que se escribe al responder. Rechazar sin decir por qué deja a quien lo
 * mandó sin saber qué corregir, así que la nota es obligatoria al rechazar.
 *
 * @returns {{ cambios: object } | { error: string }}
 */
export function respuestaIC({ estado, nota, user, ahora = new Date() }) {
  const texto = String(nota ?? '').trim();
  if (!['aprobado', 'rechazado'].includes(estado)) return { error: 'Estado no válido' };
  if (estado === 'rechazado' && !texto) return { error: 'Di por qué no procede' };
  return {
    cambios: {
      estado_tarea: estado,
      notas_ic: texto,
      respondido_por: user?.email,
      fecha_respuesta: ahora.toISOString(),
    },
  };
}

/** Descuento propuesto sobre el precio actual, en %. `null` si no se puede calcular. */
export function descuentoIC(caso) {
  const actual = Number(caso.precio_actual);
  const propuesto = Number(caso.propuesta_precio_ic);
  if (!(actual > 0) || !Number.isFinite(propuesto) || !(propuesto > 0)) return null;
  return ((actual - propuesto) / actual) * 100;
}

/** El reporte de casos, en CSV. Sin el BOM: lo pone quien lo descarga. */
export function casosICaCsv(casos) {
  const cabecera = [
    'Almacén', 'Código', 'Producto', 'Lote', 'Cant. por vencer', 'Vence', 'Precio actual',
    'Precio propuesto', 'Descuento %', 'Estado', 'Enviado por', 'Fecha de envío',
    'Clasificación', 'Nota de inventario', 'Respuesta de comercial', 'Respondido por', 'Fecha de respuesta',
  ];
  const filas = casos.map((c) => {
    const d = descuentoIC(c);
    return [
      c.almacen_num, c.producto_codigo, c.producto_nombre, c.no_lote,
      c.cant_x_vencer == null ? '' : Number(c.cant_x_vencer),
      c.fecha_vencimiento?.slice(0, 10),
      c.precio_actual == null ? '' : Number(c.precio_actual).toFixed(2),
      c.propuesta_precio_ic == null ? '' : Number(c.propuesta_precio_ic).toFixed(2),
      d === null ? '' : d.toFixed(1),
      ESTADO_TEXTO[c.estado_tarea] ?? c.estado_tarea,
      c.especialista_inv_nombre || c.especialista_inv_id,
      c.fecha_deteccion?.slice(0, 10),
      c.clasif_inv, c.nota_inv, c.notas_ic,
      c.respondido_por, c.fecha_respuesta?.slice(0, 10),
    ].map(celdaCsv).join(',');
  });
  return [cabecera.map(celdaCsv).join(','), ...filas].join('\n');
}
