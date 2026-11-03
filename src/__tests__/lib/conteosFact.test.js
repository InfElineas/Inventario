import { describe, it, expect } from 'vitest';
import {
  esIntercambio, ultimoPorProducto, anterioresDe, lineasDeConteos, paresDeIntercambio,
  lineasDePares, registroFact, cierreSinAjuste, CLASIF_INTERCAMBIO,
} from '@/lib/conteosFact';

const conteo = (extra = {}) => ({
  id: 'c1', almacen_num: '789', producto_id: 'p1', producto_codigo: '7501',
  producto_nombre: 'Aceite', diferencia: 3, resultado: 'sobrante', fecha_inv: '2026-11-02',
  ...extra,
});

describe('esIntercambio', () => {
  it('por el enlace al otro conteo o por la clasificación', () => {
    expect(esIntercambio(conteo({ intercambio_id: 'c2' }))).toBe(true);
    expect(esIntercambio(conteo({ clasif_ajuste: CLASIF_INTERCAMBIO }))).toBe(true);
    expect(esIntercambio(conteo({ clasif_ajuste: 'Robo' }))).toBe(false);
  });
});

describe('ultimoPorProducto', () => {
  it('solo cuenta el conteo más reciente de cada producto', () => {
    const viejo = conteo({ id: 'v', fecha_inv: '2026-10-30', diferencia: 9 });
    const nuevo = conteo({ id: 'n', fecha_inv: '2026-11-02', diferencia: 3 });
    const otro = conteo({ id: 'o', producto_id: 'p2', producto_codigo: '7502' });
    const { vigentes, anteriores } = ultimoPorProducto([viejo, nuevo, otro]);

    expect(vigentes.map((c) => c.id).sort()).toEqual(['n', 'o']);
    expect(anterioresDe(anteriores, nuevo)).toEqual([viejo]);
    expect(anterioresDe(anteriores, otro)).toEqual([]);
  });

  it('el mismo día, gana el creado después', () => {
    const a = conteo({ id: 'a', created_date: '2026-11-02T08:00:00Z' });
    const b = conteo({ id: 'b', created_date: '2026-11-02T09:00:00Z' });
    expect(ultimoPorProducto([a, b]).vigentes[0].id).toBe('b');
  });

  it('el mismo producto en otro almacén es otro caso', () => {
    const { vigentes } = ultimoPorProducto([conteo(), conteo({ id: 'c2', almacen_num: '593' })]);
    expect(vigentes).toHaveLength(2);
  });
});

describe('lineasDeConteos', () => {
  it('código y cantidad medida, en valor absoluto', () => {
    expect(lineasDeConteos([
      conteo({ producto_codigo: '7501', diferencia: -4 }),
      conteo({ id: 'c2', producto_codigo: '7502', diferencia: 1 }),
    ])).toBe('7501*4\n7502*1');
  });

  it('descarta lo que no tiene código o diferencia', () => {
    expect(lineasDeConteos([
      conteo({ producto_codigo: '', diferencia: 5 }),
      conteo({ id: 'c2', producto_codigo: '7503', diferencia: 0 }),
      conteo({ id: 'c3', producto_codigo: '7504', diferencia: 2 }),
    ])).toBe('7504*2');
  });
});

describe('paresDeIntercambio', () => {
  const falta = conteo({ id: 'f', producto_codigo: 'A', diferencia: -5, intercambio_id: 's', resultado: 'faltante' });
  const sobra = conteo({ id: 's', producto_codigo: 'B', diferencia: 5, intercambio_id: 'f' });

  it('empareja las dos mitades: el origen es el faltante y el destino el sobrante', () => {
    const { pares, sueltos } = paresDeIntercambio([sobra, falta]);
    expect(pares).toHaveLength(1);
    expect(pares[0].origen.id).toBe('f');
    expect(pares[0].destino.id).toBe('s');
    expect(pares[0].cantidad).toBe(5);
    expect(sueltos).toEqual([]);
  });

  it('con cantidades distintas, mueve la menor', () => {
    const { pares } = paresDeIntercambio([{ ...falta, diferencia: -5 }, { ...sobra, diferencia: 3 }]);
    expect(pares[0].cantidad).toBe(3);
  });

  it('una mitad sin su par va aparte y no se propone nada con ella', () => {
    const { pares, sueltos } = paresDeIntercambio([falta]);
    expect(pares).toEqual([]);
    expect(sueltos).toEqual([falta]);
  });

  it('dos faltantes no son un intercambio', () => {
    const otraFalta = conteo({ id: 's', diferencia: -5, intercambio_id: 'f', resultado: 'faltante' });
    const { pares, sueltos } = paresDeIntercambio([falta, otraFalta]);
    expect(pares).toEqual([]);
    expect(sueltos).toHaveLength(2);
  });

  it('el enlace basta en una sola dirección', () => {
    const { pares } = paresDeIntercambio([{ ...falta, intercambio_id: 's' }, { ...sobra, intercambio_id: null }]);
    expect(pares).toHaveLength(1);
  });
});

describe('lineasDePares', () => {
  it('ORIGEN>DESTINO*CANTIDAD', () => {
    const origen = conteo({ producto_codigo: 'A', diferencia: -5 });
    const destino = conteo({ id: 's', producto_codigo: 'B', diferencia: 5 });
    expect(lineasDePares([{ origen, destino, cantidad: 5 }])).toBe('A>B*5');
  });

  it('sin código en alguna de las dos mitades no se genera la línea', () => {
    const origen = conteo({ producto_codigo: '' });
    const destino = conteo({ id: 's', producto_codigo: 'B' });
    expect(lineasDePares([{ origen, destino, cantidad: 5 }])).toBe('');
  });
});

describe('registroFact', () => {
  const user = { email: 'fact@x.com', full_name: 'Fran' };
  const ahora = new Date('2026-11-03T10:00:00Z');

  it('el documento, cómo se resolvió, quién y cuándo, y pasa a auditoría', () => {
    expect(registroFact({ conteo: conteo({ clasif_ajuste: 'Robo' }), documento: 'TKCE123', notas: 'ok', user, ahora })).toEqual({
      fact_no_factura: 'TKCE123', fact_clasif: 'Robo', fact_estado: 'Ajuste de aumento', fact_notas: 'ok',
      fact_especialista_id: 'fact@x.com', fact_especialista_nombre: 'Fran', fact_fecha: '2026-11-03',
      estado_tarea: 'en_auditoria',
    });
  });

  it('un faltante se resuelve como ajuste de disminución, salvo que se diga otra cosa', () => {
    const c = conteo({ resultado: 'faltante', diferencia: -2 });
    expect(registroFact({ conteo: c, documento: 'T', user, ahora }).fact_estado).toBe('Ajuste de disminución');
    expect(registroFact({ conteo: c, documento: 'T', estado: 'Procesamiento', user, ahora }).fact_estado).toBe('Procesamiento');
  });
});

describe('cierreSinAjuste', () => {
  it('cierra el anterior diciendo por cuál se reemplaza, sin perder su nota', () => {
    const r = cierreSinAjuste({
      anterior: conteo({ id: 'v', fact_notas: 'revisar' }), vigente: conteo({ fecha_inv: '2026-11-02' }),
      user: { email: 'f@x.com' }, ahora: new Date('2026-11-03T10:00:00Z'),
    });
    expect(r.estado_tarea).toBe('completado');
    expect(r.fact_estado).toBe('No Procesar x Fact');
    expect(r.fact_notas).toMatch(/2026-11-02.*otra existencia.*revisar/);
  });
});
