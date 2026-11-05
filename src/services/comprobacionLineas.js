import { base44 } from '@/api/base44Client';
import { fetchExistenciaTkc } from '@/services/tkcService';
import { MAX_COMPROBAR } from '@/lib/existenciaLineas';

/**
 * La existencia de TKC de cada línea, ahora mismo: física, en almacén y en
 * tienda. Es lo que comprueba un ajuste de disminución o una transferencia antes
 * de montarse (ver `lib/existenciaLineas.js`).
 *
 * Cada línea es el catálogo (para el id de tienda) y una consulta al submayor,
 * de a unas pocas a la vez: TKC limita las peticiones por cuenta. Una línea que
 * no se puede comprobar no rompe las demás: sale sin dato y con su motivo.
 *
 * @param {{ almacen: string, lines: Array<{ code: string, quantity: number }> }} p
 * @param {number} [concurrencia]
 * @returns {Promise<Array<{ code: string, quantity: number,
 *   existencia: null | { fisica: number, enAlmacen: number, enTienda: number }, motivoSinDato?: string }>>}
 */
export async function comprobarLineas({ almacen, lines }, concurrencia = 4) {
  const resultados = new Array(lines.length);
  let siguiente = 0;

  async function una(i) {
    const { code, quantity } = lines[i];
    if (i >= MAX_COMPROBAR) {
      return { code, quantity, existencia: null, motivoSinDato: `Son demasiadas líneas: solo se comprueban las primeras ${MAX_COMPROBAR}.` };
    }
    try {
      const productos = await base44.entities.Producto.filter(
        { codigo_producto: code, almacen_num: almacen, activo: true }, '-updated_date', 5,
      );
      // El que tenga ID de anuncio; si ninguno lo tiene (insumos), se busca por código.
      const producto = (productos ?? []).find((p) => p.id_tienda) ?? (productos ?? [])[0] ?? null;
      if (!producto) {
        return { code, quantity, existencia: null, motivoSinDato: 'No está en el catálogo de este almacén.' };
      }
      const submayor = await fetchExistenciaTkc({ almacen, idTienda: producto.id_tienda, codigo: code });
      if (!submayor?.existencia) {
        return { code, quantity, existencia: null, motivoSinDato: 'El submayor de TKC no tiene este producto.' };
      }
      return { code, quantity, existencia: submayor.existencia, nombre: producto.nombre };
    } catch (e) {
      return { code, quantity, existencia: null, motivoSinDato: `No se pudo consultar TKC: ${e.message}` };
    }
  }

  async function trabajador() {
    while (siguiente < lines.length) {
      const i = siguiente++;
      resultados[i] = await una(i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrencia, lines.length) }, trabajador));
  return resultados;
}
