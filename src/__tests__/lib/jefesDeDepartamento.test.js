import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({ filtrar: vi.fn() }));
vi.mock('@/api/base44Client', () => ({ base44: { entities: { Usuario: { filter: m.filtrar } } } }));

const { jefesDe } = await import('@/lib/jefesDeDepartamento');

beforeEach(() => m.filtrar.mockReset());

describe('jefesDe', () => {
  const gente = [
    { email: 'a@x.com', roles: ['jefe_depto', 'jefe_facturacion', 'fact'] },
    { email: 'b@x.com', roles: ['jefe_depto', 'jefe_inventario', 'jefe_facturacion'] },
    { email: 'c@x.com', roles: ['fact'] },
    { email: 'd@x.com', role: 'jefe_depto', departamento: 'ca' },
  ];

  it('los jefes del departamento, por sus roles; quien dirige dos sale en los dos', async () => {
    m.filtrar.mockResolvedValue(gente);
    expect((await jefesDe('facturacion')).map((u) => u.email)).toEqual(['a@x.com', 'b@x.com']);
    expect((await jefesDe('inventario')).map((u) => u.email)).toEqual(['b@x.com']);
  });

  it('un rol operativo no es ser jefe, y un jefe de antes sigue siéndolo de su departamento', async () => {
    m.filtrar.mockResolvedValue(gente);
    expect((await jefesDe('ca')).map((u) => u.email)).toEqual(['d@x.com']);
  });

  it('solo pide a los activos', async () => {
    m.filtrar.mockResolvedValue([]);
    await jefesDe('ca');
    expect(m.filtrar.mock.calls[0][0]).toEqual({ activo: true });
  });
});
