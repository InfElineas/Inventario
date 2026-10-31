import { Button } from '@/components/ui/button';

/**
 * Un botón de acción de cabecera: solo el icono en el móvil.
 *
 * «Registrar merma» con su icono ocupa media fila de un teléfono para decir
 * lo que el icono ya dice. En el escritorio, donde el sitio sobra, la palabra
 * ayuda a no tener que adivinar; por debajo de `sm` se queda el icono solo,
 * cuadrado y del tamaño de un dedo.
 *
 * El texto no se pierde: va en `aria-label` y en el `title`, así que el lector
 * de pantalla sigue leyendo la acción completa.
 *
 * @param {object} props
 * @param {React.ElementType} props.icono
 * @param {string} props.children  La etiqueta. Obligatoria aunque no se vea.
 */
export default function BotonAccion({ icono: Icono, children, className = '', ...resto }) {
  return (
    <Button
      {...resto}
      aria-label={children}
      title={children}
      className={`shrink-0 px-2.5 sm:px-4 ${className}`}
      style={{ borderRadius: '8px', ...(resto.style ?? {}) }}
    >
      {Icono && <Icono className="w-4 h-4 sm:mr-1.5" />}
      <span className="hidden sm:inline">{children}</span>
    </Button>
  );
}
