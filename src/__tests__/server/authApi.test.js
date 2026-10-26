import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

const signIn = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());
const canjearGoogle = vi.hoisted(() => vi.fn());
const urlInicioGoogle = vi.hoisted(() => vi.fn());
vi.mock('@/server/identity', () => ({
  signIn, signOut, canjearGoogle, urlInicioGoogle,
  isIdentityConfigured: () => true,
  ipCliente: () => '203.0.113.7',
}));

const resolverSesion = vi.hoisted(() => vi.fn());
const sincronizarDesdeIS = vi.hoisted(() => vi.fn());
vi.mock('@/server/session', () => ({ resolverSesion, sincronizarDesdeIS }));

const queryOne = vi.hoisted(() => vi.fn());
vi.mock('@/server/db', () => ({ queryOne }));

const verificarCredenciales = vi.hoisted(() => vi.fn());
vi.mock('@/server/credencialesTkc', async (original) => ({
  ...(await original()),
  verificarCredenciales,
}));

const { createAuthApiMiddleware } = await import('@/server/authApi');

const USUARIO = {
  id: 'u1', email: 'a@x.com', full_name: 'A', role: 'inv', activo: true,
  almacen_num: '593', almacenes_config: [], sync_config: {}, anuncio_config: {},
};

function peticion(url, cuerpo, metodo = 'POST', cabeceras = {}) {
  const manejadores = {};
  const req = {
    url, method: metodo, headers: cabeceras,
    on: (ev, fn) => {
      manejadores[ev] = fn;
      if (ev === 'end') {
        queueMicrotask(() => {
          manejadores.data?.(JSON.stringify(cuerpo ?? {}));
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

const mw = createAuthApiMiddleware({ tkcBase: 'https://tkc.test' });

async function llamar(url, cuerpo, metodo, cabeceras) {
  const res = respuesta();
  await mw(peticion(url, cuerpo, metodo, cabeceras), res, () => { res.statusCode = 999; });
  return res;
}

const setCookies = (res) => [].concat(res.getHeader('Set-Cookie') ?? []);

beforeEach(() => {
  for (const m of [signIn, signOut, canjearGoogle, urlInicioGoogle, resolverSesion, sincronizarDesdeIS, queryOne, verificarCredenciales]) m.mockReset();
  process.env.APP_URL = 'https://inv.test';
});

describe('POST /api/auth/login', () => {
  const entrada = { ok: true, user: { email: 'a@x.com', name: 'A' }, jwt: 'jwt1', sessionToken: 'sess1' };

  it('login correcto: fija las dos cookies y devuelve el perfil sin tokens', async () => {
    signIn.mockResolvedValue(entrada);
    sincronizarDesdeIS.mockResolvedValue(USUARIO);

    const res = await llamar('/api/auth/login', { email: 'a@x.com', password: 'pw' });

    expect(res.statusCode).toBe(200);
    expect(res.cuerpo.user).toMatchObject({ email: 'a@x.com', role: 'inv' });
    expect(JSON.stringify(res.cuerpo)).not.toMatch(/sess1|jwt1/);
    const cookies = setCookies(res);
    expect(cookies.some((c) => c.startsWith('session=sess1') && c.includes('HttpOnly'))).toBe(true);
    expect(cookies.some((c) => c.startsWith('jwt=jwt1') && c.includes('HttpOnly'))).toBe(true);
  });

  it('guarda las credenciales de TKC en cookie sellada y avisa solo con un booleano', async () => {
    process.env.TKC_SECRET_KEY = Buffer.alloc(32, 7).toString('base64');
    signIn.mockResolvedValue({ ...entrada, tkc: { username: 'ana.tkc', password: 'pw-tkc' } });
    sincronizarDesdeIS.mockResolvedValue(USUARIO);

    const res = await llamar('/api/auth/login', { email: 'a@x.com', password: 'pw' });

    expect(res.cuerpo.user.tiene_tkc).toBe(true);
    expect(JSON.stringify(res.cuerpo)).not.toMatch(/pw-tkc|ana\.tkc/);
    expect(setCookies(res).some((c) => c.startsWith('tkc=') && c.includes('HttpOnly') && !c.includes('Max-Age=0'))).toBe(true);
  });

  it('sin credenciales de TKC en el IS: no toca las que la persona puso a mano', async () => {
    process.env.TKC_SECRET_KEY = Buffer.alloc(32, 7).toString('base64');
    signIn.mockResolvedValue({ ...entrada, tkc: null });
    sincronizarDesdeIS.mockResolvedValue(USUARIO);

    const previo = await llamar('/api/auth/login', { email: 'a@x.com', password: 'pw' }); // sin cookie
    expect(previo.cuerpo.user.tiene_tkc).toBe(false);
    expect(setCookies(previo).some((c) => c.startsWith('tkc='))).toBe(false);
  });

  it('pasa la IP del cliente al IS', async () => {
    signIn.mockResolvedValue({ ok: false, status: 401, error: 'x' });
    await llamar('/api/auth/login', { email: 'a@x.com', password: 'pw' });
    expect(signIn).toHaveBeenCalledWith('a@x.com', 'pw', { ip: '203.0.113.7' });
  });

  it('faltan campos → 400 sin llamar al IS', async () => {
    const res = await llamar('/api/auth/login', { email: 'a@x.com' });
    expect(res.statusCode).toBe(400);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('credenciales inválidas → 401 y ninguna cookie', async () => {
    signIn.mockResolvedValue({ ok: false, status: 401, error: 'Credenciales inválidas.' });
    const res = await llamar('/api/auth/login', { email: 'a@x.com', password: 'mal' });
    expect(res.statusCode).toBe(401);
    expect(setCookies(res)).toEqual([]);
  });

  it('sin rol en el sistema (403 del IS) → 403', async () => {
    signIn.mockResolvedValue({ ok: false, status: 403, error: 'Tu cuenta no tiene acceso a Inventario.' });
    const res = await llamar('/api/auth/login', { email: 'a@x.com', password: 'pw' });
    expect(res.statusCode).toBe(403);
    expect(setCookies(res)).toEqual([]);
  });

  it('IS autentica pero el rol no es reconocido → 403 y ninguna cookie', async () => {
    signIn.mockResolvedValue(entrada);
    sincronizarDesdeIS.mockResolvedValue(null);
    const res = await llamar('/api/auth/login', { email: 'a@x.com', password: 'pw' });
    expect(res.statusCode).toBe(403);
    expect(setCookies(res)).toEqual([]);
  });

  it('usuario con activo=false → 403 y ninguna cookie', async () => {
    signIn.mockResolvedValue(entrada);
    sincronizarDesdeIS.mockResolvedValue({ ...USUARIO, activo: false });
    const res = await llamar('/api/auth/login', { email: 'a@x.com', password: 'pw' });
    expect(res.statusCode).toBe(403);
    expect(setCookies(res)).toEqual([]);
  });
});

describe('GET /api/auth/me', () => {
  it('sin sesión → 401', async () => {
    resolverSesion.mockResolvedValue(null);
    expect((await llamar('/api/auth/me', null, 'GET')).statusCode).toBe(401);
  });

  it('con sesión devuelve el perfil público', async () => {
    resolverSesion.mockResolvedValue({ email: 'a@x.com', usuario: USUARIO, sessionToken: 's' });
    const res = await llamar('/api/auth/me', null, 'GET');
    expect(res.statusCode).toBe(200);
    expect(res.cuerpo.user.email).toBe('a@x.com');
  });
});

describe('POST /api/auth/perfil', () => {
  it('no deja escribir role ni activo: solo preferencias propias', async () => {
    resolverSesion.mockResolvedValue({ email: 'a@x.com', usuario: USUARIO, sessionToken: 's' });
    queryOne.mockResolvedValue(USUARIO);

    await llamar('/api/auth/perfil', { nickname: 'Ana', role: 'superadmin', activo: true });

    const [sql] = queryOne.mock.calls[0];
    expect(sql).toContain('"nickname"');
    expect(sql).not.toContain('"role"');
    expect(sql).not.toContain('"activo"');
  });

  it('sin sesión → 401', async () => {
    resolverSesion.mockResolvedValue(null);
    expect((await llamar('/api/auth/perfil', { nickname: 'Ana' })).statusCode).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('revoca la sesión en el IS y borra solo las cookies de sesión: las de TKC duran sus 7 días', async () => {
    // El fallo del IS lo absorbe identity.signOut (ver identity.test.js).
    signOut.mockResolvedValue(undefined);

    const res = await llamar('/api/auth/logout', null, 'POST', { cookie: 'session=sess1; jwt=j' });

    expect(res.statusCode).toBe(200);
    expect(signOut).toHaveBeenCalledWith('sess1');
    const cookies = setCookies(res);
    expect(cookies.filter((c) => c.includes('Max-Age=0'))).toHaveLength(2);
    expect(cookies.some((c) => c.startsWith('tkc='))).toBe(false);
  });

  it('con la preferencia «olvidar al cerrar sesión», borra también las de TKC', async () => {
    signOut.mockResolvedValue(undefined);
    const res = await llamar('/api/auth/logout', null, 'POST', { cookie: 'session=sess1; jwt=j; tkc_olvidar=1' });
    expect(setCookies(res).some((c) => c.startsWith('tkc=;') && c.includes('Max-Age=0'))).toBe(true);
  });
});

describe('Login con Google', () => {
  const entrada = { ok: true, user: { email: 'a@x.com', name: 'A' }, jwt: 'jwt1', sessionToken: 'sess1' };
  const destino = (res) => res.cabeceras.Location;

  /** Hace el inicio y devuelve la cookie del flujo y los parámetros PKCE. */
  async function iniciar() {
    urlInicioGoogle.mockReturnValue('https://is.test/google/start');
    const res = await llamar('/api/auth/google/start', null, 'GET');
    const cookie = setCookies(res).find((c) => c.startsWith('google_flow='));
    const flujo = JSON.parse(decodeURIComponent(cookie.split(';')[0].slice('google_flow='.length)));
    return { res, cookie, flujo, args: urlInicioGoogle.mock.calls[0][0] };
  }

  /** Vuelve del IS con la cookie del flujo y la query dada. */
  const volver = (query, flujo) => llamar(
    `/api/auth/google/callback?${query}`, null, 'GET',
    flujo ? { cookie: `google_flow=${encodeURIComponent(JSON.stringify(flujo))}` } : {},
  );

  it('inicio: redirige al IS con PKCE y deja el verifier en una cookie httpOnly', async () => {
    const { res, cookie, flujo, args } = await iniciar();

    expect(res.statusCode).toBe(302);
    expect(destino(res)).toBe('https://is.test/google/start');
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Max-Age=600/);
    expect(args.redirectTo).toBe('https://inv.test/api/auth/google/callback');
    expect(args.state).toBe(flujo.state);
    // El challenge es el SHA-256 en base64url del verifier, y el verifier no sale.
    const esperado = createHash('sha256').update(flujo.verifier).digest('base64url');
    expect(args.challenge).toBe(esperado);
    expect(JSON.stringify(args)).not.toContain(flujo.verifier);
  });

  it('inicio sin APP_URL: no redirige al IS, vuelve al login con el motivo', async () => {
    delete process.env.APP_URL;
    const res = await llamar('/api/auth/google/start', null, 'GET');
    expect(destino(res)).toBe('/login?error=APP_URL_NO_CONFIGURADA');
    expect(urlInicioGoogle).not.toHaveBeenCalled();
  });

  it('vuelta correcta: canjea con el verifier, abre sesión y entra a /', async () => {
    canjearGoogle.mockResolvedValue(entrada);
    sincronizarDesdeIS.mockResolvedValue(USUARIO);

    const res = await volver('code=C1&state=S1', { verifier: 'V1', state: 'S1' });

    expect(canjearGoogle).toHaveBeenCalledWith('C1', 'V1', { ip: '203.0.113.7' });
    expect(destino(res)).toBe('/');
    const cookies = setCookies(res);
    expect(cookies.some((c) => c.startsWith('session=sess1') && c.includes('HttpOnly'))).toBe(true);
    expect(cookies.some((c) => c.startsWith('jwt=jwt1'))).toBe(true);
    // La cookie del flujo es de un solo uso.
    expect(cookies.some((c) => c.startsWith('google_flow=') && c.includes('Max-Age=0'))).toBe(true);
  });

  it('state distinto al de la cookie → STATE_INVALID y no se canjea nada', async () => {
    const res = await volver('code=C1&state=OTRO', { verifier: 'V1', state: 'S1' });
    expect(destino(res)).toBe('/login?error=STATE_INVALID');
    expect(canjearGoogle).not.toHaveBeenCalled();
  });

  it('sin cookie del flujo → STATE_INVALID', async () => {
    const res = await volver('code=C1&state=S1', null);
    expect(destino(res)).toBe('/login?error=STATE_INVALID');
    expect(canjearGoogle).not.toHaveBeenCalled();
  });

  it('cookie del flujo corrupta → STATE_INVALID, no un 500', async () => {
    const res = await llamar('/api/auth/google/callback?code=C1&state=S1', null, 'GET',
      { cookie: 'google_flow=%7Bno-es-json' });
    expect(destino(res)).toBe('/login?error=STATE_INVALID');
  });

  it('el IS devuelve ?error= → se muestra ese código y no se canjea', async () => {
    const res = await volver('error=ACCOUNT_NOT_FOUND', { verifier: 'V1', state: 'S1' });
    expect(destino(res)).toBe('/login?error=ACCOUNT_NOT_FOUND');
    expect(canjearGoogle).not.toHaveBeenCalled();
    expect(setCookies(res).some((c) => c.startsWith('session='))).toBe(false);
  });

  it('canje fallido (código caducado) → INVALID_CODE y ninguna sesión', async () => {
    canjearGoogle.mockResolvedValue({ ok: false, status: 400, code: 'INVALID_CODE' });
    const res = await volver('code=C1&state=S1', { verifier: 'V1', state: 'S1' });
    expect(destino(res)).toBe('/login?error=INVALID_CODE');
    expect(setCookies(res).some((c) => c.startsWith('session=') && !c.includes('Max-Age=0'))).toBe(false);
  });

  it('el IS autentica pero el rol no es reconocido aquí → NO_ROLES_IN_SYSTEM, sin cookies', async () => {
    canjearGoogle.mockResolvedValue(entrada);
    sincronizarDesdeIS.mockResolvedValue(null);
    const res = await volver('code=C1&state=S1', { verifier: 'V1', state: 'S1' });
    expect(destino(res)).toBe('/login?error=NO_ROLES_IN_SYSTEM');
    expect(setCookies(res).some((c) => c.startsWith('session=') && !c.includes('Max-Age=0'))).toBe(false);
  });

  it('usuario con activo=false → ACCESO_DESACTIVADO, sin cookies', async () => {
    canjearGoogle.mockResolvedValue(entrada);
    sincronizarDesdeIS.mockResolvedValue({ ...USUARIO, activo: false });
    const res = await volver('code=C1&state=S1', { verifier: 'V1', state: 'S1' });
    expect(destino(res)).toBe('/login?error=ACCESO_DESACTIVADO');
    expect(setCookies(res).some((c) => c.startsWith('session=') && !c.includes('Max-Age=0'))).toBe(false);
  });
});

describe('enrutado', () => {
  it('una ruta ajena a /api/auth/ sigue su camino', async () => {
    const res = await llamar('/api/datos/Producto/list', {});
    expect(res.statusCode).toBe(999);
  });

  it('ruta de auth desconocida → 404', async () => {
    expect((await llamar('/api/auth/nada', {})).statusCode).toBe(404);
  });
});

describe('POST /api/auth/tkc', () => {
  beforeEach(() => {
    process.env.TKC_SECRET_KEY = Buffer.alloc(32, 7).toString('base64');
    resolverSesion.mockResolvedValue({ email: 'a@x.com', usuario: USUARIO });
  });

  it('sin sesión: 401 y no prueba nada contra TKC', async () => {
    resolverSesion.mockResolvedValue(null);
    const res = await llamar('/api/auth/tkc', { username: 'ana', password: 'pw' });
    expect(res.statusCode).toBe(401);
    expect(verificarCredenciales).not.toHaveBeenCalled();
  });

  it('faltan campos: 400', async () => {
    const res = await llamar('/api/auth/tkc', { username: 'ana' });
    expect(res.statusCode).toBe(400);
    expect(verificarCredenciales).not.toHaveBeenCalled();
  });

  it('TKC las rechaza: 401 y NO se guarda cookie', async () => {
    verificarCredenciales.mockResolvedValue(false);
    const res = await llamar('/api/auth/tkc', { username: 'ana', password: 'mala' });
    expect(res.statusCode).toBe(401);
    expect(setCookies(res)).toEqual([]);
  });

  it('TKC no responde: 502 y NO se guarda cookie', async () => {
    verificarCredenciales.mockRejectedValue(new Error('timeout'));
    const res = await llamar('/api/auth/tkc', { username: 'ana', password: 'pw' });
    expect(res.statusCode).toBe(502);
    expect(setCookies(res)).toEqual([]);
  });

  it('TKC las acepta: cookie sellada y el perfil solo trae el booleano', async () => {
    verificarCredenciales.mockResolvedValue(true);
    const res = await llamar('/api/auth/tkc', { username: ' ana ', password: 'pw-tkc' });

    expect(res.statusCode).toBe(200);
    expect(verificarCredenciales).toHaveBeenCalledWith('https://tkc.test', { username: 'ana', password: 'pw-tkc' });
    expect(res.cuerpo.user.tiene_tkc).toBe(true);
    expect(JSON.stringify(res.cuerpo)).not.toMatch(/pw-tkc/);
    expect(setCookies(res).some((c) => c.startsWith('tkc=') && c.includes('HttpOnly') && !c.includes('Max-Age=0'))).toBe(true);
  });
});

describe('credenciales de TKC: olvidar y preferencia', () => {
  beforeEach(() => {
    process.env.TKC_SECRET_KEY = Buffer.alloc(32, 7).toString('base64');
    resolverSesion.mockResolvedValue({ email: 'a@x.com', usuario: USUARIO });
  });

  it('olvidar borra la cookie de TKC', async () => {
    const res = await llamar('/api/auth/tkc/olvidar', {});
    expect(res.statusCode).toBe(200);
    expect(res.cuerpo.user.tiene_tkc).toBe(false);
    expect(setCookies(res).some((c) => c.startsWith('tkc=;') && c.includes('Max-Age=0'))).toBe(true);
  });

  it('preferencia: fija o quita la cookie y lo refleja en el perfil', async () => {
    const si = await llamar('/api/auth/tkc/preferencia', { olvidarAlSalir: true });
    expect(si.cuerpo.user.tkc_olvidar_al_salir).toBe(true);
    expect(setCookies(si).some((c) => c.startsWith('tkc_olvidar=1'))).toBe(true);

    const no = await llamar('/api/auth/tkc/preferencia', { olvidarAlSalir: false });
    expect(no.cuerpo.user.tkc_olvidar_al_salir).toBe(false);
    expect(setCookies(no).some((c) => c.startsWith('tkc_olvidar=;') && c.includes('Max-Age=0'))).toBe(true);
  });

  it('sin sesión, 401', async () => {
    resolverSesion.mockResolvedValue(null);
    expect((await llamar('/api/auth/tkc/olvidar', {})).statusCode).toBe(401);
    expect((await llamar('/api/auth/tkc/preferencia', {})).statusCode).toBe(401);
  });
});
