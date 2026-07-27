/**
 * Tests del mapa de existencias por almacén. El submayor está mockeado: lo que
 * se prueba es el recorrido en segundo plano, el caché y la degradación cuando
 * TKC falla a mitad — no la petición HTTP, que ya cubre `tkc.test.js`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchSubmayorPage = vi.fn()
vi.mock('@/services/tkc/submayor', () => ({ fetchSubmayorPage: (...a) => fetchSubmayorPage(...a) }))

const { getExistencias, resetExistenciasCache } = await import('@/services/tkc/existencias')

const CONFIG = { tkcBase: 'https://tkc.test', tkcUser: 'u', tkcPass: 'p' }
const ALM = '351'

/** Fila cruda del submayor. */
const row = (id, fisica, almacen, tienda) => ({
  idTienda: id, existencia_fisica: fisica, almacen, tienda,
})

/** Respuesta de una página, con el total del almacén completo. */
const page = (rows, total) => ({ data: rows, recordsTotal: total, recordsFiltered: total, draw: 1 })

/** Espera a que el recorrido en segundo plano termine (o se rinda). */
async function esperarListo() {
  for (let i = 0; i < 50; i++) {
    const { progreso } = await getExistencias(CONFIG, { almacen: ALM })
    if (progreso.listo) return progreso
    await new Promise(r => setTimeout(r, 5))
  }
  throw new Error('el mapa nunca quedó listo')
}

beforeEach(() => {
  resetExistenciasCache()
  fetchSubmayorPage.mockReset()
})

describe('getExistencias', () => {
  it('un almacén que cabe en una página queda listo de inmediato', async () => {
    fetchSubmayorPage.mockResolvedValueOnce(page([row(139494, 8621, 244, 8377), row(139600, 0, 0, 0)], 2))

    const { existencias, progreso } = await getExistencias(CONFIG, { almacen: ALM, ids: ['139494'] })

    expect(progreso).toMatchObject({ listo: true, total: 2, cargadas: 2, error: null })
    // Solo se devuelve lo pedido: una página de 50 filas no debe arrastrar 9 000 entradas.
    expect(existencias).toEqual({ '139494': { fisica: 8621, enAlmacen: 244, enTienda: 8377 } })
    expect(fetchSubmayorPage).toHaveBeenCalledTimes(1)
  })

  it('devuelve la primera página sin esperar al resto, y completa en segundo plano', async () => {
    // 1200 filas = primera página + 2 más que se piden por detrás.
    fetchSubmayorPage.mockImplementation((_c, { start }) =>
      Promise.resolve(page([row(1000 + start, start, 1, 2)], 1200))
    )

    const primera = await getExistencias(CONFIG, { almacen: ALM, ids: ['1000'] })
    expect(primera.progreso.listo).toBe(false)
    expect(primera.existencias['1000']).toEqual({ fisica: 0, enAlmacen: 1, enTienda: 2 })

    const progreso = await esperarListo()
    expect(progreso.listo).toBe(true)
    expect(progreso.error).toBeNull()
    // start=0, 500 y 1000.
    expect(fetchSubmayorPage.mock.calls.map(c => c[1].start).sort((a, b) => a - b)).toEqual([0, 500, 1000])

    const { existencias } = await getExistencias(CONFIG, { almacen: ALM, ids: ['1500', '2000'] })
    expect(Object.keys(existencias)).toEqual(['1500', '2000'])
  })

  it('reutiliza el mapa cacheado: la segunda llamada no vuelve a TKC', async () => {
    fetchSubmayorPage.mockResolvedValueOnce(page([row(1, 5, 2, 3)], 1))

    await getExistencias(CONFIG, { almacen: ALM, ids: ['1'] })
    await getExistencias(CONFIG, { almacen: ALM, ids: ['1'] })

    expect(fetchSubmayorPage).toHaveBeenCalledTimes(1)
  })

  it('refrescar ignora el caché y reconstruye', async () => {
    fetchSubmayorPage
      .mockResolvedValueOnce(page([row(1, 5, 2, 3)], 1))
      .mockResolvedValueOnce(page([row(1, 9, 4, 5)], 1))

    await getExistencias(CONFIG, { almacen: ALM, ids: ['1'] })
    const { existencias } = await getExistencias(CONFIG, { almacen: ALM, ids: ['1'], refrescar: true })

    expect(existencias['1']).toEqual({ fisica: 9, enAlmacen: 4, enTienda: 5 })
    expect(fetchSubmayorPage).toHaveBeenCalledTimes(2)
  })

  it('si falla una página posterior, deja el mapa parcial en vez de perderlo todo', async () => {
    fetchSubmayorPage.mockImplementation((_c, { start }) =>
      start === 0
        ? Promise.resolve(page([row(1, 5, 2, 3)], 1000))
        : Promise.reject(new Error('TKC submayor HTTP 500'))
    )

    await getExistencias(CONFIG, { almacen: ALM, ids: ['1'] })
    const progreso = await esperarListo()

    // listo=true aunque haya fallado: el cliente debe dejar de sondear.
    expect(progreso.listo).toBe(true)
    expect(progreso.error).toContain('HTTP 500')
    const { existencias } = await getExistencias(CONFIG, { almacen: ALM, ids: ['1'] })
    expect(existencias['1']).toEqual({ fisica: 5, enAlmacen: 2, enTienda: 3 })
  })

  it('un error en la primera página sí se propaga (no hay nada que servir)', async () => {
    fetchSubmayorPage.mockRejectedValueOnce(new Error('TKC submayor HTTP 502'))

    await expect(getExistencias(CONFIG, { almacen: ALM, ids: ['1'] })).rejects.toThrow('HTTP 502')
  })

  it('normaliza los números de TKC y omite los ids que no existen', async () => {
    fetchSubmayorPage.mockResolvedValueOnce(
      page([{ idTienda: '7', existencia_fisica: '1,234', almacen: '<b>34</b>', tienda: '' }], 1)
    )

    const { existencias } = await getExistencias(CONFIG, { almacen: ALM, ids: ['7', '404'] })

    expect(existencias['7']).toEqual({ fisica: 1234, enAlmacen: 34, enTienda: 0 })
    expect(existencias['404']).toBeUndefined()
  })

  it('sin ids devuelve el mapa entero', async () => {
    fetchSubmayorPage.mockResolvedValueOnce(page([row(1, 1, 1, 0), row(2, 2, 2, 0)], 2))

    const { existencias } = await getExistencias(CONFIG, { almacen: ALM })

    expect(Object.keys(existencias).sort()).toEqual(['1', '2'])
  })
})
