import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SugerenciasNota from '@/components/shared/SugerenciasNota';

/**
 * Las sugerencias AÑADEN, no sustituyen: en las notas reales la frase suele
 * venir con un detalle detrás («Producto cercano a vencer. Las 18u»), y
 * borrar lo escrito al pulsar una sugerencia sería perder ese detalle.
 */

const OPCIONES = ['Sin explicación', 'Mal conteo de inventario'];

function montar(valor = '') {
  const onElegir = vi.fn();
  render(<SugerenciasNota valor={valor} onElegir={onElegir} opciones={OPCIONES} />);
  return onElegir;
}

describe('SugerenciasNota', () => {
  it('con la nota vacía pone la frase tal cual', async () => {
    const user = userEvent.setup();
    const onElegir = montar('');
    await user.click(screen.getByRole('button', { name: 'Sin explicación' }));
    expect(onElegir).toHaveBeenCalledWith('Sin explicación');
  });

  it('con algo escrito la añade detrás, sin borrarlo', async () => {
    const user = userEvent.setup();
    const onElegir = montar('Las 18u');
    await user.click(screen.getByRole('button', { name: 'Sin explicación' }));
    expect(onElegir).toHaveBeenCalledWith('Las 18u. Sin explicación');
  });

  it('no duplica el punto si la nota ya termina en uno', async () => {
    const user = userEvent.setup();
    const onElegir = montar('Las 18u.');
    await user.click(screen.getByRole('button', { name: 'Sin explicación' }));
    expect(onElegir).toHaveBeenCalledWith('Las 18u. Sin explicación');
  });

  it('una frase ya puesta se marca y no se vuelve a añadir', async () => {
    const user = userEvent.setup();
    const onElegir = montar('Sin explicación');
    const boton = screen.getByRole('button', { name: 'Sin explicación' });
    expect(boton).toBeDisabled();
    await user.click(boton);
    expect(onElegir).not.toHaveBeenCalled();
  });

  it('la detecta aunque esté escrita con otras mayúsculas', () => {
    // Quien la tecleó a mano no tiene por qué haberla escrito igual.
    cleanup();
    montar('sin EXPLICACIÓN y algo más');
    expect(screen.getByRole('button', { name: 'Sin explicación' })).toBeDisabled();
  });
});
