import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CabeceraLista from '@/components/shared/CabeceraLista';

/**
 * La cabecera de las pantallas de listado.
 *
 * Su razón de ser es que el orden sea el MISMO en todas: título, subtítulo,
 * filtros, buscador y recuento. Cada pantalla había llegado a su propia
 * disposición y nada estaba dos veces en el mismo sitio.
 */

const pintar = (extra = {}) => render(
  <CabeceraLista
    titulo="Mermas"
    subtitulo="Registro y seguimiento de mermas"
    filtros={<button type="button">Almacén</button>}
    buscador={<input placeholder="Buscar..." />}
    recuento="24 de 186"
    {...extra}
  />,
);

/** En qué orden aparecen en el documento. */
const posicion = (nodo) => {
  const todos = [...nodo.ownerDocument.querySelectorAll('*')];
  return todos.indexOf(nodo);
};

describe('CabeceraLista', () => {
  it('pone cada franja en su orden', () => {
    pintar();
    const titulo = screen.getByRole('heading', { name: 'Mermas' });
    const filtro = screen.getByRole('button', { name: 'Almacén' });
    const buscador = screen.getByPlaceholderText('Buscar...');
    const recuento = screen.getByText('24 de 186');

    expect(posicion(titulo)).toBeLessThan(posicion(filtro));
    expect(posicion(filtro)).toBeLessThan(posicion(buscador));
    expect(posicion(buscador)).toBeLessThan(posicion(recuento));
  });

  it('el subtítulo va en una sola línea', () => {
    // Compartiendo fila con un desplegable se partía en tres y dejaba de
    // explicar nada; solo gastaba alto.
    pintar();
    const sub = screen.getByText('Registro y seguimiento de mermas');
    expect(sub.className).toContain('truncate');
  });

  it('el recuento se pega a la derecha', () => {
    pintar();
    // El recuento es texto suelto: `getByText` devuelve su propia franja.
    expect(screen.getByText('24 de 186').className).toContain('justify-end');
  });

  it('una pantalla sin buscador ni recuento no deja huecos', () => {
    pintar({ buscador: null, recuento: null });
    expect(screen.queryByPlaceholderText('Buscar...')).toBeNull();
    expect(screen.queryByText('24 de 186')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Mermas' })).toBeTruthy();
  });

  it('sin subtítulo tampoco', () => {
    pintar({ subtitulo: undefined });
    expect(screen.queryByText('Registro y seguimiento de mermas')).toBeNull();
  });
});
