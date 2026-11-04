import { describe, it, expect } from 'vitest';
import {
  DESTINOS_COMENTARIO, departamentosDe, supervisa, visiblesPara, nuevoComentario, avisoDeComentario,
} from '@/lib/comentariosSupervision';

const persona = (role, extra = {}) => ({ email: `${role}@x.com`, role, ...extra });

describe('departamentosDe', () => {
  it('por el rol', () => {
    expect(departamentosDe(persona('inv'))).toEqual(['inventario']);
    expect(departamentosDe(persona('fact'))).toEqual(['facturacion']);
    expect(departamentosDe(persona('ca'))).toEqual(['ca']);
    expect(departamentosDe(persona('esp_anuncio'))).toEqual(['ca']);
    expect(departamentosDe(persona('auditor'))).toEqual(['auditoria']);
  });

  it('un jefe, los departamentos de sus roles de jefe', () => {
    expect(departamentosDe({ email: 'j@x.com', roles: ['jefe_depto', 'jefe_facturacion'] })).toEqual(['facturacion']);
    expect(departamentosDe({ email: 'j@x.com', roles: ['jefe_depto', 'jefe_inventario', 'jefe_ca'] }).sort()).toEqual(['ca', 'inventario']);
  });

  it('un jefe de departamento, el suyo; quien tiene dos roles, los dos', () => {
    expect(departamentosDe(persona('jefe_depto', { departamento: 'facturacion' }))).toEqual(['facturacion']);
    expect(departamentosDe({ email: 'a@x.com', roles: ['inv', 'fact'] }).sort()).toEqual(['facturacion', 'inventario']);
    expect(departamentosDe(undefined)).toEqual([]);
  });
});

describe('visiblesPara', () => {
  const comentarios = [
    { id: 1, para_depto: 'inventario', autor_id: 'jefe@x.com', comentario: 'para inventario' },
    { id: 2, para_depto: 'facturacion', autor_id: 'jefe@x.com', comentario: 'para facturación' },
    { id: 3, para_depto: null, autor_id: 'jefe@x.com', comentario: 'de antes, sin destinatario' },
    { id: 4, para_depto: 'facturacion', autor_id: 'inv@x.com', comentario: 'lo escribió inventario' },
  ];

  it('el destinatario ve lo dirigido a su departamento, y no lo de los otros', () => {
    expect(visiblesPara(comentarios, persona('inv')).map((c) => c.id)).toEqual([1, 4]);
    expect(visiblesPara(comentarios, persona('fact')).map((c) => c.id)).toEqual([2, 4]);
    expect(visiblesPara(comentarios, persona('auditor'))).toEqual([]);
  });

  it('los comentarios sin destinatario no los ve un departamento', () => {
    expect(visiblesPara(comentarios, persona('inv')).some((c) => c.id === 3)).toBe(false);
  });

  it('quien supervisa los ve todos, también los de antes', () => {
    expect(visiblesPara(comentarios, persona('jefe_depto', { departamento: 'inventario' }))).toHaveLength(4);
    expect(visiblesPara(comentarios, persona('administrador'))).toHaveLength(4);
    expect(supervisa(persona('superadmin'))).toBe(true);
    expect(supervisa(persona('inv'))).toBe(false);
  });

  it('sin comentarios, nada', () => {
    expect(visiblesPara(undefined, persona('inv'))).toEqual([]);
  });
});

describe('nuevoComentario y avisoDeComentario', () => {
  it('el comentario lleva su destinatario', () => {
    expect(nuevoComentario({
      tabla: 'inventarios', registroId: 'r1', usuario: { email: 'jefe@x.com', full_name: 'Jefa' }, para: 'facturacion', texto: 'Revisen este',
    })).toEqual({
      tabla: 'inventarios', registro_id: 'r1', autor_id: 'jefe@x.com', autor_nombre: 'Jefa',
      para_depto: 'facturacion', comentario: 'Revisen este',
    });
  });

  it('el aviso dice quién, sobre qué y para quién, y lleva al registro', () => {
    const a = avisoDeComentario({
      tabla: 'mermas', registroId: 'r1', autor: 'Jefa', para: 'facturacion', producto: 'Aceite', texto: 'Falta el número de factura',
    });
    expect(a.titulo).toBe('Jefa comentó una merma para Facturación');
    expect(a.mensaje).toBe('Aceite: Falta el número de factura');
    expect(a.enlace).toBe('/ajustes/disminucion?tab=mermas');
  });

  it('el texto largo se recorta en el aviso, y una recepción lleva a la suya', () => {
    const a = avisoDeComentario({ tabla: 'recepciones', registroId: 'abc', autor: 'J', para: 'inventario', texto: 'x'.repeat(300) });
    expect(a.mensaje.length).toBeLessThan(150);
    expect(a.enlace).toBe('/recepciones/abc');
  });

  it('los destinos son los departamentos más auditoría', () => {
    expect(Object.keys(DESTINOS_COMENTARIO)).toEqual(['inventario', 'facturacion', 'ca', 'auditoria']);
  });
});
