/**
 * Qué hacer con la diferencia de un conteo: el análisis automático.
 *
 * Cuando una persona cuenta un producto y sale una diferencia, hay dos
 * explicaciones muy distintas y se resuelven de manera distinta:
 *
 *   · La mercancía existe pero TKC la tiene en otro sitio —en la tienda y no en
 *     el almacén, o al revés—: se arregla MOVIÉNDOLA, subiendo o bajando de
 *     tienda. No es un ajuste.
 *   · La mercancía de verdad falta o sobra: se arregla con un ajuste de
 *     disminución o de aumento.
 *
 * Un número solo no distingue una de otra, pero TKC reparte su existencia entre
 * almacén (A) y tienda (T), y comparar el conteo con cada una sí lo hace.
 *
 * SUPUESTO QUE HAY QUE CONOCER: el conteo es el del **almacén**, no el de la
 * tienda. Se compara con A, no con la existencia total, para saber cuánto de lo
 * que hay en el almacén TKC lo tiene apuntado en la tienda. Si algún día se
 * cuenta también el piso de tienda, esta regla no vale tal cual.
 *
 * Lógica pura, sin red ni React.
 */

const entero = (n) => Number.isFinite(n) ? Math.round(n) : NaN;

/**
 * @param {{ conteo: number, enAlmacen: number, enTienda: number }} datos
 *   Lo contado, y A y T de TKC en este momento.
 * @returns {null | {
 *   conteo: number, enAlmacen: number, enTienda: number, existencia: number,
 *   diferencia: number,
 *   accion: 'bajar' | 'subir' | 'ninguna',
 *   cantidad: number,
 *   condicional: boolean,
 *   resumen: string,
 *   detalles: string[],
 * }}
 *   `null` si falta algún dato: sin A y T no se recomienda nada.
 *   `condicional` es una recomendación que depende de algo que el sistema no
 *   puede saber —«si esas unidades están en la tienda»— y por eso se dice como
 *   posibilidad, no como orden.
 */
export function analizarConteo({ conteo, enAlmacen, enTienda }) {
  const C = entero(Number(conteo));
  const A = entero(Number(enAlmacen));
  const T = entero(Number(enTienda));
  if (![C, A, T].every(Number.isFinite) || C < 0 || A < 0 || T < 0) return null;

  const existencia = A + T;
  const base = {
    conteo: C, enAlmacen: A, enTienda: T, existencia, diferencia: C - existencia,
    accion: 'ninguna', cantidad: 0, condicional: false, resumen: '', detalles: [],
  };

  // Lo que hay en el almacén de más o de menos respecto a lo que TKC dice que
  // hay EN EL ALMACÉN. No respecto a la existencia total.
  const enMasDelAlmacen = C - A;

  if (enMasDelAlmacen > 0) {
    const bajar = Math.min(enMasDelAlmacen, T);
    const sobrante = enMasDelAlmacen - bajar;

    if (bajar > 0) {
      base.accion = 'bajar';
      base.cantidad = bajar;
      base.resumen = `Bajar ${bajar} de tienda`;
      base.detalles.push(
        `Hay ${C} en el almacén y TKC dice ${A}: ${bajar} de las ${T} que TKC tiene en tienda están en realidad en el almacén.`,
      );
    } else {
      base.resumen = `Sobrante real de ${sobrante}`;
      base.detalles.push(`Hay ${C} en el almacén y TKC dice ${A}, y no hay nada en tienda que bajar.`);
    }
    if (sobrante > 0) {
      base.detalles.push(
        bajar > 0
          ? `Aun así quedan ${sobrante} de más sobre la existencia total (${existencia}): sobrante real, se resuelve con un ajuste de aumento.`
          : `Es un sobrante sobre la existencia total (${existencia}): se resuelve con un ajuste de aumento.`,
      );
    }
    return base;
  }

  if (enMasDelAlmacen === 0) {
    if (T > 0) {
      base.resumen = 'No hay faltante en el almacén';
      base.detalles.push(
        `El conteo coincide con lo que TKC tiene en el almacén (${A}). La diferencia con la existencia total `
        + `(${base.diferencia}) son las ${T} de la tienda, que no se contaron.`,
      );
    } else {
      base.resumen = 'Sin diferencia';
    }
    return base;
  }

  // Faltan unidades en el almacén.
  const faltan = A - C;
  base.accion = 'subir';
  base.cantidad = faltan;
  base.condicional = true;
  base.resumen = `Faltan ${faltan} en el almacén`;
  base.detalles.push(
    `Hay ${C} en el almacén y TKC dice ${A}. Si esas ${faltan} están en el piso de la tienda, súbelas en TKC; `
    + 'si no aparecen, es un faltante real y se resuelve con un ajuste de disminución.',
  );
  if (T > 0) base.detalles.push(`Las ${T} que TKC tiene en tienda no entran en este conteo.`);
  return base;
}

/**
 * Lo que el análisis propone para el diálogo de subir o bajar de tienda.
 *
 * Con la cantidad cuando el análisis recomienda ESE movimiento; y cuando no, solo
 * el motivo, para que quien lo abre sepa por qué no se le propone nada.
 *
 * @param {ReturnType<typeof analizarConteo>} analisis
 * @param {'subir'|'bajar'} movimiento
 * @returns {{ cantidad?: number, motivo: string } | null}
 */
export function sugerenciaDeAnalisis(analisis, movimiento) {
  if (!analisis) return null;
  const [primero] = analisis.detalles;

  if (analisis.accion === movimiento) {
    return {
      cantidad: analisis.cantidad,
      motivo: analisis.condicional
        ? `Posible: ${analisis.resumen.toLowerCase()}; solo si están en el piso de la tienda.`
        : `${analisis.resumen}. ${primero ?? ''}`.trim(),
    };
  }
  const verbo = movimiento === 'bajar' ? 'bajar' : 'subir';
  return { motivo: `El análisis del conteo no recomienda ${verbo}: ${analisis.resumen.toLowerCase()}.` };
}

/**
 * Lo contado en un conteo guardado. Los conteos antiguos pueden no traer
 * `conteo_real`; entonces sale de la existencia contra la que se midió y la
 * diferencia. `NaN` si no hay forma de saberlo (una merma, un lote).
 */
export function conteoDeRegistro(inv) {
  const real = Number(inv?.conteo_real);
  if (inv?.conteo_real !== null && inv?.conteo_real !== undefined && Number.isFinite(real)) return real;
  return Number(inv?.exist_fisica_tkc) + Number(inv?.diferencia);
}
