import { describe, it, expect, afterEach } from 'vitest';
import { Suspense, lazy } from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, Link, Outlet, Route, Routes } from 'react-router-dom';
import { EsqueletoRuta } from '@/components/shared/Esqueleto';

/**
 * Navegar a una pantalla cuyo código aún no ha bajado.
 *
 * Por defecto el router envuelve cada navegación en `startTransition`, y React,
 * mientras la pantalla nueva está pendiente, se queda con la vieja sin enseñar
 * nada: parecía que la aplicación no respondía y de pronto cambiaba. Aquí se
 * comprueba la configuración que usa la aplicación —router sin transiciones y
 * un esqueleto DENTRO del armazón—: al pulsar aparece el esqueleto, el menú no
 * se mueve y, cuando llega la pantalla, la sustituye.
 */

function montar(props) {
  let llegar;
  const Lenta = lazy(() => new Promise((resolve) => {
    llegar = () => resolve({ default: () => <h1>Pantalla lenta</h1> });
  }));

  function Armazon() {
    return (
      <div>
        <nav><Link to="/lenta">Ir a la lenta</Link></nav>
        <Suspense fallback={<EsqueletoRuta />}>
          <Outlet />
        </Suspense>
      </div>
    );
  }

  window.history.pushState({}, '', '/');
  render(
    <BrowserRouter {...props}>
      <Routes>
        <Route element={<Armazon />}>
          <Route path="/" element={<h1>Inicio</h1>} />
          <Route path="/lenta" element={<Lenta />} />
        </Route>
      </Routes>
    </BrowserRouter>,
  );
  return { llegar: () => llegar() };
}

afterEach(cleanup);

describe('navegar a una pantalla que aún no ha llegado', () => {
  it('sin transiciones: aparece el esqueleto, el menú se queda y luego entra la pantalla', async () => {
    const { llegar } = montar({ useTransitions: false });
    expect(screen.getByText('Inicio')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Ir a la lenta' }));

    // Se nota que algo pasa: el esqueleto, y el menú sigue en pie.
    expect(await screen.findByRole('status')).toHaveTextContent('Cargando la pantalla');
    expect(screen.getByRole('link', { name: 'Ir a la lenta' })).toBeInTheDocument();
    // React no la desmonta, la oculta mientras espera: no se ve.
    expect(screen.getByText('Inicio')).not.toBeVisible();

    await act(async () => { llegar(); });
    expect(await screen.findByText('Pantalla lenta')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('con las transiciones por defecto no hay esqueleto: se queda la pantalla vieja, que es lo que se veía como congelado', async () => {
    const { llegar } = montar({});
    await userEvent.click(screen.getByRole('link', { name: 'Ir a la lenta' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Inicio')).toBeInTheDocument();

    await act(async () => { llegar(); });
    expect(await screen.findByText('Pantalla lenta')).toBeInTheDocument();
  });
});
