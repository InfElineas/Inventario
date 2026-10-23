import { describe, it, expect } from 'vitest';
import {
  parseLineas, interpretar, puedeConfirmar, nuevaClave, TIPOS_AJUSTE, ROLES_AJUSTES,
  CLASIFICACIONES_AUMENTO, CLASIFICACIONES_DISMINUCION, MAX_LINEAS,
} from '@/lib/ajustes';

describe('listas de TKC', () => {
  it('8 etiquetas de aumento y 34 de disminución, sin repetir', () => {
    expect(CLASIFICACIONES_AUMENTO).toHaveLength(8);
    expect(CLASIFICACIONES_DISMINUCION).toHaveLength(34);
    expect(new Set(CLASIFICACIONES_AUMENTO).size).toBe(8);
    expect(new Set(CLASIFICACIONES_DISMINUCION).size).toBe(34);
  });

  it('el aumento trae su valor por defecto dentro de la lista; la disminución no tiene', () => {
    const a = TIPOS_AJUSTE.aumento;
    expect(a.clasificaciones).toContain(a.clasificacionPorDefecto);
    expect(TIPOS_AJUSTE.disminucion.clasificacionPorDefecto).toBe('');
    expect(TIPOS_AJUSTE.disminucion.clasificacionObligatoria).toBe(true);
  });

  it('los segmentos coinciden con las rutas del servidor', () => {
    expect(TIPOS_AJUSTE.aumento.segmento).toBe('aumentos');
    expect(TIPOS_AJUSTE.disminucion.segmento).toBe('disminuciones');
  });

  it('facturación y administradores; nadie más', () => {
    expect(ROLES_AJUSTES).toEqual(['fact', 'administrador', 'superadmin']);
  });
});

describe('parseLineas', () => {
  it('lee CODIGO*CANTIDAD y la cantidad vale 1 si falta', () => {
    const { lines, errores } = parseLineas('7622210833662*3\n7622210697394\n  A1 * 4 ');
    expect(errores).toEqual([]);
    expect(lines).toEqual([
      { code: '7622210833662', quantity: 3 },
      { code: '7622210697394', quantity: 1 },
      { code: 'A1', quantity: 4 },
    ]);
  });

  it('ignora líneas vacías y acepta CRLF', () => {
    expect(parseLineas('A*1\r\n\r\n\r\nB*2\r\n').lines).toHaveLength(2);
  });

  it('texto vacío o nulo: sin líneas ni errores', () => {
    expect(parseLineas('')).toEqual({ lines: [], errores: [] });
    expect(parseLineas(undefined)).toEqual({ lines: [], errores: [] });
  });

  it.each([
    ['A*0', 'cantidad'],
    ['A*-2', 'cantidad'],
    ['A*1.5', 'cantidad'],
    ['A*x', 'cantidad'],
    ['A*', 'cantidad'],
    ['*3', 'código'],
    ['A B*2', 'código'],
    ['A*1*2', '«*»'],
  ])('marca error en «%s»', (texto, fragmento) => {
    const { lines, errores } = parseLineas(texto);
    expect(lines).toEqual([]);
    expect(errores).toHaveLength(1);
    expect(errores[0].motivo).toContain(fragmento);
    expect(errores[0].linea).toBe(1);
  });

  it('numera el error con la línea real del texto (contando las vacías)', () => {
    const { errores } = parseLineas('A*1\n\nB*0');
    expect(errores[0].linea).toBe(3);
  });

  it('un código repetido es error y NO se suma', () => {
    const { lines, errores } = parseLineas('A*2\nB*1\nA*5');
    expect(lines).toEqual([{ code: 'A', quantity: 2 }, { code: 'B', quantity: 1 }]);
    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatchObject({ linea: 3 });
    expect(errores[0].motivo).toContain('línea 1');
  });

  it('avisa si pasa del tope', () => {
    const texto = Array.from({ length: MAX_LINEAS + 1 }, (_, i) => `C${i}*1`).join('\n');
    const { errores } = parseLineas(texto);
    expect(errores.some((e) => e.motivo.includes(String(MAX_LINEAS)))).toBe(true);
  });
});

