import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const resolverSesion = vi.hoisted(() => vi.fn());
vi.mock('@/server/session', () => ({ resolverSesion }));
const leerCredenciales = vi.hoisted(() => vi.fn());
vi.mock('@/server/credencialesTkc', () => ({ leerCredenciales }));
const query = vi.hoisted(() => vi.fn(async () => ({ rows: [] })));
vi.mock('@/server/db', () => ({ query }));

const tkc = vi.hoisted(() => ({
  iniciarSesion: vi.fn(), leerPagina: vi.fn(),
}));
vi.mock('@/services/tkc/despachos', async (importOriginal) => ({
  ...(await importOriginal()),
  iniciarSesion: tkc.iniciarSesion,
  leerPagina: tkc.leerPagina,
}));

const { createDespachosApiMiddleware, proveedoresConfigurados } = await import('@/server/despachosApi');
const { puedeCerrarDespachos } = await import('@/lib/roles');
const { paginaDespachos, paginaLogin } = await import('../fixtures/despachosTkc');

const CREDS = { username: 'ana.tkc', password: 's3cr3t' };
const SESION = (role = 'inv', extra = {}) => ({ email: 'a@x.com', usuario: { role, email: 'a@x.com', full_name: 'Ana', ...extra } });

function peticion(url, cuerpo, metodo = 'GET') {
  const manejadores = {};
  const req = {
    url, method: metodo, headers: {},
    on: (ev, fn) => {
      manejadores[ev] = fn;
      if (ev === 'end') queueMicrotask(() => {
        if (cuerpo !== undefined) manejadores.data?.(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
        manejadores.end?.();
      });
      return req;
    },
  };
  return req;
}
function respuesta() {
  const r = { statusCode: 0, cuerpo: null, cabeceras: {}, setHeader: (k, v) => { r.cabeceras[k] = v; }, end: (c) => { r.cuerpo = c ? JSON.parse(c) : null; } };
  return r;
}

let mw;
let ejecutar;
async function llamar(url, cuerpo, metodo) {
  const res = respuesta();
  const sigue = vi.fn();
  await mw(peticion(url, cuerpo, metodo), res, sigue);
  return { res, sigue };
}
const hasta = async (fn) => { await vi.waitFor(fn); };

const original = { ...process.env };
beforeEach(() => {
  process.env.TKC_BASE = 'https://tkc.test/base';
  process.env.DESPACHOS_PROVEEDORES = '{"789":"1508","1005":"2200"}';
  resolverSesion.mockReset().mockResolvedValue(SESION());
  leerCredenciales.mockReset().mockReturnValue(CREDS);
  query.mockClear();
  tkc.iniciarSesion.mockReset().mockResolvedValue('TKC=abc');
  tkc.leerPagina.mockReset().mockResolvedValue({
    status: 200,
    html: paginaDespachos({ activos: [{ fecha: '2020-01-02', ids: ['7', '5'] }, { fecha: '2020-01-01', ids: ['3'] }] }),
  });
  ejecutar = vi.fn(async ({ alFila }) => {
    alFila({ despachoId: '3', fecha: '2020-01-01', numDespacho: '30', estado: 'cerrado' });
    return { estado: 'terminado', filas: [], limite: '2026-11-03' };
  });
  mw = createDespachosApiMiddleware({ ejecutar });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { process.env = { ...original }; vi.restoreAllMocks(); });

describe('quién puede', () => {
  it('inventario, su jefe y los administradores; facturación o auditoría, no', () => {
    expect(puedeCerrarDespachos({ role: 'inv' })).toBe(true);
    expect(puedeCerrarDespachos({ roles: ['administrador'] })).toBe(true);
    expect(puedeCerrarDespachos({ roles: ['superadmin'] })).toBe(true);
    expect(puedeCerrarDespachos({ roles: ['jefe_depto', 'jefe_inventario'] })).toBe(true);
    expect(puedeCerrarDespachos({ roles: ['jefe_depto', 'jefe_facturacion'] })).toBe(false);
    expect(puedeCerrarDespachos({ role: 'fact' })).toBe(false);
    expect(puedeCerrarDespachos({ role: 'auditor' })).toBe(false);
  });
});

describe('proveedoresConfigurados', () => {
  it('el JSON del entorno, solo con ids numéricos', () => {
    expect(proveedoresConfigurados({ DESPACHOS_PROVEEDORES: '{"789":"1508","x":"abc","1005":2200}' })).toEqual({ 789: '1508', 1005: '2200' });
  });

  it('un JSON roto o ausente es «sin configurar», no una caída', () => {
    expect(proveedoresConfigurados({ DESPACHOS_PROVEEDORES: '{roto' })).toEqual({});
    expect(proveedoresConfigurados({})).toEqual({});
  });
});

describe('acceso y rutas', () => {
  it('lo que no es de despachos sigue su camino', async () => {
    const { sigue } = await llamar('/api/ventas/resumen');
    expect(sigue).toHaveBeenCalled();
  });

  it('rutas o métodos que no existen: 404', async () => {
    for (const [url, metodo] of [['/api/despachos/otra', 'GET'], ['/api/despachos/cerrar', 'GET'], ['/api/despachos/pendientes', 'POST']]) {
      expect((await llamar(url, {}, metodo)).res.statusCode, `${metodo} ${url}`).toBe(404);
    }
  });

  it('sin sesión: 401; un rol que no cierra despachos: 403', async () => {
    resolverSesion.mockResolvedValue(null);
    expect((await llamar('/api/despachos/almacenes')).res.statusCode).toBe(401);
    resolverSesion.mockResolvedValue(SESION('fact'));
    expect((await llamar('/api/despachos/almacenes')).res.statusCode).toBe(403);
    expect(tkc.iniciarSesion).not.toHaveBeenCalled();
  });

  it('los almacenes con proveedor, con su nombre', async () => {
    const { res } = await llamar('/api/despachos/almacenes');
    expect(res.statusCode).toBe(200);
    expect(res.cuerpo.configurado).toBe(true);
    expect(res.cuerpo.almacenes.map((a) => a.key)).toEqual(['789', '1005']);
    expect(res.cuerpo.almacenes[0].nombre).toMatch(/789/);
  });

  it('sin proveedores configurados lo dice, para que el botón no ofrezca nada', async () => {
    process.env.DESPACHOS_PROVEEDORES = '';
    const { res } = await llamar('/api/despachos/almacenes');
    expect(res.cuerpo).toEqual({ almacenes: [], configurado: false });
  });
});

describe('pendientes (solo lectura)', () => {
  it('inicia sesión con las credenciales de la persona, lee la página y devuelve lo que se cerraría', async () => {
    const { res } = await llamar('/api/despachos/pendientes?almacen=789');

    expect(res.statusCode).toBe(200);
    expect(tkc.iniciarSesion).toHaveBeenCalledWith({ tkcBase: 'https://tkc.test/base', tkcUser: 'ana.tkc', tkcPass: 's3cr3t' });
    expect(res.cuerpo.proveedorId).toBe('1508');
    // Del más antiguo al más nuevo.
    expect(res.cuerpo.despachos.map((d) => d.despachoId)).toEqual(['3', '5', '7']);
    expect(res.cuerpo.total).toBe(3);
    expect(res.cuerpo.limite).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Es de lectura: nada se escribe ni se registra.
    expect(query).not.toHaveBeenCalled();
  });

  it('un almacén sin proveedor: 400 con la explicación', async () => {
    const { res } = await llamar('/api/despachos/pendientes?almacen=615');
    expect(res.statusCode).toBe(400);
    expect(res.cuerpo.error.code).toBe('sin_proveedor');
    expect(tkc.iniciarSesion).not.toHaveBeenCalled();
  });

  it('sin credenciales de TKC: 403, y nunca se cae a una cuenta de servicio', async () => {
    leerCredenciales.mockReturnValue(null);
    const { res } = await llamar('/api/despachos/pendientes?almacen=789');
    expect(res.statusCode).toBe(403);
    expect(res.cuerpo.error.code).toBe('no_tkc_credentials');
    expect(tkc.iniciarSesion).not.toHaveBeenCalled();
  });

  it('si TKC rechaza la cuenta o no la deja ver la página, lo dice', async () => {
    tkc.iniciarSesion.mockRejectedValue(new Error('POST login_check HTTP 500'));
    expect((await llamar('/api/despachos/pendientes?almacen=789')).res.cuerpo.error.code).toBe('tkc_login');

    tkc.iniciarSesion.mockResolvedValue('TKC=abc');
    tkc.leerPagina.mockResolvedValue({ status: 200, html: paginaLogin });
    const { res } = await llamar('/api/despachos/pendientes?almacen=789');
    expect(res.statusCode).toBe(502);
    expect(res.cuerpo.error.code).toBe('tkc_sin_acceso');
  });

  it('si TKC cambió la estructura, lo dice en vez de enseñar una lista vacía', async () => {
    tkc.leerPagina.mockResolvedValue({ status: 200, html: '<html>Despachos Activos, otra estructura</html>' });
    const { res } = await llamar('/api/despachos/pendientes?almacen=789');
    expect(res.cuerpo.error.code).toBe('tkc_estructura');
  });

  it('falta TKC_BASE: 503', async () => {
    delete process.env.TKC_BASE;
    expect((await llamar('/api/despachos/pendientes?almacen=789')).res.statusCode).toBe(503);
  });
});

describe('cerrar', () => {
  it('arranca un trabajo en segundo plano (202) con la cuenta de la persona y el proveedor del almacén', async () => {
    const { res } = await llamar('/api/despachos/cerrar', { almacen: '789', maximo: 1 }, 'POST');

    expect(res.statusCode).toBe(202);
    expect(res.cuerpo).toMatchObject({ almacen: '789', estado: 'corriendo', maximo: 1 });
    expect(ejecutar).toHaveBeenCalledTimes(1);
    const args = ejecutar.mock.calls[0][0];
    expect(args.config).toEqual({ tkcBase: 'https://tkc.test/base', tkcUser: 'ana.tkc', tkcPass: 's3cr3t' });
    expect(args.proveedorId).toBe('1508');
    expect(args.maximo).toBe(1);
  });

  it('el avance se consulta aparte, y al terminar queda anotado quién cerró qué', async () => {
    const { res } = await llamar('/api/despachos/cerrar', { almacen: '789' }, 'POST');
    const id = res.cuerpo.id;

    await hasta(async () => {
      const t = (await llamar(`/api/despachos/trabajo?id=${id}`)).res.cuerpo;
      expect(t.estado).toBe('terminado');
    });
    const t = (await llamar(`/api/despachos/trabajo?id=${id}`)).res.cuerpo;
    expect(t.resumen).toEqual({ cerrados: 1, omitidos: 0, fallidos: 0, total: 1 });

    await hasta(() => expect(query).toHaveBeenCalledTimes(1));
    const [sql, valores] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO historial_movimientos/);
    expect(valores[0]).toBe('a@x.com');
    expect(valores[2]).toBe('almacen 789');
    expect(valores[3]).toMatch(/terminado: 1 cerrados, 0 omitidos, 0 fallidos \(#30\)/);
  });

  it('no deja dos cierres a la vez en el mismo almacén, pero sí en otros', async () => {
    const soltadores = [];
    ejecutar.mockImplementation(() => new Promise((r) => { soltadores.push(() => r({ estado: 'terminado', filas: [], limite: 'x' })); }));

    expect((await llamar('/api/despachos/cerrar', { almacen: '789' }, 'POST')).res.statusCode).toBe(202);
    const segundo = await llamar('/api/despachos/cerrar', { almacen: '789' }, 'POST');
    expect(segundo.res.statusCode).toBe(409);
    expect(segundo.res.cuerpo.error.code).toBe('en_curso');
    expect((await llamar('/api/despachos/cerrar', { almacen: '1005' }, 'POST')).res.statusCode).toBe(202);

    // Al terminar el primero, el almacén queda libre.
    soltadores[0]();
    await hasta(async () => {
      expect((await llamar('/api/despachos/cerrar', { almacen: '789' }, 'POST')).res.statusCode).toBe(202);
    });
  });

  it('el máximo se limita a 200, y uno inválido se ignora', async () => {
    await llamar('/api/despachos/cerrar', { almacen: '789', maximo: 99999 }, 'POST');
    expect(ejecutar.mock.calls[0][0].maximo).toBe(200);
    await llamar('/api/despachos/cerrar', { almacen: '1005', maximo: -3 }, 'POST');
    expect(ejecutar.mock.calls[1][0].maximo).toBe(200);
  });

  it('almacén sin proveedor: 400; sin credenciales: 403; cuerpo roto: 400. No arranca nada', async () => {
    expect((await llamar('/api/despachos/cerrar', { almacen: '615' }, 'POST')).res.statusCode).toBe(400);
    leerCredenciales.mockReturnValue(null);
    expect((await llamar('/api/despachos/cerrar', { almacen: '789' }, 'POST')).res.statusCode).toBe(403);
    leerCredenciales.mockReturnValue(CREDS);
    expect((await llamar('/api/despachos/cerrar', '{roto', 'POST')).res.statusCode).toBe(400);
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it('un fallo del trabajo queda en el trabajo, no tumba la petición', async () => {
    ejecutar.mockRejectedValue(new Error('se cayó'));
    const { res } = await llamar('/api/despachos/cerrar', { almacen: '789' }, 'POST');
    await hasta(async () => {
      const t = (await llamar(`/api/despachos/trabajo?id=${res.cuerpo.id}`)).res.cuerpo;
      expect(t).toMatchObject({ estado: 'fallido', error: 'se cayó' });
    });
  });
});

describe('trabajo y cancelar', () => {
  it('cada quien ve sus trabajos; otra persona, no; un administrador, todos', async () => {
    let soltar;
    ejecutar.mockImplementation(() => new Promise((r) => { soltar = () => r({ estado: 'terminado', filas: [], limite: 'x' }); }));
    const { res } = await llamar('/api/despachos/cerrar', { almacen: '789' }, 'POST');
    const id = res.cuerpo.id;

    resolverSesion.mockResolvedValue({ email: 'otra@x.com', usuario: { role: 'inv', email: 'otra@x.com' } });
    expect((await llamar(`/api/despachos/trabajo?id=${id}`)).res.statusCode).toBe(404);

    resolverSesion.mockResolvedValue({ email: 'adm@x.com', usuario: { role: 'administrador', email: 'adm@x.com' } });
    expect((await llamar(`/api/despachos/trabajo?id=${id}`)).res.statusCode).toBe(200);
    soltar();
  });

  it('un trabajo que no existe: 404', async () => {
    expect((await llamar('/api/despachos/trabajo?id=nada')).res.statusCode).toBe(404);
  });

  it('cancelar marca el trabajo, y el cierre lo mira entre un despacho y el siguiente', async () => {
    let cancelado;
    ejecutar.mockImplementation(async (a) => { cancelado = a.cancelado; return new Promise(() => {}); });
    const { res } = await llamar('/api/despachos/cerrar', { almacen: '789' }, 'POST');
    expect(cancelado()).toBe(false);

    await llamar(`/api/despachos/cancelar?id=${res.cuerpo.id}`, {}, 'POST');
    expect(cancelado()).toBe(true);
  });
});
