import { celdaCsv } from '@/lib/lotes';

/**
 * El resumen de ventas por período: lo que no es pintar.
 */

const aIso = (d) => d.toISOString().slice(0, 10);

/**
 * Los últimos treinta días terminados: hasta AYER.
 *
 * Hoy no: el informe se calcula una vez al día y el día en curso no está, así
 * que un período que lo incluya parece tener un día sin ventas.
 */
export function rangoPorDefecto(hoy = new Date()) {
  const ayer = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1));
  const inicio = new Date(ayer.getTime() - 29 * 86400000);
  return { desde: aIso(inicio), hasta: aIso(ayer) };
}

/** Días que abarca el período, contando los dos extremos. `null` si no son fechas. */
export function diasDelRango(desde, hasta) {
  const d = Date.parse(`${desde}T00:00:00Z`);
  const h = Date.parse(`${hasta}T00:00:00Z`);
  if (Number.isNaN(d) || Number.isNaN(h) || d > h) return null;
  return Math.round((h - d) / 86400000) + 1;
}

/** Margen sobre el importe, en %. `null` si no hay importe que dividir. */
export function margen(importe, costo) {
  return importe > 0 ? ((importe - costo) / importe) * 100 : null;
}

/** El reporte por producto, en CSV. Sin el BOM: lo pone quien lo descarga. */
export function ventasACsv(productos) {
  const cabecera = ['Código', 'Producto', 'Unidades', 'Órdenes', 'Importe', 'Costo', 'Margen %'];
  const filas = productos.map((p) => {
    const m = margen(p.importe, p.costo);
    return [
      p.codigo, p.nombre, p.cantidad, p.ordenes,
      p.importe.toFixed(2), p.costo.toFixed(2), m === null ? '' : m.toFixed(1),
    ].map(celdaCsv).join(',');
  });
  return [cabecera.map(celdaCsv).join(','), ...filas].join('\n');
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** `2026-10` → `oct`. Lo que no es un mes, tal cual. */
export function etiquetaMes(mes) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes ?? ''));
  return m ? MESES_CORTOS[Number(m[2]) - 1] ?? mes : String(mes ?? '');
}

/**
 * La serie mensual con todos los meses del rango, también los que no vendieron:
 * el servidor solo trae los que tienen datos, y un hueco en el eje engaña.
 * Acaba en el mes de `hoy`, que es el que está en curso.
 *
 * @param {Array<{ mes: string, cantidad: number, importe?: number, dias?: number }>} filas
 * @param {number} meses  Cuántos meses, contando el actual.
 * @returns {Array<{ mes: string, etiqueta: string, cantidad: number, importe: number, dias: number, enCurso: boolean }>}
 */
export function completarMeses(filas, meses, hoy = new Date()) {
  const porMes = new Map((filas ?? []).map((f) => [f.mes, f]));
  const salida = [];
  for (let i = meses - 1; i >= 0; i -= 1) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const f = porMes.get(mes);
    salida.push({
      mes, etiqueta: etiquetaMes(mes), enCurso: i === 0,
      cantidad: f?.cantidad ?? 0, importe: f?.importe ?? 0, dias: f?.dias ?? 0,
    });
  }
  return salida;
}

/**
 * Los productos que coinciden con lo escrito, por código o por nombre y sin
 * mirar mayúsculas ni acentos. Sin texto, los primeros: una lista de miles no se
 * pinta entera, se busca.
 *
 * @param {Array<{ codigo: string, nombre?: string }>} productos
 * @param {string} texto
 * @param {number} [limite]
 */
export function filtrarProductos(productos, texto, limite = 100) {
  const plano = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = plano(texto).trim();
  const lista = q
    ? (productos ?? []).filter((p) => plano(`${p.codigo} ${p.nombre}`).includes(q))
    : (productos ?? []);
  return lista.slice(0, limite);
}
