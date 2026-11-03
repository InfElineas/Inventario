import { celdaCsv } from '@/lib/lotes';
import { puedeConfirmar } from '@/lib/ajustes';

/**
 * Lo que no es pintar del historial de documentos de TKC: ajustes de aumento,
 * de disminución y ventas directas.
 *
 * La API de transferencias lista las tres cosas con la misma forma
 * (`{id, code, status, type, date, accountingDate, warehouse, amount}`, más
 * `client` en las ventas directas), y lo que cambia es qué se puede hacer con
 * cada fila.
 */

/**
 * Las salidas de TKC que se pueden mirar. Una venta directa es una salida con
 * otro `type`: la API las trae con `type=direct-sale` o `type=all`. Por defecto
 * solo los ajustes.
 */
export const TIPOS_SALIDA = [
  { valor: 'decrease', label: 'Ajustes de disminución' },
  { valor: 'direct-sale', label: 'Ventas directas' },
  { valor: 'all', label: 'Todas las salidas' },
];

export const ESTADOS_DOCUMENTO = [
  { valor: '', label: 'Todos los estados' },
  { valor: 'editada', label: 'Editada' },
  { valor: 'confirmada', label: 'Confirmada' },
];

/** `AAAA-MM-DD` de un día, en la hora del navegador. */
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Hace siete días hasta hoy: lo mismo que la API usa si no se le dice nada, pero a la vista. */
export function rangoPorDefecto(hoy = new Date()) {
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 7);
  return { desde: iso(inicio), hasta: iso(hoy) };
}

export const esVentaDirecta = (fila) => /venta directa/i.test(String(fila?.type ?? ''));

/**
 * Se confirma un documento «editada» y de un ajuste. Una venta directa es solo
 * lectura desde aquí: no la monta esta pantalla y confirmarla no es suyo.
 */
export const sePuedeConfirmar = (fila) => puedeConfirmar(fila?.status) && !esVentaDirecta(fila);

/**
 * Los filtros de la pantalla, como los entiende `listarAjustes`.
 *
 * `type` solo existe en las disminuciones; mandarlo a un aumento es ruido que
 * la API podría rechazar. Lo vacío no se manda.
 */
export function filtrosDeHistorial({ tipo, tipoSalida, desde, hasta, status, q }) {
  const f = {};
  if (desde) f.from = desde;
  if (hasta) f.to = hasta;
  if (status) f.status = status;
  if (q && q.trim()) f.q = q.trim();
  if (tipo === 'disminucion' && tipoSalida) f.type = tipoSalida;
  return f;
}

/** El historial, en CSV. Sin el BOM: lo pone quien lo descarga. */
export function historialACsv(filas) {
  const cabecera = ['Documento', 'Tipo', 'Estado', 'Fecha', 'Fecha contable', 'Almacén', 'Cliente', 'Monto'];
  const cuerpo = filas.map((f) => [
    f.code, f.type, f.status, f.date, f.accountingDate, f.warehouse, f.client, f.amount,
  ].map(celdaCsv).join(','));
  return [cabecera.map(celdaCsv).join(','), ...cuerpo].join('\n');
}
