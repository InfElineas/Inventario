/**
 * Qué hacer con la diferencia de un conteo: el análisis automático.
 *
 * Cómo se reparte la existencia en TKC:
 *
 *   · EF, la existencia física: TODO lo que hay físicamente. Es lo que se cuenta
 *     y contra lo que se compara el conteo. EF = A + T.
 *   · A, el almacén: la **reserva**. Lo que no está a la venta y se guarda por si
 *     una unidad sufre algún cambio y hay que reponerla.
 *   · T, la tienda: lo que está **a la venta**.
 *
 * Por eso la diferencia de un conteo es `conteo − EF`, y mover mercancía entre A
 * y T no la cambia: ni subir ni bajar de tienda arreglan un faltante o un
 * sobrante. Lo que arregla la diferencia es un ajuste —de disminución si falta,
 * de aumento si sobra—, y el ajuste opera sobre la **reserva** (A).
 *
 * De ahí sale cuándo conviene mover:
 *
 *   · FALTANTE. El ajuste de disminución resta de A. Si A cubre lo que falta, no
 *     hay que mover nada. Si no, las unidades que faltan por cubrir están
 *     contadas en la tienda, y hay que **bajarlas** a la reserva antes de ajustar;
 *     si no, el ajuste no tiene de dónde restar. Es la misma razón por la que una
 *     merma se baja de tienda antes de darla de baja.
 *   · SOBRANTE. El ajuste de aumento suma a A: lo que sobra entra en la reserva.
 *     Si la tienda está agotada, quizá convenga **subirlo** para que se pueda
 *     vender, pero eso es una decisión, no una necesidad.
 *
 * Lógica pura, sin red ni React.
 */

const entero = (n) => (Number.isFinite(n) ? Math.round(n) : NaN);

/**
 * @param {{ conteo: number, enAlmacen: number, enTienda: number, existencia?: number }} datos
 *   Lo contado, y A y T de TKC en este momento. `existencia` es la EF que dice TKC;
 *   sin ella, A + T.
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
 *   `condicional` es una recomendación que depende de una decisión —subir lo que
 *   sobra a la venta— y por eso se dice como posibilidad, no como orden.
 */
export function analizarConteo({ conteo, enAlmacen, enTienda, existencia }) {
  const C = entero(Number(conteo));
  const A = entero(Number(enAlmacen));
  const T = entero(Number(enTienda));
  if (![C, A, T].every(Number.isFinite) || C < 0 || A < 0 || T < 0) return null;

  const EF = Number.isFinite(Number(existencia)) && existencia !== null && existencia !== undefined
    ? entero(Number(existencia)) : A + T;
  const diferencia = C - EF;

  const base = {
    conteo: C, enAlmacen: A, enTienda: T, existencia: EF, diferencia,
    accion: 'ninguna', cantidad: 0, condicional: false, resumen: '', detalles: [],
  };

  if (diferencia === 0) {
    base.resumen = 'Sin diferencia';
    return base;
  }

  if (diferencia < 0) {
    const faltan = -diferencia;
    // Lo que la reserva no cubre. Nunca más de lo que hay en tienda: si faltan
    // menos unidades que EF, la cuenta no puede pedir más de T.
    const sinCubrir = Math.max(0, faltan - A);
    const bajar = Math.min(sinCubrir, T);

    if (bajar > 0) {
      base.accion = 'bajar';
      base.cantidad = bajar;
      base.resumen = `Faltan ${faltan}: hay que bajar ${bajar} de tienda`;
      base.detalles.push(
        `El ajuste de disminución resta de la reserva (A), que solo tiene ${A}. Las ${bajar} que faltan por cubrir `
        + 'están contadas en la tienda: bájalas a la reserva primero y ajusta después.',
        `Después, un ajuste de disminución de ${faltan} (EF ${EF}, contaste ${C}).`,
      );
    } else {
      base.resumen = `Faltan ${faltan}: no hay que mover nada`;
      base.detalles.push(
        `La reserva (A = ${A}) cubre lo que falta. Se resuelve con un ajuste de disminución de ${faltan}, `
        + 'que sale de ella; la tienda no se toca.',
      );
    }
    return base;
  }

  // Sobrante
  const sobran = diferencia;
  base.resumen = `Sobran ${sobran}: ajuste de aumento`;
  base.detalles.push(
    `Se resuelve con un ajuste de aumento de ${sobran} (EF ${EF}, contaste ${C}). Las unidades entran en la reserva (A).`,
  );
  if (T === 0) {
    base.accion = 'subir';
    base.cantidad = sobran;
    base.condicional = true;
    base.detalles.push(
      `La tienda está agotada: si esas ${sobran} deben venderse, súbelas a tienda después del ajuste.`,
    );
  }
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
        ? `Posible: ${analisis.resumen.toLowerCase()}. ${primero ?? ''}`.trim()
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
