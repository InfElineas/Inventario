import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const resolverSesion = vi.hoisted(() => vi.fn());
vi.mock('@/server/session', () => ({ resolverSesion }));

const leerCredenciales = vi.hoisted(() => vi.fn());
vi.mock('@/server/credencialesTkc', () => ({ leerCredenciales }));

const { createTransferenciasApiMiddleware, ROLES_AJUSTES } =
  await import('@/server/transferenciasApi');
const { abrir } = await import('@/server/secretBox');

const CLAVE_TRASPASO = Buffer.alloc(32, 3).toString('base64');
const CREDS = { username: 'ana.tkc', password: 's3cr3t' };
const SESION = (role = 'fact') => ({
  email: 'a@x.com', usuario: { role }, jwt: 'jwt-vigente', sub: 'is-user-1',
});

function peticion(url, cuerpo, metodo = 'GET') {
  const manejadores = {};
  const req = {
    url, method: metodo, headers: {},
    on: (ev, fn) => {
      manejadores[ev] = fn;
      if (ev === 'end') {
        queueMicrotask(() => {
          if (cuerpo !== undefined) {
            manejadores.data?.(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
          }
          manejadores.end?.();
        });
      }
      return req;
    },
  };
  return req;
}

function respuesta() {
  const r = {
    statusCode: 0, cuerpo: null, cabeceras: {},
    setHeader: (k, v) => { r.cabeceras[k] = v; },
    getHeader: (k) => r.cabeceras[k],
    end: (c) => { r.cuerpo = c ? JSON.parse(c) : null; },
  };
  return r;
}

const mw = createTransferenciasApiMiddleware();
async function llamar(url, cuerpo, metodo) {
  const res = respuesta();
  const sigue = vi.fn();
  await mw(peticion(url, cuerpo, metodo), res, sigue);
  return { res, sigue };
}

/** Lo que la API contestaría. */
function apiResponde(status, cuerpo, cabeceras = {}) {
  fetch.mockResolvedValue(new Response(JSON.stringify(cuerpo), {
    status, headers: { 'content-type': 'application/json', ...cabeceras },
  }));
}
const ultimaLlamada = () => {
  const [url, opts] = fetch.mock.calls.at(-1);
  return { url: new URL(url), opts, cuerpo: opts.body ? JSON.parse(opts.body) : undefined };
};

const original = { ...process.env };
beforeEach(() => {
  process.env.TRANSFERENCIAS_API_URL = 'https://api.test/';
  process.env.TKC_HANDOFF_KEY = CLAVE_TRASPASO;
  resolverSesion.mockReset().mockResolvedValue(SESION());
  leerCredenciales.mockReset().mockReturnValue(CREDS);
  vi.stubGlobal('fetch', vi.fn());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...original };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PROCESAR = { almacen: '676', lines: [{ code: 'NoMT10157977', quantity: 1 }] };

describe('enrutado y acceso', () => {
  it('ruta o método no permitidos: 404 sin llamar a la API', async () => {
    for (const [url, metodo] of [
      ['/api/procesamientos/otra', 'GET'],
      ['/api/procesamientos', 'GET'],
      ['/api/procesamientos', 'DELETE'],
      ['/api/procesamientos/candidatos', 'POST'],
      ['/api/procesamientos/analizar', 'GET'],
      ['/api/procesamientos/documentos/5', 'GET'],
    ]) {
      const { res } = await llamar(url, {}, metodo);
      expect(res.statusCode, `${metodo} ${url}`).toBe(404);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sin sesión: 401', async () => {
    resolverSesion.mockResolvedValue(null);
    const { res } = await llamar('/api/procesamientos/candidatos?almacen=676');
    expect(res.statusCode).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['inv', 'ca', 'auditor', 'jefe_depto'])('el rol %s no puede: 403', async (rol) => {
    resolverSesion.mockResolvedValue(SESION(rol));
    const { res } = await llamar('/api/procesamientos', PROCESAR, 'POST');
    expect(res.statusCode).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(ROLES_AJUSTES)('el rol %s sí puede', async (rol) => {
    resolverSesion.mockResolvedValue(SESION(rol));
    apiResponde(200, []);
    const { res } = await llamar('/api/procesamientos/candidatos?almacen=676');
    expect(res.statusCode).toBe(200);
  });
});

describe('leer', () => {
  it('candidatos: traduce el almacén y pasa los filtros', async () => {
    apiResponde(200, [{ code: 'NoMT1' }], { 'x-total-count': '7' });
    const { res } = await llamar('/api/procesamientos/candidatos?almacen=676&status=ready&q=NoMT&refresh=true&limit=20&offset=40');
    const { url, opts } = ultimaLlamada();
    expect(url.pathname).toBe('/api/v1/process/candidates');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      warehouse: '188', status: 'ready', q: 'NoMT', refresh: 'true', limit: '20', offset: '40',
    });
    expect(opts.headers.Authorization).toBe('Bearer jwt-vigente');
    expect(res.statusCode).toBe(200);
    expect(res.cabeceras['x-total-count']).toBe('7');
  });

  it('documentos: va a /process/documents y reenvía las almacenes truncados', async () => {
    apiResponde(200, [], { 'x-truncated-warehouses': '1' });
    const { res } = await llamar('/api/procesamientos/documentos?almacen=676');
    expect(ultimaLlamada().url.pathname).toBe('/api/v1/process/documents');
    expect(res.cabeceras['x-truncated-warehouses']).toBe('1');
  });

  it('almacén desconocido: 400', async () => {
    const { res } = await llamar('/api/procesamientos/candidatos?almacen=nope');
    expect(res.statusCode).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('analizar', () => {
  it('es lectura: no exige credenciales ni clave de traspaso ni manda Idempotency-Key', async () => {
    leerCredenciales.mockReturnValue(null);
    delete process.env.TKC_HANDOFF_KEY;
    apiResponde(200, { lines: [], rejected: [] });
    const { res } = await llamar('/api/procesamientos/analizar', PROCESAR, 'POST');
    const { url, opts, cuerpo } = ultimaLlamada();
    expect(res.statusCode).toBe(200);
    expect(url.pathname).toBe('/api/v1/process/analyze');
    expect(cuerpo).toEqual({ warehouse: '188', lines: [{ code: 'NoMT10157977', quantity: 1 }] });
    expect(opts.headers['Idempotency-Key']).toBeUndefined();
    expect(opts.headers['X-Tkc-Credentials']).toBeUndefined();
  });

  it('un timeout al analizar NO es unverified: no escribió nada', async () => {
    fetch.mockRejectedValue(Object.assign(new Error('t'), { name: 'TimeoutError' }));
    const { res } = await llamar('/api/procesamientos/analizar', PROCESAR, 'POST');
    expect(res.statusCode).toBe(504);
    expect(res.cuerpo.error.code).toBe('timeout');
  });
});

describe('procesar', () => {
  it('sin credenciales de TKC: 403 y no se llama a la API', async () => {
    leerCredenciales.mockReturnValue(null);
    const { res } = await llamar('/api/procesamientos', PROCESAR, 'POST');
    expect(res.statusCode).toBe(403);
    expect(res.cuerpo.error.code).toBe('no_tkc_credentials');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sin TKC_HANDOFF_KEY: 503, no cae a la cuenta de servicio', async () => {
    delete process.env.TKC_HANDOFF_KEY;
    const { res } = await llamar('/api/procesamientos', PROCESAR, 'POST');
    expect(res.statusCode).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('monta el cuerpo, sella las credenciales y pone la Idempotency-Key', async () => {
    apiResponde(201, { status: 'created', groups: [], rejected: [], done: 1, failed: 0, unverified: 0 });
    const { res } = await llamar('/api/procesamientos', { ...PROCESAR, idempotencyKey: 'proc-12345678' }, 'POST');
    const { url, opts, cuerpo } = ultimaLlamada();
    expect(res.statusCode).toBe(201);
    expect(url.pathname).toBe('/api/v1/process');
    expect(cuerpo).toEqual({ warehouse: '188', lines: [{ code: 'NoMT10157977', quantity: 1 }] });
    expect(opts.headers['Idempotency-Key']).toBe('proc-12345678');
    const sellado = abrir(opts.headers['X-Tkc-Credentials'], 'TKC_HANDOFF_KEY');
    expect(JSON.parse(sellado)).toMatchObject({ ...CREDS, sub: 'is-user-1' });
  });

  it('solo reenvía los campos conocidos', async () => {
    apiResponde(201, { status: 'created' });
    await llamar('/api/procesamientos', { ...PROCESAR, callback: { url: 'http://x' }, extra: 1 }, 'POST');
    expect(Object.keys(ultimaLlamada().cuerpo).sort()).toEqual(['lines', 'warehouse']);
  });

  it.each([
    ['sin líneas', { almacen: '676', lines: [] }],
    ['cantidad no entera', { almacen: '676', lines: [{ code: 'NoMT1', quantity: 1.5 }] }],
    ['código con espacio', { almacen: '676', lines: [{ code: 'No MT1', quantity: 1 }] }],
    ['almacén desconocido', { almacen: 'nope', lines: [{ code: 'NoMT1', quantity: 1 }] }],
    ['clave de idempotencia corta', { ...PROCESAR, idempotencyKey: 'x' }],
  ])('%s: 400', async (_, cuerpo) => {
    const { res } = await llamar('/api/procesamientos', cuerpo, 'POST');
    expect(res.statusCode).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('202 unverified llega tal cual', async () => {
    apiResponde(202, { status: 'unverified', message: 'revisa TKC' });
    const { res } = await llamar('/api/procesamientos', PROCESAR, 'POST');
    expect(res.statusCode).toBe(202);
    expect(res.cuerpo.status).toBe('unverified');
  });

  it('un 401 de la API no se reenvía como 401', async () => {
    apiResponde(401, { error: { code: 'unauthorized', message: 'x' } });
    const { res } = await llamar('/api/procesamientos', PROCESAR, 'POST');
    expect(res.statusCode).toBe(502);
  });

  it('timeout al escribir: unverified, que no se reintente a ciegas', async () => {
    fetch.mockRejectedValue(Object.assign(new Error('t'), { name: 'TimeoutError' }));
    const { res } = await llamar('/api/procesamientos', PROCESAR, 'POST');
    expect(res.statusCode).toBe(504);
    expect(res.cuerpo.error.code).toBe('unverified');
  });

  it('conexión rechazada: seguro que no se envió', async () => {
    fetch.mockRejectedValue(Object.assign(new Error('fail'), { cause: { code: 'ECONNREFUSED' } }));
    const { res } = await llamar('/api/procesamientos', PROCESAR, 'POST');
    expect(res.statusCode).toBe(502);
    expect(res.cuerpo.error.code).toBe('upstream_error');
  });
});
