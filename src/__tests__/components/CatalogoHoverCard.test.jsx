import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import CatalogoHoverCard from '@/components/productos/CatalogoHoverCard';

/**
 * La ficha del producto en el catálogo.
 *
 * Lo que importa aquí no es el aspecto sino qué se le dice al usuario en cada
 * caso: sobre todo cuando NO se puede traer la existencia en vivo, que antes
 * se resolvía no mostrando nada y parecía que la pantalla estaba rota.
 */

const RECT = { top: 100, left: 100, right: 400, height: 40 };

const producto = (extra = {}) => ({
  nombre: 'Colgante de plata S925',
  codigo: '12121265-1',
  idOnline: 'T900',
  suministrador: 'SEL TOUS COLGANTES',
  proveedor: 'ELíneas Electrocuba (789)',
  marca: 'Tous',
  categoriaOnline: 'Joyería',
  unidadMedida: 'u',
  fechaVencimiento: '',
  estadoTienda: 'NO TIENDA',
  estadoAnuncioTkc: 'Activado',
  imagenes: [],
  ef: 7, enAlmacen: 7, enTienda: 0, precio: 35.19,
  ...extra,
});

afterEach(cleanup);

describe('CatalogoHoverCard', () => {
  it('no pinta nada sin producto o sin posición', () => {
    const { container: a } = render(<CatalogoHoverCard producto={null} rect={RECT} />);
    expect(a).toBeEmptyDOMElement();
    const { container: b } = render(<CatalogoHoverCard producto={producto()} rect={null} />);
    expect(b).toBeEmptyDOMElement();
  });

  it('muestra los datos que TKC publica del producto', () => {
    render(<CatalogoHoverCard producto={producto()} rect={RECT} />);

    expect(screen.getByText('Colgante de plata S925')).toBeInTheDocument();
    expect(screen.getByText('12121265-1')).toBeInTheDocument();
    expect(screen.getByText('ELíneas Electrocuba (789)')).toBeInTheDocument();
    expect(screen.getByText('Tous')).toBeInTheDocument();
    // El prefijo "SEL " del suministrador estorba y se recorta.
    expect(screen.getByText('TOUS COLGANTES')).toBeInTheDocument();
    expect(screen.getByText('Activado')).toBeInTheDocument();
  });

  it('sin ID de tienda explica por qué no hay existencia en vivo', () => {
    // Este era el caso que parecía un fallo: el submayor se busca por ID de
    // tienda, así que sin ID no hay nada que consultar. Antes no se decía.
    render(<CatalogoHoverCard producto={producto({ idOnline: '' })} rect={RECT} />);
    expect(screen.getByText(/Sin ID de tienda/i)).toBeInTheDocument();
  });

  it('sin credenciales de TKC lo dice en vez de callar', () => {
    render(<CatalogoHoverCard producto={producto()} rect={RECT} sinAccesoTkc />);
    expect(screen.getByText(/Pon tu cuenta de TKC/i)).toBeInTheDocument();
  });

  it('avisa mientras consulta y si el submayor falla', () => {
    const { rerender } = render(<CatalogoHoverCard producto={producto()} rect={RECT} cargando />);
    expect(screen.getByText(/Consultando el submayor/i)).toBeInTheDocument();

    rerender(<CatalogoHoverCard producto={producto()} rect={RECT} error={new Error('timeout')} />);
    expect(screen.getByText(/no respondió/i)).toBeInTheDocument();
  });

  it('cuando el submayor no tiene el producto, lo dice', () => {
    render(<CatalogoHoverCard producto={producto()} rect={RECT} enVivo={null} />);
    expect(screen.getByText(/no tiene este producto/i)).toBeInTheDocument();
  });

  it('señala cuando el dato en vivo no coincide con nuestra copia', () => {
    // Nuestra copia puede ir hasta 18 h por detrás; que discrepen no es un
    // error, pero el usuario tiene que verlo.
    render(
      <CatalogoHoverCard
        producto={producto({ ef: 7 })}
        rect={RECT}
        enVivo={{ existencia: { fisica: 3, enAlmacen: 3, enTienda: 0 } }}
      />,
    );
    expect(screen.getByText(/no coincide con nuestra copia/i)).toBeInTheDocument();
  });

  it('si coincide, no mete ruido', () => {
    render(
      <CatalogoHoverCard
        producto={producto({ ef: 7 })}
        rect={RECT}
        enVivo={{ existencia: { fisica: 7, enAlmacen: 7, enTienda: 0 } }}
      />,
    );
    expect(screen.queryByText(/no coincide/i)).not.toBeInTheDocument();
  });

  it('con varias fotos el carrusel avanza solo', () => {
    vi.useFakeTimers();
    try {
      render(
        <CatalogoHoverCard
          producto={producto({ imagenes: ['http://x/1.jpg', 'http://x/2.jpg', 'http://x/3.jpg'] })}
          rect={RECT}
        />,
      );
      // La tarjeta va por portal a document.body, no al contenedor del render.
      const tira = () => document.body.querySelector('[style*="translateX"]');
      expect(tira().style.transform).toBe('translateX(-0%)');

      act(() => { vi.advanceTimersByTime(1800); });
      expect(tira().style.transform).not.toBe('translateX(-0%)');
    } finally {
      vi.useRealTimers();
    }
  });

  it('con una sola foto no hay puntos ni temporizador', () => {
    render(<CatalogoHoverCard producto={producto({ imagenes: ['http://x/1.jpg'] })} rect={RECT} />);
    // Una sola foto: ni puntos ni tira desplazable.
    expect(document.body.querySelector('img')).toBeInTheDocument();
    expect(document.body.querySelectorAll('span.rounded-full')).toHaveLength(0);
  });
});
