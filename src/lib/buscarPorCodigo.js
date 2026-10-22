import { base44 } from '@/api/base44Client'

/**
 * Productos que comparten un código de barras.
 *
 * El código NO identifica un producto. Un mismo código de barras aparece en
 * varios anuncios de TKC —distinto nombre, distinto suministrador, distinta
 * existencia— y la clave real es `id_tienda`; de hecho dar por buena esa
 * confusión es lo que destruía 456 anuncios y 516 unidades en el sync (ver
 * supabase/fix_clave_producto.sql).
 *
 * Por eso esto devuelve una LISTA. Hasta ahora los tres escáneres del sistema
 * pedían una sola fila y se quedaban con ella, de modo que al escanear un
 * código compartido el producto lo elegía el orden de la base, en silencio.
 *
 * @param {string} codigo  lo que leyó el escáner o tecleó el usuario
 * @param {string} almacen almacén activo; vacío busca en todos
 * @returns {Promise<{ codigo: string, enAlmacen: object[], enOtros: object[] }>}
 *   `enAlmacen` son las coincidencias del almacén activo. Solo si no hay
 *   ninguna se busca en el resto, para poder decir "existe, pero no aquí" en
 *   lugar de "no existe".
 */
export async function buscarPorCodigo(codigo, almacen) {
  const limpio = String(codigo ?? '').trim()
  if (!limpio) return { codigo: '', enAlmacen: [], enOtros: [] }

  const condiciones = { codigo_producto: limpio, activo: true }

  const enAlmacen = await base44.entities.Producto.filter(
    almacen ? { ...condiciones, almacen_num: almacen } : condiciones,
    'nombre',
  )
  if (enAlmacen.length > 0) return { codigo: limpio, enAlmacen, enOtros: [] }

  // Sin coincidencias aquí: mirar el catálogo entero solo para el mensaje.
  const enOtros = almacen
    ? await base44.entities.Producto.filter(condiciones, 'nombre')
    : []

  return { codigo: limpio, enAlmacen: [], enOtros }
}

/**
 * Mensaje para cuando la búsqueda no deja ningún producto que elegir.
 * Devuelve null si sí lo hay.
 */
export function avisoSinCoincidencia({ codigo, enAlmacen, enOtros }, almacen) {
  if (enAlmacen.length > 0) return null

  if (enOtros.length > 0) {
    const donde = [...new Set(enOtros.map((p) => p.almacen_num).filter(Boolean))]
    const nombres = enOtros.length === 1 ? `"${enOtros[0].nombre}"` : `${enOtros.length} productos`
    return `${nombres} con el código ${codigo} ${enOtros.length === 1 ? 'existe' : 'existen'} en el catálogo` +
      (donde.length ? ` (almacén ${donde.join(', ')})` : '') +
      `, pero no en el almacén ${almacen}.`
  }

  return `No se encontró ningún producto con el código ${codigo}.`
}
