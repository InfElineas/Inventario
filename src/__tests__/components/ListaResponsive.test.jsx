import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ListaResponsive from '@/components/shared/ListaResponsive';

/**
 * El listado que es tabla en el escritorio y fichas en el teléfono.
 *
 * Lo que se prueba es que las dos caras salgan de la MISMA descripción de
 * columnas. En cuanto haya que mantener dos maquetaciones en paralelo, se
 * desincronizan: aparece una columna nueva en la tabla y nadie se acuerda de
 * la ficha.
 */

const TITULOS = {
  producto: { label: 'Producto' },
  cantidad: { label: 'Cantidad', align: 'right' },
  accion: { label: 'Acción', align: 'center' },
};

const FILAS = [
  { id: 'a', producto: 'Champú Dove 370ml', cantidad: 12 },
  { id: 'b', producto: 'Mostaza Heinz', cantidad: 3 },
];

const celda = (f, k, enTabla) => {
  const dentro = k === 'accion' ? <button type="button">Abrir</button> : String(f[k]);
  return enTabla ? <td key={k}>{dentro}</td> : dentro;
};

const pintar = (extra = {}) => render(
  <ListaResponsive
    columnas={['producto', 'cantidad', 'accion']}
    titulos={TITULOS}
    filas={FILAS}
    claveDe={(f) => f.id}
    celda={celda}
    encabezado="producto"
    accion="accion"
    {...extra}
  />,
);

describe('ListaResponsive', () => {
  it('pinta cada fila una vez por cara, con los mismos datos', () => {
    pintar();
    // Dos caras del mismo listado: la tabla y la ficha. Las dos tienen que
    // decir lo mismo, y de ahí que el texto aparezca dos veces.
    expect(screen.getAllByText('Champú Dove 370ml')).toHaveLength(2);
    expect(screen.getAllByText('Mostaza Heinz')).toHaveLength(2);
  });

  it('en la ficha cada dato lleva su etiqueta', () => {
    // En la tabla la etiqueta está en la cabecera; en una ficha apilada, un
    // «12» suelto no dice si son unidades, días o pesos.
    pintar();
    expect(screen.getAllByText('Cantidad').length).toBeGreaterThanOrEqual(2);
  });

  it('el encabezado no se repite entre los datos de la ficha', () => {
    pintar();
    // Si «Producto» saliera también como dato, cada ficha diría el nombre dos
    // veces: una de título y otra debajo.
    const etiquetas = screen.getAllByText('Producto');
    expect(etiquetas).toHaveLength(1); // solo la cabecera de la tabla
  });

  it('pulsar una ficha abre su fila', () => {
    const alPulsar = vi.fn();
    pintar({ alPulsar });
    fireEvent.click(screen.getAllByText('Mostaza Heinz')[0].closest('button'));
    expect(alPulsar).toHaveBeenCalledWith(FILAS[1]);
  });

  it('sin filas lo dice en vez de dejar un hueco', () => {
    render(
      <ListaResponsive columnas={['producto']} titulos={TITULOS} filas={[]}
        claveDe={(f) => f.id} celda={celda} vacio="Ningún lote con estos filtros." />,
    );
    expect(screen.getByText('Ningún lote con estos filtros.')).toBeTruthy();
  });

  it('mientras carga enseña el hueco de las filas, no una rueda', () => {
    // Con una rueda centrada, la pantalla pega un salto cuando entran los
    // datos; con barras del tamaño de las filas, no se mueve nada.
    const { container } = render(
      <ListaResponsive columnas={['producto', 'cantidad']} titulos={TITULOS} filas={[]}
        claveDe={(f) => f.id} celda={celda} cargando />,
    );
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('Sin registros')).toBeNull();
  });
});
