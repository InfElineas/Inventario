import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const m = vi.hoisted(() => ({ filter: vi.fn() }));
vi.mock('@/api/base44Client', () => ({
  base44: { entities: { ComentarioSupervision: { filter: m.filter } } },
}));

const { default: ComentariosDeSupervision } = await import('@/components/supervision/ComentariosDeSupervision');

const COMENTARIOS = [
  { id: 1, para_depto: 'inventario', autor_id: 'jefe@x.com', autor_nombre: 'Jefa', comentario: 'Vuelve a contar el pasillo 3', created_date: '2026-11-03T10:00:00Z' },
  { id: 2, para_depto: 'facturacion', autor_id: 'jefe@x.com', autor_nombre: 'Jefa', comentario: 'Falta la factura', created_date: '2026-11-03T11:00:00Z' },
];

function pintar(usuario) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ComentariosDeSupervision tabla="inventarios" registroId="r1" usuario={usuario} />
    </QueryClientProvider>,
  );
}

beforeEach(() => m.filter.mockReset().mockResolvedValue(COMENTARIOS));
afterEach(cleanup);

describe('ComentariosDeSupervision', () => {
  it('el destinatario ve el comentario dirigido a su departamento, con quién lo escribió y para quién', async () => {
    pintar({ email: 'ana@x.com', role: 'inv' });

    expect(await screen.findByText('Vuelve a contar el pasillo 3')).toBeInTheDocument();
    expect(screen.getByText('Jefa')).toBeInTheDocument();
    expect(screen.getByText('para Inventario')).toBeInTheDocument();
    expect(screen.getByText(/Comentarios de supervisión \(1\)/)).toBeInTheDocument();
    // Lo de otro departamento no.
    expect(screen.queryByText('Falta la factura')).not.toBeInTheDocument();
    expect(m.filter).toHaveBeenCalledWith({ tabla: 'inventarios', registro_id: 'r1' }, 'created_date');
  });

  it('quien supervisa los ve todos', async () => {
    pintar({ email: 'jefe@x.com', role: 'jefe_depto', departamento: 'inventario' });
    expect(await screen.findByText('Falta la factura')).toBeInTheDocument();
    expect(screen.getByText('Vuelve a contar el pasillo 3')).toBeInTheDocument();
  });

  it('si no hay nada para esta persona, no sale ni el bloque', async () => {
    const { container } = pintar({ email: 'aud@x.com', role: 'auditor' });
    await waitFor(() => expect(m.filter).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('sin usuario no consulta nada', () => {
    pintar(undefined);
    expect(m.filter).not.toHaveBeenCalled();
  });
});
