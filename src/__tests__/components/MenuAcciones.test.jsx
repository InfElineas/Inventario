import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MenuAcciones from '@/components/productos/MenuAcciones';

/**
 * El menú de acciones de una fila, el mismo en catálogo, inventario, mermas y
 * vencimientos. Lo que cada pantalla ofrece lo decide ella; aquí se vigila que
 * el menú respete eso y no enseñe de más.
 */

const PRODUCTO = { nombre: 'Aceite Dante' };

async function abrir(props) {
  render(<MenuAcciones producto={PRODUCTO} onHistorial={() => {}} onConteos={() => {}} {...props} />);
  await userEvent.click(screen.getByRole('button', { name: /acciones: aceite dante/i }));
}

beforeEach(() => cleanup());

describe('MenuAcciones', () => {
  it('«Ver todos los precios» sale solo donde la pantalla lo ofrece, y lo llama', async () => {
    const onPrecios = vi.fn();
    await abrir({ onPrecios });

    await userEvent.click(await screen.findByRole('button', { name: /ver todos los precios/i }));
    expect(onPrecios).toHaveBeenCalledTimes(1);
  });

  it('sin onPrecios no hay opción de precios', async () => {
    await abrir({});
    await screen.findByRole('button', { name: /historial del submayor/i });
    expect(screen.queryByRole('button', { name: /precios/i })).not.toBeInTheDocument();
  });

  it('los precios los ve cualquiera: no dependen de poder mover tienda', async () => {
    await abrir({ onPrecios: () => {}, puedeMoverTienda: false });
    expect(await screen.findByRole('button', { name: /ver todos los precios/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /subir a tienda/i })).not.toBeInTheDocument();
  });

  it('subir y bajar solo con permiso, y según los módulos de la pantalla', async () => {
    await abrir({ puedeMoverTienda: true, modulos: ['bajar'], onMover: () => {} });
    expect(await screen.findByRole('button', { name: /bajar de tienda/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /subir a tienda/i })).not.toBeInTheDocument();
  });
});
