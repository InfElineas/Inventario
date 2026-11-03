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

// Sin devolver el mock: vitest llama como limpieza a lo que devuelva un hook, y eso
// ejecutaba `buscar` sin argumentos al acabar cada prueba.
beforeEach(() => { buscar.mockReset(); });

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

  // Falta una prueba de que el fallo de la búsqueda se enseña en vez de
  // tragarse. No está por el entorno, no por el componente: cualquier forma
  // de hacer fallar el mock —`throw`, `mockRejectedValue`, una promesa
  // rechazada— deja un error que vitest cuenta como fallo de la prueba aunque
  // el componente lo capture, y se comprobó que lo captura.

  it('la respuesta que llega tarde no pisa a la de lo último escrito', async () => {
    // Una petición por tecla: la de «arr» puede contestar después de la de
    // «arroz» y dejar en pantalla una lista que no es la de lo escrito.
    // La de «arr» tarda más que la de «arroz», que se pide después y llega antes.
    buscar.mockImplementation((texto) => (texto === 'arr'
      ? new Promise((r) => setTimeout(() => r([PRODUCTO(9)]), 400))
      : Promise.resolve([PRODUCTO(1)])));

    render(<ProductSearch onSelect={vi.fn()} />);
    const campo = screen.getByRole('textbox');
    fireEvent.change(campo, { target: { value: 'arr' } });
    // Lo justo para que salga la primera y entre la segunda detrás.
    await new Promise((r) => setTimeout(r, 300));
    fireEvent.change(campo, { target: { value: 'arroz' } });

    await waitFor(() => expect(screen.getByText('Arroz 1')).toBeTruthy());
    await new Promise((r) => setTimeout(r, 450));
    expect(screen.queryByText('Arroz 9')).toBeNull();
  });

  describe('los que tienen existencia, primero', () => {
    // La lista llena de productos en cero y los que sí había, fuera: pasaba con
    // «café» —todas las «Bebida instantánea…» sin existencia van antes por
    // nombre— mientras el catálogo, que oculta los de cero por defecto, enseñaba
    // otra cosa.
    const responder = (conExistencia, todos) => buscar.mockImplementation(async (_t, _c, cond) => (
      cond.exist_fisica ? conExistencia : todos
    ));

    it('pide por separado lo que tiene existencia y todo, y enseña primero lo que tiene', async () => {
      responder(
        [{ ...PRODUCTO(1), nombre: 'Café Cubita', exist_fisica: 98 }],
        [
          { ...PRODUCTO(2), nombre: 'Bebida instantánea', exist_fisica: 0 },
          { ...PRODUCTO(1), nombre: 'Café Cubita', exist_fisica: 98 },
        ],
      );
      const { container } = escribir('café');

      await waitFor(() => expect(container.textContent).toContain('Café Cubita'));
      const nombres = [...container.querySelectorAll('button .font-medium')].map((n) => n.textContent);
      expect(nombres).toEqual(['Café Cubita', 'Bebida instantánea']);
      expect(buscar.mock.calls.some(([, , cond]) => cond.exist_fisica?.gt === 0)).toBe(true);
    });

    it('un producto sin existencia sigue saliendo, atenuado', async () => {
      responder([], [{ ...PRODUCTO(3), nombre: 'Sin stock', exist_fisica: 0 }]);
      escribir('stock');

      const fila = (await screen.findByText('Sin stock')).closest('button');
      expect(fila.className).toContain('opacity-60');
    });

    it('enseña el desglose A y T, como el catálogo', async () => {
      responder([{ ...PRODUCTO(1), exist_fisica: 98, almacen: 12, tienda: 86 }], []);
      const { container } = escribir();
      await waitFor(() => expect(container.textContent).toMatch(/EF: 98 · A: 12 · T: 86/));
    });
  });

  it('elegido el producto, su nombre en el campo no vuelve a abrir la lista', async () => {
    // El nombre se queda escrito; antes se buscaba otra vez y la lista se
    // reabría encima del formulario que acababa de aparecer.
    buscar.mockResolvedValue([PRODUCTO(1)]);
    const { container } = render(<ProductSearch onSelect={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'arroz' } });

    await waitFor(() => expect(screen.getByText('Arroz 1')).toBeTruthy());
    const veces = buscar.mock.calls.length;
    fireEvent.click(screen.getByText('Arroz 1').closest('button'));

    await new Promise((r) => setTimeout(r, 400));
    expect(container.querySelector('.overflow-y-auto')).toBeNull();
    expect(buscar).toHaveBeenCalledTimes(veces);
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
