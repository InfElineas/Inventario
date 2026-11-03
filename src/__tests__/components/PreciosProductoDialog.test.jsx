import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * El diálogo de precios de un producto: cada precio con su fuente, y una
 * fuente caída que no esconde a las demás.
 */

const m = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/services/preciosService', () => ({ fetchPrecios: m.fetch }));

const { default: PreciosProductoDialog } = await import('@/components/productos/PreciosProductoDialog');

const PRODUCTO = { codigo: '8033576194042', nombre: 'Aceite Dante' };

function montar(producto = PRODUCTO) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <PreciosProductoDialog producto={producto} almacen="789" onClose={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  m.fetch.mockReset();
});

describe('PreciosProductoDialog', () => {
  it('enseña cada fuente con su nota y sus precios', async () => {
    m.fetch.mockResolvedValue({
      nombre: 'Aceite Dante', codigo: PRODUCTO.codigo,
      fuentes: [
        { clave: 'catalogo', titulo: 'Catálogo', nota: 'Lo que guarda nuestro catálogo.', precios: [{ etiqueta: 'Precio costo', valor: 7.46 }] },
        { clave: 'lista_vd', titulo: 'Lista de precios (VD)', nota: 'La lista del informe central.', precios: [{ etiqueta: 'Venta', valor: 9.99 }, { etiqueta: 'Costo', valor: null }] },
      ],
    });
    montar();

    expect(await screen.findByText('Catálogo')).toBeInTheDocument();
    expect(screen.getByText('Lista de precios (VD)')).toBeInTheDocument();
    expect(screen.getByText('Lo que guarda nuestro catálogo.')).toBeInTheDocument();
    expect(screen.getByText(/7[.,]46/)).toBeInTheDocument();
    expect(screen.getByText(/9[.,]99/)).toBeInTheDocument();
    // Sin precio no se escribe cero: se escribe un guion.
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(m.fetch).toHaveBeenCalledWith({ almacen: '789', codigo: PRODUCTO.codigo });
  });

  it('una fuente que falla lo dice y la otra se sigue viendo', async () => {
    m.fetch.mockResolvedValue({
      nombre: 'A', codigo: PRODUCTO.codigo,
      fuentes: [
        { clave: 'catalogo', titulo: 'Catálogo', nota: 'n', precios: [{ etiqueta: 'Precio costo', valor: 5 }] },
        { clave: 'lista_vd', titulo: 'Lista de precios (VD)', nota: 'n', precios: [], error: 'La base no deja leer esta fuente (permiso).' },
      ],
    });
    montar();

    expect(await screen.findByText(/no deja leer esta fuente/i)).toBeInTheDocument();
    expect(screen.getByText('Precio costo')).toBeInTheDocument();
  });

  it('una fuente sin el producto lo dice, sin error', async () => {
    m.fetch.mockResolvedValue({
      nombre: '', codigo: PRODUCTO.codigo,
      fuentes: [{ clave: 'lista_vd', titulo: 'Lista de precios (VD)', nota: 'n', precios: [] }],
    });
    montar();
    expect(await screen.findByText(/no tiene este producto en este almacén/i)).toBeInTheDocument();
  });

  it('el fallo de la petición entera se enseña', async () => {
    m.fetch.mockRejectedValue(new Error('No se pudieron consultar los precios.'));
    montar();
    expect(await screen.findByText(/no se pudieron consultar los precios/i)).toBeInTheDocument();
  });

  it('acepta el producto con el nombre de campo del catálogo de la base', async () => {
    m.fetch.mockResolvedValue({ nombre: 'X', codigo: 'ABC', fuentes: [] });
    montar({ codigo_producto: 'ABC', nombre: 'X' });
    await screen.findByText(/Precios/);
    expect(m.fetch).toHaveBeenCalledWith({ almacen: '789', codigo: 'ABC' });
  });
});
