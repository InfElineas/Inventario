import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Radix Select no se deja manejar en jsdom: se sustituye por un <select> nativo
// con la misma interfaz (lo que se prueba aquí es el flujo, no el desplegable).
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
  listarAjustes: vi.fn(), lineasAjuste: vi.fn(), crearAjuste: vi.fn(), confirmarAjuste: vi.fn(),
}));
vi.mock('@/services/ajustesService', () => ({ ...svc, ErrorDeRed: class ErrorDeRed extends Error {} }));

const { default: AjusteForm } = await import('@/components/ajustes/AjusteForm');

const CREADO = {
  status: 201,
  body: {
    status: 'created',
    document: { id: 3107, code: 'TKCE0003107' },
    accepted: [{ line: 1, code: '7622210833662', quantity: 3 }],
    rejected: [{ line: 2, code: '7622210000017', quantity: 1, reason: 'No existe en TKC' }],
  },
};

function montar(tipo) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><AjusteForm tipo={tipo} /></QueryClientProvider>);
}

const boton = (nombre) => screen.getByRole('button', { name: nombre });

/** El almacén se elige fuera de las pestañas; el resto vive en el modal. */
async function abrirMontar(user) {
  await user.selectOptions(screen.getAllByRole('combobox')[0], '789');
  await user.click(boton(/Montar un ajuste a mano/i));
}

async function rellenar(user, { texto = '7622210833662*3\n7622210000017', clasif } = {}) {
  await abrirMontar(user);
  if (clasif) {
    const combos = screen.getAllByRole('combobox');
    await user.selectOptions(combos[combos.length - 1], clasif);
  }
  await user.click(screen.getByPlaceholderText(/7622210833662\*3/));
  await user.paste(texto);
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  auth.user = { role: 'fact', tiene_tkc: true, almacenes_config: [] };
  Object.values(svc).forEach((f) => f.mockReset());
  svc.listarAjustes.mockResolvedValue({
    status: 200, total: 1,
    body: [{ id: 55, code: 'TKCE0000055', status: 'editada', date: '2026-10-20', amount: '10.00' }],
  });
  svc.crearAjuste.mockResolvedValue(CREADO);
  svc.confirmarAjuste.mockResolvedValue({ status: 200, body: { status: 'confirmed', message: 'Ajuste confirmado', state: 'confirmada' } });
});

