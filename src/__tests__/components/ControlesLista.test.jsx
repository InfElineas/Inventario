import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FiltroIcono } from '@/components/shared/ControlesLista';

/**
 * Los filtros de dentro de una pantalla, reducidos a un icono.
 *
 * Quitarles el texto ahorra media fila en un teléfono, pero se paga con dos
 * riesgos: que nadie sepa para qué es el botón, y que un filtro puesto pase
 * desapercibido y la lista parezca incompleta sin explicación. De eso van
 * estas pruebas.
 */

const OPCIONES = [
  { valor: 'all', label: 'Todas las temperaturas' },
  { valor: 'ambient', label: 'Ambiente' },
  { valor: 'chilled', label: 'Frío' },
];

const Icono = (props) => <svg {...props} />;

const pintar = (valor) => render(
  <FiltroIcono icono={Icono} etiqueta="Temperatura" valor={valor}
    porDefecto="all" opciones={OPCIONES} onChange={vi.fn()} />,
);

describe('FiltroIcono', () => {
  it('sin texto, dice para qué es', () => {
    // Es un cuadrado con un dibujo: sin esto, ni el lector de pantalla ni
    // quien deja el dedo encima saben qué filtra.
    pintar('all');
    expect(screen.getByLabelText('Temperatura')).toBeTruthy();
  });

  it('puesto, dice además por qué valor', () => {
    pintar('chilled');
    expect(screen.getByLabelText('Temperatura: Frío')).toBeTruthy();
  });

  it('puesto, se marca en el color de acento', () => {
    // Un filtro activo que no se ve es la forma más rápida de no entender
    // por qué falta algo en la lista.
    const { container } = pintar('chilled');
    expect(container.querySelector('[class*="4ade80"]')).toBeTruthy();
  });

  it('sin filtrar, no se marca', () => {
    const { container } = pintar('all');
    expect(container.querySelector('[class*="4ade80"]')).toBeNull();
  });
});
