import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EsqueletoApp, { EsqueletoContenido } from '@/components/shared/Esqueleto';

/**
 * Lo que se ve mientras carga.
 *
 * Sustituye a una rueda centrada en una pantalla en blanco. Lo que tiene que
 * cumplir: anunciarse a quien usa lector de pantalla —si no, la espera es
 * silencio— y dibujar la misma forma que va a aparecer, que es lo que evita
 * el salto cuando entran los datos.
 */

describe('EsqueletoApp', () => {
  it('se anuncia como carga en curso', () => {
    // Una pantalla de barras grises no dice nada por sí misma: sin esto,
    // quien no la ve no se entera de que hay algo pasando.
    render(<EsqueletoApp />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('Cargando la aplicación')).toBeTruthy();
  });

  it('dibuja el armazón entero, no solo el contenido', () => {
    // Aquí todavía no hay nada pintado: si faltara el armazón, al entrar
    // aparecerían de golpe la cabecera, el menú y la barra de abajo.
    const { container } = render(<EsqueletoApp />);
    expect(container.querySelector('header')).toBeTruthy();
    expect(container.querySelector('aside')).toBeTruthy();
    expect(container.querySelector('nav')).toBeTruthy();
  });

  it('la barra de abajo mide lo que la de verdad', () => {
    // Con `h-14` medía 49 px en el móvil —la escala baja la raíz a 14— y la
    // barra saltaba al entrar la aplicación.
    const { container } = render(<EsqueletoApp />);
    expect(container.querySelector('nav').style.height).toBe('56px');
  });
});

describe('EsqueletoContenido', () => {
  it('tiene las franjas de una pantalla de listado', () => {
    const { container } = render(<EsqueletoContenido />);
    // Las barras son el esqueleto; que haya unas cuantas es lo que
    // distingue «la forma de la pantalla» de «una caja vacía».
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(10);
  });

  it('trae fichas para el móvil y tabla para el escritorio', () => {
    // Las dos caras, como el listado de verdad: así la forma coincide se
    // entre por donde se entre.
    const { container } = render(<EsqueletoContenido />);
    expect(container.querySelector('.sm\\:hidden')).toBeTruthy();
    expect(container.querySelector('.hidden.sm\\:block')).toBeTruthy();
  });
});
