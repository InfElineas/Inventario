import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// recharts no mide nada en jsdom: se sustituye por marcas que dicen qué se le pasó.
vi.mock('recharts', () => {
  const Nada = ({ children }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Nada,
    BarChart: ({ data, children }) => <div data-testid="barras" data-meses={data.length}>{children}</div>,
    Bar: Nada, Cell: () => null, CartesianGrid: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null,
  };
});

const { default: VentasPorMes } = await import('@/components/dashboard/VentasPorMes');

afterEach(cleanup);

const mesActual = () => {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
};

describe('VentasPorMes', () => {
  it('pinta todos los meses pedidos y el del mes en curso', () => {
    render(<VentasPorMes meses={12} consulta={{
      isLoading: false,
      data: { meses: [{ mes: mesActual(), cantidad: 1812, importe: 10, ordenes: 3, dias: 12 }] },
    }} />);
    expect(screen.getByTestId('barras')).toHaveAttribute('data-meses', '12');
    expect(screen.getByText(/este mes, 12 días con datos/)).toBeInTheDocument();
    expect(screen.getByText(/^1.?812$/)).toBeInTheDocument();
  });

  it('cargando, lo dice', () => {
    render(<VentasPorMes consulta={{ isLoading: true }} />);
    expect(screen.getByText(/Calculando/)).toBeInTheDocument();
  });

  it('sin ventas, lo dice en vez de pintar barras vacías', () => {
    render(<VentasPorMes consulta={{ isLoading: false, data: { meses: [] } }} />);
    expect(screen.getByText(/no tiene ventas en estos meses/)).toBeInTheDocument();
    expect(screen.queryByTestId('barras')).not.toBeInTheDocument();
  });

  it('un rol que no ve las ventas: la tarjeta no sale, y no es un error', () => {
    const e = Object.assign(new Error('Tu rol no puede ver el resumen de ventas.'), { status: 403 });
    const { container } = render(<VentasPorMes consulta={{ isLoading: false, error: e }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('otro fallo se dice', () => {
    render(<VentasPorMes consulta={{ isLoading: false, error: Object.assign(new Error('Se cayó'), { status: 500 }) }} />);
    expect(screen.getByText(/No se pudieron cargar las ventas: Se cayó/)).toBeInTheDocument();
  });
});
