import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MultiSelect from '@/components/shared/MultiSelect';

const OPCIONES = [
  { value: 'A', label: 'Ana SA' },
  { value: 'B', label: 'Beta SL' },
  { value: 'C', label: 'Carla SA' },
];

function Caja({ inicial = [], onCambio }) {
  const [v, setV] = useState(inicial);
  return <MultiSelect value={v} onChange={(n) => { setV(n); onCambio?.(n); }} options={OPCIONES}
    placeholder="Suministrador: todos" etiquetaVarios={(n) => `${n} suministradores`} />;
}

describe('MultiSelect', () => {
  it('sin nada marcado dice «todos»', () => {
    render(<Caja />);
    expect(screen.getByRole('button', { name: 'Suministrador: todos' })).toBeInTheDocument();
  });

  it('marca varias a la vez sin cerrarse', async () => {
    const cambio = vi.fn();
    const user = userEvent.setup();
    render(<Caja onCambio={cambio} />);
    await user.click(screen.getByRole('button', { name: /todos/i }));
    await user.click(screen.getByRole('option', { name: 'Ana SA' }));
    await user.click(screen.getByRole('option', { name: 'Carla SA' }));

    expect(cambio).toHaveBeenLastCalledWith(['A', 'C']);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 suministradores' })).toBeInTheDocument();
  });

  it('con una sola marcada enseña su nombre', () => {
    render(<Caja inicial={['B']} />);
    expect(screen.getByRole('button', { name: 'Beta SL' })).toBeInTheDocument();
  });

  it('volver a pulsar una la desmarca', async () => {
    const cambio = vi.fn();
    const user = userEvent.setup();
    render(<Caja inicial={['A', 'B']} onCambio={cambio} />);
    await user.click(screen.getByRole('button', { name: '2 suministradores' }));
    await user.click(screen.getByRole('option', { name: 'Ana SA' }));
    expect(cambio).toHaveBeenLastCalledWith(['B']);
  });

  it('«Quitar filtro» las desmarca todas', async () => {
    const cambio = vi.fn();
    const user = userEvent.setup();
    render(<Caja inicial={['A', 'B']} onCambio={cambio} />);
    await user.click(screen.getByRole('button', { name: '2 suministradores' }));
    await user.click(screen.getByRole('button', { name: /quitar filtro/i }));
    expect(cambio).toHaveBeenLastCalledWith([]);
  });

  it('el buscador acota las opciones', async () => {
    const user = userEvent.setup();
    render(<Caja />);
    await user.click(screen.getByRole('button', { name: /todos/i }));
    await user.type(screen.getByPlaceholderText('Buscar…'), 'sa');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Ana SA', 'Carla SA']);
  });
});
