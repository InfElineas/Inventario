import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { recordarCredenciales, leerCredenciales } from '@/server/credencialesTkc';
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
  it('guarda sellado en cookie httpOnly y se vuelve a leer', () => {
    const res = resFalsa();
    expect(recordarCredenciales(res, CREDS)).toBe(true);
    const c = cookies(res)[0];
    expect(c).toMatch(/^tkc=/);
    expect(c).toContain('HttpOnly');
    expect(decodeURIComponent(c)).not.toContain('s3cr3t');
    expect(leerCredenciales(reqCon(res))).toEqual(CREDS);
  });

  it('sin credenciales (null) borra la cookie', () => {
    const res = resFalsa();
    expect(recordarCredenciales(res, null)).toBe(false);
    expect(cookies(res)[0]).toMatch(/^tkc=;.*Max-Age=0/);
  });

  it('credenciales incompletas cuentan como ninguna', () => {
    const res = resFalsa();
    expect(recordarCredenciales(res, { username: 'a', password: '' })).toBe(false);
  });

  it('sin TKC_SECRET_KEY no lanza: registra y borra la cookie', () => {
    delete process.env.TKC_SECRET_KEY;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = resFalsa();
    expect(recordarCredenciales(res, CREDS)).toBe(false);
    expect(cookies(res)[0]).toContain('Max-Age=0');
  });

  it('una cookie que no abre (clave rotada) es «sin credenciales», no un error', () => {
    const res = resFalsa();
    recordarCredenciales(res, CREDS);
    process.env.TKC_SECRET_KEY = OTRA;
    expect(leerCredenciales(reqCon(res))).toBeNull();
  });

  it('sin cookie, null', () => {
    expect(leerCredenciales({ headers: {} })).toBeNull();
  });
});
