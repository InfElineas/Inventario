import { describe, it, expect } from 'vitest';
import { parsearHistorial, parsearCabecera } from '@/services/tkc/historial';

/**
 * El historial llega como HTML, no como JSON: es un trozo de modal de TKC.
 * Lo que se prueba aquí es que de esa tabla salgan los números correctos y que
 * una celda vacía no se confunda con un cero — «no hubo salida» y «salieron 0»
 * no son lo mismo cuando se está averiguando por qué bajó una existencia.
 */

const HTML = `
<div class="modal-header">
    <h5 class="modal-title" id="exampleModalLabel">    <img src="/x.png" alt=""> Historial del producto Cerveza Cristal (355 ml)
    <small>ID.: (141473)  </small>
    <small>COD.: (8500001270027)</small>
</h5>
</div>
<div class="modal-body">
<table id="submayorTable">
<thead><tr><th><strong>Fecha</strong></th></tr></thead>
<tbody>
    <tr>
        <td>28/10/2026</td><td>28/10/2026</td><td>Salida - Despacho - 567389</td>
        <td>72</td><td></td><td>6</td><td>66</td><td>ibrahin.mekin</td><td>28/10/2026 09:07:57</td>
    </tr>
    <tr>
        <td>27/10/2026</td><td>27/10/2026</td><td>Entrada - Recepción - 12</td>
        <td>1,050</td><td>24</td><td></td><td>1,074</td><td>ana.perez</td><td>27/10/2026 10:00:00</td>
    </tr>
</tbody>
</table>
</div>`;

describe('parsearHistorial', () => {
  it('saca cada movimiento con sus cifras', () => {
    const filas = parsearHistorial(HTML);
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({
      fecha: '28/10/2026',
      documento: 'Salida - Despacho - 567389',
      saldoInicial: 72,
      salida: 6,
      saldoFinal: 66,
      usuario: 'ibrahin.mekin',
    });
  });

  it('una celda vacía es null, no cero', () => {
    // Un 0 diría que hubo un movimiento de cero unidades, que es otra cosa.
    const [salida, entrada] = parsearHistorial(HTML);
    expect(salida.entrada).toBeNull();
    expect(entrada.salida).toBeNull();
  });

  it('los millares no se pierden', () => {
    // «1,050» leído mal son 1 unidad: el error más caro posible aquí.
    const [, entrada] = parsearHistorial(HTML);
    expect(entrada.saldoInicial).toBe(1050);
    expect(entrada.saldoFinal).toBe(1074);
  });

  it('sin tabla devuelve una lista vacía, no revienta', () => {
    expect(parsearHistorial('<p>Sin datos</p>')).toEqual([]);
    expect(parsearHistorial('')).toEqual([]);
    expect(parsearHistorial(null)).toEqual([]);
  });

  it('una fila con menos celdas de las esperadas se descarta', () => {
    // Mejor perder una fila rara que colocar sus valores en la columna
    // equivocada y enseñar una salida donde hubo una entrada.
    const roto = '<tbody><tr><td>28/10/2026</td><td>algo</td></tr></tbody>';
    expect(parsearHistorial(roto)).toEqual([]);
  });

  it('el título trae el nombre y los dos identificadores', () => {
    const t = parsearCabecera(HTML);
    expect(t).toContain('Cerveza Cristal');
    expect(t).toContain('141473');
    expect(t).toContain('8500001270027');
  });
});
