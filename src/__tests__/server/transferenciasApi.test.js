import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const resolverSesion = vi.hoisted(() => vi.fn());
vi.mock('@/server/session', () => ({ resolverSesion }));

const leerCredenciales = vi.hoisted(() => vi.fn());
vi.mock('@/server/credencialesTkc', () => ({ leerCredenciales }));

const query = vi.hoisted(() => vi.fn(async () => ({ rows: [] })));
vi.mock('@/server/db', () => ({ query }));

const { createTransferenciasApiMiddleware, ROLES_AJUSTES, traspasoCredenciales } =
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

const CREAR = { almacen: '789', lines: [{ code: '7622210833662', quantity: 3 }] };

describe('enrutado y acceso', () => {
  it('lo que no es /api/ajustes/ sigue su camino', async () => {
    const { sigue } = await llamar('/api/tkc/inventario', {}, 'POST');
    expect(sigue).toHaveBeenCalled();
  });

  it('tipo desconocido, método o ruta no permitidos: 404 sin llamar a la API', async () => {
    for (const [url, metodo] of [
      ['/api/ajustes/otros', 'GET'],
      ['/api/ajustes/aumentos', 'DELETE'],
      ['/api/ajustes/aumentos/abc/confirm', 'POST'],
      ['/api/ajustes/aumentos/5/cancel', 'POST'],
      ['/api/ajustes/aumentos/5/lines', 'POST'],
      ['/api/ajustes/aumentos/5', 'GET'],
    ]) {
      const { res } = await llamar(url, {}, metodo);
      expect(res.statusCode, `${metodo} ${url}`).toBe(404);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sin TRANSFERENCIAS_API_URL: 503', async () => {
    delete process.env.TRANSFERENCIAS_API_URL;
    const { res } = await llamar('/api/ajustes/aumentos');
    expect(res.statusCode).toBe(503);
  });

  it('sin sesión: 401', async () => {
    resolverSesion.mockResolvedValue(null);
    const { res } = await llamar('/api/ajustes/aumentos');
    expect(res.statusCode).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['inv', 'ca', 'auditor', 'jefe_depto'])('el rol %s no puede: 403', async (rol) => {
    resolverSesion.mockResolvedValue(SESION(rol));
    const { res } = await llamar('/api/ajustes/aumentos');
    expect(res.statusCode).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(ROLES_AJUSTES)('el rol %s sí puede', async (rol) => {
    resolverSesion.mockResolvedValue(SESION(rol));
    apiResponde(200, []);
    const { res } = await llamar('/api/ajustes/aumentos');
    expect(res.statusCode).toBe(200);
  });
});

describe('credenciales de TKC', () => {
  it('escribir sin credenciales: 403 no_tkc_credentials y no se llama a la API', async () => {
    leerCredenciales.mockReturnValue(null);
    for (const [url, cuerpo] of [
      ['/api/ajustes/aumentos', CREAR],
      ['/api/ajustes/aumentos/5/confirm', { almacen: '789' }],
    ]) {
      const { res } = await llamar(url, cuerpo, 'POST');
      expect(res.statusCode).toBe(403);
      expect(res.cuerpo.error.code).toBe('no_tkc_credentials');
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('escribir sin TKC_HANDOFF_KEY: 503, no se cae a la cuenta de servicio', async () => {
    delete process.env.TKC_HANDOFF_KEY;
    const { res } = await llamar('/api/ajustes/aumentos', CREAR, 'POST');
    expect(res.statusCode).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('la cabecera va sellada, atada a la persona y con caducidad', async () => {
    apiResponde(201, { status: 'created' });
    await llamar('/api/ajustes/aumentos', CREAR, 'POST');
    const { opts } = ultimaLlamada();

    expect(opts.headers.Authorization).toBe('Bearer jwt-vigente');
    const sellado = opts.headers['X-Tkc-Credentials'];
    expect(sellado).not.toContain('s3cr3t');
    const dentro = JSON.parse(abrir(sellado, 'TKC_HANDOFF_KEY'));
    expect(dentro).toMatchObject({ ...CREDS, sub: 'is-user-1' });
    expect(dentro.exp).toBeGreaterThan(Date.now());
    expect(dentro.exp).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000 + 1000);
  });

  it('traspasoCredenciales usa el formato v1 de elineas-transferencia', () => {
    expect(traspasoCredenciales(CREDS, 'u').split('.')).toHaveLength(4);
  });

  it('leer sin credenciales va con la cuenta de servicio, sin cabecera', async () => {
    leerCredenciales.mockReturnValue(null);
    apiResponde(200, []);
    const { res } = await llamar('/api/ajustes/aumentos');
    expect(res.statusCode).toBe(200);
    expect(ultimaLlamada().opts.headers['X-Tkc-Credentials']).toBeUndefined();
  });
});

describe('crear', () => {
  it('aumento: monta el cuerpo, traduce el almacén y reenvía el 201', async () => {
    apiResponde(201, { status: 'created', document: { id: 3107, code: 'TKCE0003107' } });
    const { res } = await llamar('/api/ajustes/aumentos', {
      ...CREAR, date: '2026-10-15', notes: ' Conteo ', classification: 'Reposición de inventario',
      idempotencyKey: 'envio-0001-abcd',
    }, 'POST');

    const { url, opts, cuerpo } = ultimaLlamada();
    expect(url.href).toBe('https://api.test/api/v1/adjustments');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Idempotency-Key']).toBe('envio-0001-abcd');
    expect(cuerpo).toEqual({
      warehouse: '351', // 789 → id de TKC
      lines: [{ code: '7622210833662', quantity: 3 }],
      date: '2026-10-15', notes: 'Conteo', classification: 'Reposición de inventario',
    });
    expect(res.statusCode).toBe(201);
    expect(res.cuerpo.document.code).toBe('TKCE0003107');
  });

  it('disminución: va a /decreases y exige clasificación', async () => {
    const sin = await llamar('/api/ajustes/disminuciones', CREAR, 'POST');
    expect(sin.res.statusCode).toBe(400);
    expect(fetch).not.toHaveBeenCalled();

    apiResponde(201, { status: 'created' });
    await llamar('/api/ajustes/disminuciones', { ...CREAR, classification: 'Merma' }, 'POST');
    expect(ultimaLlamada().url.pathname).toBe('/api/v1/decreases');
    expect(ultimaLlamada().cuerpo.classification).toBe('Merma');
  });

  it('sin idempotencyKey genera una válida', async () => {
    apiResponde(201, {});
    await llamar('/api/ajustes/aumentos', CREAR, 'POST');
    expect(ultimaLlamada().opts.headers['Idempotency-Key']).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
  });

  it('solo reenvía los campos conocidos', async () => {
    apiResponde(201, {});
    await llamar('/api/ajustes/aumentos', { ...CREAR, callback: { url: 'https://x' }, text: 'otro', extra: 1 }, 'POST');
    expect(Object.keys(ultimaLlamada().cuerpo).sort()).toEqual(['lines', 'warehouse']);
  });

  it.each([
    ['almacén desconocido', { ...CREAR, almacen: 'nope' }],
    ['sin almacén', { lines: CREAR.lines }],
    ['sin líneas', { almacen: '789', lines: [] }],
    ['código con espacio', { almacen: '789', lines: [{ code: 'A B', quantity: 1 }] }],
    ['código con asterisco', { almacen: '789', lines: [{ code: 'A*2', quantity: 1 }] }],
    ['cantidad cero', { almacen: '789', lines: [{ code: 'A', quantity: 0 }] }],
    ['cantidad decimal', { almacen: '789', lines: [{ code: 'A', quantity: 1.5 }] }],
    ['fecha mala', { ...CREAR, date: '15/10/2026' }],
    ['clave de idempotencia corta', { ...CREAR, idempotencyKey: 'x' }],
    ['más de 500 líneas', { almacen: '789', lines: Array.from({ length: 501 }, (_, i) => ({ code: `C${i}`, quantity: 1 })) }],
  ])('rechaza con 400 sin llamar a la API: %s', async (_n, cuerpo) => {
    const { res } = await llamar('/api/ajustes/aumentos', cuerpo, 'POST');
    expect(res.statusCode).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('la cantidad por defecto es 1', async () => {
    apiResponde(201, {});
    await llamar('/api/ajustes/aumentos', { almacen: '789', lines: [{ code: 'A1' }] }, 'POST');
    expect(ultimaLlamada().cuerpo.lines).toEqual([{ code: 'A1', quantity: 1 }]);
  });

  it('JSON inválido: 400', async () => {
    const { res } = await llamar('/api/ajustes/aumentos', '{no', 'POST');
    expect(res.statusCode).toBe(400);
  });
});

describe('confirmar', () => {
  it('reenvía almacén traducido, a la ruta del tipo', async () => {
    apiResponde(200, { status: 'confirmed' });
    const { res } = await llamar('/api/ajustes/disminuciones/3107/confirm', { almacen: '789' }, 'POST');
    const { url, cuerpo } = ultimaLlamada();
    expect(url.pathname).toBe('/api/v1/decreases/3107/confirm');
    expect(cuerpo).toEqual({ warehouse: '351' });
    expect(res.statusCode).toBe(200);
  });

  it('exige el almacén', async () => {
    const { res } = await llamar('/api/ajustes/aumentos/5/confirm', {}, 'POST');
    expect(res.statusCode).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('un 422 (TKC lo rechazó) llega tal cual', async () => {
    apiResponde(422, { status: 'failed', error: 'TKC rechazó' });
    const { res } = await llamar('/api/ajustes/aumentos/5/confirm', { almacen: '789' }, 'POST');
    expect(res.statusCode).toBe(422);
    expect(res.cuerpo.error).toBe('TKC rechazó');
  });
});

describe('listar y líneas', () => {
  it('traduce el almacén, pasa filtros y devuelve las cabeceras de paginación', async () => {
    apiResponde(200, [{ id: 1 }], { 'X-Total-Count': '40', 'X-Next-Offset': '20' });
    const { res } = await llamar('/api/ajustes/aumentos?almacen=789&from=2026-10-01&limit=20&status=editada');
    const { url, opts } = ultimaLlamada();
    expect(opts.method).toBe('GET');
    expect(url.pathname).toBe('/api/v1/adjustments');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      warehouse: '351', from: '2026-10-01', limit: '20', status: 'editada',
    });
    expect(res.cabeceras['x-total-count']).toBe('40');
    expect(res.cabeceras['x-next-offset']).toBe('20');
  });

  it('líneas de un documento', async () => {
    apiResponde(200, { headers: [], rows: [] });
    await llamar('/api/ajustes/disminuciones/9/lines');
    expect(ultimaLlamada().url.pathname).toBe('/api/v1/decreases/9/lines');
  });

  it('almacén desconocido en el filtro: 400', async () => {
    const { res } = await llamar('/api/ajustes/aumentos?almacen=nope');
    expect(res.statusCode).toBe(400);
  });
});

describe('errores de la API', () => {
  it('403 (sin el permiso en el IS) se reenvía como 403 con su mensaje', async () => {
    apiResponde(403, { error: { code: 'forbidden', message: 'sin permiso increase:create' } });
    const { res } = await llamar('/api/ajustes/aumentos', CREAR, 'POST');
    expect(res.statusCode).toBe(403);
    expect(res.cuerpo.error.code).toBe('forbidden');
  });

  it('«sin rol en este sistema» se explica: el rol que falta no es el de aquí', async () => {
    apiResponde(403, { error: { code: 'forbidden', message: 'El usuario del token no tiene ningún rol en este sistema.' } });
    const { res } = await llamar('/api/ajustes/aumentos', CREAR, 'POST');
    expect(res.statusCode).toBe(403);
    expect(res.cuerpo.error.code).toBe('sin_rol_transferencias');
    expect(res.cuerpo.error.message).toMatch(/identity server/i);
  });

  it('un 401 de la API NO se reenvía como 401 (mandaría al login sin motivo)', async () => {
    apiResponde(401, { error: { code: 'unauthorized', message: 'x' } });
    const { res } = await llamar('/api/ajustes/aumentos');
    expect(res.statusCode).toBe(502);
  });

  it('202 unverified llega tal cual', async () => {
    apiResponde(202, { status: 'unverified' });
    const { res } = await llamar('/api/ajustes/aumentos', CREAR, 'POST');
    expect(res.statusCode).toBe(202);
    expect(res.cuerpo.status).toBe('unverified');
  });

  it('respuesta que no es JSON: 502', async () => {
    fetch.mockResolvedValue(new Response('<html>', { status: 500 }));
    const { res } = await llamar('/api/ajustes/aumentos');
    expect(res.statusCode).toBe(502);
  });

  it('conexión rechazada al escribir: 502 upstream_error (seguro que no se envió)', async () => {
    fetch.mockRejectedValue(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }));
    const { res } = await llamar('/api/ajustes/aumentos', CREAR, 'POST');
    expect(res.statusCode).toBe(502);
    expect(res.cuerpo.error.code).toBe('upstream_error');
  });

  it('conexión rechazada con el formato de Bun (sin cause): tampoco es unverified', async () => {
    fetch.mockRejectedValue(Object.assign(new Error('ECONNREFUSED: Unable to connect. Is the computer able to access the url?'), { code: 'ConnectionRefused' }));
    const { res } = await llamar('/api/ajustes/aumentos', CREAR, 'POST');
    expect(res.statusCode).toBe(502);
    expect(res.cuerpo.error.code).toBe('upstream_error');
  });

  it('timeout o corte al escribir: unverified, que no se reintente a ciegas', async () => {
    fetch.mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
    const t = await llamar('/api/ajustes/aumentos', CREAR, 'POST');
    expect(t.res.statusCode).toBe(504);
    expect(t.res.cuerpo.error.code).toBe('unverified');

    fetch.mockRejectedValue(new Error('socket hang up'));
    const c = await llamar('/api/ajustes/aumentos', CREAR, 'POST');
    expect(c.res.cuerpo.error.code).toBe('unverified');
  });

  it('un fallo al leer no se marca como unverified', async () => {
    fetch.mockRejectedValue(new Error('socket hang up'));
    const { res } = await llamar('/api/ajustes/aumentos');
    expect(res.cuerpo.error.code).toBe('upstream_error');
  });
});

describe('subir y bajar de tienda', () => {
  const CUERPO = { almacen: '789', lineas: [{ code: '7501', quantity: 2 }] };

  beforeEach(() => {
    resolverSesion.mockResolvedValue(SESION('inv'));
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
  });

  it('analizar llama a plans y NO escribe', async () => {
    apiResponde(202, { jobId: 'j1' });
    const { res } = await llamar('/api/tienda/subir/plan', CUERPO, 'POST');

    expect(res.statusCode).toBe(202);
    const { url, opts, cuerpo } = ultimaLlamada();
    expect(url.pathname).toBe('/api/v1/up-shop/plans');
    expect(cuerpo).toMatchObject({ warehouse: '351', lines: [{ code: '7501', quantity: 2 }] });
    // Analizar no mueve nada: una clave de idempotencia aquí no pinta nada.
    expect(opts.headers['Idempotency-Key']).toBeUndefined();
  });

  it('ejecutar llama a runs y lleva clave de idempotencia', async () => {
    apiResponde(202, { jobId: 'j2' });
    await llamar('/api/tienda/bajar/ejecutar', CUERPO, 'POST');

    const { url, opts } = ultimaLlamada();
    expect(url.pathname).toBe('/api/v1/down-shop/runs');
    // Es lo que impide que un reintento baje dos veces la misma mercancía.
    expect(opts.headers['Idempotency-Key']).toBeTruthy();
  });

  describe('reflejo en nuestra copia', () => {
    const TERMINADO = (code, granted) => ({
      status: 'succeeded',
      result: { totalGranted: granted, exito: [{ code, granted }], fallido: [] },
    });

    it('al terminar el trabajo, lo movido pasa a nuestra copia', async () => {
      // El catálogo lee la copia, no TKC: sin esto quien sube dos unidades
      // sigue viendo los números viejos hasta la sincronización de la hora.
      apiResponde(202, { jobId: 'jm1' });
      await llamar('/api/tienda/subir/ejecutar', CUERPO, 'POST');

      apiResponde(200, TERMINADO('7501', 2));
      await llamar('/api/tienda/trabajo?id=jm1');

      const [sql, valores] = query.mock.calls.at(-1);
      expect(sql).toMatch(/UPDATE productos/);
      // Subir: salen del almacén y entran en la tienda.
      expect(valores).toEqual([2, '7501', '789']);
      expect(sql).toMatch(/almacen = GREATEST\(COALESCE\(almacen, 0\) - \$1/);
    });

    it('bajar mueve al revés', async () => {
      apiResponde(202, { jobId: 'jm2' });
      await llamar('/api/tienda/bajar/ejecutar', CUERPO, 'POST');

      apiResponde(200, TERMINADO('7501', 2));
      await llamar('/api/tienda/trabajo?id=jm2');

      expect(query.mock.calls.at(-1)[1]).toEqual([-2, '7501', '789']);
    });

    it('un análisis no toca la copia aunque termine bien', async () => {
      apiResponde(202, { jobId: 'jm3' });
      await llamar('/api/tienda/subir/plan', CUERPO, 'POST');

      apiResponde(200, TERMINADO('7501', 2));
      await llamar('/api/tienda/trabajo?id=jm3');
      expect(query).not.toHaveBeenCalled();
    });

    it('un trabajo que falla no toca la copia', async () => {
      apiResponde(202, { jobId: 'jm4' });
      await llamar('/api/tienda/subir/ejecutar', CUERPO, 'POST');

      apiResponde(200, { status: 'failed', result: { exito: [] } });
      await llamar('/api/tienda/trabajo?id=jm4');
      expect(query).not.toHaveBeenCalled();
    });

    it('si el reflejo falla, el movimiento se informa igual', async () => {
      // Ya se movió en TKC: callárselo sería lo peor que se puede hacer.
      query.mockRejectedValueOnce(new Error('conexión caída'));
      apiResponde(202, { jobId: 'jm5' });
      await llamar('/api/tienda/subir/ejecutar', CUERPO, 'POST');

      apiResponde(200, TERMINADO('7501', 2));
      const { res } = await llamar('/api/tienda/trabajo?id=jm5');
      expect(res.statusCode).toBe(200);
      expect(res.cuerpo.status).toBe('succeeded');
    });
  });

  it('traduce la clave de almacén al id de TKC', async () => {
    apiResponde(202, { jobId: 'j3' });
    await llamar('/api/tienda/subir/plan', { ...CUERPO, almacen: '480' }, 'POST');
    // 480 es nuestra clave; 223 es como lo llama TKC.
    expect(ultimaLlamada().cuerpo.warehouse).toBe('223');
  });

  it('manda las credenciales de la persona, no las de servicio', async () => {
    apiResponde(202, { jobId: 'j4' });
    await llamar('/api/tienda/subir/ejecutar', CUERPO, 'POST');

    const sellado = ultimaLlamada().opts.headers['X-Tkc-Credentials'];
    expect(JSON.parse(abrir(sellado, 'TKC_HANDOFF_KEY'))).toMatchObject({
      username: 'ana.tkc', sub: 'is-user-1',
    });
  });

  it('ejecutar sin credenciales de TKC se rechaza: firmaría a nombre de otro', async () => {
    leerCredenciales.mockReturnValue(null);
    const { res } = await llamar('/api/tienda/subir/ejecutar', CUERPO, 'POST');
    expect(res.statusCode).toBe(403);
    expect(res.cuerpo.error.code).toBe('no_tkc_credentials');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('facturación también sube y baja de tienda', async () => {
    // Forma parte de su trabajo, y además la aplicación guarda un solo rol:
    // quien es inventarista y factura queda como `fact`.
    apiResponde(202, { jobId: 'j9' });
    resolverSesion.mockResolvedValue(SESION('fact'));
    const { res } = await llamar('/api/tienda/subir/plan', CUERPO, 'POST');
    expect(res.statusCode).toBe(202);
  });

  it('un rol que no mueve mercancía no pasa', async () => {
    resolverSesion.mockResolvedValue(SESION('auditor'));
    const { res } = await llamar('/api/tienda/subir/plan', CUERPO, 'POST');
    expect(res.statusCode).toBe(403);
    expect(res.cuerpo.error.message).toMatch(/subir ni bajar de tienda/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('el cuerpo se reconstruye: no es un proxy abierto', async () => {
    apiResponde(202, { jobId: 'j5' });
    await llamar('/api/tienda/subir/plan', { ...CUERPO, callback: 'http://malo', dryRun: false }, 'POST');
    expect(ultimaLlamada().cuerpo).toEqual({
      warehouse: '351', lines: [{ code: '7501', quantity: 2 }], mode: 'integro',
    });
  });

  it('el modo es obligatorio para ellos: por defecto «integro»', async () => {
    apiResponde(202, { jobId: 'j6' });
    await llamar('/api/tienda/bajar/plan', CUERPO, 'POST');
    // Sin él su API responde «`mode` es `integro` o `porcentaje`».
    expect(ultimaLlamada().cuerpo.mode).toBe('integro');
  });

  it('el porcentaje viaja aparte y se valida antes de salir', async () => {
    apiResponde(202, { jobId: 'j7' });
    await llamar('/api/tienda/bajar/plan', { ...CUERPO, modo: 'porcentaje', porcentaje: 30 }, 'POST');
    expect(ultimaLlamada().cuerpo).toMatchObject({ mode: 'porcentaje', percent: 30 });
  });

  it('cada sentido tiene SUS modos: confundirlos da un 400 de su API', async () => {
    // Subir admite «reserva» —su fórmula de resguardo— y bajar «porcentaje».
    // Cruzarlos es el error que nos devolvió al probar.
    apiResponde(202, { jobId: 'j8' });
    await llamar('/api/tienda/subir/plan', { ...CUERPO, modo: 'reserva' }, 'POST');
    expect(ultimaLlamada().cuerpo.mode).toBe('reserva');

    fetch.mockClear();
    const { res } = await llamar('/api/tienda/subir/plan', { ...CUERPO, modo: 'porcentaje', porcentaje: 30 }, 'POST');
    expect(res.statusCode).toBe(400);
    expect(res.cuerpo.error.message).toMatch(/integro o reserva/i);
    expect(fetch).not.toHaveBeenCalled();

    fetch.mockClear();
    const r2 = await llamar('/api/tienda/bajar/plan', { ...CUERPO, modo: 'reserva' }, 'POST');
    expect(r2.res.statusCode).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('el porcentaje solo acompaña a «porcentaje»', async () => {
    apiResponde(202, { jobId: 'j9' });
    await llamar('/api/tienda/bajar/plan', { ...CUERPO, modo: 'integro', porcentaje: 30 }, 'POST');
    expect(ultimaLlamada().cuerpo.percent).toBeUndefined();
  });

  it('un porcentaje imposible no llega a su API', async () => {
    for (const malo of [0, 101, 12.5, 'mucho']) {
      fetch.mockClear();
      const { res } = await llamar('/api/tienda/bajar/plan', { ...CUERPO, modo: 'porcentaje', porcentaje: malo }, 'POST');
      expect(res.statusCode).toBe(400);
      expect(fetch).not.toHaveBeenCalled();
    }
  });

  it('consultar el trabajo usa la espera larga en vez de sondear', async () => {
    apiResponde(200, { id: 'j1', status: 'running' });
    await llamar('/api/tienda/trabajo?id=j1&wait=20');

    const { url } = ultimaLlamada();
    expect(url.pathname).toBe('/api/v1/jobs/j1');
    expect(url.searchParams.get('wait')).toBe('20');
  });

  it('consultar un trabajo sin id es un 400, no una llamada a ciegas', async () => {
    const { res } = await llamar('/api/tienda/trabajo');
    expect(res.statusCode).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('una ruta de tienda que no existe no cae en los ajustes', async () => {
    const { res } = await llamar('/api/tienda/subir/inventado', CUERPO, 'POST');
    expect(res.statusCode).toBe(404);
  });
});
