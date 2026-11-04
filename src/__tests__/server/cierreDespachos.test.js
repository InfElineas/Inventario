import { describe, it, expect, vi } from 'vitest';
import { ejecutarCierre, resumirFilas, MAX_DESPACHOS, MAX_FALLOS_SEGUIDOS, PAUSA_MS } from '@/server/cierreDespachos';
import {
  paginaDespachos, despachoConFormulario, despachoSinFormulario, despachoIncompleto, paginaLogin,
} from '../fixtures/despachosTkc';

/**
 * Un TKC de mentira con su cola: solo el despacho MÁS ANTIGUO trae el formulario,
 * como hace el de verdad. Es lo que obliga al cierre a ir de uno en uno.
 */
function tkcSimulado({ despachos, incompletos = [], fallanAlCerrar = [], caducaEn = null, sinEstructura = false } = {}) {
  const activos = despachos.map((d) => ({ ...d }));   // { id, fecha }
  const log = { sesiones: 0, paginas: 0, cierres: [] };
  let paginas = 0;

  const api = {
    iniciarSesion: vi.fn(async () => { log.sesiones += 1; return `TKC=sesion${log.sesiones}`; }),
    leerPagina: vi.fn(async (_c, cookie) => {
      paginas += 1; log.paginas = paginas;
      if (caducaEn && paginas === caducaEn && cookie === 'TKC=sesion1') return { status: 200, html: paginaLogin };
      if (sinEstructura) return { status: 200, html: '<html>Despachos Activos pero otra estructura</html>' };
      const porFecha = new Map();
      for (const d of activos) porFecha.set(d.fecha, [...(porFecha.get(d.fecha) ?? []), d.id]);
      return { status: 200, html: paginaDespachos({ activos: [...porFecha].map(([fecha, ids]) => ({ fecha, ids })) }) };
    }),
    leerDespacho: vi.fn(async (_c, _k, _p, id) => {
      const masAntiguo = [...activos].sort((a, b) => a.fecha.localeCompare(b.fecha) || Number(a.id) - Number(b.id))[0];
      if (incompletos.includes(id)) return { status: 200, html: despachoIncompleto(1, 3) };
      if (masAntiguo?.id !== id) return { status: 200, html: despachoSinFormulario() };
      return { status: 200, html: despachoConFormulario(`tok-${id}`, { interno: '90' + id, numero: id }) };
    }),
    cerrarDespacho: vi.fn(async (_c, _k, id) => {
      log.cierres.push(id);
      if (fallanAlCerrar.includes(id)) return { status: 500 };
      activos.splice(activos.findIndex((d) => d.id === id), 1);
      return { status: 302 };
    }),
  };
  return { api, log, activos };
}

const config = { tkcBase: 'https://tkc.test/base', tkcUser: 'ana', tkcPass: 'x' };
const HOY = new Date(2026, 10, 4);   // el límite es el 3 de noviembre
const base = { config, proveedorId: '1508', hoy: HOY, pausaMs: 0, esperar: async () => {} };

