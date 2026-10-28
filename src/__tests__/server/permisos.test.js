import { describe, it, expect } from 'vitest';
import {
  puedeLeer, puedeCrear, puedeActualizar, puedeBorrar,
  filtroPropias, esAdmin, CAMPOS_PROPIOS_USUARIO,
} from '@/server/permisos';

// Cada bloque se contrasta con la policy de la que viene. Lo que más importa
// aquí son los casos negativos: hasta ahora quien decía que no era Postgres.
const ctx = (rol, email = 'yo@mercadoelineas.com') => ({ rol, email });

describe('esAdmin', () => {
  it('administrador y superadmin; nadie más', () => {
    expect(esAdmin('administrador')).toBe(true);
    expect(esAdmin('superadmin')).toBe(true);
    for (const r of ['inv', 'fact', 'auditor', 'ca', 'esp_anuncio', 'supervisor', 'jefe_depto']) {
      expect(esAdmin(r)).toBe(false);
    }
  });
});

describe('lectura', () => {
  it('sin rol no se lee nada', () => {
    expect(puedeLeer({ rol: null }, 'mermas')).toBe(false);
  });

  it('cualquier rol conocido lee las tablas del negocio', () => {
    expect(puedeLeer(ctx('inv'), 'mermas')).toBe(true);
    expect(puedeLeer(ctx('jefe_depto'), 'inventarios')).toBe(true);
  });
});

describe('filtroPropias — notificaciones', () => {
  it('obliga a filtrar por el propio email', () => {
    expect(filtroPropias(ctx('inv'), 'notificaciones'))
      .toEqual({ campo: 'usuario_id', valor: 'yo@mercadoelineas.com' });
  });

  it('un admin ve todas', () => {
    expect(filtroPropias(ctx('administrador'), 'notificaciones')).toBeNull();
  });

  it('las tablas sin filas propias no llevan filtro', () => {
    expect(filtroPropias(ctx('inv'), 'mermas')).toBeNull();
  });
});

describe('creación', () => {
  it('inv crea una merma a su nombre', () => {
    expect(puedeCrear(ctx('inv'), 'mermas', { especialista_id: 'yo@mercadoelineas.com' })).toBe(true);
  });

  it('inv NO crea una merma a nombre de otro', () => {
    expect(puedeCrear(ctx('inv'), 'mermas', { especialista_id: 'otro@mercadoelineas.com' })).toBe(false);
  });

  it('fact y auditor no crean mermas', () => {
    expect(puedeCrear(ctx('fact'), 'mermas', { especialista_id: 'yo@mercadoelineas.com' })).toBe(false);
    expect(puedeCrear(ctx('auditor'), 'mermas', { especialista_id: 'yo@mercadoelineas.com' })).toBe(false);
  });

  it('un admin crea sin más', () => {
    expect(puedeCrear(ctx('administrador'), 'mermas', {})).toBe(true);
  });

  it('esp_anuncio escala un caso, pero solo naciendo en pendiente', () => {
    expect(puedeCrear(ctx('esp_anuncio'), 'anuncios_desact', { estado_tarea: 'pendiente' })).toBe(true);
    // Si pudiera insertarlo ya en auditoría, se saltaría el flujo entero.
    expect(puedeCrear(ctx('esp_anuncio'), 'anuncios_desact', { estado_tarea: 'en_auditoria' })).toBe(false);
    expect(puedeCrear(ctx('esp_anuncio'), 'anuncios_desact', { estado_tarea: 'completado' })).toBe(false);
  });

  it('lotes_ic: inv y ca, a su nombre', () => {
    expect(puedeCrear(ctx('inv'), 'lotes_ic', { especialista_inv_id: 'yo@mercadoelineas.com' })).toBe(true);
    expect(puedeCrear(ctx('ca'), 'lotes_ic', { especialista_inv_id: 'yo@mercadoelineas.com' })).toBe(true);
    expect(puedeCrear(ctx('ca'), 'lotes_ic', { especialista_inv_id: 'otro@mercadoelineas.com' })).toBe(false);
    expect(puedeCrear(ctx('auditor'), 'lotes_ic', { especialista_inv_id: 'yo@mercadoelineas.com' })).toBe(false);
  });

  it('una tabla no declarada no se puede crear', () => {
    expect(puedeCrear(ctx('inv'), 'tabla_inventada', {})).toBe(false);
  });
});

