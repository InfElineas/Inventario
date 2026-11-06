import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const auth = vi.hoisted(() => ({ user: null, refrescar: vi.fn() }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: auth.user, refrescarSesion: auth.refrescar }) }));

const alm = vi.hoisted(() => ({ setAlmacen: vi.fn() }));
vi.mock('@/lib/useAlmacen', () => ({ useAlmacen: () => ({ almacen: '', setAlmacen: alm.setAlmacen, almacenesConfig: [] }) }));

const { default: ElegirAlmacenesDialog } = await import('@/components/layout/ElegirAlmacenesDialog');
const { debeElegirAlmacenes, veAlertasDeAnuncios } = await import('@/lib/roles');

beforeEach(() => {
  cleanup();
  auth.refrescar.mockReset().mockResolvedValue(null);
  alm.setAlmacen.mockReset();
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

describe('veAlertasDeAnuncios: aviso para facturación y anuncios', () => {
  it('lo ven facturación, anuncios, quien dirige esas áreas y la administración', () => {
    for (const roles of [['fact'], ['ca'], ['esp_anuncio'], ['administrador'], ['superadmin'], ['jefe_depto', 'jefe_facturacion'], ['jefe_depto', 'jefe_ca']]) {
      expect(veAlertasDeAnuncios({ email: 'a@x', roles }), roles.join()).toBe(true);
    }
  });

  it('inventario, auditoría y el jefe de inventario no', () => {
    for (const roles of [['inv'], ['auditor'], ['supervisor'], ['jefe_depto', 'jefe_inventario']]) {
      expect(veAlertasDeAnuncios({ email: 'a@x', roles }), roles.join()).toBe(false);
    }
  });
});

describe('ElegirAlmacenesDialog', () => {
  it('sale cuando no hay almacén y Aceptar no se puede pulsar sin elegir uno', () => {
    render(<ElegirAlmacenesDialog />);
    expect(screen.getByText(/En qué almacén trabajas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aceptar' })).toBeDisabled();
  });

  it('el botón Aceptar no es hijo directo del diálogo: la regla que oculta la X lo escondería', () => {
    render(<ElegirAlmacenesDialog />);
    const aceptar = screen.getByRole('button', { name: 'Aceptar' });
    const dialogo = screen.getByRole('dialog');
    expect(aceptar.parentElement).not.toBe(dialogo);
    expect(dialogo.className).toMatch(/\[&>button\]:hidden/);
  });

  it('no sale si ya tiene almacén', () => {
    auth.user = { email: 'ana@x.com', role: 'inv', almacenes_config: ['789'] };
    render(<ElegirAlmacenesDialog />);
    expect(screen.queryByText(/En qué almacén trabajas/)).toBeNull();
  });

  it('no se cierra con Escape', async () => {
    const user = userEvent.setup();
    render(<ElegirAlmacenesDialog />);
    await user.keyboard('{Escape}');
    expect(screen.getByText(/En qué almacén trabajas/)).toBeInTheDocument();
  });

  it('es de un solo almacén: elegir otro cambia la elección, no la suma', async () => {
    const user = userEvent.setup();
    render(<ElegirAlmacenesDialog />);
    await user.click(screen.getByRole('radio', { name: /TKC SUB 789/ }));
    await user.click(screen.getByRole('radio', { name: /TKC SUB 1005/ }));

    expect(screen.getByRole('radio', { name: /TKC SUB 789/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: /TKC SUB 1005/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('Aceptar guarda ese almacén en el perfil, lo deja como el activo y refresca la sesión', async () => {
    const user = userEvent.setup();
    render(<ElegirAlmacenesDialog />);
    await user.click(screen.getByRole('radio', { name: /TKC SUB 789/ }));
    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    await waitFor(() => expect(auth.refrescar).toHaveBeenCalled());
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('/api/auth/perfil');
    expect(JSON.parse(opts.body)).toEqual({ almacenes_config: ['789'], almacen_num: '789' });
    expect(alm.setAlmacen).toHaveBeenCalledWith('789');
  });

  it('si no se pudo guardar, lo dice y sigue abierto', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ error: 'Sin permiso' }), { status: 403 }));
    const user = userEvent.setup();
    render(<ElegirAlmacenesDialog />);
    await user.click(screen.getByRole('radio', { name: /TKC SUB 789/ }));
    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(await screen.findByText('Sin permiso')).toBeInTheDocument();
    expect(auth.refrescar).not.toHaveBeenCalled();
    expect(alm.setAlmacen).not.toHaveBeenCalled();
  });
});