describe('ejecutarCierre — el camino normal', () => {
  it('cierra todos los pendientes hasta ayer, del más antiguo al más nuevo y de uno en uno', async () => {
    const { api, log } = tkcSimulado({
      despachos: [{ id: '3', fecha: '2026-11-02' }, { id: '1', fecha: '2026-10-30' }, { id: '2', fecha: '2026-10-30' }],
    });
    const r = await ejecutarCierre({ ...base, api });

    expect(r.estado).toBe('terminado');
    expect(log.cierres).toEqual(['1', '2', '3']);
    expect(resumirFilas(r.filas)).toEqual({ cerrados: 3, omitidos: 0, fallidos: 0, total: 3 });
    // Entre uno y otro se vuelve a pedir la página: así TKC libera el siguiente de la cola.
    expect(log.paginas).toBe(4);
    expect(r.filas[0]).toMatchObject({ despachoId: '1', numDespacho: '1', numInterno: '901', estado: 'cerrado', fecha: '2026-10-30' });
  });

  it('un solo inicio de sesión para toda la corrida, con las credenciales de quien lo pide', async () => {
    const { api } = tkcSimulado({ despachos: [{ id: '1', fecha: '2026-10-30' }, { id: '2', fecha: '2026-10-31' }] });
    await ejecutarCierre({ ...base, api });
    expect(api.iniciarSesion).toHaveBeenCalledTimes(1);
    expect(api.iniciarSesion).toHaveBeenCalledWith(config);
  });

  it('los de hoy no se tocan, aunque estén ahí', async () => {
    const { api, log } = tkcSimulado({ despachos: [{ id: '1', fecha: '2026-11-03' }, { id: '2', fecha: '2026-11-04' }] });
    const r = await ejecutarCierre({ ...base, api });
    expect(log.cierres).toEqual(['1']);          // el del 3 (ayer) sí; el del 4 (hoy) no
    expect(r.limite).toBe('2026-11-03');
  });

  it('sin nada pendiente termina sin cerrar nada', async () => {
    const { api, log } = tkcSimulado({ despachos: [] });
    const r = await ejecutarCierre({ ...base, api });
    expect(r).toMatchObject({ estado: 'terminado', filas: [] });
    expect(log.cierres).toEqual([]);
  });

  it('avisa de cada despacho según lo trata, y espera entre uno y otro', async () => {
    const { api } = tkcSimulado({ despachos: [{ id: '1', fecha: '2026-10-30' }, { id: '2', fecha: '2026-10-31' }] });
    const alFila = vi.fn();
    const esperar = vi.fn(async () => {});
    await ejecutarCierre({ ...base, api, alFila, esperar, pausaMs: PAUSA_MS });
    expect(alFila.mock.calls.map(([f]) => f.despachoId)).toEqual(['1', '2']);
    expect(esperar).toHaveBeenCalledWith(PAUSA_MS);
    expect(esperar).toHaveBeenCalledTimes(2);
  });
});

