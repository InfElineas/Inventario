import { describe, it, expect } from 'vitest';
import { condicionesDeHistorial } from '@/lib/historialConteos';

describe('condicionesDeHistorial', () => {
  it('solo la persona, si no hay más filtros', () => {
    expect(condicionesDeHistorial({ persona: 'ana@x.com' })).toEqual({ especialista_id: 'ana@x.com' });
  });

  it('lo vacío y «todos» no se mandan: un filtro puesto sin querer esconde conteos', () => {
    expect(condicionesDeHistorial({ persona: 'a@x.com', almacen: '', estado: 'all', desde: '', hasta: '' }))
      .toEqual({ especialista_id: 'a@x.com' });
  });

  it('almacén, estado y rango de fechas', () => {
    expect(condicionesDeHistorial({
      persona: 'a@x.com', almacen: '789', estado: 'devuelto', desde: '2026-10-01', hasta: '2026-10-31',
    })).toEqual({
      especialista_id: 'a@x.com', almacen_num: '789', estado_tarea: 'devuelto',
      fecha_inv: { gte: '2026-10-01', lte: '2026-10-31' },
    });
  });

  it('un rango abierto por un lado', () => {
    expect(condicionesDeHistorial({ persona: 'a@x.com', hasta: '2026-10-31' }).fecha_inv).toEqual({ lte: '2026-10-31' });
  });
});