describe('AjusteForm — aumento', () => {
  it('no deja montar sin almacén ni productos válidos', async () => {
    const user = userEvent.setup();
    montar('aumento');
    // El formulario vive en un modal; sin abrirlo no hay botón que mirar.
    await abrirMontar(user);
    expect(boton(/montar ajuste/i)).toBeDisabled();

    await user.click(screen.getByPlaceholderText(/7622210833662\*3/));
    await user.paste('A*0');
    expect(screen.getByText(/entero positivo/i)).toBeInTheDocument();
    expect(boton(/montar ajuste/i)).toBeDisabled();
  });

  it('monta con el almacén, las líneas y la clasificación por defecto, y muestra aceptadas y rechazadas', async () => {
    const user = userEvent.setup();
    montar('aumento');
    await rellenar(user);
    await user.click(boton(/montar ajuste/i));

    await screen.findByText(/TKCE0003107 montado en «editada»/);
    const [tipo, datos] = svc.crearAjuste.mock.calls[0];
    expect(tipo).toBe('aumento');
    expect(datos).toMatchObject({
      almacen: '789',
      lines: [{ code: '7622210833662', quantity: 3 }, { code: '7622210000017', quantity: 1 }],
      classification: 'Reposición de inventario',
    });
    expect(datos.idempotencyKey).toMatch(/^aj-/);
    expect(screen.getByText('No existe en TKC')).toBeInTheDocument();
    // Montar NO confirma.
    expect(svc.confirmarAjuste).not.toHaveBeenCalled();
    // Ya está montado: el modal se cierra para que se vea el resultado y el
    // botón de confirmar, que es el que mueve la existencia.
    expect(screen.queryByPlaceholderText(/7622210833662\*3/)).not.toBeInTheDocument();
  });

  it('confirmar pide un diálogo aparte y solo entonces llama a la API', async () => {
    const user = userEvent.setup();
    montar('aumento');
    await rellenar(user);
    await user.click(boton(/montar ajuste/i));
    await user.click(await screen.findByRole('button', { name: /confirmar ajuste/i }));

    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent(/SUMARÁ/);
    expect(dialogo).toHaveTextContent(/TKCE0003107/);
    expect(svc.confirmarAjuste).not.toHaveBeenCalled();

    await user.click(within(dialogo).getByRole('button', { name: /^confirmar$/i }));
    await waitFor(() => expect(svc.confirmarAjuste).toHaveBeenCalledTimes(1));
    const [tipo, id, datos] = svc.confirmarAjuste.mock.calls[0];
    expect([tipo, id]).toEqual(['aumento', 3107]);
    expect(datos).toMatchObject({ almacen: '789', code: 'TKCE0003107' });
    expect(datos.idempotencyKey).toMatch(/^conf-/);
    await screen.findByText(/la existencia en TKC ya se movió/i);
  });

  it('cancelar el diálogo no confirma nada', async () => {
    const user = userEvent.setup();
    montar('aumento');
    await rellenar(user);
    await user.click(boton(/montar ajuste/i));
    await user.click(await screen.findByRole('button', { name: /confirmar ajuste/i }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /cancelar/i }));
    expect(svc.confirmarAjuste).not.toHaveBeenCalled();
  });

  it('desde el historial se puede confirmar un documento «editada»', async () => {
    const user = userEvent.setup();
    montar('aumento');
    await user.selectOptions(screen.getAllByRole('combobox')[0], '789');
    // El historial vive en su propia pestaña.
    await user.click(screen.getByRole('tab', { name: /Historial/i }));
    const fila = (await screen.findByText('TKCE0000055')).closest('tr');
    await user.click(within(fila).getByRole('button', { name: /^confirmar$/i }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /^confirmar$/i }));
    await waitFor(() => expect(svc.confirmarAjuste).toHaveBeenCalledWith('aumento', 55, expect.objectContaining({ almacen: '789' })));
  });

  it('«sin verificar» bloquea montar hasta que la persona lo revise, y reutiliza la clave', async () => {
    const user = userEvent.setup();
    svc.crearAjuste.mockResolvedValueOnce({ status: 504, body: { error: { code: 'unverified', message: 'No se sabe si llegó' } } });
    montar('aumento');
    await rellenar(user);
    await user.click(boton(/montar ajuste/i));

    // El modal se cierra: lo siguiente —revisar en TKC— está fuera de él.
    await screen.findByText(/no se pudo comprobar el resultado/i);
    await user.click(boton(/Montar un ajuste a mano/i));
    expect(boton(/montar ajuste/i)).toBeDisabled();
    await user.keyboard('{Escape}');

    await user.click(boton(/ya lo revisé en tkc/i));
    // Reabrir conserva lo escrito: es lo que permite reenviar con la misma clave.
    await user.click(boton(/Montar un ajuste a mano/i));
    expect(boton(/montar ajuste/i)).toBeEnabled();
    await user.click(boton(/montar ajuste/i));
    await waitFor(() => expect(svc.crearAjuste).toHaveBeenCalledTimes(2));
    // Mismo envío → misma clave: la API devuelve lo ya hecho en vez de duplicar.
    expect(svc.crearAjuste.mock.calls[1][1].idempotencyKey).toBe(svc.crearAjuste.mock.calls[0][1].idempotencyKey);
  });

  it('cambiar el envío cambia la clave de idempotencia', async () => {
    const user = userEvent.setup();
    svc.crearAjuste.mockResolvedValue({ status: 422, body: { status: 'rejected', accepted: [], rejected: [] } });
    montar('aumento');
    await rellenar(user, { texto: 'A*1' });
    await user.click(boton(/montar ajuste/i));
    await waitFor(() => expect(svc.crearAjuste).toHaveBeenCalledTimes(1));
    await user.type(screen.getByPlaceholderText(/7622210833662\*3/), '\nB*2');
    await user.click(boton(/montar ajuste/i));
    await waitFor(() => expect(svc.crearAjuste).toHaveBeenCalledTimes(2));
    expect(svc.crearAjuste.mock.calls[1][1].idempotencyKey).not.toBe(svc.crearAjuste.mock.calls[0][1].idempotencyKey);
  });

  it('un rechazo dice que no se envió nada', async () => {
    const user = userEvent.setup();
    svc.crearAjuste.mockResolvedValue({ status: 422, body: { status: 'rejected', accepted: [], rejected: [{ line: 1, code: 'A', quantity: 1, reason: 'Sin existencia' }] } });
    montar('aumento');
    await rellenar(user, { texto: 'A*1' });
    await user.click(boton(/montar ajuste/i));
    await screen.findByText(/no se envió nada a tkc/i);
    expect(screen.getByText('Sin existencia')).toBeInTheDocument();
  });

  it('un 403 de permisos explica qué hacer', async () => {
    const user = userEvent.setup();
    svc.crearAjuste.mockResolvedValue({ status: 403, body: { error: { code: 'forbidden', message: 'Falta increase:create.' } } });
    montar('aumento');
    await rellenar(user, { texto: 'A*1' });
    await user.click(boton(/montar ajuste/i));
    await screen.findByText(/Falta increase:create\. Esto no tiene que ver con tus credenciales de TKC/);
  });

  it('sin credenciales de TKC: explica por qué y bloquea el envío', async () => {
    const user = userEvent.setup();
    auth.user = { role: 'fact', tiene_tkc: false, almacenes_config: [] };
    montar('aumento');
    expect(screen.getByText(/Sin credenciales de TKC/i)).toBeInTheDocument();
    expect(screen.getByText(/montar o confirmar ajustes/i)).toBeInTheDocument();
    await rellenar(user, { texto: 'A*1' });
    expect(boton(/montar ajuste/i)).toBeDisabled();
  });

  it('un 403 de rol aclara que no son las credenciales de TKC', async () => {
    const user = userEvent.setup();
    svc.crearAjuste.mockResolvedValue({ status: 403, body: { error: { code: 'no_access', message: 'El usuario del token no tiene ningún rol en este sistema.' } } });
    montar('aumento');
    await rellenar(user, { texto: 'A*1' });
    await user.click(boton(/montar ajuste/i));
    await screen.findByText(/no tiene que ver con tus credenciales de TKC/i);
  });

  it('un usuario con almacenes configurados solo ve los suyos', () => {
    auth.user = { role: 'fact', tiene_tkc: true, almacenes_config: ['789', '615'] };
    montar('aumento');
    const opciones = within(screen.getAllByRole('combobox')[0]).getAllByRole('option').map((o) => o.value);
    expect(opciones.filter(Boolean).sort()).toEqual(['615', '789']);
  });
});

