/**
 * Tests del middleware compartido de la API de TKC (`src/server/tkcApi.js`).
 * `listInventory` / `fetchExistencia` / `getExistencias` van mockeados: aquí
 * solo se prueba el enrutado, la autenticación y los códigos de estado — la
 * lógica de cada uno ya está cubierta en sus propios tests.
 *
 * Es el mismo middleware que monta tanto `vite-plugin-tkc.js` (dev/preview)
 * como `server/index.js` (producción), así que probarlo aquí cubre ambos.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

const listInventory = vi.fn()
const fetchExistencia = vi.fn()
const getExistencias = vi.fn()

vi.mock('@/services/tkc/normalize', () => ({ listInventory: (...a) => listInventory(...a) }))
vi.mock('@/services/tkc/submayor', () => ({ fetchExistencia: (...a) => fetchExistencia(...a) }))
vi.mock('@/services/tkc/existencias', () => ({ getExistencias: (...a) => getExistencias(...a) }))

const resolverSesion = vi.hoisted(() => vi.fn())
vi.mock('@/server/session', () => ({ resolverSesion }))

const leerCredenciales = vi.hoisted(() => vi.fn())
vi.mock('@/server/credencialesTkc', () => ({ leerCredenciales }))

const query = vi.hoisted(() => vi.fn(async () => ({ rowCount: 0 })))
vi.mock('@/server/db', () => ({ query }))

const { createTkcApiMiddleware } = await import('@/server/tkcApi')

const TKC = { tkcBase: 'https://tkc.test', tkcUser: 'u', tkcPass: 'p' }

/** Request falso: EventEmitter para que `req.on('data'/'end')` funcione. */
function fakeReq({ url = '/api/tkc/inventario', method = 'POST', body = {}, authorization } = {}) {
  const req = new EventEmitter()
  req.url = url
  req.method = method
  req.headers = authorization ? { authorization } : {}
  // setImmediate (no queueMicrotask): el middleware resuelve la sesión con un
  // antes de leer el body, así que emitir en un microtask adelantaría los
  // eventos a un momento en que `readBody` aún no ha enganchado sus listeners.
  setImmediate(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)))
    req.emit('end')
  })
  return req
}

/** Response falso: capta status/headers/body en vez de escribir a un socket. */
function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v },
    end(payload) { this.body = payload ? JSON.parse(payload) : null },
  }
}

beforeEach(() => {
  listInventory.mockReset()
  fetchExistencia.mockReset()
  getExistencias.mockReset()
  resolverSesion.mockReset()
  leerCredenciales.mockReset()
  leerCredenciales.mockReturnValue({ username: 'persona', password: 'clave' })
  // Por defecto hay sesión; las pruebas que necesiten lo contrario lo dicen.
  resolverSesion.mockResolvedValue({ email: 'a@mercadoelineas.com', usuario: { role: 'inv' } })
})

