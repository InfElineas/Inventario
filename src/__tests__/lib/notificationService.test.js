import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock de supabase: contadores configurables por prueba + insert espiado ──
const mockCounts = vi.hoisted(() => ({ usuariosPendientes: 0, recepcionesDiferencias: 0 }));
const insertMock = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));

vi.mock('@/api/supabaseClient', () => ({
  supabase: {
    from: (table) => {
      if (table === 'notificaciones') {
        return { insert: insertMock };
      }
      if (table === 'usuarios') {
        return { select: () => ({ eq: () => Promise.resolve({ count: mockCounts.usuariosPendientes }) }) };
      }
      if (table === 'recepciones') {
        return { select: () => ({ eq: () => Promise.resolve({ count: mockCounts.recepcionesDiferencias }) }) };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: [] }) }) };
    },
  },
}));

import { runSmartNotifications, wasFired, markFired, getDedup } from '@/lib/notificationService';

const titulosInsertados = () => insertMock.mock.calls.map(([row]) => row.titulo);

beforeEach(() => {
  localStorage.clear();
  mockCounts.usuariosPendientes = 0;
  mockCounts.recepcionesDiferencias = 0;
  insertMock.mockClear();
});

// ── Mecanismo de deduplicación (localStorage, TTL 24h) ─────────────────────
describe('deduplicación (wasFired/markFired/getDedup)', () => {
  it('una clave nunca marcada no está "fired"', () => {
    expect(wasFired('clave_nueva')).toBe(false);
  });

  it('markFired hace que wasFired devuelva true para esa clave', () => {
    markFired('clave_x');
    expect(wasFired('clave_x')).toBe(true);
  });

  it('no afecta otras claves distintas', () => {
    markFired('clave_x');
    expect(wasFired('clave_y')).toBe(false);
  });

  it('expira después de 24 horas (TTL)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 17, 10, 0, 0));
    markFired('clave_ttl');
    expect(wasFired('clave_ttl')).toBe(true);

    vi.setSystemTime(new Date(2026, 6, 18, 10, 0, 1)); // 24h y 1s después
    expect(wasFired('clave_ttl')).toBe(false);
    expect(getDedup()['clave_ttl']).toBeUndefined();
    vi.useRealTimers();
  });
});