describe('actualización — flujo de mermas', () => {
  const merma = (estado) => ({ estado_tarea: estado });

  it('inv envía a facturación desde en_curso', () => {
    expect(puedeActualizar(ctx('inv'), 'mermas', merma('en_curso'), { estado_tarea: 'pend_fact' })).toBe(true);
  });

  it('inv NO toca una merma que ya está en facturación', () => {
    expect(puedeActualizar(ctx('inv'), 'mermas', merma('pend_fact'), { estado_tarea: 'en_curso' })).toBe(false);
  });

  it('inv NO puede completar una merma saltándose el flujo', () => {
    // Es la regla que evita cerrar sin pasar por FACT ni auditoría.
    expect(puedeActualizar(ctx('inv'), 'mermas', merma('en_curso'), { estado_tarea: 'completado' })).toBe(false);
  });

  it('fact solo actúa sobre pend_fact', () => {
    expect(puedeActualizar(ctx('fact'), 'mermas', merma('pend_fact'), { estado_tarea: 'en_auditoria' })).toBe(true);
    expect(puedeActualizar(ctx('fact'), 'mermas', merma('en_curso'), { estado_tarea: 'pend_fact' })).toBe(false);
  });

  it('fact NO completa: eso es del auditor', () => {
    expect(puedeActualizar(ctx('fact'), 'mermas', merma('pend_fact'), { estado_tarea: 'completado' })).toBe(false);
  });

  it('el auditor completa o devuelve desde auditoría', () => {
    expect(puedeActualizar(ctx('auditor'), 'mermas', merma('en_auditoria'), { estado_tarea: 'completado' })).toBe(true);
    expect(puedeActualizar(ctx('auditor'), 'mermas', merma('en_auditoria'), { estado_tarea: 'devuelto' })).toBe(true);
  });

  it('el auditor no toca lo que aún no le ha llegado', () => {
    expect(puedeActualizar(ctx('auditor'), 'mermas', merma('pend_fact'), { estado_tarea: 'completado' })).toBe(false);
  });

  it('un cambio que no toca el estado se juzga por el estado actual', () => {
    expect(puedeActualizar(ctx('fact'), 'mermas', merma('pend_fact'), { fact_notas: 'x' })).toBe(true);
    expect(puedeActualizar(ctx('fact'), 'mermas', merma('completado'), { fact_notas: 'x' })).toBe(false);
  });

  it('roles ajenos al flujo no actualizan', () => {
    expect(puedeActualizar(ctx('esp_anuncio'), 'mermas', merma('en_curso'), {})).toBe(false);
    expect(puedeActualizar(ctx('jefe_depto'), 'mermas', merma('en_curso'), {})).toBe(false);
  });

  it('un admin pasa por encima', () => {
    expect(puedeActualizar(ctx('administrador'), 'mermas', merma('completado'), { estado_tarea: 'en_curso' })).toBe(true);
  });
});

describe('actualización — inventarios: la diferencia con mermas', () => {
  it('inv NO puede completar un conteo directamente', () => {
    // Fue uno de los tres fallos críticos que corrigió la migración v32.
    expect(puedeActualizar(ctx('inv'), 'inventarios', { estado_tarea: 'en_curso' }, { estado_tarea: 'completado' })).toBe(false);
  });

  it('inv no tiene reconteo_solicitado, a diferencia de mermas', () => {
    expect(puedeActualizar(ctx('inv'), 'inventarios', { estado_tarea: 'reconteo_solicitado' }, {})).toBe(false);
    expect(puedeActualizar(ctx('inv'), 'mermas', { estado_tarea: 'reconteo_solicitado' }, {})).toBe(true);
  });
});

