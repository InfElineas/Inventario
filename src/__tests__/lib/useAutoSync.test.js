import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// ── Mock de supabase: synced_at configurable por prueba + upsert espiado ──
const mockSyncedAt = vi.hoisted(() => ({ current: null }));
const upsertMock   = vi.hoisted(() => vi.fn().mockResolvedValue({}));

vi.mock('@/api/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { synced_at: mockSyncedAt.current } }),
          }),
        }),
      }),
      upsert: upsertMock,
    }),
  },
}));

import { useAutoSync, getLastSync, setLastSync } from '@/lib/useAutoSync';

beforeEach(() => {
  mockSyncedAt.current = null;
  upsertMock.mockClear();
});

describe('getLastSync / setLastSync', () => {
  it('getLastSync devuelve el synced_at que retorna la consulta', async () => {
    mockSyncedAt.current = '2026-07-17T10:00:00.000Z';
    const result = await getLastSync('a@mercadoelineas.com', '1');
    expect(result).toBe('2026-07-17T10:00:00.000Z');
  });

  it('getLastSync devuelve null si no hay registro previo', async () => {
    mockSyncedAt.current = null;
    expect(await getLastSync('a@mercadoelineas.com', '1')).toBeNull();
  });

  it('setLastSync llama a upsert con los datos correctos', async () => {
    await setLastSync('a@mercadoelineas.com', '1', 10, 2);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_email: 'a@mercadoelineas.com', almacen: '1', synced: 10, errors: 2 }),
      { onConflict: 'user_email,almacen' }
    );
  });
});

describe('useAutoSync', () => {
  const baseUser = (overrides = {}) => ({
    email: 'inv@mercadoelineas.com',
    sync_config: { auto_sync: true, almacenes_sync: ['1'] },
    almacenes_config: [],
    ...overrides,
  });

  it('no dispara sync si enabled es false', async () => {
    const onSync = vi.fn();
    mockSyncedAt.current = null; // nunca sincronizado — dispararía si estuviera habilitado
    renderHook(() => useAutoSync({ user: baseUser(), onSync, enabled: false }));
    await new Promise((r) => setTimeout(r, 0));
    expect(onSync).not.toHaveBeenCalled();
  });

  it('no dispara sync si no hay email de usuario', async () => {
    const onSync = vi.fn();
    renderHook(() => useAutoSync({ user: { email: null }, onSync, enabled: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(onSync).not.toHaveBeenCalled();
  });

  it('no dispara sync si auto_sync está desactivado en la config del usuario', async () => {
    const onSync = vi.fn();
    const user = baseUser({ sync_config: { auto_sync: false, almacenes_sync: ['1'] } });
    renderHook(() => useAutoSync({ user, onSync, enabled: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(onSync).not.toHaveBeenCalled();
  });

  it('no dispara sync si no hay ningún almacén configurado', async () => {
    const onSync = vi.fn();
    const user = baseUser({ sync_config: { auto_sync: true, almacenes_sync: [] }, almacenes_config: [] });
    renderHook(() => useAutoSync({ user, onSync, enabled: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(onSync).not.toHaveBeenCalled();
  });

  it('dispara sync al montar si el almacén nunca se ha sincronizado', async () => {
    const onSync = vi.fn();
    mockSyncedAt.current = null;
    renderHook(() => useAutoSync({ user: baseUser(), onSync, enabled: true }));
    await waitFor(() => expect(onSync).toHaveBeenCalledWith('1'));
  });

  it('dispara sync si el último sync fue hace más de 1 hora', async () => {
    const onSync = vi.fn();
    mockSyncedAt.current = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // hace 2h
    renderHook(() => useAutoSync({ user: baseUser(), onSync, enabled: true }));
    await waitFor(() => expect(onSync).toHaveBeenCalledWith('1'));
  });

  it('NO dispara sync si el último sync fue hace menos de 1 hora', async () => {
    const onSync = vi.fn();
    mockSyncedAt.current = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // hace 10 min
    renderHook(() => useAutoSync({ user: baseUser(), onSync, enabled: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(onSync).not.toHaveBeenCalled();
  });

  it('usa almacenes_config del perfil si sync_config.almacenes_sync está vacío', async () => {
    const onSync = vi.fn();
    mockSyncedAt.current = null;
    const user = baseUser({ sync_config: { auto_sync: true, almacenes_sync: [] }, almacenes_config: ['5'] });
    renderHook(() => useAutoSync({ user, onSync, enabled: true }));
    await waitFor(() => expect(onSync).toHaveBeenCalledWith('5'));
  });
});