describe('AjusteForm — disminución', () => {
  it('exige clasificación (no hay valor por defecto) y la manda', async () => {
    const user = userEvent.setup();
    montar('disminucion');
    await rellenar(user, { texto: 'A*2' });
    expect(boton(/montar ajuste/i)).toBeDisabled();

    // Con el modal abierto, Radix oculta el fondo del árbol de accesibilidad:
    // el desplegable de clasificación es el único que queda visible.
    const combos = screen.getAllByRole('combobox');
    await user.selectOptions(combos[combos.length - 1], 'Merma');
    expect(boton(/montar ajuste/i)).toBeEnabled();
    await user.click(boton(/montar ajuste/i));

    await waitFor(() => expect(svc.crearAjuste).toHaveBeenCalled());
    expect(svc.crearAjuste.mock.calls[0][0]).toBe('disminucion');
    expect(svc.crearAjuste.mock.calls[0][1].classification).toBe('Merma');
  });

  it('el diálogo de confirmar dice que RESTARÁ', async () => {
    const user = userEvent.setup();
    montar('disminucion');
    await user.selectOptions(screen.getAllByRole('combobox')[0], '789');
    await user.click(screen.getByRole('tab', { name: /Historial/i }));
    const fila = (await screen.findByText('TKCE0000055')).closest('tr');
    await user.click(within(fila).getByRole('button', { name: /^confirmar$/i }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(/RESTARÁ/);
  });
});