describe('actualización — anuncios y recepciones', () => {
  it('ca actúa en pend_ca y lo manda a auditoría', () => {
    expect(puedeActualizar(ctx('ca'), 'anuncios_desact', { estado_tarea: 'pend_ca' }, { estado_tarea: 'en_auditoria' })).toBe(true);
  });

  it('ca no toca un caso que sigue en INV', () => {
    expect(puedeActualizar(ctx('ca'), 'anuncios_desact', { estado_tarea: 'pendiente' }, {})).toBe(false);
  });

  it('el supervisor solo resuelve recepciones con diferencias', () => {
    expect(puedeActualizar(ctx('supervisor'), 'recepciones', { estado: 'con_diferencias' }, {})).toBe(true);
    expect(puedeActualizar(ctx('supervisor'), 'recepciones', { estado: 'en_curso' }, {})).toBe(false);
  });

  it('inv cierra una recepción en curso', () => {
    expect(puedeActualizar(ctx('inv'), 'recepciones', { estado: 'en_curso' }, { estado: 'cerrada' })).toBe(true);
    expect(puedeActualizar(ctx('inv'), 'recepciones', { estado: 'cerrada' }, { estado: 'en_curso' })).toBe(false);
  });
});

describe('actualización — usuarios: la regla más delicada', () => {
  const yo = { email: 'yo@mercadoelineas.com', role: 'inv' };

  it('puedo cambiar mis preferencias', () => {
    expect(puedeActualizar(ctx('inv'), 'usuarios', yo, { nickname: 'Yo', sync_config: {} })).toBe(true);
  });

  it('NO puedo cambiarme el rol', () => {
    // Reemplaza al trigger prevent_role_self_escalation, eliminado en la
    // migración porque habría bloqueado el espejado del rol desde el IS.
    expect(puedeActualizar(ctx('inv'), 'usuarios', yo, { role: 'administrador' })).toBe(false);
  });

  it('NO puedo activarme ni desactivarme', () => {
    expect(puedeActualizar(ctx('inv'), 'usuarios', yo, { activo: true })).toBe(false);
  });

  it('un cambio válido mezclado con uno prohibido se rechaza entero', () => {
    expect(puedeActualizar(ctx('inv'), 'usuarios', yo, { nickname: 'Yo', role: 'superadmin' })).toBe(false);
  });

  it('no puedo tocar la fila de otro', () => {
    expect(puedeActualizar(ctx('inv'), 'usuarios', { email: 'otro@mercadoelineas.com' }, { nickname: 'x' })).toBe(false);
  });

  it('un admin sí cambia roles', () => {
    expect(puedeActualizar(ctx('administrador'), 'usuarios', { email: 'otro@mercadoelineas.com' }, { role: 'fact' })).toBe(true);
  });

  it('role y activo quedan fuera de los campos propios', () => {
    expect(CAMPOS_PROPIOS_USUARIO).not.toContain('role');
    expect(CAMPOS_PROPIOS_USUARIO).not.toContain('activo');
  });
});

