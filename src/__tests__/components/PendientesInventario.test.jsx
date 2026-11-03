import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * El puente entre inventario y facturación.
 *
 * Lo que se prueba es que cada pantalla pida lo suyo —un sobrante se resuelve
 * con un aumento y un faltante con una disminución—, que las líneas que pasa al
 * formulario lleven la cantidad que midió el conteo, que se pueda elegir cuáles
 * y que lo que no procede se pueda devolver a inventario con su motivo.
 */

const m = vi.hoisted(() => ({ filter: vi.fn(), update: vi.fn(), me: vi.fn() }));
vi.mock('@/api/base44Client', () => ({
  base44: {
    auth: { me: m.me },
    entities: new Proxy({}, { get: () => ({ filter: m.filter, update: m.update, create: vi.fn() }) }),
  },
}));

const { default: PendientesInventario } = await import('@/components/ajustes/PendientesInventario');

const conteo = (extra = {}) => ({
  id: 'c1', almacen_num: '789', producto_id: 'p1', producto_nombre: 'Aceite 1 L', producto_codigo: '7501',
  diferencia: 3, especialista_nombre: 'Ada', fecha_inv: '2026-10-27', ...extra,
});

function pintar(props) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PendientesInventario almacen="789" onUsar={() => {}} {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  m.filter.mockReset().mockResolvedValue([]);
  m.update.mockReset().mockResolvedValue({});
  m.me.mockReset().mockResolvedValue({ email: 'fact@x.com', full_name: 'Fran', role: 'fact' });
});
afterEach(cleanup);

