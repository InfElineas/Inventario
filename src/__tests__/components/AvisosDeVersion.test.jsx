import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AvisoActualizacion from '@/components/layout/AvisoActualizacion';
import NovedadesDialog from '@/components/layout/NovedadesDialog';
import Novedades from '@/pages/Novedades';
import { RELEASES } from '@/data/releases';

const REMOTA = {
  build: 'nueva',
  release: { version: 'v2', titulo: 'Algo cambió', cambios: [{ tipo: 'nuevo', texto: 'Una función nueva' }] },
};

function respondeCon(datos) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => datos }));
}

beforeEach(() => { cleanup(); localStorage.clear(); });
afterEach(() => vi.unstubAllGlobals());

describe('AvisoActualizacion', () => {
  it('con una compilación distinta en el servidor, avisa con lo que cambia', async () => {
    respondeCon(REMOTA);
    render(<AvisoActualizacion buildId="vieja" />);
    expect(await screen.findByText('Hay una versión nueva')).toBeInTheDocument();
    expect(screen.getByText('Una función nueva')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actualizar ahora' })).toBeInTheDocument();
  });

  it('con la misma compilación no dice nada', async () => {
    respondeCon({ ...REMOTA, build: 'vieja' });
    render(<AvisoActualizacion buildId="vieja" />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText('Hay una versión nueva')).toBeNull();
  });

  it('en desarrollo no consulta ni avisa', async () => {
    respondeCon(REMOTA);
    render(<AvisoActualizacion buildId="dev" />);
    expect(screen.queryByText('Hay una versión nueva')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('«Más tarde» lo cierra y no insiste con la misma versión', async () => {
    respondeCon(REMOTA);
    const user = userEvent.setup();
    render(<AvisoActualizacion buildId="vieja" />);
    await user.click(await screen.findByRole('button', { name: 'Más tarde' }));
    expect(screen.queryByText('Hay una versión nueva')).toBeNull();
  });

  it('un fallo de red no enseña nada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sin red')));
    render(<AvisoActualizacion buildId="vieja" />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText('Hay una versión nueva')).toBeNull();
  });
});

describe('NovedadesDialog', () => {
  const pintar = (props) => render(<MemoryRouter><NovedadesDialog {...props} /></MemoryRouter>);

  it('sale la primera vez que se ve una entrada y no vuelve tras cerrarla', async () => {
    const user = userEvent.setup();
    pintar({ vista: null });
    expect(await screen.findByText(RELEASES[0].titulo)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(screen.queryByText(RELEASES[0].titulo)).toBeNull();
    expect(localStorage.getItem('eb:release-vista')).toBe(RELEASES[0].version);
  });

  it('si ya vio la última, no sale', () => {
    pintar({ vista: RELEASES[0].version });
    expect(screen.queryByText('Novedades')).toBeNull();
  });
});

describe('Novedades (la sección)', () => {
  it('lista todas las entradas con sus cambios, la última marcada', () => {
    render(<MemoryRouter><Novedades /></MemoryRouter>);
    for (const r of RELEASES) expect(screen.getByText(r.titulo)).toBeInTheDocument();
    expect(screen.getByText('Última')).toBeInTheDocument();
    expect(screen.getAllByText('Nuevo').length).toBeGreaterThan(0);
  });
});
