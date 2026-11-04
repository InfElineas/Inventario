import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * La barrera contra la cifra descabellada al contar: un cero de más no pasa sin
 * repetirse. La lógica está en lib/barrerasConteo.test.js; aquí se vigila que el
 * formulario la respete: el botón se apaga y solo se enciende al repetir la cifra.
 */

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

const PRODUCTO = {
  id: 'p1', nombre: 'Aceite 1 L', codigo_producto: '7501', almacen_num: '789', id_tienda: 'T1', exist_fisica: 107,
};

const m = vi.hoisted(() => ({ existencia: vi.fn(), previo: vi.fn() }));
vi.mock('@/lib/useAlmacen', () => ({ useAlmacen: () => ({ almacen: '789' }) }));
vi.mock('@/lib/useAccesoTkc', () => ({ useAccesoTkc: () => ({ tiene: true, cargando: false }) }));
vi.mock('@/services/tkcService', () => ({ fetchExistenciaTkc: m.existencia }));
vi.mock('@/api/base44Client', () => ({ base44: { entities: { Inventario: { filter: m.previo } } } }));
vi.mock('@/components/shared/ProductSearch', () => ({
  default: ({ onSelect }) => <button type="button" onClick={() => onSelect(PRODUCTO)}>elegir producto</button>,
}));
vi.mock('@/components/inventario/BarcodeScanner', () => ({ default: () => null }));
vi.mock('@/components/shared/SugerenciasNota', () => ({ default: () => null }));

const { default: InventarioForm } = await import('@/components/inventario/InventarioForm');

function pintar(onSubmit = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <InventarioForm user={{ email: 'ana@x.com', full_name: 'Ana' }} onSubmit={onSubmit} onCancel={() => {}} isPending={false} />
    </QueryClientProvider>,
  );
  return onSubmit;
}

async function contar(user, cantidad) {
  await user.click(screen.getByText('elegir producto'));
  await screen.findByText('Aceite 1 L');
  await waitFor(() => expect(screen.getAllByText('107').length).toBeGreaterThan(0));
  const caja = screen.getAllByRole('spinbutton')[0];
  await user.clear(caja);
  await user.type(caja, String(cantidad));
  // La clasificación es obligatoria con diferencia: la primera que haya.
  const combos = screen.getAllByRole('combobox');
  await user.selectOptions(combos[combos.length - 1], 'Robo');
}

beforeEach(() => {
  cleanup();
  m.existencia.mockReset().mockResolvedValue({ existencia: { fisica: 107, enAlmacen: 21, enTienda: 86 } });
  m.previo.mockReset().mockResolvedValue([]);
});
afterEach(cleanup);

describe('InventarioForm — poka-yoke de la cifra', () => {
  it('1500 contra 107: pide repetir la cifra, y no deja confirmar hasta que coincide', async () => {
    const user = userEvent.setup();
    pintar();
    await contar(user, 1500);

    expect(await screen.findByText(/Comprueba esta cifra antes de seguir/)).toBeInTheDocument();
    expect(screen.getByText(/Has contado 1500 y TKC tiene 107/)).toBeInTheDocument();
    const confirmar = screen.getByRole('button', { name: /confirmar conteo/i });
    expect(confirmar).toBeDisabled();

    const repite = screen.getByLabelText('Repite la cantidad contada');
    await user.type(repite, '150');
    expect(await screen.findByText(/No coincide con el conteo \(1500\)/)).toBeInTheDocument();
    expect(confirmar).toBeDisabled();

    await user.type(repite, '0');
    await waitFor(() => expect(confirmar).toBeEnabled());
  });

  it('si se corrige el conteo, lo repetido antes ya no vale', async () => {
    const user = userEvent.setup();
    pintar();
    await contar(user, 1500);
    await user.type(await screen.findByLabelText('Repite la cantidad contada'), '1500');
    await waitFor(() => expect(screen.getByRole('button', { name: /confirmar conteo/i })).toBeEnabled());

    const caja = screen.getAllByRole('spinbutton')[0];
    await user.clear(caja);
    await user.type(caja, '1600');
    await waitFor(() => expect(screen.getByRole('button', { name: /confirmar conteo/i })).toBeDisabled());
  });

  it('una cifra razonable no pide nada', async () => {
    const user = userEvent.setup();
    pintar();
    await contar(user, 80);

    expect(screen.queryByText(/Comprueba esta cifra/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /confirmar conteo/i })).toBeEnabled());
  });
});
