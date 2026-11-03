/**
 * Qué son los movimientos del submayor de TKC, y de dónde viene una diferencia.
 *
 * El submayor (ver `services/tkc/historial.js`) guarda TODO lo que le pasa a la
 * existencia de un producto: despachos (ventas), ventas directas, ajustes,
 * transferencias, procesamientos… Cada movimiento trae un texto de documento
 * como «Salida - Despacho - 541493» o «Entrada - Ajuste Aumento - TKCE2026…».
 * Aquí se clasifica por ese texto y se resume, para contestar «¿de dónde sale
 * este faltante o sobrante?». Lógica pura, sin red ni React.
 *
 * Lo que no se reconoce cae en `otros` con su texto a la vista: mejor un cajón
 * honesto que adivinar.
 */

/**
 * Los tipos, en el orden en que se enseñan. `afectaEF` es si el movimiento
 * cambia la existencia física: subir y bajar de tienda solo la reparten entre
 * almacén y tienda, así que no explican ninguna diferencia.
 */
export const TIPOS_MOVIMIENTO = [
  { clave: 'venta',              etiqueta: 'Ventas (despachos)',        afectaEF: true },
  { clave: 'venta_directa',      etiqueta: 'Ventas directas',           afectaEF: true },
  { clave: 'ajuste_aumento',     etiqueta: 'Ajustes de aumento',        afectaEF: true },
  { clave: 'ajuste_disminucion', etiqueta: 'Ajustes de disminución',    afectaEF: true },
  { clave: 'transferencia',      etiqueta: 'Transferencias',            afectaEF: true },
  { clave: 'procesamiento',      etiqueta: 'Procesamientos',            afectaEF: true },
  { clave: 'recepcion',          etiqueta: 'Recepciones y compras',     afectaEF: true },
  { clave: 'merma',              etiqueta: 'Mermas',                    afectaEF: true },
  { clave: 'otros',              etiqueta: 'Otros',                     afectaEF: true },
  { clave: 'interno',            etiqueta: 'Subidas y bajadas de tienda', afectaEF: false },
];

const POR_CLAVE = Object.fromEntries(TIPOS_MOVIMIENTO.map((t) => [t.clave, t]));

/** Minúsculas y sin acentos, para comparar el texto sin depender de cómo lo escriba TKC. */
const plano = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * El tipo de un movimiento según el texto de su documento.
 * El orden de las reglas importa: «Venta Directa» antes que «Venta».
 */
const REGLAS = [
  ['interno',            /\b(subida|rebaja|subir|bajar)\b.*\btienda\b/],
  ['venta_directa',      /venta directa/],
  ['venta',              /despacho/],
  ['ajuste_aumento',     /ajuste( de)? aumento/],
  ['ajuste_disminucion', /ajuste( de)? disminucion/],
  ['transferencia',      /transferencia/],
  ['procesamiento',      /procesamiento|\bproceso\b/],
  ['recepcion',          /recepcion|compra|\bentrada de mercancia/],
  ['merma',              /merma/],
];

export function tipoDeMovimiento(documento) {
  const t = plano(documento);
  for (const [clave, re] of REGLAS) if (re.test(t)) return clave;
  return 'otros';
}

/** `AAAA-MM-DD` de la fecha que da TKC (`05/10/2026`); acepta también la ya ISO. `''` si no se entiende. */
export function fechaIso(texto) {
  const t = String(texto ?? '').trim();
  const dmy = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : '';
}

const cantidad = (n) => Math.abs(Number(n) || 0);

/**
 * Los movimientos con su tipo. `unidades` es lo que entra (+) o sale (−) de la
 * existencia física: una rebaja a tienda trae la salida en negativo en TKC, y
 * por eso va siempre en valor absoluto.
 */
export function clasificarMovimientos(movimientos) {
  return (movimientos ?? []).map((m) => {
    const tipo = tipoDeMovimiento(m.documento);
    return {
      ...m,
      tipo,
      iso: fechaIso(m.fecha),
      unidades: cantidad(m.entrada) - cantidad(m.salida),
    };
  });
}

