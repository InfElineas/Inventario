import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * El resumen de ventas.
 *
 * Lo que se vigila: que pida lo que se ve en los filtros, que enseñe los
 * totales y la lista, y que avise cuando el período tiene días sin datos antes
 * de que alguien compare el total con otra cifra.
 */

const m = vi.hoisted(() => ({ fetch: vi.fn(), almacen: { valor: '789' } }));

vi.mock('@/services/ventasService', () => ({ fetchResumenVentas: m.fetch }));
vi.mock('@/lib/useAlmacen', async (importOriginal) => ({
  ...(await importOriginal()),
  useAlmacen: () => ({ almacen: m.almacen.valor, setAlmacen: () => {}, almacenesConfig: null }),
}));

const { default: ResumenVentas } = await import('@/pages/ResumenVentas');

const DATOS = {
  total: { cantidad: 15, ordenes: 6, importe: 100, costo: 75 },
  productos: [
    { codigo: 'A1', nombre: 'Arroz', cantidad: 10, ordenes: 4, importe: 60, costo: 45 },
    { codigo: 'B2', nombre: '', cantidad: 5, ordenes: 2, importe: 40, costo: 30 },
  ],
  recortado: false,
  dias: [{ fecha: '2026-10-01', cantidad: 15, ordenes: 6, importe: 100, costo: 75 }],
  cobertura: { diasPedidos: 30, diasConDatos: 30, primera: '2025-01-02', ultima: '2026-11-02' },
};

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ResumenVentas />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  m.fetch.mockReset().mockResolvedValue(DATOS);
  m.almacen.valor = '789';
});

describe('ResumenVentas', () => {
  it('pide el almacén y el período que se ven, por defecto los últimos treinta días', async () => {
    montar();
    await screen.findAllByText('Arroz');
    const [args] = m.fetch.mock.calls[0];
    expect(args.almacen).toBe('789');
    expect(args.desde < args.hasta).toBe(true);
  });

  it('enseña los productos y los totales', async () => {
    montar();
    expect((await screen.findAllByText('Arroz')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sin nombre en el catálogo').length).toBeGreaterThan(0);
    expect(screen.getByText('25.0%')).toBeInTheDocument();   // (100 - 75) / 100
  });

  it('sin almacén no pide nada y lo dice', async () => {
    m.almacen.valor = '';
    montar();
    expect(await screen.findByText(/elige un almacén arriba/i)).toBeInTheDocument();
    expect(m.fetch).not.toHaveBeenCalled();
  });

  it('avisa cuando faltan días en el período', async () => {
    m.fetch.mockResolvedValue({ ...DATOS, cobertura: { diasPedidos: 30, diasConDatos: 20, primera: '2025-01-02', ultima: '2026-10-20' } });
    montar();
    expect(await screen.findByText(/ventas de 20 de los 30 días/i)).toBeInTheDocument();
    expect(screen.getByText(/hasta el 2026-10-20/)).toBeInTheDocument();
  });

  it('no avisa cuando están todos los días', async () => {
    montar();
    await screen.findAllByText('Arroz');
    expect(screen.queryByText(/de los 30 días/i)).not.toBeInTheDocument();
  });

  it('el error de la API se enseña, no se esconde', async () => {
    m.fetch.mockRejectedValue(new Error('La base no deja leer el informe de ventas'));
    montar();
    expect(await screen.findByText(/no deja leer el informe de ventas/i)).toBeInTheDocument();
  });

  it('«Por día» cambia la lista a los días', async () => {
    montar();
    await screen.findAllByText('Arroz');
    await userEvent.click(screen.getByRole('tab', { name: /por día/i }));
    await waitFor(() => expect(screen.getAllByText('2026-10-01').length).toBeGreaterThan(0));
  });
});
