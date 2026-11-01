import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Con qué conteo se intercambió un producto.
 *
 * Un intercambio es un solo hecho contado dos veces: se vendió uno por otro,
 * así que uno sale faltante y el otro sobrante por la misma cantidad.
 * Emparejar mal —o dejarlo a medias— le deja a facturación dos ajustes que no
 * cuadran y ninguna pista de que eran el mismo caso.
 */

const filter = vi.hoisted(() => vi.fn());
vi.mock('@/api/base44Client', () => ({ base44: { entities: { Inventario: { filter } } } }));

const { default: SelectorIntercambio } = await import('@/components/inventario/SelectorIntercambio');

const BORRADOR = (extra = {}) => ({
  id: 'a1', producto_nombre: 'Champú Dove 370ml', producto_codigo: '7501',
  diferencia: 35, fecha_inv: '2026-11-01', estado_tarea: 'en_curso', ...extra,
});

const pintar = (props = {}) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SelectorIntercambio diferencia={-35} almacen="789" onElegir={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
};

beforeEach(() => filter.mockReset());

describe('SelectorIntercambio', () => {
  it('busca la cantidad contraria, en borrador y del mismo almacén', async () => {
    filter.mockResolvedValue([]);
    pintar({ diferencia: -35, almacen: '789' });

    await waitFor(() => expect(filter).toHaveBeenCalled());
    const [condiciones] = filter.mock.calls[0];
    // Un faltante de 35 solo puede emparejarse con un sobrante de 35.
    expect(condiciones.diferencia).toBe(35);
    expect(condiciones.estado_tarea).toBe('en_curso');
    expect(condiciones.almacen_num).toBe('789');
  });

  it('no se ofrece a sí mismo al corregir un borrador', async () => {
    filter.mockResolvedValue([BORRADOR(), BORRADOR({ id: 'yo' })]);
    pintar({ excluirId: 'yo' });

    await waitFor(() => expect(screen.getAllByRole('button')).toHaveLength(1));
  });

  it('sin candidatos, dice qué hacer en vez de dejar un hueco', async () => {
    // El otro producto puede no estar contado todavía: el aviso tiene que
    // decir que hay que contarlo y guardarlo como borrador.
    filter.mockResolvedValue([]);
    pintar();

    await waitFor(() => {
      expect(screen.getByText(/No hay ningún conteo en borrador/)).toBeTruthy();
    });
    expect(screen.getByText(/Guardar para recontar/)).toBeTruthy();
  });

  it('elegir uno lo devuelve entero, no solo su id', async () => {
    // Quien lo usa necesita el nombre para confirmarlo en pantalla.
    const onElegir = vi.fn();
    filter.mockResolvedValue([BORRADOR()]);
    pintar({ onElegir });

    await waitFor(() => expect(screen.getByText('Champú Dove 370ml')).toBeTruthy());
    fireEvent.click(screen.getByText('Champú Dove 370ml').closest('button'));
    expect(onElegir).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });

  it('volver a pulsar el elegido lo quita', async () => {
    const onElegir = vi.fn();
    filter.mockResolvedValue([BORRADOR()]);
    pintar({ onElegir, valor: 'a1' });

    await waitFor(() => expect(screen.getByText('Champú Dove 370ml')).toBeTruthy());
    fireEvent.click(screen.getByText('Champú Dove 370ml').closest('button'));
    expect(onElegir).toHaveBeenCalledWith(null);
  });

  it('sin diferencia no hay nada que emparejar', () => {
    const { container } = pintar({ diferencia: 0 });
    expect(container.textContent).toBe('');
    expect(filter).not.toHaveBeenCalled();
  });
});
