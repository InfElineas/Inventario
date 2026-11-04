import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fechaLimite, sesionActiva, parsearActivos, parsearDespacho, cierreExitoso,
  leerPagina, leerDespacho, cerrarDespacho, RUTA_DESPACHOS,
} from '@/services/tkc/despachos';
import {
  paginaDespachos, despachoConFormulario, despachoSinFormulario, despachoIncompleto, paginaLogin,
} from '../fixtures/despachosTkc';

describe('fechaLimite', () => {
  it('hasta ayer: los despachos de hoy no se cierran', () => {
    expect(fechaLimite(new Date(2026, 10, 4, 21, 0))).toBe('2026-11-03');
  });

  it('cruza el mes y el año', () => {
    expect(fechaLimite(new Date(2026, 10, 1))).toBe('2026-10-31');
    expect(fechaLimite(new Date(2026, 0, 1))).toBe('2025-12-31');
  });
});

describe('sesionActiva', () => {
  it('la página de despachos, con 200', () => {
    expect(sesionActiva({ status: 200, html: paginaDespachos() })).toBe(true);
  });

  it('el login, o cualquier otro estado, es sesión caducada', () => {
    expect(sesionActiva({ status: 200, html: paginaLogin })).toBe(false);
    expect(sesionActiva({ status: 302, html: '' })).toBe(false);
    expect(sesionActiva({ status: 403, html: paginaDespachos() })).toBe(false);
  });
});

describe('parsearActivos', () => {
  const html = paginaDespachos({
    activos: [
      { fecha: '2026-11-02', ids: ['300'] },
      { fecha: '2026-10-30', ids: ['210', '205'] },
      { fecha: '2026-10-28', ids: ['100'] },
    ],
    cerrados: [{ fecha: '2026-10-01', ids: ['1', '2'] }],
  });

  it('solo los activos hasta el límite, del más antiguo al más nuevo', () => {
    const r = parsearActivos(html, { limite: '2026-11-01' });
    expect(r.estructuraOk).toBe(true);
    expect(r.despachos).toEqual([
      { despachoId: '100', fecha: '2026-10-28' },
      { despachoId: '205', fecha: '2026-10-30' },
      { despachoId: '210', fecha: '2026-10-30' },
    ]);
  });

  it('el día del límite entra, el siguiente no', () => {
    expect(parsearActivos(html, { limite: '2026-11-02' }).despachos.map((d) => d.despachoId)).toContain('300');
    expect(parsearActivos(html, { limite: '2026-11-01' }).despachos.map((d) => d.despachoId)).not.toContain('300');
  });

  it('nunca toca los cerrados', () => {
    const ids = parsearActivos(html, { limite: '2030-01-01' }).despachos.map((d) => d.despachoId);
    expect(ids).not.toContain('1');
    expect(ids).not.toContain('2');
  });

  it('un despacho repetido sale una vez', () => {
    const repetido = paginaDespachos({ activos: [{ fecha: '2026-10-28', ids: ['100', '100'] }] });
    expect(parsearActivos(repetido, { limite: '2026-11-01' }).despachos).toHaveLength(1);
  });

  it('sin la sección de activos, la estructura no es la esperada y no se adivina', () => {
    expect(parsearActivos('<html>otra cosa</html>', { limite: '2026-11-01' })).toEqual({ estructuraOk: false, despachos: [] });
  });

  it('sin despachos activos, vacío y la estructura bien', () => {
    expect(parsearActivos(paginaDespachos(), { limite: '2026-11-01' })).toEqual({ estructuraOk: true, despachos: [] });
  });
});

describe('parsearDespacho', () => {
  it('con formulario: el token y los números', () => {
    expect(parsearDespacho(despachoConFormulario('abc', { interno: '77', numero: '12' }), 200))
      .toEqual({ omitir: false, csrf: 'abc', numInterno: '77', numDespacho: '12' });
  });

  it('reconoce el token con el valor delante del nombre', () => {
    const html = '<input value="zzz" name="form[_token]">';
    expect(parsearDespacho(html, 200)).toMatchObject({ omitir: false, csrf: 'zzz' });
  });

  it('sin formulario: ya cerrado o aún no habilitado', () => {
    const r = parsearDespacho(despachoSinFormulario(), 200);
    expect(r.omitir).toBe(true);
    expect(r.motivo).toMatch(/Sin formulario de cierre/);
  });

  it('incompleto: faltan productos por confirmar, y lo dice', () => {
    const r = parsearDespacho(despachoIncompleto(1, 3), 200);
    expect(r.omitir).toBe(true);
    expect(r.motivo).toMatch(/Incompleto.*1 de 3/);
  });

  it('un estado que no es 200 se omite con su código', () => {
    expect(parsearDespacho('', 500)).toEqual({ omitir: true, motivo: 'TKC respondió 500 al pedir el despacho.' });
  });
});

describe('cierreExitoso', () => {
  it('302 y 200 sí; lo demás no', () => {
    expect(cierreExitoso(302)).toBe(true);
    expect(cierreExitoso(200)).toBe(true);
    expect(cierreExitoso(500)).toBe(false);
    expect(cierreExitoso(403)).toBe(false);
  });
});

describe('la red', () => {
  const config = { tkcBase: 'https://tkc.test/products/backend', tkcUser: 'ana', tkcPass: 'x' };

  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('leerPagina: la ruta de despachos con la cookie, sin seguir redirecciones', async () => {
    fetch.mockResolvedValue(new Response('<html>Despachos Activos</html>', { status: 200 }));
    const r = await leerPagina(config, 'TKC=abc');

    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(`https://tkc.test/products/backend${RUTA_DESPACHOS}`);
    expect(opts.headers.Cookie).toBe('TKC=abc');
    expect(opts.redirect).toBe('manual');
    expect(r).toEqual({ status: 200, html: '<html>Despachos Activos</html>' });
  });

  it('leerDespacho: proveedor y despacho en la ruta, como petición AJAX', async () => {
    fetch.mockResolvedValue(new Response('<div/>', { status: 200 }));
    await leerDespacho(config, 'TKC=abc', '1508', '205');
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(`https://tkc.test/products/backend${RUTA_DESPACHOS}despacho-data/1508/205`);
    expect(opts.headers['X-Requested-With']).toBe('XMLHttpRequest');
  });

  it('cerrarDespacho: POST con el token del formulario, sin seguir la redirección', async () => {
    fetch.mockResolvedValue(new Response(null, { status: 302 }));
    const r = await cerrarDespacho(config, 'TKC=abc', '205', 'tok+/=');

    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(`https://tkc.test/products/backend${RUTA_DESPACHOS}despacho-submit/205`);
    expect(opts.method).toBe('POST');
    expect(opts.redirect).toBe('manual');
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(opts.headers.Origin).toBe('https://tkc.test');
    // El token va codificado: lleva caracteres que romperían el formulario.
    expect(opts.body).toBe('form%5B_token%5D=tok%2B%2F%3D');
    expect(r).toEqual({ status: 302 });
  });
});
