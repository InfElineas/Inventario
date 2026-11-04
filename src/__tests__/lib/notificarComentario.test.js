import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({ usuarios: vi.fn(), crear: vi.fn() }));
vi.mock('@/api/base44Client', () => ({
  base44: { entities: { Usuario: { filter: m.usuarios }, Notificacion: { create: m.crear } } },
}));

const { notificarComentario } = await import('@/lib/notificationService');

beforeEach(() => {
  m.usuarios.mockReset();
  m.crear.mockReset().mockResolvedValue({});
});

describe('notificarComentario', () => {
  const datos = {
    para: 'facturacion', roles: ['fact'], autor: 'jefe@x.com',
    titulo: 'Jefa comentó un conteo para Facturación', mensaje: 'Aceite: falta la factura', enlace: '/inventario',
  };

  it('avisa a quienes tienen los roles del departamento y a su jefe, con el enlace al registro', async () => {
    m.usuarios.mockImplementation(async (cond) => (cond.role
      ? [{ email: 'fact1@x.com' }, { email: 'fact2@x.com' }]
      // Los activos: de ahí salen los jefes, por sus roles de jefe.
      : [{ email: 'jefefact@x.com', roles: ['jefe_depto', 'jefe_facturacion'] },
        { email: 'jefeinv@x.com', roles: ['jefe_depto', 'jefe_inventario'] }]));

    await notificarComentario(datos);

    // Se busca por roles y, aparte, el jefe del departamento.
    expect(m.usuarios).toHaveBeenCalledWith({ role: ['fact'], activo: true });
    const para = m.crear.mock.calls.map(([n]) => n.usuario_id).sort();
    expect(para).toEqual(['fact1@x.com', 'fact2@x.com', 'jefefact@x.com']);
    expect(m.crear.mock.calls[0][0]).toMatchObject({
      tipo: 'comentario', titulo: datos.titulo, mensaje: datos.mensaje, link: '/inventario', leida: false,
    });
  });

  it('no avisa al autor, que ya lo sabe, ni dos veces a quien sale por dos vías', async () => {
    m.usuarios.mockImplementation(async (cond) => (cond.role
      ? [{ email: 'fact1@x.com' }]
      : [{ email: 'jefe@x.com', roles: ['jefe_depto', 'jefe_facturacion'] },
        { email: 'fact1@x.com', roles: ['jefe_depto', 'jefe_facturacion'] }]));

    await notificarComentario(datos);

    expect(m.crear.mock.calls.map(([n]) => n.usuario_id)).toEqual(['fact1@x.com']);
  });

  it('si no hay nadie en el departamento, no crea ningún aviso', async () => {
    m.usuarios.mockResolvedValue([]);
    await notificarComentario(datos);
    expect(m.crear).not.toHaveBeenCalled();
  });
});
