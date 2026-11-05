import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const auth = vi.hoisted(() => ({ user: null, refrescar: vi.fn() }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: auth.user, refrescarSesion: auth.refrescar }) }));

const { default: ElegirAlmacenesDialog } = await import('@/components/layout/ElegirAlmacenesDialog');
const { debeElegirAlmacenes } = await import('@/lib/roles');

beforeEach(() => {
  cleanup();
  auth.refrescar.mockReset().mockResolvedValue(null);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
  auth.user = { email: 'ana@x.com', role: 'inv', almacenes_config: [] };
});

describe('debeElegirAlmacenes', () => {
  it('sin almacenes y sin ser jefe: sí', () => {
    expect(debeElegirAlmacenes({ email: 'a@x', role: 'inv', almacenes_config: [] })).toBe(true);
    expect(debeElegirAlmacenes({ email: 'a@x', role: 'fact' })).toBe(true);
  });
  it('con algún almacén: no', () => {
    expect(debeElegirAlmacenes({ email: 'a@x', role: 'inv', almacenes_config: ['789'] })).toBe(false);
  });
  it('un jefe de departamento, o un administrador, no están obligados', () => {
    expect(debeElegirAlmacenes({ email: 'a@x', roles: ['jefe_depto', 'jefe_inventario'] })).toBe(false);
    expect(debeElegirAlmacenes({ email: 'a@x', role: 'administrador' })).toBe(false);
    expect(debeElegirAlmacenes({ email: 'a@x', role: 'superadmin' })).toBe(false);
  });
  it('sin usuario todavía, no se pregunta', () => {
    expect(debeElegirAlmacenes(null)).toBe(false);
  });
});

describe('ElegirAlmacenesDialog', () => {
  it('sale cuando no hay almacenes y no se puede guardar sin elegir uno', () => {
    render(<ElegirAlmacenesDialog />);
    expect(screen.getByText(/Con qué almacenes trabajas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Elige al menos un almacén/ })).toBeDisabled();
  });

  it('no sale si ya tiene almacenes', () => {
    auth.user = { email: 'ana@x.com', role: 'inv', almacenes_config: ['789'] };
    render(<ElegirAlmacenesDialog />);
    expect(screen.queryByText(/Con qué almacenes trabajas/)).toBeNull();
  });

  it('no se cierra con Escape', async () => {
    const user = userEvent.setup();
    render(<ElegirAlmacenesDialog />);
    await user.keyboard('{Escape}');
    expect(screen.getByText(/Con qué almacenes trabajas/)).toBeInTheDocument();
  });

  it('guarda los elegidos en el perfil y refresca la sesión', async () => {
    const user = userEvent.setup();
    render(<ElegirAlmacenesDialog />);
    await user.click(screen.getByRole('button', { name: /TKC SUB 789/ }));
    await user.click(screen.getByRole('button', { name: /TKC SUB 1005/ }));
    await user.click(screen.getByRole('button', { name: /Guardar \(2\)/ }));

    await waitFor(() => expect(auth.refrescar).toHaveBeenCalled());
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('/api/auth/perfil');
    expect(JSON.parse(opts.body)).toEqual({ almacenes_config: ['789', '1005'], almacen_num: '789' });
  });

  it('si no se pudo guardar, lo dice y sigue abierto', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ error: 'Sin permiso' }), { status: 403 }));
    const user = userEvent.setup();
    render(<ElegirAlmacenesDialog />);
    await user.click(screen.getByRole('button', { name: /TKC SUB 789/ }));
    await user.click(screen.getByRole('button', { name: /Guardar \(1\)/ }));

    expect(await screen.findByText('Sin permiso')).toBeInTheDocument();
    expect(auth.refrescar).not.toHaveBeenCalled();
  });
});
