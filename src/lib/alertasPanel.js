/**
 * Las alertas del panel: lo que está mal y no se arregla solo.
 *
 * Un producto con existencia y sin ID de tienda no se puede vender en línea ni se
 * ve en el submayor por ID: mientras nadie le cree el anuncio en TKC, es mercancía
 * parada. Pasa también con insumos que no se venden pero se cuentan, así que no
 * siempre es urgente; lo es cuando lleva mucho tiempo, o hay mucho, o vale mucho.
 *
 * Lógica pura, sin red ni React, para probarla sola.
 */

/** Desde cuántos días con existencia y sin ID es crítico. */
export const DIAS_CRITICO = 30;
/** Desde cuántas unidades en existencia es crítico aunque sea reciente. */
export const UNIDADES_CRITICO = 500;
/** Desde cuánto valor (existencia × costo) es crítico aunque sea reciente. */
export const VALOR_CRITICO = 500;

/** Un producto sin ID con existencia siempre merece atención; crítico según el caso. */
export function severidadSinId({ dias, ef, valor }) {
  if ((dias ?? 0) >= DIAS_CRITICO) return 'critica';
  if (Number(ef) >= UNIDADES_CRITICO) return 'critica';
  if (Number(valor) >= VALOR_CRITICO) return 'critica';
  return 'atencion';
}

/** `dd/MM/yyyy` de TKC → Date a las 12:00, o null. */
function fechaTkc(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(texto ?? '').trim());
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12) : null;
}

/**
 * Desde cuándo tiene existencia, según el submayor: la fecha de su PRIMERA entrada
 * en el periodo mirado. Es el único dato que lo dice —el catálogo no guarda cuándo
 * entró la mercancía—, y es un mínimo: si el producto lleva más tiempo que el
 * periodo mirado, sale más reciente de lo que es.
 *
 * @param {Array<{ fecha: string, entrada: number|null }>} movimientos
 * @param {Date} [ahora]
 * @returns {{ dias: number, desde: Date } | null} null si no hay entradas.
 */
export function primeraEntrada(movimientos, ahora = new Date()) {
  const fechas = (movimientos ?? [])
    .filter((m) => Number(m?.entrada) > 0)
    .map((m) => fechaTkc(m.fecha))
    .filter(Boolean)
    .sort((a, b) => a - b);
  if (fechas.length === 0) return null;
  const desde = fechas[0];
  return { dias: Math.max(0, Math.floor((ahora - desde) / 86400000)), desde };
}

/** «1 día», «12 días», «2 meses»: lo que se dice, no un número suelto. */
export function textoDias(dias) {
  if (!Number.isFinite(dias)) return '';
  if (dias < 1) return 'menos de un día';
  if (dias === 1) return '1 día';
  if (dias < 60) return `${dias} días`;
  return `${Math.round(dias / 30)} meses`;
}

const mayor = (a, b) => (a === 'critica' || b === 'critica' ? 'critica' : 'atencion');

/**
 * Las alertas que se enseñan, de la más grave a la menos.
 *
 * @param {object} datos
 * @param {{ total: number, unidades: number, filas: Array<{ severidad: string, dias: number|null }> }} datos.sinId
 *   Productos con existencia y sin ID de tienda del almacén.
 * @param {{ muertoConExistencia: number, desactivadoConExistencia: number, activoSinExistencia: number }} datos.casos
 *   Casos de anuncio abiertos, por tipo.
 * @returns {Array<{ clave: string, severidad: 'critica'|'atencion', titulo: string, detalle: string, cantidad: number, enlace: string }>}
 */
export function construirAlertas({ sinId, casos }) {
  const alertas = [];

  if (sinId?.total > 0) {
    const severidad = (sinId.filas ?? []).reduce((acc, f) => mayor(acc, f.severidad), 'atencion');
    const dias = Math.max(0, ...(sinId.filas ?? []).map((f) => f.dias ?? 0));
    alertas.push({
      clave: 'sin-id',
      severidad,
      titulo: sinId.total === 1
        ? '1 producto con existencia y sin ID de tienda'
        : `${sinId.total} productos con existencia y sin ID de tienda`,
      detalle: `${sinId.unidades.toLocaleString()} unidades que no se pueden vender en línea`
        + (dias > 0 ? ` · el que más lleva, ${textoDias(dias)}` : ''),
      cantidad: sinId.total,
      enlace: 'sin-id',
    });
  }

  const m = (casos?.muertoConExistencia ?? 0) + (casos?.desactivadoConExistencia ?? 0);
  if (m > 0) {
    alertas.push({
      clave: 'anuncio-desactivado',
      severidad: 'atencion',
      titulo: m === 1 ? '1 anuncio muerto o desactivado con existencia' : `${m} anuncios muertos o desactivados con existencia`,
      detalle: 'Hay mercancía en el almacén que no se puede comprar en línea',
      cantidad: m,
      enlace: '/anuncios',
    });
  }

  if ((casos?.activoSinExistencia ?? 0) > 0) {
    const n = casos.activoSinExistencia;
    alertas.push({
      clave: 'activo-sin-existencia',
      severidad: 'atencion',
      titulo: n === 1 ? '1 anuncio activo sin existencia' : `${n} anuncios activos sin existencia`,
      detalle: 'Se puede vender algo que no hay',
      cantidad: n,
      enlace: '/anuncios',
    });
  }

  const orden = { critica: 0, atencion: 1 };
  return alertas.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
}