/** Los movimientos desde un día (incluido). Sin día, todos. */
export const desdeFecha = (clasificados, iso) => (iso
  ? clasificados.filter((m) => m.iso && m.iso >= iso)
  : clasificados);

/** Cuánto cambió la existencia física con estos movimientos. Subir y bajar de tienda no cuentan. */
export const cambioDeExistencia = (clasificados) => clasificados
  .filter((m) => POR_CLAVE[m.tipo]?.afectaEF)
  .reduce((s, m) => s + m.unidades, 0);

/**
 * Entradas y salidas por tipo, y por usuario. Lo que no cambia la existencia
 * (`interno`) va aparte en `internos`, para no mezclarlo en los totales.
 *
 * @returns {{ porTipo: Array<{ clave, etiqueta, movimientos, entradas, salidas, neto }>,
 *             porUsuario: Array<{ usuario, movimientos, entradas, salidas }>,
 *             entradas: number, salidas: number, neto: number,
 *             internos: number, otros: string[] }}
 */
export function resumirMovimientos(clasificados) {
  const porTipo = new Map();
  const porUsuario = new Map();
  let entradas = 0;
  let salidas = 0;
  let internos = 0;
  const otros = new Set();

  for (const m of clasificados) {
    if (!POR_CLAVE[m.tipo].afectaEF) { internos += 1; continue; }
    const e = cantidad(m.entrada);
    const s = cantidad(m.salida);
    entradas += e;
    salidas += s;
    if (m.tipo === 'otros' && m.documento) otros.add(m.documento);

    const t = porTipo.get(m.tipo) ?? { clave: m.tipo, etiqueta: POR_CLAVE[m.tipo].etiqueta, movimientos: 0, entradas: 0, salidas: 0, neto: 0 };
    t.movimientos += 1; t.entradas += e; t.salidas += s; t.neto += e - s;
    porTipo.set(m.tipo, t);

    const u = porUsuario.get(m.usuario || '—') ?? { usuario: m.usuario || '—', movimientos: 0, entradas: 0, salidas: 0 };
    u.movimientos += 1; u.entradas += e; u.salidas += s;
    porUsuario.set(m.usuario || '—', u);
  }

  const orden = TIPOS_MOVIMIENTO.map((t) => t.clave);
  return {
    porTipo: [...porTipo.values()].sort((a, b) => orden.indexOf(a.clave) - orden.indexOf(b.clave)),
    porUsuario: [...porUsuario.values()].sort((a, b) => (b.entradas + b.salidas) - (a.entradas + a.salidas)),
    entradas, salidas, neto: entradas - salidas, internos, otros: [...otros],
  };
}

/** Unidades que salieron como despacho (venta): lo que se compara con lo que dice la plataforma. */
export const unidadesDespachadas = (clasificados) => clasificados
  .filter((m) => m.tipo === 'venta')
  .reduce((s, m) => s + cantidad(m.salida), 0);

/** Los tipos que se enseñan en la pestaña de ventas directas y ajustes. */
export const TIPOS_DE_AJUSTE = ['venta_directa', 'ajuste_aumento', 'ajuste_disminucion'];

/**
 * Lo que dice la comparación de ventas: la plataforma vendió `vendido` unidades
 * y el submayor dio salida a `despachado` como despacho.
 *
 * @returns {{ diferencia: number, mensaje: string }}
 */
export function compararVentas({ vendido, despachado }) {
  const diferencia = despachado - vendido;
  if (diferencia === 0) return { diferencia, mensaje: 'Cuadran: lo que vendió la plataforma es lo que salió como despacho.' };
  return {
    diferencia,
    mensaje: diferencia > 0
      ? `Salieron ${diferencia} unidades más como despacho que lo que dice la plataforma: pueden ser despachos de otra fecha o devoluciones sin registrar.`
      : `La plataforma vendió ${-diferencia} unidades más de las que salieron como despacho: puede haber ventas sin despachar todavía.`,
  };
}
