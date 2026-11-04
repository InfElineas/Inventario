import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Radix Select no se deja manejar en jsdom: se sustituye por un <select> nativo.
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>
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

const base = vi.hoisted(() => ({ filter: vi.fn(), update: vi.fn(), me: vi.fn() }));
vi.mock('@/api/base44Client', () => ({
  base44: {
    auth: { me: base.me },
    entities: new Proxy({}, { get: () => ({ filter: base.filter, update: base.update, create: vi.fn() }) }),
  },
}));

const svc = vi.hoisted(() => ({
  listarTransferencias: vi.fn(), lineasTransferencia: vi.fn(), crearTransferencia: vi.fn(),
  confirmarTransferencia: vi.fn(), cancelarTransferencia: vi.fn(),
}));
vi.mock('@/services/transferenciasService', () => svc);
vi.mock('@/services/ajustesService', () => ({ ErrorDeRed: class ErrorDeRed extends Error {} }));

const comprobar = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('@/services/comprobacionLineas', () => ({ comprobarLineas: comprobar.fn }));

const { default: TransferenciaForm } = await import('@/components/transferencias/TransferenciaForm');

const CREADA = {
  status: 201,
  body: {
    status: 'created',
    draft: { id: 77, code: 'TKCT0000077' },
    accepted: [{ line: 1, code: '7622210833662', quantity: 3 }],
    rejected: [],
  },
};

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><TransferenciaForm /></QueryClientProvider>);
}

const boton = (nombre) => screen.getByRole('button', { name: nombre });

/** El origen se elige fuera de las pestañas; el destino y las líneas viven en el modal. */
async function rellenar(user, texto = '7622210833662*3') {
  await user.selectOptions(screen.getAllByRole('combobox')[0], '789');
  await user.click(boton(/Montar una transferencia a mano/i));
  const combos = screen.getAllByRole('combobox');
  await user.selectOptions(combos[combos.length - 1], '1005');
  await user.click(screen.getByPlaceholderText(/7622210833662\*3/));
  await user.paste(texto);
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  auth.user = { role: 'fact', tiene_tkc: true, almacenes_config: [] };
  Object.values(svc).forEach((f) => f.mockReset());
  base.filter.mockReset().mockResolvedValue([]);
  base.update.mockReset().mockResolvedValue({});
  base.me.mockReset().mockResolvedValue({ email: 'fact@x.com', full_name: 'Fran', role: 'fact' });
  svc.listarTransferencias.mockResolvedValue({
    status: 200, total: 1,
    body: [{ id: 55, code: 'TKCT0000055', status: 'editada', date: '2026-10-20', origin: 'TKC SUB 789', destination: 'TKC SUB 1005' }],
  });
  comprobar.fn.mockReset().mockImplementation(async ({ lines }) => lines.map((l) => ({
    code: l.code, quantity: l.quantity, existencia: { fisica: 100, enAlmacen: 100, enTienda: 0 },
  })));
  svc.crearTransferencia.mockResolvedValue(CREADA);
  svc.confirmarTransferencia.mockResolvedValue({ status: 200, body: { status: 'confirmed' } });
  svc.cancelarTransferencia.mockResolvedValue({ status: 200, body: { status: 'cancelled' } });
});