describe('nuevaClave', () => {
  it('cumple el formato de la API y es distinta cada vez', () => {
    const a = nuevaClave();
    expect(a).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    expect(a).not.toBe(nuevaClave());
    expect(nuevaClave('conf')).toMatch(/^conf-/);
  });
});

describe('interpretar', () => {
  it('201 creado: documento y líneas', () => {
    const r = interpretar(201, {
      status: 'created', document: { id: 3107, code: 'TKCE0003107' },
      accepted: [{ line: 1, code: 'A', quantity: 3 }],
      rejected: [{ line: 2, code: 'B', quantity: 1, reason: 'no existe' }],
    });
    expect(r.tipo).toBe('creado');
    expect(r.documento.id).toBe(3107);
    expect(r.aceptadas).toHaveLength(1);
    expect(r.rechazadas[0].reason).toBe('no existe');
  });

  it('422 rejected: nada se envió', () => {
    const r = interpretar(422, { status: 'rejected', accepted: [], rejected: [{ line: 1, code: 'A', quantity: 1, reason: 'x' }], error: 'Clasificación no válida' });
    expect(r.tipo).toBe('rechazado');
    expect(r.mensaje).toBe('Clasificación no válida');
  });

  it('failed: TKC no lo aceptó, con su motivo', () => {
    expect(interpretar(502, { status: 'failed', error: 'TKC no creó el ajuste.' }))
      .toMatchObject({ tipo: 'fallo', mensaje: 'TKC no creó el ajuste.' });
    expect(interpretar(422, { status: 'failed', error: 'TKC rechazó la confirmación.' }).tipo).toBe('fallo');
  });

  it('confirmed', () => {
    expect(interpretar(200, { status: 'confirmed', message: 'Ajuste confirmado', state: 'confirmada', warning: 'revisa' }))
      .toEqual({ tipo: 'confirmado', mensaje: 'Ajuste confirmado', estado: 'confirmada', aviso: 'revisa' });
  });

  it('unverified en cualquiera de sus formas: no repetir', () => {
    expect(interpretar(202, { status: 'unverified' }).tipo).toBe('sin_verificar');
    expect(interpretar(502, { error: { code: 'unverified', message: 'm' } }).tipo).toBe('sin_verificar');
    expect(interpretar(504, { error: { code: 'unverified', message: 'm' } }).tipo).toBe('sin_verificar');
  });

  it('errores de la API o de la pasarela', () => {
    expect(interpretar(403, { error: { code: 'forbidden', message: 'sin permiso' } }))
      .toEqual({ tipo: 'error', codigo: 'forbidden', mensaje: 'sin permiso', status: 403 });
    expect(interpretar(403, { error: { code: 'no_tkc_credentials', message: 'x' } }).codigo).toBe('no_tkc_credentials');
    expect(interpretar(409, { error: { code: 'request_in_progress', message: 'x' } }).tipo).toBe('error');
  });

  it('un fallo limpio de conexión NO es sin_verificar', () => {
    expect(interpretar(502, { error: { code: 'upstream_error', message: 'x' } }).tipo).toBe('error');
  });

  it('cuerpo desconocido o vacío: error genérico', () => {
    expect(interpretar(200, {}).tipo).toBe('error');
    expect(interpretar(500, null).tipo).toBe('error');
  });
});

describe('puedeConfirmar', () => {
  it('solo «editada», sin importar mayúsculas', () => {
    expect(puedeConfirmar('editada')).toBe(true);
    expect(puedeConfirmar(' Editada ')).toBe(true);
    expect(puedeConfirmar('confirmada')).toBe(false);
    expect(puedeConfirmar(undefined)).toBe(false);
  });
});