// ── runSmartNotifications ──────────────────────────────────────────────────
describe('runSmartNotifications', () => {
  it('no hace nada si no hay usuario con email', async () => {
    await runSmartNotifications({ user: null });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('notifica lotes vencidos con stock', async () => {
    await runSmartNotifications({
      user: { email: 'inv@mercadoelineas.com', role: 'inv' },
      lotes: [{ estado_fv: 'vencido', cantidad: 5 }],
    });
    expect(titulosInsertados()).toContainEqual(expect.stringMatching(/lote.*vencido/i));
  });

  it('NO notifica lotes vencidos sin stock (cantidad 0)', async () => {
    await runSmartNotifications({
      user: { email: 'inv@mercadoelineas.com', role: 'inv' },
      lotes: [{ estado_fv: 'vencido', cantidad: 0 }],
    });
    expect(titulosInsertados()).not.toContainEqual(expect.stringMatching(/vencido/i));
  });

  it('no repite la misma notificación en una segunda corrida el mismo día (dedup)', async () => {
    const args = {
      user: { email: 'inv@mercadoelineas.com', role: 'inv' },
      lotes: [{ estado_fv: 'vencido', cantidad: 5 }],
    };
    await runSmartNotifications(args);
    expect(insertMock).toHaveBeenCalledTimes(1);

    await runSmartNotifications(args);
    expect(insertMock).toHaveBeenCalledTimes(1); // no se duplicó
  });

  it('regresión: si el conteo de lotes vencidos cambia el mismo día, sigue deduplicando (no debe reventar por conteo)', async () => {
    const email = 'inv@mercadoelineas.com';
    await runSmartNotifications({ user: { email, role: 'inv' }, lotes: [{ estado_fv: 'vencido', cantidad: 5 }] });
    expect(insertMock).toHaveBeenCalledTimes(1);

    // Antes del fix, cambiar el conteo generaba una dedupKey distinta y
    // volvía a insertar una notificación "nueva" el mismo día — ya no debe pasar.
    await runSmartNotifications({
      user: { email, role: 'inv' },
      lotes: [{ estado_fv: 'vencido', cantidad: 3 }, { estado_fv: 'vencido', cantidad: 2 }],
    });
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it('stock bajo mínimo solo aplica a inv/administrador, no a otros roles', async () => {
    const productos = [{ activo: true, stock_minimo: 10, exist_fisica: 2 }];

    await runSmartNotifications({ user: { email: 'auditor@mercadoelineas.com', role: 'auditor' }, productos });
    expect(titulosInsertados()).not.toContainEqual(expect.stringMatching(/stock mínimo/i));

    insertMock.mockClear();
    await runSmartNotifications({ user: { email: 'inv2@mercadoelineas.com', role: 'inv' }, productos });
    expect(titulosInsertados()).toContainEqual(expect.stringMatching(/stock mínimo/i));
  });

  it('reconteos solicitados solo notifican a inv/administrador', async () => {
    const mermas = [{ estado_tarea: 'reconteo_solicitado' }];
    await runSmartNotifications({ user: { email: 'inv3@mercadoelineas.com', role: 'inv' }, mermas });
    expect(titulosInsertados()).toContainEqual(expect.stringMatching(/reconteo/i));
  });

  it('pendientes de facturación solo notifican a fact/administrador', async () => {
    const mermas = [{ estado_tarea: 'pend_fact' }];
    await runSmartNotifications({ user: { email: 'fact@mercadoelineas.com', role: 'fact' }, mermas });
    expect(titulosInsertados()).toContainEqual(expect.stringMatching(/facturación/i));

    insertMock.mockClear();
    await runSmartNotifications({ user: { email: 'ca@mercadoelineas.com', role: 'ca' }, mermas });
    expect(titulosInsertados()).not.toContainEqual(expect.stringMatching(/facturación/i));
  });

  it('jefe_depto solo recibe el resumen de su propio departamento', async () => {
    const mermas = [{ estado_tarea: 'devuelto' }];
    await runSmartNotifications({
      user: { email: 'jefe@mercadoelineas.com', role: 'jefe_depto', departamento: 'inventario' },
      mermas,
    });
    expect(titulosInsertados()).toContainEqual(expect.stringMatching(/devuelta.*INV/i));

    insertMock.mockClear();
    await runSmartNotifications({
      user: { email: 'jefe2@mercadoelineas.com', role: 'jefe_depto', departamento: 'ca' },
      mermas, // devueltos, pero su depto es "ca" — no debe disparar la regla de "inventario"
    });
    expect(titulosInsertados()).not.toContainEqual(expect.stringMatching(/devuelta.*INV/i));
  });

  it('usuarios pendientes de aprobación solo se consulta/notifica para administrador', async () => {
    mockCounts.usuariosPendientes = 3;
    await runSmartNotifications({ user: { email: 'admin@mercadoelineas.com', role: 'administrador' } });
    expect(titulosInsertados()).toContainEqual(expect.stringMatching(/3 usuarios pendientes/i));
  });

  it('recepciones con diferencias notifica a inv y administrador', async () => {
    mockCounts.recepcionesDiferencias = 2;
    await runSmartNotifications({ user: { email: 'inv4@mercadoelineas.com', role: 'inv' } });
    expect(titulosInsertados()).toContainEqual(expect.stringMatching(/con diferencias/i));
  });

  it('lotes próximos a vencer (30 días) aplica a cualquier rol', async () => {
    const lotes = [{ estado_fv: 'por_vencer', cantidad: 4 }];
    await runSmartNotifications({ user: { email: 'ca2@mercadoelineas.com', role: 'ca' }, lotes });
    expect(titulosInsertados()).toContainEqual(expect.stringMatching(/próximo.*vencer/i));
  });
});
