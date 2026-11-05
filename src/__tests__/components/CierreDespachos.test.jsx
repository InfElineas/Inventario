import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }) => (
    <select aria-label="Almacén" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="" />{children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }) => <>{children}</>,
  SelectItem: ({ value, children }) => <option value={value}>{children}</option>,
}));

const auth = vi.hoisted(() => ({ user: null }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));

const svc = vi.hoisted(() => ({
  pendientesDespachos: vi.fn(), cerrarDespachos: vi.fn(),
  trabajoDespachos: vi.fn(), cancelarDespachos: vi.fn(),
}));
vi.mock('@/services/despachosService', () => svc);

const { default: CierreDespachos } = await import('@/components/inventario/CierreDespachos');

const PENDIENTES = {
  status: 200,
  body: {
    almacen: '789', limite: '2026-11-03', total: 2,
    despachos: [{ despachoId: '100', fecha: '2026-10-28' }, { despachoId: '205', fecha: '2026-10-30' }],
  },
};

function montar(almacen = '789') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><CierreDespachos almacenInicial={almacen} /></QueryClientProvider>);
}

const boton = (nombre) => screen.getByRole('button', { name: nombre });

async function abrir(user) {
  await user.click(boton(/Cerrar despachos/i));
  await screen.findByText('TKC SUB 789');
}

beforeEach(() => {
  cleanup();
  auth.user = { role: 'inv', tiene_tkc: true };
  Object.values(svc).forEach((f) => f.mockReset());
  svc.pendientesDespachos.mockResolvedValue(PENDIENTES);
  svc.cerrarDespachos.mockResolvedValue({ status: 202, body: { id: 'j1' } });
  svc.trabajoDespachos.mockResolvedValue({
    status: 200,
    body: {
      id: 'j1', estado: 'terminado', error: null, filas: [{ despachoId: '100', fecha: '2026-10-28', numDespacho: '100', estado: 'cerrado' }],
      resumen: { cerrados: 1, omitidos: 0, fallidos: 0, total: 1 },
    },
  });
});

describe('CierreDespachos', () => {
  it('no deja cerrar nada sin haber revisado antes', async () => {
    const user = userEvent.setup();
    montar();
    await abrir(user);
    expect(screen.queryByRole('button', { name: /Cerrar solo el más antiguo/i })).toBeNull();
    expect(svc.cerrarDespachos).not.toHaveBeenCalled();
  });

  it('revisar enseña los pendientes sin cerrar', async () => {
    const user = userEvent.setup();
    montar();
    await abrir(user);
    await user.click(boton(/Revisar pendientes/i));

    expect(await screen.findByText('205')).toBeTruthy();
    expect(svc.pendientesDespachos).toHaveBeenCalledWith('789');
    expect(svc.cerrarDespachos).not.toHaveBeenCalled();
  });

  it('cerrar pide confirmación con el número y el almacén; sin confirmar no cierra', async () => {
    const user = userEvent.setup();
    montar();
    await abrir(user);
    await user.click(boton(/Revisar pendientes/i));
    await user.click(await screen.findByRole('button', { name: /Cerrar los 2 pendientes/i }));

    expect(await screen.findByText(/los 2 despachos pendientes/i)).toBeTruthy();
    expect(svc.cerrarDespachos).not.toHaveBeenCalled();
  });

  it('confirmado, cierra con el almacén y enseña el resultado', async () => {
    const user = userEvent.setup();
    montar();
    await abrir(user);
    await user.click(boton(/Revisar pendientes/i));
    await user.click(await screen.findByRole('button', { name: /Cerrar solo el más antiguo/i }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(svc.cerrarDespachos).toHaveBeenCalledWith({ almacen: '789', maximo: 1 }));
    expect(await screen.findByText(/1 cerrados/)).toBeTruthy();
  });

  it('sin credenciales de TKC lo dice y no deja revisar', async () => {
    auth.user = { role: 'inv', tiene_tkc: false };
    const user = userEvent.setup();
    montar();
    await abrir(user);
    expect(screen.getByText(/Sin credenciales de TKC/i)).toBeTruthy();
    expect(boton(/Revisar pendientes/i).disabled).toBe(true);
  });

  it('sin almacén en el filtro de la página pide elegir uno y no deja revisar', async () => {
    const user = userEvent.setup();
    montar('');
    await user.click(boton(/Cerrar despachos/i));
    expect(await screen.findByText(/Elige un almacén en el filtro/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Revisar pendientes/i })).toBeNull();
  });
});
