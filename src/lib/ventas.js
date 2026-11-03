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