describe('ejecutarCierre — barreras', () => {
  it('«solo el más antiguo»: el máximo corta la corrida', async () => {
    const { api, log } = tkcSimulado({ despachos: [{ id: '1', fecha: '2026-10-30' }, { id: '2', fecha: '2026-10-31' }] });
    const r = await ejecutarCierre({ ...base, api, maximo: 1 });
    expect(log.cierres).toEqual(['1']);
    expect(r.estado).toBe('terminado');
  });

  it('nunca pasa de su freno de emergencia, pida lo que pida', async () => {
    const { api } = tkcSimulado({ despachos: [] });
    await expect(ejecutarCierre({ ...base, api, maximo: 99999 })).resolves.toBeDefined();
    expect(MAX_DESPACHOS).toBe(200);
  });

  it('un despacho incompleto se omite con su motivo y no se vuelve a intentar', async () => {
    const { api, log } = tkcSimulado({
      despachos: [{ id: '1', fecha: '2026-10-30' }, { id: '2', fecha: '2026-10-31' }], incompletos: ['1'],
    });
    const r = await ejecutarCierre({ ...base, api });

    expect(r.filas[0]).toMatchObject({ despachoId: '1', estado: 'omitido' });
    expect(r.filas[0].motivo).toMatch(/Incompleto/);
    // Como el 1 sigue ahí, el 2 no es el más antiguo y TKC no le da formulario: se omite sin cerrar nada.
    expect(log.cierres).toEqual([]);
    expect(r.filas.filter((f) => f.despachoId === '1')).toHaveLength(1);
  });

  it('un fallo al cerrar se anota y la corrida sigue con el siguiente', async () => {
    const { api, log } = tkcSimulado({
      despachos: [{ id: '1', fecha: '2026-10-30' }, { id: '2', fecha: '2026-10-31' }], fallanAlCerrar: ['1'],
    });
    const r = await ejecutarCierre({ ...base, api });
    expect(r.filas[0]).toMatchObject({ despachoId: '1', estado: 'fallido' });
    expect(r.filas[0].motivo).toMatch(/TKC respondió 500/);
    // El 1 no se cerró, así que el 2 no tiene formulario (sigue la cola): se omite, no se fuerza.
    expect(log.cierres).toEqual(['1']);
  });

  it(`${MAX_FALLOS_SEGUIDOS} fallos seguidos paran la corrida: no se insiste`, async () => {
    const ids = ['1', '2', '3', '4', '5'];
    const { api, log } = tkcSimulado({
      despachos: ids.map((id, i) => ({ id, fecha: `2026-10-${10 + i}` })), fallanAlCerrar: ids,
    });
    // Cada uno falla y se excluye; como no se cierra, los siguientes no traen formulario y se omiten:
    // para forzar fallos seguidos, el simulado da formulario a todos.
    api.leerDespacho.mockImplementation(async (_c, _k, _p, id) => ({ status: 200, html: despachoConFormulario(`t${id}`) }));
    const r = await ejecutarCierre({ ...base, api });

    expect(r.estado).toBe('fallido');
    expect(r.error).toMatch(/3 fallos seguidos/);
    expect(log.cierres).toHaveLength(3);
  });

  it('una excepción de red al cerrar cuenta como fallo, con su mensaje', async () => {
    const { api } = tkcSimulado({ despachos: [{ id: '1', fecha: '2026-10-30' }] });
    api.cerrarDespacho.mockRejectedValue(new Error('ECONNRESET'));
    const r = await ejecutarCierre({ ...base, api });
    expect(r.filas[0]).toMatchObject({ estado: 'fallido' });
    expect(r.filas[0].motivo).toMatch(/ECONNRESET/);
  });

  it('si TKC cambió la estructura de la página, se para y no cierra nada a ciegas', async () => {
    const { api, log } = tkcSimulado({ despachos: [{ id: '1', fecha: '2026-10-30' }], sinEstructura: true });
    const r = await ejecutarCierre({ ...base, api });
    expect(r.estado).toBe('fallido');
    expect(r.error).toMatch(/TKC pudo cambiar la página/);
    expect(log.cierres).toEqual([]);
  });

  it('si la sesión caduca a mitad, se renueva una vez y sigue', async () => {
    const { api, log } = tkcSimulado({
      despachos: [{ id: '1', fecha: '2026-10-30' }, { id: '2', fecha: '2026-10-31' }], caducaEn: 2,
    });
    const r = await ejecutarCierre({ ...base, api });
    expect(log.sesiones).toBe(2);
    expect(log.cierres).toEqual(['1', '2']);
    expect(r.estado).toBe('terminado');
  });

  it('si ni renovada la sesión da la página (la cuenta no tiene acceso), se para', async () => {
    const { api } = tkcSimulado({ despachos: [{ id: '1', fecha: '2026-10-30' }] });
    api.leerPagina.mockResolvedValue({ status: 200, html: paginaLogin });
    const r = await ejecutarCierre({ ...base, api });
    expect(r.estado).toBe('fallido');
    expect(r.error).toMatch(/no tiene acceso/);
    expect(api.iniciarSesion).toHaveBeenCalledTimes(2);
  });

  it('un login que falla lo dice, y no hace nada más', async () => {
    const { api } = tkcSimulado({ despachos: [] });
    api.iniciarSesion.mockRejectedValue(new Error('HTTP 500'));
    const r = await ejecutarCierre({ ...base, api });
    expect(r).toMatchObject({ estado: 'fallido', filas: [] });
    expect(r.error).toMatch(/No se pudo iniciar sesión en TKC: HTTP 500/);
    expect(api.leerPagina).not.toHaveBeenCalled();
  });

  it('se puede cancelar entre un despacho y el siguiente', async () => {
    const { api, log } = tkcSimulado({
      despachos: [{ id: '1', fecha: '2026-10-30' }, { id: '2', fecha: '2026-10-31' }, { id: '3', fecha: '2026-11-01' }],
    });
    let cierres = 0;
    api.cerrarDespacho.mockImplementation(async (_c, _k, id) => { cierres += 1; log.cierres.push(id); return { status: 302 }; });
    api.leerDespacho.mockImplementation(async (_c, _k, _p, id) => ({ status: 200, html: despachoConFormulario(`t${id}`) }));
    const r = await ejecutarCierre({ ...base, api, cancelado: () => cierres >= 1 });
    expect(r.estado).toBe('cancelado');
    expect(log.cierres).toHaveLength(1);
  });
});

describe('resumirFilas', () => {
  it('cuenta por estado', () => {
    expect(resumirFilas([{ estado: 'cerrado' }, { estado: 'cerrado' }, { estado: 'omitido' }, { estado: 'fallido' }]))
      .toEqual({ cerrados: 2, omitidos: 1, fallidos: 1, total: 4 });
  });
});
