import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AvisosPendientes from '@/components/shared/AvisosPendientes';
import BotonAccion from '@/components/shared/BotonAccion';
import { Plus } from 'lucide-react';

/**
 * Lo que el panel enseña ahora: tareas con a dónde ir, no cifras sueltas.
 */

const AVISO = (extra = {}) => ({
  clave: 'devueltos', cantidad: 3, color: '#e24b4a', Icono: Plus,
  texto: 'casos te los devolvieron', accion: 'Corregir y volver a enviar',
  enlace: '/inventario', ...extra,
});

const pintar = (avisos) => render(
  <MemoryRouter><AvisosPendientes avisos={avisos} /></MemoryRouter>,
);

describe('AvisosPendientes', () => {
  it('cada aviso lleva a donde se resuelve', () => {
    // Leer el número y no poder ir es media función.
    pintar([AVISO()]);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/inventario');
    expect(screen.getByText('Corregir y volver a enviar')).toBeTruthy();
  });

  it('lo que está en cero no se pinta', () => {
    // Una lista de «0 pendientes» repetida cinco veces esconde al único que
    // sí tiene algo.
    pintar([AVISO({ cantidad: 0 }), AVISO({ clave: 'otro', cantidad: 2 })]);
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('sin nada pendiente lo dice, no deja un hueco', () => {
    pintar([AVISO({ cantidad: 0 })]);
    expect(screen.getByText('No tienes nada pendiente ahora mismo.')).toBeTruthy();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('aguanta un aviso a medias sin reventar el panel', () => {
    pintar([null, undefined, AVISO()]);
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
});

describe('BotonAccion', () => {
  it('sin su texto a la vista, sigue diciendo qué hace', () => {
    // En el móvil queda solo el icono: la etiqueta tiene que llegar igual a
    // quien usa lector de pantalla.
    render(<BotonAccion icono={Plus}>Registrar merma</BotonAccion>);
    const boton = screen.getByRole('button', { name: 'Registrar merma' });
    expect(boton.getAttribute('title')).toBe('Registrar merma');
  });

  it('el texto se oculta por CSS, no se borra', () => {
    // Si se quitara del DOM, el lector de pantalla tampoco lo leería.
    render(<BotonAccion icono={Plus}>Exportar</BotonAccion>);
    const texto = screen.getByText('Exportar');
    expect(texto.className).toContain('hidden');
    expect(texto.className).toContain('sm:inline');
  });
});
