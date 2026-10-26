import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { recordarCredenciales, leerCredenciales, estadoCredenciales } from '@/server/credencialesTkc';
import { sellar, abrir } from '@/server/secretBox';

const CLAVE = Buffer.alloc(32, 7).toString('base64');
const OTRA = Buffer.alloc(32, 9).toString('base64');
const CREDS = { username: 'ana.tkc', password: 's3cr3t' };

function resFalsa() {
  const cab = {};
  return {
    setHeader: (n, v) => { cab[n] = v; },
    getHeader: (n) => cab[n],
  };
}
const cookies = (res) => [].concat(res.getHeader('Set-Cookie') ?? []);
/** La petición que mandaría el navegador de vuelta con lo que fijó la respuesta. */
const reqCon = (res) => ({
  headers: { cookie: cookies(res).map((c) => c.split(';')[0]).join('; ') },
});

const original = { ...process.env };
beforeEach(() => { process.env.TKC_SECRET_KEY = CLAVE; });
afterEach(() => { process.env = { ...original }; vi.restoreAllMocks(); });

describe('secretBox', () => {
  it('lo sellado se abre igual, también con acentos', () => {
    expect(abrir(sellar('contraseña · ñÁ€'))).toBe('contraseña · ñÁ€');
  });

  it('cada sellado usa un IV distinto', () => {
    expect(sellar('x')).not.toBe(sellar('x'));
  });

  it('con otra clave, manipulado o con basura, lanza', () => {
    const s = sellar('x');
    process.env.TKC_SECRET_KEY = OTRA;
    expect(() => abrir(s)).toThrow();
    process.env.TKC_SECRET_KEY = CLAVE;
    expect(() => abrir(s.slice(0, -2) + 'AA')).toThrow();
    expect(() => abrir('basura')).toThrow();
  });

  it('las dos claves son independientes', () => {
    process.env.TKC_HANDOFF_KEY = OTRA;
    const s = sellar('x', 'TKC_HANDOFF_KEY');
    expect(abrir(s, 'TKC_HANDOFF_KEY')).toBe('x');
    expect(() => abrir(s)).toThrow();
  });

  it('formato v1.<iv>.<tag>.<ct> (compatible con elineas-transferencia)', () => {
    expect(sellar('x').split('.')).toHaveLength(4);
    expect(sellar('x').startsWith('v1.')).toBe(true);
  });
});

describe('credencialesTkc', () => {
  const EMAIL = 'ana@x.com';

  it('guarda sellado en cookie httpOnly de 7 días y se vuelve a leer', () => {
    const res = resFalsa();
    const exp = recordarCredenciales(res, CREDS, EMAIL);
    const c = cookies(res)[0];
    expect(c).toMatch(/^tkc=/);
    expect(c).toContain('HttpOnly');
    expect(c).toContain(`Max-Age=${7 * 24 * 60 * 60}`);
    expect(decodeURIComponent(c)).not.toContain('s3cr3t');
    expect(exp).toBeGreaterThan(Date.now() + 6.9 * 24 * 3600 * 1000);
    expect(leerCredenciales(reqCon(res), EMAIL)).toEqual(CREDS);
    expect(estadoCredenciales(reqCon(res), EMAIL)).toMatchObject({ tiene: true, expira: exp });
  });

  it('caduca a los 7 días aunque el navegador siga mandando la cookie', () => {
    vi.useFakeTimers();
    const res = resFalsa();
    recordarCredenciales(res, CREDS, EMAIL);
    vi.advanceTimersByTime(7 * 24 * 3600 * 1000 + 1000);
    expect(leerCredenciales(reqCon(res), EMAIL)).toBeNull();
    expect(estadoCredenciales(reqCon(res), EMAIL).tiene).toBe(false);
    vi.useRealTimers();
  });

  it('otra persona en el mismo navegador no las hereda', () => {
    const res = resFalsa();
    recordarCredenciales(res, CREDS, EMAIL);
    expect(leerCredenciales(reqCon(res), 'otra@x.com')).toBeNull();
    expect(leerCredenciales(reqCon(res), 'ANA@x.com')).toEqual(CREDS);
  });

  it('sin credenciales (null) borra la cookie', () => {
    const res = resFalsa();
    expect(recordarCredenciales(res, null, EMAIL)).toBeNull();
    expect(cookies(res)[0]).toMatch(/^tkc=;.*Max-Age=0/);
  });

  it('credenciales incompletas cuentan como ninguna', () => {
    expect(recordarCredenciales(resFalsa(), { username: 'a', password: '' }, EMAIL)).toBeNull();
  });

  it('sin TKC_SECRET_KEY no lanza: registra y borra la cookie', () => {
    delete process.env.TKC_SECRET_KEY;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = resFalsa();
    expect(recordarCredenciales(res, CREDS, EMAIL)).toBeNull();
    expect(cookies(res)[0]).toContain('Max-Age=0');
  });

  it('una cookie que no abre (clave rotada) es «sin credenciales», no un error', () => {
    const res = resFalsa();
    recordarCredenciales(res, CREDS, EMAIL);
    process.env.TKC_SECRET_KEY = OTRA;
    expect(leerCredenciales(reqCon(res), EMAIL)).toBeNull();
  });

  it('sin cookie, null; y la preferencia de olvidar se lee de su cookie', () => {
    expect(leerCredenciales({ headers: {} }, EMAIL)).toBeNull();
    expect(estadoCredenciales({ headers: { cookie: 'tkc_olvidar=1' } }, EMAIL).olvidarAlSalir).toBe(true);
  });
});
