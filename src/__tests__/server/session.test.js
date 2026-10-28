import { describe, it, expect, vi, beforeEach } from 'vitest';

// La base se sustituye: estas pruebas verifican la lógica de decisión, no SQL.
const queryOne = vi.hoisted(() => vi.fn());
vi.mock('@/server/db', () => ({ queryOne }));

const verifyJwt = vi.hoisted(() => vi.fn());
const refreshJwt = vi.hoisted(() => vi.fn());
const getRoles = vi.hoisted(() => vi.fn());
vi.mock('@/server/identity', () => ({ verifyJwt, refreshJwt, getRoles }));

const { sincronizarUsuario, resolverSesion } = await import('@/server/session');

const USUARIO = {
  id: 'u1', email: 'a@mercadoelineas.com', full_name: 'A', role: 'inv', activo: true,
};

beforeEach(() => {
  queryOne.mockReset();
  verifyJwt.mockReset();
  refreshJwt.mockReset();
  getRoles.mockReset();
});

describe('sincronizarUsuario — espejado del rol', () => {
  it('escribe en usuarios.role el rol que dice el IS', async () => {
    queryOne.mockResolvedValue(USUARIO);
    await sincronizarUsuario({ email: USUARIO.email, nombre: 'A', roles: [{ name: 'inv' }] });

    const [, valores] = queryOne.mock.calls[0];
    expect(valores).toEqual([USUARIO.email, 'A', 'inv', ['inv']]);
  });

  it('con varios roles guarda TODOS, y como principal el de mayor precedencia', async () => {
    // Guardar solo el principal quitaba permisos: quien es inventarista y
    // además factura perdía lo que solo puede `inv`.
    queryOne.mockResolvedValue({ ...USUARIO, role: 'administrador' });
    await sincronizarUsuario({
      email: USUARIO.email, nombre: 'A',
      roles: [{ name: 'inv' }, { name: 'administrador' }],
    });

    const [, valores] = queryOne.mock.calls[0];
    expect(valores[2]).toBe('administrador');
    expect(valores[3]).toEqual(['administrador', 'inv']);
  });

  it('un rol que el sistema no conoce no se guarda', async () => {
    queryOne.mockResolvedValue(USUARIO);
    await sincronizarUsuario({
      email: USUARIO.email, nombre: 'A', roles: [{ name: 'inv' }, { name: 'vendedor' }],
    });
    expect(queryOne.mock.calls[0][1][3]).toEqual(['inv']);
  });

  it('sin rol en el sistema no toca la base en absoluto', async () => {
    // Que el IS autentique no implica acceso a Inventario: sin rol no se crea
    // ni se actualiza el perfil local.
    const r = await sincronizarUsuario({ email: USUARIO.email, nombre: 'A', roles: [] });
    expect(r).toBeNull();
    expect(queryOne).not.toHaveBeenCalled();
  });

  it('un rol desconocido del IS no concede acceso', async () => {
    const r = await sincronizarUsuario({
      email: USUARIO.email, nombre: 'A', roles: [{ name: 'vendedor' }],
    });
    expect(r).toBeNull();
    expect(queryOne).not.toHaveBeenCalled();
  });
});

describe('resolverSesion', () => {
  const req = (cookie) => ({ headers: cookie ? { cookie } : {} });
  const res = () => {
    const h = {};
    return { setHeader: (k, v) => { h[k] = v; }, getHeader: (k) => h[k], h };
  };

  it('sin cookie de sesión no hay sesión', async () => {
    expect(await resolverSesion(req(), res())).toBeNull();
    expect(verifyJwt).not.toHaveBeenCalled();
  });

  it('con jwt válido devuelve el perfil local', async () => {
    verifyJwt.mockResolvedValue({ sub: 'x', email: USUARIO.email });
    queryOne.mockResolvedValue(USUARIO);

    const s = await resolverSesion(req('session=s1; jwt=j1'), res());
    expect(s.email).toBe(USUARIO.email);
    expect(s.usuario.role).toBe('inv');
    expect(refreshJwt).not.toHaveBeenCalled();
  });

  it('si el jwt expiró lo renueva y actualiza la cookie', async () => {
    verifyJwt.mockResolvedValueOnce(null)                                  // el de la cookie
             .mockResolvedValueOnce({ sub: 'x', email: USUARIO.email });   // el renovado
    refreshJwt.mockResolvedValue('j2');
    queryOne.mockResolvedValue(USUARIO);

    const r = res();
    const s = await resolverSesion(req('session=s1; jwt=viejo'), r);

    expect(s).not.toBeNull();
    expect(refreshJwt).toHaveBeenCalledWith('s1');
    expect(String(r.getHeader('Set-Cookie'))).toContain('jwt=j2');
  });

  it('si el session token también murió, no hay sesión', async () => {
    verifyJwt.mockResolvedValue(null);
    refreshJwt.mockResolvedValue(null);

    expect(await resolverSesion(req('session=s1; jwt=viejo'), res())).toBeNull();
    expect(queryOne).not.toHaveBeenCalled();
  });

  it('un usuario desactivado localmente no tiene sesión', async () => {
    // `activo` es el interruptor local: bloquea en esta app sin tocar el IS.
    verifyJwt.mockResolvedValue({ sub: 'x', email: USUARIO.email });
    queryOne.mockResolvedValue({ ...USUARIO, activo: false });

    expect(await resolverSesion(req('session=s1; jwt=j1'), res())).toBeNull();
  });

  it('un email sin perfil local no tiene sesión', async () => {
    verifyJwt.mockResolvedValue({ sub: 'x', email: 'otro@mercadoelineas.com' });
    queryOne.mockResolvedValue(null);

    expect(await resolverSesion(req('session=s1; jwt=j1'), res())).toBeNull();
  });

  it('un jwt válido sin email no sirve: el vínculo con la app es el email', async () => {
    verifyJwt.mockResolvedValue({ sub: 'x' });
    expect(await resolverSesion(req('session=s1; jwt=j1'), res())).toBeNull();
    expect(queryOne).not.toHaveBeenCalled();
  });
});
