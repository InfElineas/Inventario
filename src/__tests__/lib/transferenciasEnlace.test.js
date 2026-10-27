import { describe, it, expect } from 'vitest';
import { enlaceTransferencias, MAX_LINEAS_ENLACE } from '@/lib/transferenciasEnlace';

/**
 * El enlace a elineas-transferencia.
 *
 * Lo que se prueba es la traducción, que es donde está el error fácil: su
 * `warehouse` es el id numérico de TKC, no nuestra clave de almacén. Mandar
 * «789» en vez de «351» abriría su herramienta en otro almacén —o en ninguno—
 * y la persona no tendría por qué notarlo antes de ejecutar.
 */

describe('enlaceTransferencias', () => {
  it('traduce nuestra clave de almacén al id de TKC', () => {
    const url = new URL(enlaceTransferencias('up-shop', '789'));
    expect(url.pathname).toBe('/up-shop');
    // 789 es nuestra clave; 351 es como lo llama TKC.
    expect(url.searchParams.get('warehouse')).toBe('351');
  });

  it('bajar de tienda va a su propia ruta', () => {
    expect(new URL(enlaceTransferencias('down-shop', '480')).pathname).toBe('/down-shop');
  });

  it('un almacén que TKC no conoce no da enlace', () => {
    // Mejor nada que un enlace a un almacén equivocado.
    expect(enlaceTransferencias('up-shop', 'inventado')).toBeNull();
    expect(enlaceTransferencias('up-shop', '')).toBeNull();
  });

  it('sin productos no manda texto: la persona los pone allí', () => {
    expect(new URL(enlaceTransferencias('up-shop', '789')).searchParams.get('text')).toBeNull();
  });

  it('los productos van en CODIGO*CANTIDAD, una línea por producto', () => {
    const url = new URL(enlaceTransferencias('up-shop', '789', [
      { codigo: '7501', cantidad: 3 },
      { codigo: '7502' },
    ]));
    // Sin cantidad vale 1, como en su formato.
    expect(url.searchParams.get('text')).toBe('7501*3\n7502*1');
  });

  it('descarta lo que no tiene código y sanea la cantidad', () => {
    const url = new URL(enlaceTransferencias('up-shop', '789', [
      { codigo: '', cantidad: 5 },
      { codigo: '7501', cantidad: 0 },
      { codigo: '7502', cantidad: 2.7 },
      { codigo: '7503', cantidad: -4 },
    ]));
    expect(url.searchParams.get('text')).toBe('7501*1\n7502*2\n7503*1');
  });

  it('corta los lotes grandes: la URL tiene tope', () => {
    // Por encima de esto su canal es postMessage, no el enlace. Cortar es
    // preferible a mandar una URL que el navegador trunque por su cuenta.
    const muchos = Array.from({ length: MAX_LINEAS_ENLACE + 20 }, (_, i) => ({ codigo: `C${i}` }));
    const texto = new URL(enlaceTransferencias('up-shop', '789', muchos)).searchParams.get('text');
    expect(texto.split('\n')).toHaveLength(MAX_LINEAS_ENLACE);
  });
});
