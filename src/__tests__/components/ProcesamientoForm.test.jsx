import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

const svc = vi.hoisted(() => ({
  listarCandidatos: vi.fn(), listarProcesados: vi.fn(), analizarProceso: vi.fn(), procesar: vi.fn(),
}));
vi.mock('@/services/procesamientosService', () => svc);
vi.mock('@/services/ajustesService', () => ({ ErrorDeRed: class ErrorDeRed extends Error {} }));

const { default: ProcesamientoForm } = await import('@/components/procesamientos/ProcesamientoForm');

const LINEA = (code, processable, extra = {}) => ({
  code, name: `Producto ${code}`, existence: 2, requested: 1, targetCode: code.replace('NoMT', ''),
  processable, status: processable ? 'ready' : 'blocked', reason: processable ? '' : 'Sin producto destino', ...extra,
});
const ANALISIS = {
  status: 200,
  body: { lines: [LINEA('NoMT10157977', true), LINEA('NoMT021321020', false)], rejected: [] },
};
const PROCESADO = {
  status: 201,
  body: {
    status: 'created', rejected: [], done: 1, failed: 0, unverified: 0,
    groups: [{
      warehouse: '188', warehouseName: 'ELI MARYKAY (676)', processId: 56357,
      lines: [{ code: 'NoMT10157977', quantity: 1, status: 'done', message: 'Procesado en el documento 56357.' }],
    }],
  },
};

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><ProcesamientoForm /></QueryClientProvider>);
}
const boton = (nombre) => screen.getByRole('button', { name: nombre });
const PLACEHOLDER = /NoMT10157977\*1/;

async function rellenar(user, texto = 'NoMT10157977*1\nNoMT021321020*2') {
  await user.selectOptions(screen.getAllByRole('combobox')[0], '676');
  await user.click(screen.getByPlaceholderText(PLACEHOLDER));
  await user.paste(texto);
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  auth.user = { role: 'fact', tiene_tkc: true, almacenes_config: [] };
  Object.values(svc).forEach((f) => f.mockReset());
  svc.listarCandidatos.mockResolvedValue({ status: 200, total: 0, body: [] });
  svc.listarProcesados.mockResolvedValue({ status: 200, total: 0, body: [] });
  svc.analizarProceso.mockResolvedValue(ANALISIS);
  svc.procesar.mockResolvedValue(PROCESADO);
});

describe('ProcesamientoForm', () => {
  it('no deja analizar sin almacén ni líneas válidas', async () => {
    const user = userEvent.setup();
    montar();
    expect(boton(/analizar/i)).toBeDisabled();
    await rellenar(user, 'A*0');
    expect(screen.getByText(/entero positivo/i)).toBeInTheDocument();
    expect(boton(/analizar/i)).toBeDisabled();
  });

  it('avisa de un código repetido con y sin NoMT', async () => {
    const user = userEvent.setup();
    montar();
    await rellenar(user, 'NoMT10157977*1\n10157977*1');
    expect(screen.getByText(/mismo producto/i)).toBeInTheDocument();
    expect(boton(/analizar/i)).toBeDisabled();
  });

  it('procesar no se habilita hasta analizar, y analizar no escribe', async () => {
    const user = userEvent.setup();
    montar();
    await rellenar(user);
    expect(screen.queryByRole('button', { name: /^procesar$/i })).not.toBeInTheDocument();

    await user.click(boton(/analizar/i));
    await screen.findByText(/1 de 2 se pueden procesar/);
    expect(svc.analizarProceso).toHaveBeenCalledWith({
      almacen: '676',
      lines: [{ code: 'NoMT10157977', quantity: 1 }, { code: 'NoMT021321020', quantity: 2 }],
    });
    expect(screen.getByText('Sin producto destino')).toBeInTheDocument();
    expect(svc.procesar).not.toHaveBeenCalled();
  });

  it('procesar pide un diálogo aparte y manda solo las procesables', async () => {
    const user = userEvent.setup();
    montar();
    await rellenar(user);
    await user.click(boton(/analizar/i));
    await user.click(await screen.findByRole('button', { name: /^procesar$/i }));

    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent(/almacén 676/);
    expect(svc.procesar).not.toHaveBeenCalled();

    await user.click(within(dialogo).getByRole('button', { name: /^confirmar$/i }));
    await waitFor(() => expect(svc.procesar).toHaveBeenCalledTimes(1));
    const [datos] = svc.procesar.mock.calls[0];
    expect(datos).toMatchObject({ almacen: '676', lines: [{ code: 'NoMT10157977', quantity: 1 }] });
    expect(datos.idempotencyKey).toMatch(/^proc-/);
    await screen.findByText(/Procesado: 1 producto/);
    expect(screen.getByText(/— documento 56357/)).toBeInTheDocument();
    // Lo procesado ya no está en la entrada ni queda un análisis que reenviar.
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveValue('');
    expect(screen.queryByRole('button', { name: /^procesar$/i })).not.toBeInTheDocument();
  });

  it('cambiar la entrada invalida el análisis', async () => {
    const user = userEvent.setup();
    montar();
    await rellenar(user);
    await user.click(boton(/analizar/i));
    await screen.findByRole('button', { name: /^procesar$/i });
    await user.click(screen.getByPlaceholderText(PLACEHOLDER));
    await user.paste('\nNoMT999*1');
    expect(boton(/^procesar$/i)).toBeDisabled();
    expect(screen.getByText(/vuelve a analizar/i)).toBeInTheDocument();
  });

  it('sin verificar: bloquea hasta que la persona revise TKC', async () => {
    svc.procesar.mockResolvedValue({ status: 202, body: { status: 'unverified', message: 'revisa TKC' } });
    const user = userEvent.setup();
    montar();
    await rellenar(user);
    await user.click(boton(/analizar/i));
    await user.click(await screen.findByRole('button', { name: /^procesar$/i }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /^confirmar$/i }));

    await screen.findByText(/no se pudo comprobar el resultado/i);
    await user.click(screen.getByPlaceholderText(PLACEHOLDER));
    await user.paste('NoMT10157977*1');
    await user.click(boton(/analizar/i));
    await screen.findByText(/se pueden procesar/);
    expect(boton(/^procesar$/i)).toBeDisabled();

    await user.click(boton(/ya lo revisé en tkc/i));
    expect(boton(/^procesar$/i)).toBeEnabled();
  });

  it('sin credenciales de TKC bloquea analizar y procesar', async () => {
    auth.user = { role: 'fact', tiene_tkc: false, almacenes_config: [] };
    const user = userEvent.setup();
    montar();
    await rellenar(user);
    expect(boton(/analizar/i)).toBeDisabled();
    expect(svc.listarCandidatos).not.toHaveBeenCalled();
  });

  it('«Agregar» de un candidato lo añade a la entrada', async () => {
    svc.listarCandidatos.mockResolvedValue({
      status: 200, total: 1,
      body: [{ warehouse: '188', code: 'NoMT10157977', name: 'Labial', quantity: 3, targetCode: '10157977', status: 'ready', reason: 'Procesable' }],
    });
    const user = userEvent.setup();
    montar();
    await user.selectOptions(screen.getAllByRole('combobox')[0], '676');
    await user.click(await screen.findByRole('button', { name: /agregar NoMT10157977/i }));
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveValue('NoMT10157977*3');
  });
});
