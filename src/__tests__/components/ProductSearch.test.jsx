import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * La lista de resultados del buscador de productos.
 *
 * Estuvo en un Popover con portal a `document.body` para que el
 * `overflow-y-auto` del diálogo no la recortara. El portal la dejaba fuera
 * del bloqueo de scroll que Radix monta al abrir un modal —solo permite
 * mover el contenido del diálogo—, así que la rueda y el dedo no la movían
 * y con quince resultados solo se veían cuatro.
 *
 * Ahora va en el flujo, dentro del propio diálogo: la mueve el scroll del
 * diálogo, que sí está permitido.
 */

const buscar = vi.hoisted(() => vi.fn());
vi.mock('@/api/base44Client', () => ({ base44: { entities: { Producto: { buscar } } } }));
vi.mock('@/lib/useAlmacen', () => ({ useAlmacen: () => ({ almacen: '789' }) }));

const { default: ProductSearch } = await import('@/components/shared/ProductSearch');

const PRODUCTO = (n) => ({
  id: `p${n}`, nombre: `Arroz ${n}`, codigo_producto: `750${n}`,
  suministrador: 'SEL UNO', exist_fisica: n, precio_costo: 1.5,
});

const escribir = (valor = 'arroz') => {
  const vista = render(<ProductSearch onSelect={vi.fn()} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: valor } });
  return vista;
};

beforeEach(() => buscar.mockReset());

describe('ProductSearch', () => {
  it('pinta los resultados dentro del componente, no en un portal al body', async () => {
    buscar.mockResolvedValue([PRODUCTO(1)]);
    const { container } = escribir();

    // `container` es el árbol del componente; si la lista estuviera en un
    // portal, el texto solo aparecería en `baseElement`.
    await waitFor(() => expect(container.textContent).toContain('Arroz 1'));
  });

  it('la lista se queda con su propio scroll acotado', async () => {
    buscar.mockResolvedValue([PRODUCTO(1), PRODUCTO(2)]);
    const { container } = escribir();

    await waitFor(() => expect(screen.getByText('Arroz 1')).toBeTruthy());
    const lista = container.querySelector('.overflow-y-auto');
    expect(lista).toBeTruthy();
    expect(lista.className).toContain('max-h-60');
  });

  it('con menos de dos letras no busca ni abre nada', () => {
    const { container } = escribir('a');
    expect(buscar).not.toHaveBeenCalled();
    expect(container.querySelector('.overflow-y-auto')).toBeNull();
  });

  it('sin resultados lo dice en vez de dejar un hueco', async () => {
    buscar.mockResolvedValue([]);
    escribir();

    await waitFor(() => expect(screen.getByText(/No se encontraron productos/)).toBeTruthy());
  });

  it('elegir uno cierra la lista y deja el nombre en el buscador', async () => {
    const onSelect = vi.fn();
    buscar.mockResolvedValue([PRODUCTO(1)]);
    const { container } = render(<ProductSearch onSelect={onSelect} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'arroz' } });

    await waitFor(() => expect(screen.getByText('Arroz 1')).toBeTruthy());
    fireEvent.click(screen.getByText('Arroz 1').closest('button'));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
    expect(screen.getByRole('textbox').value).toBe('Arroz 1');
    expect(container.querySelector('.overflow-y-auto')).toBeNull();
  });
});
