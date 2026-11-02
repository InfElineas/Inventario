import { describe, it, expect } from 'vitest';
import { accionesDeLote, resumenPorVencer, lotesACsv } from '@/lib/lotes';

const lote = (estado, extra = {}) => ({
  estado_fv: estado, producto_codigo: 'SC1', cantidad: 5, ...extra,
});
const claves = (l, permisos) => accionesDeLote(l, permisos).map((a) => a.clave);
const TODO = { puedeGestionar: true, puedeMoverTienda: true };

describe('accionesDeLote', () => {
  it('un crítico se baja de tienda primero, y admite rebaja y corrección', () => {
    expect(claves(lote('critico'), TODO)).toEqual(['bajar', 'ic', 'editar']);
  });

  it('un vencido se baja y se manda a merma', () => {
    expect(claves(lote('vencido'), TODO)).toEqual(['bajar', 'merma', 'editar']);
  });

  it('un por vencer no se baja todavía: se le busca una rebaja', () => {
    expect(claves(lote('por_vencer'), TODO)).toEqual(['ic', 'editar']);
  });

  it('un vigente solo se corrige', () => {
    expect(claves(lote('vigente'), TODO)).toEqual(['editar']);
  });

  it('sin fecha no se baja: no se sabe si toca', () => {
    expect(claves(lote('sin_fecha'), TODO)).toEqual(['merma', 'ic', 'editar']);
  });

  it('sin unidades o sin código no hay nada que bajar', () => {
    expect(claves(lote('critico', { cantidad: 0 }), TODO)).not.toContain('bajar');
    expect(claves(lote('critico', { producto_codigo: '' }), TODO)).not.toContain('bajar');
  });

  it('quien mueve tienda pero no gestiona lotes solo ve bajar', () => {
    expect(claves(lote('critico'), { puedeGestionar: false, puedeMoverTienda: true })).toEqual(['bajar']);
  });

  it('quien gestiona pero no mueve tienda no ve bajar', () => {
    expect(claves(lote('critico'), { puedeGestionar: true, puedeMoverTienda: false })).toEqual(['ic', 'editar']);
  });

  it('sin ningún permiso no hay menú', () => {
    expect(claves(lote('critico'), { puedeGestionar: false, puedeMoverTienda: false })).toEqual([]);
  });
});

describe('resumenPorVencer', () => {
  it('cuenta lotes, unidades y valor, y dice cuándo vence el primero', () => {
    const r = resumenPorVencer([
      lote('por_vencer', { cantidad: 4, precio_costo: 2.5, vigencia_dias: 25, fecha_vencimiento: '2026-11-27' }),
      lote('por_vencer', { cantidad: 6, precio_costo: 1, vigencia_dias: 18, fecha_vencimiento: '2026-11-20' }),
      lote('critico', { cantidad: 99 }),
    ]);
    expect(r).toEqual({ lotes: 2, unidades: 10, valor: 16, primero: { fecha: '2026-11-20', dias: 18 } });
  });

  it('sin lotes por vencer no hay resumen', () => {
    expect(resumenPorVencer([lote('critico')])).toBeNull();
  });
});

describe('lotesACsv', () => {
  const base = {
    almacen_nombre: 'TKC LOT 789', producto_codigo: '0130', producto_nombre: 'Mostaza',
    suministrador: 'Heinz', no_lote: 'L1', temperatura: 'ambient',
    fecha_vencimiento: '2026-11-20', vigencia_dias: 18, estado_fv: 'por_vencer',
    cantidad: 5, precio_costo: 2, nota_revision: '',
  };

  it('una fila por lote, con el valor en riesgo y el estado en castellano', () => {
    const [cab, fila] = lotesACsv([base]).split('\n');
    expect(cab).toContain('Valor en riesgo');
    expect(fila).toBe('TKC LOT 789,0130,Mostaza,Heinz,L1,Ambiente,2026-11-20,18,Por vencer,5,2.00,10.00,');
  });

  it('entrecomilla comas y comillas', () => {
    const [, fila] = lotesACsv([{ ...base, producto_nombre: 'Salsa "X", 500 g' }]).split('\n');
    expect(fila).toContain('"Salsa ""X"", 500 g"');
  });

  it('un texto que Excel tomaría por fórmula lleva apóstrofo; un número negativo no', () => {
    const [, fila] = lotesACsv([{ ...base, producto_nombre: '=HYPERLINK("x")', vigencia_dias: -12 }]).split('\n');
    expect(fila).toContain(`"'=HYPERLINK(""x"")"`);
    expect(fila).toContain(',-12,');
  });

  it('sin lotes queda solo la cabecera', () => {
    expect(lotesACsv([]).split('\n')).toHaveLength(1);
  });
});
