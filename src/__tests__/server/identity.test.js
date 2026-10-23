import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  signIn, getRoles, refreshJwt, signOut, ipCliente, urlInicioGoogle, canjearGoogle,
} = await import('@/server/identity');

const IS = 'https://is.test';

/** Respuesta de fetch con cuerpo JSON y cabeceras opcionales. */
function resp(status, cuerpo, cabeceras = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => cuerpo,
    headers: { get: (n) => cabeceras[n.toLowerCase()] ?? null },
  };
}

beforeEach(() => {
  process.env.AUTH_API_URL = IS;
  process.env.SYSTEM_SLUG = 'inventario';
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('signIn', () => {
  it('manda email, password y el systemSlug del sistema', async () => {
    fetch.mockResolvedValue(resp(200, { user: { email: 'a@x.com' }, token: 'jwt' }, { 'set-auth-token': 'sess' }));
    await signIn('a@x.com', 'pw');

    const [destino, opts] = fetch.mock.calls[0];
    expect(String(destino)).toBe(`${IS}/api/auth/sign-in`);
    expect(JSON.parse(opts.body)).toEqual({ email: 'a@x.com', password: 'pw', systemSlug: 'inventario' });
  });

  it('devuelve el session token de la cabecera y el JWT del cuerpo', async () => {
    fetch.mockResolvedValue(resp(200, { user: { email: 'a@x.com' }, token: 'jwt' }, { 'set-auth-token': 'sess' }));
    expect(await signIn('a@x.com', 'pw')).toEqual({
      ok: true, user: { email: 'a@x.com' }, jwt: 'jwt', sessionToken: 'sess', tkc: null,
    });
  });

  it('reenvía la IP del cliente en X-Forwarded-For', async () => {
    fetch.mockResolvedValue(resp(401, {}));
    await signIn('a@x.com', 'pw', { ip: '203.0.113.7' });
    expect(fetch.mock.calls[0][1].headers['X-Forwarded-For']).toBe('203.0.113.7');
  });

  it('sin IP no inventa la cabecera', async () => {
    fetch.mockResolvedValue(resp(401, {}));
    await signIn('a@x.com', 'pw');
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('X-Forwarded-For');
  });

  it('401 → credenciales inválidas', async () => {
    fetch.mockResolvedValue(resp(401, {}));
    expect(await signIn('a@x.com', 'mal')).toMatchObject({ ok: false, status: 401, error: 'Credenciales inválidas.' });
  });

  it('403 → mensaje distinto: autenticó pero no tiene rol aquí', async () => {
    fetch.mockResolvedValue(resp(403, {}));
    const r = await signIn('a@x.com', 'pw');
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(r.error).toMatch(/no tiene acceso a Inventario/);
  });

  it('200 sin cabecera set-auth-token → 502, no una sesión a medias', async () => {
    fetch.mockResolvedValue(resp(200, { user: {}, token: 'jwt' }));
    expect(await signIn('a@x.com', 'pw')).toMatchObject({ ok: false, status: 502 });
  });
});

describe('getRoles', () => {
  it('consulta /user-roles/me con el systemSlug y el session token como Bearer', async () => {
    fetch.mockResolvedValue(resp(200, { roles: [] }));
    await getRoles('sess');

    const [destino, opts] = fetch.mock.calls[0];
    expect(destino.pathname).toBe('/api/user-roles/me');
    expect(destino.searchParams.get('systemSlug')).toBe('inventario');
    expect(opts.headers.Authorization).toBe('Bearer sess');
  });

  it('acepta el payload real del IS: roles con system anidado', async () => {
    const roles = [{
      id: '8c1f0a52-0000-4000-8000-000000000001', name: 'inv', description: null,
      system: { id: '8c1f0a52-0000-4000-8000-000000000002', slug: 'inventario', name: 'Inventario' },
    }];
    fetch.mockResolvedValue(resp(200, { roles }));
    expect(await getRoles('sess')).toEqual(roles);
  });

  it('un fallo del IS se traduce en "sin roles", nunca en acceso', async () => {
    fetch.mockResolvedValue(resp(500, {}));
    expect(await getRoles('sess')).toEqual([]);
  });

  it('sin session token ni siquiera llama al IS', async () => {
    expect(await getRoles(undefined)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('refreshJwt', () => {
  it('devuelve el JWT nuevo', async () => {
    fetch.mockResolvedValue(resp(200, { token: 'nuevo' }));
    expect(await refreshJwt('sess')).toBe('nuevo');
  });

  it('si el session token murió devuelve null', async () => {
    fetch.mockResolvedValue(resp(401, {}));
    expect(await refreshJwt('sess')).toBeNull();
  });
});

describe('signOut', () => {
  it('no propaga el fallo del IS: salir tiene que funcionar siempre', async () => {
    fetch.mockRejectedValue(new Error('red caída'));
    await expect(signOut('sess')).resolves.toBeUndefined();
  });
});

describe('ipCliente', () => {
  it('toma el ÚLTIMO valor de X-Forwarded-For: lo anterior lo pudo inyectar el cliente', () => {
    const req = { headers: { 'x-forwarded-for': '6.6.6.6, 198.51.100.4' }, socket: { remoteAddress: '10.0.0.1' } };
    expect(ipCliente(req)).toBe('198.51.100.4');
  });

  it('sin cabecera cae en la IP del socket', () => {
    expect(ipCliente({ headers: {}, socket: { remoteAddress: '10.0.0.1' } })).toBe('10.0.0.1');
  });

  it('sin nada devuelve undefined', () => {
    expect(ipCliente({ headers: {} })).toBeUndefined();
  });
});

describe('urlInicioGoogle', () => {
  const args = { redirectTo: 'https://inv.test/api/auth/google/callback', challenge: 'CH', state: 'ST' };

  it('apunta a /api/auth/google/start del IS con PKCE, state y systemSlug', () => {
    const u = new URL(urlInicioGoogle(args));
    expect(u.origin + u.pathname).toBe(`${IS}/api/auth/google/start`);
    expect(Object.fromEntries(u.searchParams)).toEqual({
      redirect_to: args.redirectTo, code_challenge: 'CH', state: 'ST', systemSlug: 'inventario',
    });
  });

  it('usa AUTH_PUBLIC_URL (la que ve el navegador) si está definida', () => {
    process.env.AUTH_PUBLIC_URL = 'https://publica.test';
    try {
      expect(urlInicioGoogle(args)).toMatch(/^https:\/\/publica\.test\/api\/auth\/google\/start/);
    } finally {
      delete process.env.AUTH_PUBLIC_URL;
    }
  });
});

describe('credenciales de TKC en el login', () => {
  const creds = { username: 'ana.tkc', password: 'pw' };

  it('signIn devuelve las credenciales de TKC que manda el IS', async () => {
    fetch.mockResolvedValue(resp(200, { user: { email: 'a@x.com' }, token: 'jwt', tkc: creds }, { 'set-auth-token': 'sess' }));
    expect((await signIn('a@x.com', 'pw')).tkc).toEqual(creds);
  });

  it('canjearGoogle también las devuelve', async () => {
    fetch.mockResolvedValue(resp(200, { user: { email: 'a@x.com' }, token: 'jwt', tkc: creds }, { 'set-auth-token': 'sess' }));
    expect((await canjearGoogle('C1', 'V1')).tkc).toEqual(creds);
  });
});

describe('canjearGoogle', () => {
  it('manda code y code_verifier por POST, con la IP del cliente', async () => {
    fetch.mockResolvedValue(resp(200, { user: {}, token: 'jwt' }, { 'set-auth-token': 'sess' }));
    await canjearGoogle('C1', 'V1', { ip: '203.0.113.7' });

    const [destino, opts] = fetch.mock.calls[0];
    expect(String(destino)).toBe(`${IS}/api/auth/google/exchange`);
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ code: 'C1', code_verifier: 'V1' });
    expect(opts.headers['X-Forwarded-For']).toBe('203.0.113.7');
  });

  it('devuelve el session token de la cabecera y el JWT del cuerpo', async () => {
    fetch.mockResolvedValue(resp(200, { user: { email: 'a@x.com' }, token: 'jwt' }, { 'set-auth-token': 'sess' }));
    expect(await canjearGoogle('C1', 'V1')).toEqual({
      ok: true, user: { email: 'a@x.com' }, jwt: 'jwt', sessionToken: 'sess', tkc: null,
    });
  });

  it('propaga el code del IS cuando falla', async () => {
    fetch.mockResolvedValue(resp(400, { code: 'INVALID_CODE' }));
    expect(await canjearGoogle('C1', 'V1')).toEqual({ ok: false, status: 400, code: 'INVALID_CODE' });
  });

  it('un fallo sin code se reduce a GOOGLE_AUTH_FAILED', async () => {
    fetch.mockResolvedValue(resp(500, null));
    expect(await canjearGoogle('C1', 'V1')).toMatchObject({ ok: false, code: 'GOOGLE_AUTH_FAILED' });
  });

  it('200 sin set-auth-token → no hay sesión a medias', async () => {
    fetch.mockResolvedValue(resp(200, { user: {}, token: 'jwt' }));
    expect(await canjearGoogle('C1', 'V1')).toMatchObject({ ok: false, status: 502 });
  });
});
