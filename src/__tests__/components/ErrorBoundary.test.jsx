import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary, { yaSeRecargo } from '@/components/shared/ErrorBoundary';

/**
 * Tras un despliegue, una pestaña abierta pide trozos de JavaScript que ya no
 * existen. Se arregla recargando, y tiene que arreglarse en cada despliegue,
 * no solo en el primero de la sesión.
 */

const CLAVE = 'eb:recarga-por-modulo';
const MODULO = 'Failed to fetch dynamically imported module: /assets/Lotes-X.js';

function Roto({ mensaje }) {
  throw new Error(mensaje);
}

let recargar;

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  recargar = vi.fn();
  vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload: recargar });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('yaSeRecargo', () => {
  it('solo cuenta una recarga reciente: la de hace una hora ya no frena', () => {
    const ahora = 10_000_000;
    expect(yaSeRecargo(ahora)).toBe(false);
    sessionStorage.setItem(CLAVE, String(ahora - 5_000));
    expect(yaSeRecargo(ahora)).toBe(true);
    sessionStorage.setItem(CLAVE, String(ahora - 3_600_000));
    expect(yaSeRecargo(ahora)).toBe(false);
  });
});

describe('ErrorBoundary', () => {
  it('recarga ante un módulo caducado', () => {
    render(<ErrorBoundary><Roto mensaje={MODULO} /></ErrorBoundary>);
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it('un despliegue posterior en la misma sesión vuelve a recargar', () => {
    sessionStorage.setItem(CLAVE, String(Date.now() - 3_600_000));
    render(<ErrorBoundary><Roto mensaje={MODULO} /></ErrorBoundary>);
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it('si ya recargó hace nada y sigue fallando, enseña el error en vez de girar en bucle', () => {
    sessionStorage.setItem(CLAVE, String(Date.now()));
    render(<ErrorBoundary><Roto mensaje={MODULO} /></ErrorBoundary>);
    expect(recargar).not.toHaveBeenCalled();
    expect(screen.getByText(/esta pantalla no se pudo mostrar/i)).toBeInTheDocument();
  });

  it('Reintentar con un módulo caducado carga la versión nueva', async () => {
    sessionStorage.setItem(CLAVE, String(Date.now()));
    render(<ErrorBoundary><Roto mensaje={MODULO} /></ErrorBoundary>);
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it('otros errores no recargan', () => {
    render(<ErrorBoundary><Roto mensaje="x is not defined" /></ErrorBoundary>);
    expect(recargar).not.toHaveBeenCalled();
    expect(screen.getByText(/x is not defined/)).toBeInTheDocument();
  });
});