describe('createTkcApiMiddleware', () => {
  it('sin credenciales de TKC de la persona responde 403 no_tkc_credentials y no llama a TKC', async () => {
    leerCredenciales.mockReturnValue(null)
    const middleware = createTkcApiMiddleware({ tkc: TKC })
    const res = fakeRes()
    await middleware(fakeReq({ body: { almacen: '789' } }), res, vi.fn())
    expect(res.statusCode).toBe(403)
    expect(res.body.codigo).toBe('no_tkc_credentials')
    expect(listInventory).not.toHaveBeenCalled()
  })

  it('deja pasar rutas que no son de TKC', async () => {
    const middleware = createTkcApiMiddleware({ tkc: TKC })
    const next = vi.fn()
    await middleware(fakeReq({ url: '/otra-cosa' }), fakeRes(), next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('rechaza métodos que no son POST', async () => {
    const middleware = createTkcApiMiddleware({ tkc: TKC })
    const res = fakeRes()
    await middleware(fakeReq({ method: 'GET' }), res, vi.fn())
    expect(res.statusCode).toBe(405)
  })

  it('sin TKC_BASE/USER/PASS responde 503 antes de mirar la sesión', async () => {
    const middleware = createTkcApiMiddleware({ tkc: { tkcBase: '', tkcUser: '', tkcPass: '' } })
    const res = fakeRes()
    await middleware(fakeReq(), res, vi.fn())
    expect(res.statusCode).toBe(503)
    expect(resolverSesion).not.toHaveBeenCalled()
  })


  it('sin sesión responde 401 y no llega a tocar TKC', async () => {
    resolverSesion.mockResolvedValue(null)
    const middleware = createTkcApiMiddleware({ tkc: TKC })
    const res = fakeRes()
    await middleware(fakeReq({ authorization: 'Bearer malo' }), res, vi.fn())
    expect(res.statusCode).toBe(401)
    expect(listInventory).not.toHaveBeenCalled()
  })

  it('almacén desconocido responde 400', async () => {
    const middleware = createTkcApiMiddleware({ tkc: TKC })
    const res = fakeRes()
    await middleware(fakeReq({ body: { almacen: '9999' } }), res, vi.fn())
    expect(res.statusCode).toBe(400)
  })

  it('POST /api/tkc/inventario responde el resultado de listInventory', async () => {
    listInventory.mockResolvedValue({ rows: [{ id: 1 }], pagination: { page: 1, limit: 50, total: 1, totalPages: 1 } })
    const middleware = createTkcApiMiddleware({ tkc: TKC })
    const res = fakeRes()
    await middleware(fakeReq({ body: { almacen: '789', page: 2 } }), res, vi.fn())

    expect(res.statusCode).toBe(200)
    expect(res.body.rows).toEqual([{ id: 1 }])
    expect(listInventory).toHaveBeenCalledWith(TKC, expect.objectContaining({ page: 2, almacenes: ['351'] }))
  })

  it('POST /api/tkc/existencia sin idTienda responde 400', async () => {
    const middleware = createTkcApiMiddleware({ tkc: TKC })
    const res = fakeRes()
    await middleware(fakeReq({ url: '/api/tkc/existencia', body: { almacen: '789' } }), res, vi.fn())
    expect(res.statusCode).toBe(400)
    expect(fetchExistencia).not.toHaveBeenCalled()
  })

  it('POST /api/tkc/existencia responde 404 si el submayor no tiene el producto', async () => {
    fetchExistencia.mockResolvedValue(null)
    const middleware = createTkcApiMiddleware({ tkc: TKC })
    const res = fakeRes()
    await middleware(fakeReq({ url: '/api/tkc/existencia', body: { almacen: '789', idTienda: '139494' } }), res, vi.fn())
    expect(res.statusCode).toBe(404)
  })

  it('POST /api/tkc/existencia responde 200 con el producto encontrado', async () => {
    const producto = { idTienda: '139494', existencia: { fisica: 8, enAlmacen: 2, enTienda: 6 } }
    fetchExistencia.mockResolvedValue(producto)
    const middleware = createTkcApiMiddleware({ tkc: TKC })
    const res = fakeRes()
    await middleware(fakeReq({ url: '/api/tkc/existencia', body: { almacen: '789', idTienda: '139494' } }), res, vi.fn())
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(producto)
    expect(fetchExistencia).toHaveBeenCalledWith(TKC, { idTienda: '139494', almacen: '351' })
  })

  it('POST /api/tkc/existencias pasa los ids (como string) y el flag de refresco', async () => {
    getExistencias.mockResolvedValue({ existencias: {}, progreso: { cargadas: 0, total: 0, listo: true, error: null } })
    const middleware = createTkcApiMiddleware({ tkc: TKC })
    const res = fakeRes()
    await middleware(
      fakeReq({ url: '/api/tkc/existencias', body: { almacen: '789', ids: [1, 2, 3], refrescar: true } }),
      res, vi.fn(),
    )
    expect(res.statusCode).toBe(200)
    expect(getExistencias).toHaveBeenCalledWith(TKC, { almacen: '351', ids: ['1', '2', '3'], refrescar: true })
  })

  it('POST /api/tkc/submayor guarda en la copia lo que diga el submayor', async () => {
    // El catálogo lee `productos`, y ahí las existencias vienen de una foto de
    // dos veces al día. Esto es lo que las pone al día de verdad.
    getExistencias.mockResolvedValue({
      existencias: { 74298: { fisica: 15, enAlmacen: 13, enTienda: 2 } },
      progreso: { cargadas: 1, total: 1, listo: true, error: null },
    })
    query.mockResolvedValue({ rowCount: 1 })

    const middleware = createTkcApiMiddleware({ tkc: TKC })
    const res = fakeRes()
    await middleware(fakeReq({ url: '/api/tkc/submayor', body: { almacen: '789' } }), res, vi.fn())

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ actualizados: 1, leidos: 1 })

    const [sql, valores] = query.mock.calls.at(-1)
    expect(sql).toMatch(/UPDATE productos/)
    // Se unen por id de tienda, que es como los identifica el submayor.
    expect(sql).toMatch(/p\.id_tienda = v\.id/)
    // Marca de frescura: sin ella la sincronización lo pisa con la foto vieja.
    expect(sql).toMatch(/existencias_en = now\(\)/)
    expect(valores).toEqual(['74298', 15, 13, 2, '789'])
  })

  it('un error de TKC (listInventory rechaza) responde 502 con el mensaje', async () => {
    listInventory.mockRejectedValue(new Error('TKC inventario HTTP 500'))
    const middleware = createTkcApiMiddleware({ tkc: TKC })
    const res = fakeRes()
    await middleware(fakeReq({ body: { almacen: '789' } }), res, vi.fn())
    expect(res.statusCode).toBe(502)
    expect(res.body.error).toContain('TKC inventario HTTP 500')
  })
})
