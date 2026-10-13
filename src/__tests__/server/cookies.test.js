import { describe, it, expect } from 'vitest';
import {
  leerCookies,
  fijarCookiesSesion,
  limpiarCookiesSesion,
  COOKIE_SESSION,
  COOKIE_JWT,
} from '@/server/cookies';

/** Respuesta mínima con la interfaz de cabeceras que usa el módulo. */
function resFalsa() {
  const cabeceras = {};
  return {
    setHeader: (n, v) => { cabeceras[n] = v; },
    getHeader: (n) => cabeceras[n],
    cabeceras,
  };
}

const setCookies = (res) => {
  const v = res.getHeader('Set-Cookie');
  return Array.isArray(v) ? v : v ? [v] : [];
};

describe('leerCookies', () => {
  it('devuelve {} si no hay cabecera', () => {
    expect(leerCookies({ headers: {} })).toEqual({});
  });

  it('parsea varias cookies', () => {
    const r = leerCookies({ headers: { cookie: 'session=abc; jwt=xyz' } });
    expect(r).toEqual({ session: 'abc', jwt: 'xyz' });
  });

  it('decodifica valores percent-encoded', () => {
    expect(leerCookies({ headers: { cookie: 'a=x%20y' } })).toEqual({ a: 'x y' });
  });

  it('tolera un valor mal codificado sin lanzar', () => {
    // Un '%' suelto rompe decodeURIComponent: debe devolverse crudo.
    expect(leerCookies({ headers: { cookie: 'a=100%' } })).toEqual({ a: '100%' });
  });

  it('ignora trozos sin signo igual', () => {
    expect(leerCookies({ headers: { cookie: 'basura; a=1' } })).toEqual({ a: '1' });
  });

  it('acepta valores que contienen "="', () => {
    expect(leerCookies({ headers: { cookie: 'jwt=aa.bb==' } })).toEqual({ jwt: 'aa.bb==' });
  });
});

describe('fijarCookiesSesion', () => {
  it('ambas cookies son httpOnly, con Path y SameSite', () => {
    const res = resFalsa();
    fijarCookiesSesion(res, { sessionToken: 's1', jwt: 'j1' });

    const cookies = setCookies(res);
    expect(cookies).toHaveLength(2);
    for (const c of cookies) {
      expect(c).toContain('HttpOnly');
      expect(c).toContain('Path=/');
      expect(c).toContain('SameSite=Lax');
    }
  });

  it('el session token lleva Max-Age y el jwt no', () => {
    // El jwt dura ~15 min, pero su cookie es de sesión: si caducara sola, el
    // cliente no podría ni intentar renovarla.
    const res = resFalsa();
    fijarCookiesSesion(res, { sessionToken: 's1', jwt: 'j1', diasSesion: 7 });

    const sesion = setCookies(res).find((c) => c.startsWith(`${COOKIE_SESSION}=`));
    const jwt = setCookies(res).find((c) => c.startsWith(`${COOKIE_JWT}=`));

    expect(sesion).toContain(`Max-Age=${7 * 24 * 60 * 60}`);
    expect(jwt).not.toContain('Max-Age');
  });

  it('permite fijar solo el jwt, al renovarlo', () => {
    const res = resFalsa();
    fijarCookiesSesion(res, { jwt: 'nuevo' });
    expect(setCookies(res)).toHaveLength(1);
    expect(setCookies(res)[0]).toContain(`${COOKIE_JWT}=nuevo`);
  });

  it('no pisa las Set-Cookie que ya hubiera', () => {
    const res = resFalsa();
    res.setHeader('Set-Cookie', 'otra=1');
    fijarCookiesSesion(res, { jwt: 'j' });
    expect(setCookies(res)).toHaveLength(2);
  });

  it('codifica el valor para no romper la cabecera', () => {
    const res = resFalsa();
    fijarCookiesSesion(res, { sessionToken: 'a;b c' });
    // Un ';' sin codificar partiría la cookie en dos atributos.
    expect(setCookies(res)[0]).not.toContain('a;b');
  });
});

describe('limpiarCookiesSesion', () => {
  it('expira ambas con Max-Age=0', () => {
    const res = resFalsa();
    limpiarCookiesSesion(res);
    const cookies = setCookies(res);
    expect(cookies).toHaveLength(2);
    for (const c of cookies) expect(c).toContain('Max-Age=0');
  });
});

describe('secure segun el entorno', () => {
  it('en desarrollo no marca Secure', () => {
    // En dev se sirve por http://localhost y el navegador descartaría una
    // cookie Secure, dejando al usuario sin poder entrar.
    const res = resFalsa();
    fijarCookiesSesion(res, { jwt: 'j' });
    expect(setCookies(res)[0]).not.toContain('Secure');
  });
});