describe('TransferenciaForm', () => {
  it('no deja montar sin destino ni productos válidos', async () => {
    const user = userEvent.setup();
    montar();
    await user.selectOptions(screen.getAllByRole('combobox')[0], '789');
    await user.click(boton(/Montar una transferencia a mano/i));
    expect(boton(/montar transferencia/i)).toBeDisabled();

    await user.click(screen.getByPlaceholderText(/7622210833662\*3/));
    await user.paste('A*0');
    expect(screen.getByText(/entero positivo/i)).toBeInTheDocument();
    expect(boton(/montar transferencia/i)).toBeDisabled();
  });

  it('el origen no se ofrece como destino', async () => {
    const user = userEvent.setup();
    montar();
    await user.selectOptions(screen.getAllByRole('combobox')[0], '789');
    await user.click(boton(/Montar una transferencia a mano/i));
    const destino = screen.getAllByRole('combobox').at(-1);
    expect(within(destino).queryByRole('option', { name: 'TKC SUB 789' })).not.toBeInTheDocument();
    expect(within(destino).getByRole('option', { name: 'TKC SUB 1005' })).toBeInTheDocument();
  });

  it('monta con origen, destino y líneas, y NO confirma', async () => {
    const user = userEvent.setup();
    montar();
    await rellenar(user);
    await user.click(boton(/comprobar existencia/i));
    await screen.findByText(/Comprobado contra TKC/);
    await user.click(boton(/montar transferencia/i));

    await screen.findByText(/TKCT0000077 montada en «editada»/);
    expect(svc.crearTransferencia).toHaveBeenCalledWith(expect.objectContaining({
      origen: '789', destino: '1005', lines: [{ code: '7622210833662', quantity: 3 }],
    }));
    expect(svc.crearTransferencia.mock.calls[0][0].idempotencyKey).toMatch(/^tr-/);
    expect(svc.confirmarTransferencia).not.toHaveBeenCalled();
  });

  it('confirmar pide un diálogo aparte y solo entonces llama a la API', async () => {
    const user = userEvent.setup();
    montar();
    await rellenar(user);
    await user.click(boton(/comprobar existencia/i));
    await screen.findByText(/Comprobado contra TKC/);
    await user.click(boton(/montar transferencia/i));
    await user.click(await screen.findByRole('button', { name: /confirmar transferencia/i }));

    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent(/TKCT0000077/);
    expect(svc.confirmarTransferencia).not.toHaveBeenCalled();

    await user.click(within(dialogo).getByRole('button', { name: /^confirmar$/i }));
    await waitFor(() => expect(svc.confirmarTransferencia).toHaveBeenCalledTimes(1));
    expect(svc.confirmarTransferencia.mock.calls[0][0]).toBe(77);
    expect(svc.confirmarTransferencia.mock.calls[0][1]).toMatchObject({ almacen: '789' });
    await screen.findByText(/quedó en tránsito/i);
  });

  it('un borrador del historial se puede cancelar', async () => {
    const user = userEvent.setup();
    montar();
    await user.selectOptions(screen.getAllByRole('combobox')[0], '789');
    await user.click(screen.getByRole('tab', { name: /Historial/i }));
    const fila = (await screen.findByText('TKCT0000055')).closest('tr');
    await user.click(within(fila).getByRole('button', { name: /^cancelar$/i }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /^confirmar$/i }));
    await waitFor(() => expect(svc.cancelarTransferencia).toHaveBeenCalledWith(55, expect.objectContaining({ almacen: '789' })));
  });

  it('el historial pide las salidas del almacén elegido', async () => {
    const user = userEvent.setup();
    montar();
    await user.selectOptions(screen.getAllByRole('combobox')[0], '789');
    await user.click(screen.getByRole('tab', { name: /Historial/i }));
    await screen.findByText('TKCT0000055');
    expect(svc.listarTransferencias).toHaveBeenCalledWith(expect.objectContaining({ origen: '789' }));
  });

  it('por transferir enseña solo los faltantes clasificados como transferencia', async () => {
    base.filter.mockResolvedValue([
      { id: 'c1', almacen_num: '789', producto_id: 'p1', producto_nombre: 'Aceite 1 L', producto_codigo: '7501', diferencia: -3, clasif_ajuste: 'Transferencia a Latino no registrada', fecha_inv: '2026-10-27' },
      { id: 'c2', almacen_num: '789', producto_id: 'p2', producto_nombre: 'Arroz', producto_codigo: '7502', diferencia: -2, clasif_ajuste: 'Robo', fecha_inv: '2026-10-27' },
    ]);
    const user = userEvent.setup();
    montar();
    await user.selectOptions(screen.getAllByRole('combobox')[0], '789');

    expect(await screen.findByText('Aceite 1 L')).toBeInTheDocument();
    expect(screen.queryByText('Arroz')).not.toBeInTheDocument();
    expect(base.filter.mock.calls[0][0]).toMatchObject({ resultado: 'faltante', estado_tarea: 'pend_fact' });
  });

  it('poka-yoke: no deja montar lo que el origen no tiene, y sin comprobar tampoco', async () => {
    comprobar.fn.mockResolvedValue([{ code: '7622210833662', quantity: 3, existencia: { fisica: 2, enAlmacen: 2, enTienda: 0 } }]);
    const user = userEvent.setup();
    montar();
    await rellenar(user);
    // Sin comprobar, no.
    expect(boton(/montar transferencia/i)).toBeDisabled();
    expect(screen.getByText(/Comprueba la existencia del origen para poder montar/)).toBeInTheDocument();

    await user.click(boton(/comprobar existencia/i));
    expect(await screen.findByText(/Hay 2 en total y se piden 3/)).toBeInTheDocument();
    expect(boton(/montar transferencia/i)).toBeDisabled();
    expect(svc.crearTransferencia).not.toHaveBeenCalled();
  });
});
