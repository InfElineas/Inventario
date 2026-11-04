import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EsperanFacturacion, Devueltos } from '@/components/dashboard/TarjetasTareas';

afterEach(cleanup);

const pintar = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);
const CERO = { aumento: 0, disminucion: 0, procesamiento: 0, mermas: 0, total: 0, enAuditoria: 0, enCurso: 0 };

describe('EsperanFacturacion', () => {
  it('una fila por pantalla con algo pendiente, con su enlace; lo que está en cero no sale', () => {
    pintar(<EsperanFacturacion resumen={{ ...CERO, aumento: 12, disminucion: 19, mermas: 3 }} />);

    expect(screen.getByRole('link', { name: /Ajuste de aumento/ })).toHaveAttribute('href', '/ajustes/aumento');
    expect(screen.getByRole('link', { name: /Ajuste de disminución/ })).toHaveAttribute('href', '/ajustes/disminucion');
    expect(screen.getByRole('link', { name: /Mermas por facturar/ })).toHaveAttribute('href', '/ajustes/disminucion?tab=mermas');
    expect(screen.getByText('19')).toBeInTheDocument();
    expect(screen.queryByText(/Procesamientos/)).not.toBeInTheDocument();
    expect(screen.queryByText(/En auditoría/)).not.toBeInTheDocument();
  });

  it('sin nada pendiente, lo dice', () => {
    pintar(<EsperanFacturacion resumen={CERO} />);
    expect(screen.getByText('Nada espera a facturación.')).toBeInTheDocument();
  });
});

describe('Devueltos', () => {
  it('cada devuelto con su motivo, y los conteos sin enviar', () => {
    pintar(<Devueltos enCurso={2} devueltos={{
      total: 1,
      filas: [{ id: 'i-1', tipo: 'conteo', nombre: 'Jabón Safeguard', nota: 'Falta contar el pasillo 3', enlace: '/inventario' }],
    }} />);

    expect(screen.getByText('Jabón Safeguard')).toBeInTheDocument();
    expect(screen.getByText('Falta contar el pasillo 3')).toBeInTheDocument();
    expect(screen.getByText('Conteos sin enviar a facturación')).toBeInTheDocument();
  });

  it('dice cuántos más hay', () => {
    const filas = [{ id: 'i-1', tipo: 'conteo', nombre: 'A', nota: '', enlace: '/inventario' }];
    pintar(<Devueltos enCurso={0} devueltos={{ total: 6, filas }} />);
    expect(screen.getByText('y 5 más')).toBeInTheDocument();
  });

  it('sin nada por corregir, lo dice', () => {
    pintar(<Devueltos enCurso={0} devueltos={{ total: 0, filas: [] }} />);
    expect(screen.getByText('No tienes nada por corregir.')).toBeInTheDocument();
  });
});
