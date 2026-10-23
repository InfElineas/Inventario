import { describe, it, expect } from 'vitest';
import { SECURITY_HEADERS, aplicarCabecerasSeguridad } from '@/server/securityHeaders';

describe('cabeceras de seguridad', () => {
  it('prohíbe incrustar la app en un iframe', () => {
    expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
  });

  it('deja la cámara a la propia página: el escáner de códigos la necesita', () => {
    expect(SECURITY_HEADERS['Permissions-Policy']).toContain('camera=(self)');
    expect(SECURITY_HEADERS['Permissions-Policy']).not.toContain('camera=()');
  });

  it('las aplica todas a la respuesta', () => {
    const puestas = {};
    aplicarCabecerasSeguridad({ setHeader: (k, v) => { puestas[k] = v; } });
    expect(puestas).toEqual(SECURITY_HEADERS);
  });
});
