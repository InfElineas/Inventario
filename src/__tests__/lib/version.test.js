import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hayVersionNueva, leerVersionRemota, releaseSinVer, leerReleaseVista, marcarReleaseVista,
} from '@/lib/version';
import { RELEASES, TIPOS_DE_CAMBIO } from '@/data/releases';

describe('hayVersionNueva', () => {
  it('es nueva cuando la compilación del servidor no es la que se ejecuta', () => {
    expect(hayVersionNueva('a', { build: 'b' })).toBe(true);
    expect(hayVersionNueva('a', { build: 'a' })).toBe(false);
  });

  it('sin datos del servidor, o en desarrollo, nunca avisa', () => {
    expect(hayVersionNueva('a', null)).toBe(false);
    expect(hayVersionNueva('a', {})).toBe(false);
    expect(hayVersionNueva('dev', { build: 'b' })).toBe(false);
    expect(hayVersionNueva('', { build: 'b' })).toBe(false);
  });
});

describe('leerVersionRemota', () => {
  it('lee la compilación y la última novedad, sin caché', async () => {
    const pedir = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ build: 'x', release: { version: 'v' } }) });
    expect(await leerVersionRemota(pedir)).toEqual({ build: 'x', release: { version: 'v' } });
    expect(pedir).toHaveBeenCalledWith('/version.json', expect.objectContaining({ cache: 'no-store' }));
  });

  it('un fallo de red, una página en vez de JSON o una respuesta rara no son una versión nueva', async () => {
    expect(await leerVersionRemota(vi.fn().mockRejectedValue(new Error('red')))).toBeNull();
    expect(await leerVersionRemota(vi.fn().mockResolvedValue({ ok: false }))).toBeNull();
    expect(await leerVersionRemota(vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error('no es JSON'); } }))).toBeNull();
    expect(await leerVersionRemota(vi.fn().mockResolvedValue({ ok: true, json: async () => ({ otra: 1 }) }))).toBeNull();
  });
});

describe('releaseSinVer', () => {
  const lista = [{ version: '2' }, { version: '1' }];

  it('enseña la última si no es la que ya se vio, o si nunca se vio ninguna', () => {
    expect(releaseSinVer(null, lista)).toBe(lista[0]);
    expect(releaseSinVer('1', lista)).toBe(lista[0]);
  });

  it('si ya vio la última, nada', () => {
    expect(releaseSinVer('2', lista)).toBeNull();
    expect(releaseSinVer('2', [])).toBeNull();
  });
});

describe('lo ya visto se recuerda en el navegador', () => {
  beforeEach(() => localStorage.clear());

  it('guarda y lee la última versión vista', () => {
    expect(leerReleaseVista()).toBeNull();
    marcarReleaseVista('2026.11.06');
    expect(leerReleaseVista()).toBe('2026.11.06');
  });
});

describe('las novedades (src/data/releases.js)', () => {
  it('hay al menos una, con versión única', () => {
    expect(RELEASES.length).toBeGreaterThan(0);
    const versiones = RELEASES.map((r) => r.version);
    expect(new Set(versiones).size).toBe(versiones.length);
  });

  it('van de la más nueva a la más vieja', () => {
    const fechas = RELEASES.map((r) => r.fecha);
    expect([...fechas].sort().reverse()).toEqual(fechas);
  });

  it('cada una tiene fecha válida, título y cambios con un tipo conocido y su texto', () => {
    for (const r of RELEASES) {
      expect(r.fecha, r.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.titulo.trim().length, r.version).toBeGreaterThan(0);
      expect(r.cambios.length, r.version).toBeGreaterThan(0);
      for (const c of r.cambios) {
        expect(TIPOS_DE_CAMBIO, `${r.version}: ${c.texto}`).toContain(c.tipo);
        expect(c.texto.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