describe('PendientesInventario', () => {
  it('la pantalla de aumento pide sobrantes', async () => {
    pintar({ tipo: 'aumento' });
    await waitFor(() => expect(m.filter).toHaveBeenCalled());
    expect(m.filter.mock.calls[0][0]).toMatchObject({
      almacen_num: '789', resultado: 'sobrante', estado_tarea: 'pend_fact',
    });
  });

  it('la de disminución pide faltantes', async () => {
    pintar({ tipo: 'disminucion' });
    await waitFor(() => expect(m.filter).toHaveBeenCalled());
    expect(m.filter.mock.calls[0][0]).toMatchObject({ resultado: 'faltante' });
  });

  it('sin almacén no consulta nada', () => {
    pintar({ tipo: 'aumento', almacen: '' });
    expect(m.filter).not.toHaveBeenCalled();
  });

  it('dice que no hay nada en vez de quedarse en blanco', async () => {
    pintar({ tipo: 'aumento' });
    expect(await screen.findByText(/Ningún conteo/i)).toBeInTheDocument();
  });

  it('lista los conteos con su diferencia y lo que se midió', async () => {
    m.filter.mockResolvedValue([
      conteo({ exist_fisica_tkc: 10, conteo_real: 13 }),
      conteo({ id: 'c2', producto_id: 'p2', producto_nombre: 'Arroz', producto_codigo: '7502', diferencia: -5, especialista_nombre: 'Lin' }),
    ]);
    pintar({ tipo: 'aumento' });

    expect(await screen.findByText('Aceite 1 L')).toBeInTheDocument();
    expect(screen.getByText('Arroz')).toBeInTheDocument();
    // El signo importa: un sobrante suma y un faltante resta.
    expect(screen.getByText('+3')).toBeInTheDocument();
    expect(screen.getByText('-5')).toBeInTheDocument();
    expect(screen.getByText('10 → 13')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Lin')).toBeInTheDocument();
  });

  it('pasa al formulario el código y la cantidad medida, en valor absoluto, y los conteos de los que sale', async () => {
    // Un faltante viene con diferencia negativa, pero el ajuste de
    // disminución resta: la línea lleva cuánto, no en qué sentido.
    m.filter.mockResolvedValue([
      conteo({ producto_codigo: '7501', diferencia: -4 }),
      conteo({ id: 'c2', producto_id: 'p2', producto_codigo: '7502', diferencia: -1 }),
    ]);
    const onUsar = vi.fn();
    pintar({ tipo: 'disminucion', onUsar });

    await userEvent.click(await screen.findByRole('button', { name: /Pasarlos al formulario/i }));
    expect(onUsar).toHaveBeenCalledTimes(1);
    expect(onUsar.mock.calls[0][0]).toBe('7501*4\n7502*1');
    expect(onUsar.mock.calls[0][1].map((x) => x.conteo.id)).toEqual(['c1', 'c2']);
  });

  it('descarta los conteos sin código o sin diferencia', async () => {
    m.filter.mockResolvedValue([
      conteo({ producto_codigo: '7501', diferencia: 2 }),
      conteo({ id: 'c2', producto_id: 'p2', producto_codigo: '', diferencia: 9 }),
      conteo({ id: 'c3', producto_id: 'p3', producto_codigo: '7503', diferencia: 0 }),
    ]);
    const onUsar = vi.fn();
    pintar({ tipo: 'aumento', onUsar });

    await userEvent.click(await screen.findByRole('button', { name: /Pasarlos/i }));
    expect(onUsar.mock.calls[0][0]).toBe('7501*2');
  });

  it('se puede quitar un conteo: solo van los marcados', async () => {
    m.filter.mockResolvedValue([
      conteo({ producto_codigo: '7501', diferencia: 2 }),
      conteo({ id: 'c2', producto_id: 'p2', producto_nombre: 'Arroz', producto_codigo: '7502', diferencia: 3 }),
    ]);
    const onUsar = vi.fn();
    pintar({ tipo: 'aumento', onUsar });

    await userEvent.click(await screen.findByRole('checkbox', { name: /Incluir Arroz/i }));
    await userEvent.click(screen.getByRole('button', { name: /Pasarlos al formulario \(1\)/i }));
    expect(onUsar.mock.calls[0][0]).toBe('7501*2');
    expect(onUsar.mock.calls[0][1]).toHaveLength(1);
  });

  it('el menú ⋯ de la fila monta el ajuste con ESE producto y ofrece analizar la diferencia', async () => {
    m.filter.mockResolvedValue([
      conteo({ producto_codigo: '7501', diferencia: 3 }),
      conteo({ id: 'c2', producto_id: 'p2', producto_nombre: 'Arroz', producto_codigo: '7502', diferencia: 2 }),
    ]);
    const onUsar = vi.fn();
    pintar({ tipo: 'aumento', onUsar });

    await userEvent.click(await screen.findByRole('button', { name: 'Acciones: Arroz' }));
    expect(await screen.findByText('Analizar diferencia')).toBeInTheDocument();
    expect(screen.getByText('Historial del submayor')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Montar ajuste de aumento con este producto'));

    expect(onUsar).toHaveBeenCalledTimes(1);
    expect(onUsar.mock.calls[0][0]).toBe('7502*2');
    expect(onUsar.mock.calls[0][1].map((x) => x.conteo.id)).toEqual(['c2']);
  });

  it('sin ninguno marcado no se puede pasar nada', async () => {
    m.filter.mockResolvedValue([conteo()]);
    pintar({ tipo: 'aumento' });

    await userEvent.click(await screen.findByRole('checkbox'));
    expect(screen.getByRole('button', { name: /Pasarlos al formulario \(0\)/i })).toBeDisabled();
  });

  it('de cada producto solo cuenta el conteo más reciente, y lo dice', async () => {
    m.filter.mockResolvedValue([
      conteo({ id: 'viejo', fecha_inv: '2026-10-20', diferencia: 9 }),
      conteo({ id: 'nuevo', fecha_inv: '2026-10-27', diferencia: 3 }),
    ]);
    const onUsar = vi.fn();
    pintar({ tipo: 'aumento', onUsar });

    await userEvent.click(await screen.findByRole('button', { name: /Pasarlos/i }));
    // Una sola línea del producto —dos darían «código repetido»— y la cantidad del reciente.
    expect(onUsar.mock.calls[0][0]).toBe('7501*3');
    expect(onUsar.mock.calls[0][1][0].anteriores.map((c) => c.id)).toEqual(['viejo']);
    expect(screen.getByText(/1 conteo anterior queda cubierto/i)).toBeInTheDocument();
  });

  it('los intercambios no están aquí: son de Procesamientos', async () => {
    m.filter.mockResolvedValue([
      conteo({ id: 'i1', intercambio_id: 'i2', producto_nombre: 'Cambiado' }),
      conteo({ id: 'c2', producto_id: 'p2', producto_nombre: 'Normal', producto_codigo: '7502' }),
    ]);
    pintar({ tipo: 'aumento' });

    expect(await screen.findByText('Normal')).toBeInTheDocument();
    expect(screen.queryByText('Cambiado')).not.toBeInTheDocument();
  });

  it('devolver a inventario exige un motivo y marca el conteo como devuelto', async () => {
    m.filter.mockResolvedValue([conteo()]);
    pintar({ tipo: 'aumento' });

    await userEvent.click(await screen.findByRole('button', { name: /Devolver a inventario: Aceite 1 L/i }));
    const devolver = screen.getByRole('button', { name: /^Devolver$/ });
    expect(devolver).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText(/qué hay que corregir/i), 'Falta contar el pasillo 3');
    await userEvent.click(devolver);

    await waitFor(() => expect(m.update).toHaveBeenCalledTimes(1));
    expect(m.update.mock.calls[0][0]).toBe('c1');
    expect(m.update.mock.calls[0][1]).toMatchObject({
      estado_tarea: 'devuelto', fact_notas: 'Falta contar el pasillo 3', fact_especialista_id: 'fact@x.com',
    });
  });

  it('el detalle enseña la nota de inventario y la clasificación', async () => {
    m.filter.mockResolvedValue([conteo({ notas_inv: 'Estaba en otro pasillo', clasif_ajuste: 'Robo' })]);
    pintar({ tipo: 'aumento' });

    await userEvent.click(await screen.findByRole('button', { name: /Ver detalle: Aceite 1 L/i }));
    expect(await screen.findByText(/Estaba en otro pasillo/)).toBeInTheDocument();
  });
});
