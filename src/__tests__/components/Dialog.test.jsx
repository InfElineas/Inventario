import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/**
 * El ancho de los diálogos.
 *
 * Hubo un tope duro `maxWidth: calc(100vw - 2rem)` puesto en `style` para que
 * en el teléfono no se pasaran del ancho de la pantalla. Un estilo en línea
 * gana siempre a una clase, así que tapaba el `max-w-lg`/`max-w-2xl` de cada
 * diálogo y en el escritorio salían todos a pantalla completa.
 *
 * El margen del teléfono lo da `w-[calc(100%-2rem)]` —el 100% es el de la
 * pantalla, porque el diálogo es `fixed`—, y el `max-w-*` manda en cuanto
 * cabe. No hace falta nada más.
 */

const abrir = (props = {}) => render(
  <Dialog open>
    <DialogContent {...props}>
      <DialogTitle>Revisar el lote</DialogTitle>
    </DialogContent>
  </Dialog>,
);

const caja = () => screen.getByRole('dialog');

describe('DialogContent', () => {
  it('no fija el ancho en línea: eso taparía el max-w de cada diálogo', () => {
    abrir();
    expect(caja().style.maxWidth).toBe('');
  });

  it('deja el margen del teléfono con el ancho, no con el tope', () => {
    abrir();
    expect(caja().className).toContain('w-[calc(100%-2rem)]');
  });

  it('respeta el max-w que pide cada diálogo', () => {
    abrir({ className: 'max-w-2xl' });
    const clases = caja().className;
    expect(clases).toContain('max-w-2xl');
    expect(clases).not.toContain('max-w-lg');
  });

  it('sigue aceptando estilos propios', () => {
    abrir({ style: { borderRadius: '20px' } });
    expect(caja().style.borderRadius).toBe('20px');
  });
});
