import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * El diálogo de subir y bajar de tienda.
 *
 * Lo que se prueba aquí es lo que decide si alguien mueve mercancía de más:
 * que el plan se lea, que diga cuánto se mueve de verdad —TKC recorta— y que
 * no se pueda ejecutar un plan que no concede nada.
 */

const svc = vi.hoisted(() => ({
  planearTienda: vi.fn(), ejecutarTienda: vi.fn(), esperarTrabajo: vi.fn(),
}));
vi.mock('@/services/tiendaService', () => svc);

const { default: MoverTiendaDialog } = await import('@/components/productos/MoverTiendaDialog');

const PRODUCTO = {
  codigo: 'SC78913092601',
  nombre: 'Abrazadera final de aluminio',
  ef: 294, enAlmacen: 294, enTienda: 0,
};

const plan = (linea) => ({
  status: 'succeeded',
  result: {
    strategy: 'lookup',
    totalGranted: linea.granted,
    exito: linea.granted > 0 ? [linea] : [],
    fallido: linea.granted > 0 ? [] : [linea],
  },
});

function montar(props = {}) {
  render(
    <MoverTiendaDialog modulo="subir" producto={PRODUCTO} almacen="789"
      onHecho={() => {}} onClose={() => {}} {...props} />,
  );
}
const boton = (nombre) => screen.getByRole('button', { name: nombre });

beforeEach(() => {
  cleanup();
  Object.values(svc).forEach((f) => f.mockReset());
  svc.esperarTrabajo.mockImplementation(async () => { throw new Error('no debería esperarse'); });
});

describe('MoverTiendaDialog', () => {
  it('el plan se lee en castellano, no como JSON', async () => {
    svc.planearTienda.mockResolvedValue(plan({
      line: 1, code: PRODUCTO.codigo, requested: 294, granted: 294, status: 'exito',
    }));
    const user = userEvent.setup();
    montar();

    await user.click(boton(/analizar/i));
    expect(await screen.findByText(/se subirían 294 de las 294 unidades/i)).toBeInTheDocument();
    expect(screen.queryByText(/totalGranted/)).not.toBeInTheDocument();
    expect(boton(/ejecutar/i)).toBeEnabled();
  });

  it('un plan que no concede nada enseña el motivo y no se deja ejecutar', async () => {
    svc.planearTienda.mockResolvedValue(plan({
      line: 1, code: PRODUCTO.codigo, requested: 294, granted: 0, status: 'fallido',
      reason: 'Este código no tiene oferta en la tienda de este almacén.',
    }));
    const user = userEvent.setup();
    montar();

    await user.click(boton(/analizar/i));
    expect(await screen.findByText(/no se movería nada/i)).toBeInTheDocument();
    expect(screen.getByText(/no tiene oferta en la tienda/i)).toBeInTheDocument();
    // Ejecutarlo mandaría a TKC algo que ya dijo que rechaza.
    expect(boton(/ejecutar/i)).toBeDisabled();
    expect(svc.ejecutarTienda).not.toHaveBeenCalled();
  });

  it('avisa cuando TKC recorta la cantidad', async () => {
    svc.planearTienda.mockResolvedValue(plan({
      line: 1, code: PRODUCTO.codigo, requested: 294, granted: 100, status: 'exito', trimmed: true,
    }));
    const user = userEvent.setup();
    montar();

    await user.click(boton(/analizar/i));
    expect(await screen.findByText(/se subirían 100 de las 294/i)).toBeInTheDocument();
    expect(screen.getByText(/se recorta a lo que hay/i)).toBeInTheDocument();
  });

  it('no se puede ejecutar sin analizar antes', () => {
    montar();
    expect(boton(/ejecutar/i)).toBeDisabled();
  });

  it('cada sentido ofrece solo sus modos', () => {
    montar({ modulo: 'subir' });
    expect(screen.getByRole('option', { name: /reserva/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /porcentaje/i })).not.toBeInTheDocument();

    cleanup();
    montar({ modulo: 'bajar', producto: { ...PRODUCTO, enTienda: 10 } });
    expect(screen.getByRole('option', { name: /porcentaje/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /reserva/i })).not.toBeInTheDocument();
  });
});
