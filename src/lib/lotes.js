/**
 * Lo que la pantalla de Vencimientos decide sobre un lote, sin pintar nada.
 *
 * Aparte de la página para poder probarlo: qué se ofrece en cada estado es la
 * regla que de verdad importa, y dentro de un menú no se ve.
 */

/** Los que siguen en el piso de tienda y no pueden quedarse ahí. */
const ESTADOS_A_BAJAR = ['vencido', 'critico'];

/**
 * Qué se puede hacer con un lote, según en qué estado esté y quién mira.
 *
 * - Un lote crítico o vencido se baja de tienda, y va el primero: cada día que
 *   sigue en el piso se puede vender o se sigue contando una existencia que
 *   no sirve.
 * - Lo vencido se manda a merma; el que no tiene fecha, también, por si quien
 *   lo tiene delante ve que ya pasó.
 * - Crítico, por vencer y sin fecha admiten intervención comercial.
 * - Corregir la fecha o anotar vale siempre.
 *
 * Mover mercancía es de quien puede hacerlo en la tienda; el resto de acciones
 * son de quien gestiona lotes. Quien no puede ninguna no ve menú.
 *
 * @returns {Array<{ clave: 'bajar'|'merma'|'ic'|'editar', nota?: string }>}
 */
export function accionesDeLote(lote, { puedeGestionar, puedeMoverTienda }) {
  const sinFecha = lote.estado_fv === 'sin_fecha';
  const acciones = [];

  // Sin código o sin unidades no hay nada que mandarle a TKC.
  if (puedeMoverTienda && ESTADOS_A_BAJAR.includes(lote.estado_fv)
    && lote.producto_codigo && Number(lote.cantidad) > 0) {
    acciones.push({ clave: 'bajar' });
  }

  if (!puedeGestionar) return acciones;

  if (lote.estado_fv === 'vencido' || sinFecha) {
    acciones.push({ clave: 'merma', nota: sinFecha ? 'si lo ves vencido' : null });
  }
  if (['critico', 'por_vencer'].includes(lote.estado_fv) || sinFecha) {
    acciones.push({ clave: 'ic', nota: sinFecha ? 'si le queda poco' : null });
  }
  acciones.push({ clave: 'editar' });
  return acciones;
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Lo que hay que decirle a quien abre un lote, según cómo esté.
 *
 * Antes tocar un lote abría siempre el formulario de la fecha, también en uno
 * crítico o vencido, donde lo que importa no es la fecha sino sacarlo del piso.
 * Esto es lo primero que se lee: qué pasa con este lote y qué se espera de
 * quien lo tiene delante.
 *
 * @returns {{ variant: 'danger'|'warning'|'info', texto: string } | null}
 */
export function avisoDeLote(lote) {
  const dias = lote.vigencia_dias;
  const unidades = plural(Number(lote.cantidad) || 0, 'unidad', 'unidades');
  switch (lote.estado_fv) {
    case 'vencido':
      return {
        variant: 'danger',
        texto: `Venció hace ${plural(Math.abs(dias ?? 0), 'día', 'días')} y quedan ${unidades}. `
          + 'Baja de tienda lo que siga en el piso y dale salida como merma.',
      };
    case 'critico':
      return {
        variant: 'danger',
        texto: `Vence en ${plural(dias ?? 0, 'día', 'días')}, ${unidades}. `
          + 'Bájalo de tienda lo antes posible y propón una rebaja si no se va a vender.',
      };
    case 'por_vencer':
      return {
        variant: 'warning',
        texto: `Vence en ${plural(dias ?? 0, 'día', 'días')}, ${unidades}. `
          + 'Todavía hay tiempo de rebajarlo o devolverlo antes de que pase a crítico.',
      };
    case 'sin_fecha':
      return {
        variant: 'info',
        texto: 'No tiene fecha de vencimiento, y sin ella no avisa ni se puede gestionar. '
          + 'Mira el envase y anótala.',
      };
    default:
      return null;
  }
}

/** Los lotes por vencer en una línea: cuántos, cuánto hay y cuándo vence el primero. */
export function resumenPorVencer(lotes) {
  const lista = lotes.filter((l) => l.estado_fv === 'por_vencer');
  if (lista.length === 0) return null;

  const primero = lista
    .filter((l) => l.vigencia_dias != null)
    .sort((a, b) => a.vigencia_dias - b.vigencia_dias)[0];

  return {
    lotes: lista.length,
    unidades: lista.reduce((s, l) => s + (Number(l.cantidad) || 0), 0),
    valor: lista.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precio_costo) || 0), 0),
    primero: primero ? { fecha: primero.fecha_vencimiento, dias: primero.vigencia_dias } : null,
  };
}

const ESTADO_TEXTO = {
  vencido: 'Vencido', critico: 'Crítico', por_vencer: 'Por vencer',
  vigente: 'Vigente', sin_fecha: 'Sin fecha',
};

/**
 * Una celda de CSV.
 *
 * Los textos que empiezan por `=`, `+`, `-` o `@` los toma Excel por una
 * fórmula: un nombre de producto viene de fuera y no se puede fiar. Se les
 * pone un apóstrofo delante. Los números van tal cual, que los negativos
 * (días que lleva vencido) son datos y no fórmulas.
 */
function celdaCsv(valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number') return String(valor);
  let t = String(valor);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/**
 * El reporte de lotes, en CSV. Sin el BOM: lo pone quien lo descarga.
 *
 * Lleva el costo y el valor en riesgo porque es lo que se enseña a quien
 * decide si se rebaja, se devuelve o se da por perdido.
 */
export function lotesACsv(lotes) {
  const cabecera = [
    'Almacén', 'Código', 'Producto', 'Suministrador', 'Lote', 'Temperatura',
    'Vence', 'Días', 'Estado', 'Cantidad', 'Costo unitario', 'Valor en riesgo', 'Nota de revisión',
  ];
  const filas = lotes.map((l) => {
    const costo = Number(l.precio_costo) || 0;
    return [
      l.almacen_nombre || l.almacen_num,
      l.producto_codigo,
      l.producto_nombre,
      l.suministrador,
      l.no_lote,
      l.temperatura === 'chilled' ? 'Frío' : 'Ambiente',
      l.fecha_vencimiento,
      l.vigencia_dias,
      ESTADO_TEXTO[l.estado_fv] ?? l.estado_fv,
      Number(l.cantidad) || 0,
      costo.toFixed(2),
      ((Number(l.cantidad) || 0) * costo).toFixed(2),
      l.nota_revision,
    ].map(celdaCsv).join(',');
  });
  return [cabecera.map(celdaCsv).join(','), ...filas].join('\n');
}
