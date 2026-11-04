import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PantallaError, { PANTALLAS_ERROR, clasificarError } from '@/components/shared/PantallaError';

const montar = (props) => render(<MemoryRouter><PantallaError {...props} /></MemoryRouter>);

describe('clasificarError', () => {
  it('sin red, siempre sin conexión', () => {
    expect(clasificarError(new Error('x'), false)).toBe('sinConexion');
  });
  it('un fetch caído o un 5xx es el servidor', () => {
    expect(clasificarError(new TypeError('Failed to fetch'), true)).toBe('servidor');
    expect(clasificarError(new Error('Error 502'), true)).toBe('servidor');
  });
  it('cualquier otro error es un fallo de la pantalla', () => {
    expect(clasificarError(new Error('x is not defined'), true)).toBe('fallo');
  });
});

describe('PantallaError', () => {
  it.each(Object.keys(PANTALLAS_ERROR))('%s tiene su título y su código', (tipo) => {
    montar({ tipo, onReintentar: () => {} });
    expect(screen.getByText(PANTALLAS_ERROR[tipo].titulo)).toBeInTheDocument();
    expect(screen.getByText(PANTALLAS_ERROR[tipo].codigo)).toBeInTheDocument();
  });

  it('404 y 403 llevan al inicio, no reintentan', () => {
    montar({ tipo: 'noEncontrada', onReintentar: () => {} });
    expect(screen.getByRole('link', { name: /volver al inicio/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reintentar/i })).toBeNull();
  });

  it('servidor y sin conexión reintentan', async () => {
    const reintentar = vi.fn();
    montar({ tipo: 'servidor', onReintentar: reintentar });
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(reintentar).toHaveBeenCalledTimes(1);
  });

  it('enseña el detalle técnico si se da', () => {
    montar({ tipo: 'fallo', detalle: 'x is not defined', onReintentar: () => {} });
    expect(screen.getByText('x is not defined')).toBeInTheDocument();
  });
});
