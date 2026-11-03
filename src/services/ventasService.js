/**
 * Lo vendido en un almacén entre dos fechas. Ver src/server/ventasApi.js.
 *
 * @returns {Promise<{
 *   total: { cantidad: number, ordenes: number, importe: number, costo: number },
 *   productos: Array<{ codigo: string, nombre: string, cantidad: number, ordenes: number, importe: number, costo: number }>,
 *   recortado: boolean,
 *   dias: Array<{ fecha: string, cantidad: number, ordenes: number, importe: number, costo: number }>,
 *   cobertura: { diasPedidos: number, diasConDatos: number, primera: string|null, ultima: string|null },
 * }>}
 */
export async function fetchResumenVentas({ almacen, desde, hasta, codigo }) {
  const params = new URLSearchParams({ almacen, desde, hasta })
  // Un solo producto, si se pide.
  if (codigo) params.set('codigo', codigo)
  const res = await fetch(`/api/ventas/resumen?${params}`, { credentials: 'include' })
  const datos = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(datos?.error?.message ?? `Error ${res.status} al consultar las ventas`)
  }
  return datos
}

/**
 * Lo vendido en cada mes de un almacén, para el gráfico del panel. Ver
 * `ventasMensuales` en src/server/ventasApi.js.
 *
 * Quien no puede ver las ventas recibe un 403 y el error lleva `status`, para
 * que el panel se limite a no enseñar el gráfico en vez de mostrar un fallo.
 *
 * @returns {Promise<{ almacen: string, ultima: string|null,
 *   meses: Array<{ mes: string, cantidad: number, importe: number, ordenes: number, dias: number }> }>}
 */
export async function fetchVentasMensuales({ almacen, meses = 12 }) {
  const params = new URLSearchParams({ almacen, meses: String(meses) })
  const res = await fetch(`/api/ventas/mensual?${params}`, { credentials: 'include' })
  const datos = await res.json().catch(() => null)
  if (!res.ok) {
    const error = new Error(datos?.error?.message ?? `Error ${res.status} al consultar las ventas`)
    error.status = res.status
    throw error
  }
  return datos
}
