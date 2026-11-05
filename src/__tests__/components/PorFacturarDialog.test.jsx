import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PorFacturarDialog from '@/components/dashboard/PorFacturarDialog';

const RESUMEN = { aumento: 2, disminucion: 1, procesamiento: 0, mermas: 3, total: 6, enAuditoria: 0, enCurso: 0 };

function pintar(onClose = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<PorFacturarDialog resumen={RESUMEN} onClose={onClose} />} />
        <Route path="*" element={<p>otra pantalla</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return onClose;
}

describe('PorFacturarDialog', () => {
  it('separa los casos con su cantidad, y dice el total', () => {
    pintar();
    expect(screen.getByText(/6 casos esperan su ajuste/)).toBeInTheDocument();
    expect(screen.getByText('Ajuste de aumento')).toBeInTheDocument();
    expect(screen.getByText('Mermas por facturar')).toBeInTheDocument();
    expect(screen.getByText('Procesamientos (intercambios)')).toBeInTheDocument();
  });

  it('un caso con algo lleva a su pantalla y cierra el diálogo', async () => {
    const onClose = pintar();
    await userEvent.click(screen.getByText('Mermas por facturar'));
    expect(onClose).toHaveBeenCalled();
    expect(await screen.findByText('otra pantalla')).toBeInTheDocument();
  });

  it('un caso en cero no lleva a ningún sitio', async () => {
    const onClose = pintar();
    await userEvent.click(screen.getByText('Procesamientos (intercambios)'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
