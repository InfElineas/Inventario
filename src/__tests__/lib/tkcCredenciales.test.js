import { describe, it, expect, vi } from 'vitest';
import {
  conCredencialesTkc, pedirCredencialesTkc, resolverPeticionTkc, suscribirPeticionTkc,
} from '@/lib/tkcCredenciales';

const SIN_TKC = { status: 403, body: { codigo: 'no_tkc_credentials' } };
const SIN_TKC_AJUSTES = { status: 403, body: { error: { code: 'no_tkc_credentials' } } };
const OK = { status: 200, body: { ok: true } };

/** Abre el diálogo y espera a que alguien lo resuelva. */
const diálogoResuelto = (guardadas) => {
  const baja = suscribirPeticionTkc((abierto) => {
    if (abierto) queueMicrotask(() => resolverPeticionTkc(guardadas));
  });
  return baja;
};

describe('conCredencialesTkc', () => {
  it('respuesta normal: no abre el diálogo ni repite', async () => {
    const abierto = vi.fn();
    const baja = suscribirPeticionTkc(abierto);
    abierto.mockClear();
    const peticion = vi.fn().mockResolvedValue(OK);

    expect(await conCredencialesTkc(peticion)).toBe(OK);
    expect(peticion).toHaveBeenCalledTimes(1);
    expect(abierto).not.toHaveBeenCalled();
    baja();
  });

  it.each([SIN_TKC, SIN_TKC_AJUSTES])('pide credenciales y repite UNA vez si las guardan', async (falta) => {
    const baja = diálogoResuelto(true);
    const peticion = vi.fn().mockResolvedValueOnce(falta).mockResolvedValueOnce(OK);

    expect(await conCredencialesTkc(peticion)).toBe(OK);
    expect(peticion).toHaveBeenCalledTimes(2);
    baja();
  });

  it('si cancelan, devuelve la respuesta original y no repite', async () => {
    const baja = diálogoResuelto(false);
    const peticion = vi.fn().mockResolvedValue(SIN_TKC);

    expect(await conCredencialesTkc(peticion)).toBe(SIN_TKC);
    expect(peticion).toHaveBeenCalledTimes(1);
    baja();
  });

  it('un 403 de otro motivo no abre el diálogo', async () => {
    const forbidden = { status: 403, body: { error: { code: 'forbidden' } } };
    const peticion = vi.fn().mockResolvedValue(forbidden);
    expect(await conCredencialesTkc(peticion)).toBe(forbidden);
    expect(peticion).toHaveBeenCalledTimes(1);
  });

  it('varias llamadas a la vez comparten un solo diálogo', async () => {
    const a = pedirCredencialesTkc();
    const b = pedirCredencialesTkc();
    expect(a).toBe(b);
    resolverPeticionTkc(true);
    expect(await a).toBe(true);
  });
});
