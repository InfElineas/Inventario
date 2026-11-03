import { ESTADO_POR_RESULTADO } from '@/lib/ajusteFact';

/**
 * Los conteos que esperan a facturación (`pend_fact`) y lo que se hace con
 * ellos desde las pantallas de ajustes. Lógica pura, sin red ni React.
 *
 * Un conteo con diferencia se resuelve de una de tres maneras, y cada una tiene
 * su pantalla:
 *
 *   · sobrante  → ajuste de AUMENTO
 *   · faltante  → ajuste de DISMINUCIÓN
 *   · intercambio (un producto vendido por otro: uno sale faltante y el otro
 *     sobrante por la misma cantidad) → PROCESAMIENTO del uno al otro
 */

/** La clasificación que obliga a declarar el par. Ver SelectorIntercambio. */
export const CLASIF_INTERCAMBIO = 'Intercambio de Producto';

export const esIntercambio = (c) => Boolean(c?.intercambio_id) || c?.clasif_ajuste === CLASIF_INTERCAMBIO;

/** Una clave por producto y almacén: dos conteos del mismo producto son el mismo caso. */
const claveDe = (c) => `${c.almacen_num}|${c.producto_id ?? c.producto_codigo}`;

const mas = (a, b) => {
  const fa = a.fecha_inv ?? '';
  const fb = b.fecha_inv ?? '';
  if (fa !== fb) return fa > fb;
  return (a.created_date ?? '') > (b.created_date ?? '');
};

/**
 * Solo el conteo más reciente de cada producto cuenta; los anteriores se
 * midieron contra otra existencia y aplicarles un ajuste además sería mover dos
 * veces la misma mercancía.
 *
 * @returns {{ vigentes: object[], anteriores: Map<string, object[]> }}
 *   `anteriores` por clave de producto, para poder cerrarlos sin ajuste.
 */
export function ultimoPorProducto(conteos) {
  const ultimo = new Map();
  for (const c of conteos) {
    const k = claveDe(c);
    const previo = ultimo.get(k);
    if (!previo || mas(c, previo)) ultimo.set(k, c);
  }
  const anteriores = new Map();
  for (const c of conteos) {
    const k = claveDe(c);
    if (ultimo.get(k) !== c) anteriores.set(k, [...(anteriores.get(k) ?? []), c]);
  }
  return { vigentes: [...ultimo.values()], anteriores };
}

/** Los anteriores del producto de un conteo vigente. */
export const anterioresDe = (mapa, conteo) => mapa.get(claveDe(conteo)) ?? [];

/** Lo que se puede ajustar: con código y con diferencia. */
export const esAjustable = (c) => Boolean(c?.producto_codigo) && Math.abs(Number(c?.diferencia) || 0) > 0;

/** `CODIGO*CANTIDAD`, una línea por producto: el formato que lee `parseLineas`. La cantidad va en valor absoluto. */
export function lineasDeConteos(conteos) {
  return conteos
    .filter(esAjustable)
    .map((c) => `${c.producto_codigo}*${Math.abs(Number(c.diferencia))}`)
    .join('\n');
}

/**
 * Los intercambios, emparejados.
 *
 * Cada mitad apunta a la otra con `intercambio_id`. Un par existe cuando están
 * las dos entre lo pendiente; una mitad sin la otra (porque ya se procesó, o
 * porque se borró) va aparte, y no se propone nada con ella: mover mercancía
 * de un producto a otro sin saber cuál es el otro es adivinar.
 *
 * El origen es el FALTANTE —el que el sistema cree que tiene y no está— y el
 * destino el SOBRANTE —el que está y el sistema no sabe—: procesar lleva la
 * existencia de uno al otro. La cantidad es la menor de las dos diferencias.
 *
 * @returns {{ pares: Array<{ origen: object, destino: object, cantidad: number }>, sueltos: object[] }}
 */
export function paresDeIntercambio(conteos) {
  const porId = new Map(conteos.map((c) => [c.id, c]));
  const usados = new Set();
  const pares = [];

  for (const c of conteos) {
    if (usados.has(c.id)) continue;
    const otro = porId.get(c.intercambio_id)
      ?? conteos.find((x) => x.intercambio_id === c.id);
    if (!otro || usados.has(otro.id) || otro.id === c.id) continue;

    const falta = Number(c.diferencia) < 0 ? c : otro;
    const sobra = falta === c ? otro : c;
    // Dos faltantes o dos sobrantes no son un intercambio: no se emparejan.
    if (!(Number(falta.diferencia) < 0 && Number(sobra.diferencia) > 0)) continue;

    usados.add(c.id);
    usados.add(otro.id);
    pares.push({
      origen: falta,
      destino: sobra,
      cantidad: Math.min(Math.abs(Number(falta.diferencia)), Number(sobra.diferencia)),
    });
  }
  return { pares, sueltos: conteos.filter((c) => !usados.has(c.id)) };
}

/** `ORIGEN>DESTINO*CANTIDAD`, una línea por par: el formato que acepta procesar. */
export function lineasDePares(pares) {
  return pares
    .filter((p) => p.origen.producto_codigo && p.destino.producto_codigo && p.cantidad > 0)
    .map((p) => `${p.origen.producto_codigo}>${p.destino.producto_codigo}*${p.cantidad}`)
    .join('\n');
}

/**
 * Lo que se escribe en un conteo cuando facturación lo da por procesado: el
 * documento de TKC que lo resolvió, cómo, quién y cuándo, y pasa a auditoría.
 *
 * Es lo que antes se tecleaba a mano en «Conteos por facturar» después de haber
 * hecho el ajuste en otra pantalla.
 */
export function registroFact({ conteo, documento, estado, notas, user, ahora = new Date() }) {
  return {
    fact_no_factura: documento ?? '',
    fact_clasif: conteo.clasif_ajuste ?? '',
    fact_estado: estado ?? ESTADO_POR_RESULTADO[conteo.resultado] ?? '',
    fact_notas: notas ?? '',
    fact_especialista_id: user?.email,
    fact_especialista_nombre: user?.full_name,
    fact_fecha: ahora.toISOString().slice(0, 10),
    estado_tarea: 'en_auditoria',
  };
}

/** Lo que se escribe en un conteo anterior que se cierra sin ajuste porque lo reemplaza otro. */
export function cierreSinAjuste({ anterior, vigente, user, ahora = new Date() }) {
  return {
    estado_tarea: 'completado',
    fact_estado: 'No Procesar x Fact',
    fact_especialista_id: user?.email,
    fact_especialista_nombre: user?.full_name,
    fact_fecha: ahora.toISOString().slice(0, 10),
    fact_notas: `Cerrado sin ajuste: lo reemplaza el conteo del ${vigente.fecha_inv ?? 'más reciente'}. `
      + 'Su diferencia se midió contra otra existencia.'
      + (anterior.fact_notas ? ` — ${anterior.fact_notas}` : ''),
  };
}