describe('borrado', () => {
  const mermaBorrable = {
    especialista_id: 'yo@mercadoelineas.com',
    estado_tarea: 'pend_fact',
    fact_no_factura: null,
    auditor_id: null,
  };

  it('inv borra su merma mientras nadie la haya tocado', () => {
    expect(puedeBorrar(ctx('inv'), 'mermas', mermaBorrable)).toBe(true);
  });

  it('deja de poder en cuanto facturación le pone número', () => {
    expect(puedeBorrar(ctx('inv'), 'mermas', { ...mermaBorrable, fact_no_factura: 'F-1' })).toBe(false);
  });

  it('ni cuando ya pasó por el auditor', () => {
    expect(puedeBorrar(ctx('inv'), 'mermas', { ...mermaBorrable, auditor_id: 'a@mercadoelineas.com' })).toBe(false);
  });

  it('no borra las mermas de otro', () => {
    expect(puedeBorrar(ctx('inv'), 'mermas', { ...mermaBorrable, especialista_id: 'otro@mercadoelineas.com' })).toBe(false);
  });

  it('el superadmin borra cualquiera', () => {
    expect(puedeBorrar(ctx('superadmin'), 'mermas', { estado_tarea: 'completado' })).toBe(true);
  });

  it('un administrador no borra mermas, aunque sí inventarios sin completar', () => {
    expect(puedeBorrar(ctx('administrador'), 'mermas', mermaBorrable)).toBe(false);
    expect(puedeBorrar(ctx('administrador'), 'inventarios', { estado_tarea: 'en_curso' })).toBe(true);
    expect(puedeBorrar(ctx('administrador'), 'inventarios', { estado_tarea: 'completado' })).toBe(false);
  });

  it('recepciones: cualquier inv borra una en curso, sea suya o no', () => {
    // Única de las tres sin comprobación de propiedad; se respeta la policy.
    expect(puedeBorrar(ctx('inv'), 'recepciones', { estado: 'en_curso', especialista_id: 'otro@mercadoelineas.com' })).toBe(true);
    expect(puedeBorrar(ctx('inv'), 'recepciones', { estado: 'cerrada' })).toBe(false);
  });

  it('una tabla sin regla de borrado no se borra', () => {
    expect(puedeBorrar(ctx('superadmin'), 'historial_movimientos', {})).toBe(false);
    expect(puedeBorrar(ctx('administrador'), 'lotes', {})).toBe(false);
  });

  it('sin rol no se borra nada', () => {
    expect(puedeBorrar({ rol: null }, 'mermas', mermaBorrable)).toBe(false);
  });
});

describe('varios roles: los permisos se suman', () => {
  // Quien es inventarista y además factura resolvía a `fact` —el de más
  // autoridad— y perdía todo lo que solo puede `inv`: recepciones,
  // vencimientos, registrar un conteo. Lo que puede hacer alguien es la suma
  // de lo que permiten sus roles.
  const dosRoles = { roles: ['fact', 'inv'], email: 'yo@mercadoelineas.com' };

  it('puede crear lo que permite su rol secundario', () => {
    expect(puedeCrear(dosRoles, 'recepciones', { especialista_id: 'yo@mercadoelineas.com' })).toBe(true);
    // Con `fact` solo, no podría.
    expect(puedeCrear(ctx('fact'), 'recepciones', { especialista_id: 'yo@mercadoelineas.com' })).toBe(false);
  });

  it('avanza el flujo por cualquiera de sus dos lados', () => {
    const enCurso = { estado_tarea: 'en_curso' };
    const pendFact = { estado_tarea: 'pend_fact' };
    // Como inventarista, de en_curso a pend_fact.
    expect(puedeActualizar(dosRoles, 'mermas', enCurso, { estado_tarea: 'pend_fact' })).toBe(true);
    // Como facturación, de pend_fact a auditoría.
    expect(puedeActualizar(dosRoles, 'mermas', pendFact, { estado_tarea: 'en_auditoria' })).toBe(true);
  });

  it('lo que no permite ninguno de sus roles sigue prohibido', () => {
    const enAuditoria = { estado_tarea: 'en_auditoria' };
    expect(puedeActualizar(dosRoles, 'mermas', enAuditoria, { estado_tarea: 'completado' })).toBe(false);
  });

  it('un usuario guardado antes de la columna sigue funcionando con su rol suelto', () => {
    expect(puedeCrear(ctx('inv'), 'recepciones', { especialista_id: 'yo@mercadoelineas.com' })).toBe(true);
  });

  it('sin ningún rol no puede nada', () => {
    expect(puedeCrear({ roles: [], email: 'x' }, 'recepciones', {})).toBe(false);
    expect(puedeLeer({ roles: [] }, 'mermas')).toBe(false);
  });
});
