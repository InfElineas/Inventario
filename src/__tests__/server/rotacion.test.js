import { describe, it, expect } from 'vitest';
import { ventaDiaria, diasSinVender } from '@/server/rotacionApi';

/**
 * Qué ritmo de venta se le atribuye a un producto.
 *
 * De este número sale el mínimo que se propone comprar, así que equivocarlo
 * se paga de las dos maneras: de menos, el producto se agota; de más, se
 * inmoviliza dinero en mercancía parada.
 */

const AHORA = new Date('2026-10-30T12:00:00Z').getTime();
const hace = (dias) => new Date(AHORA - dias * 86400000).toISOString().slice(0, 10);

const FILA = (extra = {}) => ({
  promMayor0: '2.5',
  promUlt1Mes: '0',
  promTodos: '0.01',
  fechaUltimaVenta: hace(3),
  ...extra,
});

describe('ventaDiaria', () => {
  it('usa el promedio de los días en que SÍ se vendió', () => {
    // Un día sin existencia vende cero, y meterlo en el promedio hace parecer
    // que el producto se vende menos de lo que la gente pide.
    const r = ventaDiaria(FILA(), AHORA);
    expect(r.diaria).toBe(2.5);
    expect(r.segun).toBe('promMayor0');
  });

  it('no se deja llevar por los promedios recientes', () => {
    // El último mes puede estar a cero porque no hubo existencia que vender.
    // Eso no significa que el producto no rote.
    const r = ventaDiaria(FILA({ promUlt1Mes: '0', promUlt3Mes: '0' }), AHORA);
    expect(r.diaria).toBe(2.5);
  });

  it('un producto que no se vende nunca no entra', () => {
    expect(ventaDiaria(FILA({ promMayor0: '0' }), AHORA).diaria).toBe(0);
  });

  it('lo que lleva más de noventa días sin venderse deja de contar', () => {
    // `promMayor0` promedia toda la vida del producto: sin este corte, algo
    // que se vendía bien hace dos años seguiría pidiendo reposición con un
    // ritmo que ya no existe.
    const r = ventaDiaria(FILA({ fechaUltimaVenta: hace(400) }), AHORA);
    expect(r.diaria).toBe(0);
    expect(r.paradoHace).toBe(400);
  });

  it('justo en el límite todavía cuenta', () => {
    expect(ventaDiaria(FILA({ fechaUltimaVenta: hace(90) }), AHORA).diaria).toBe(2.5);
    expect(ventaDiaria(FILA({ fechaUltimaVenta: hace(91) }), AHORA).diaria).toBe(0);
  });

  it('sin fecha de última venta se respeta el índice', () => {
    // No consta cuándo fue la última: descartarlo por eso sería castigar un
    // dato que falta, no una falta de rotación.
    expect(ventaDiaria(FILA({ fechaUltimaVenta: null }), AHORA).diaria).toBe(2.5);
  });

  it('una fecha ilegible no tumba el cálculo', () => {
    expect(ventaDiaria(FILA({ fechaUltimaVenta: 'ayer' }), AHORA).diaria).toBe(2.5);
  });
});

describe('diasSinVender', () => {
  it('cuenta los días completos', () => {
    expect(diasSinVender(hace(10), AHORA)).toBe(10);
  });

  it('sin fecha devuelve null, no cero', () => {
    // Cero diría «se vendió hoy», que es lo contrario de «no se sabe».
    expect(diasSinVender(null, AHORA)).toBeNull();
    expect(diasSinVender('', AHORA)).toBeNull();
  });
});
