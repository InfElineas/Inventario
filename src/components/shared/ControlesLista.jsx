import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WAREHOUSES } from '@/services/tkc/warehouses';
import { filterAlmacenesByConfig } from '@/lib/useAlmacen';

/**
 * Los mandos de una pantalla de listado, iguales en todas.
 *
 * Cada pantalla había resuelto lo mismo a su manera: un desplegable de 208 px
 * para el almacén, otro de 176 para el estado, el buscador aplastado entre
 * los dos. En un teléfono eso es una fila que no cabe, y de pantalla a
 * pantalla ni siquiera estaban en el mismo orden.
 *
 * El criterio: el almacén manda y lleva su nombre escrito; los filtros de
 * dentro de la pantalla son cuadrados con un icono, porque su valor ya se ve
 * en lo que la lista enseña y ocupar media fila para repetirlo es caro.
 * Cuando un filtro está puesto, su cuadrado se marca en verde: así se ve sin
 * abrirlo que hay algo acotando la lista.
 */

/** Alto común de todos los mandos, para que la fila quede a escuadra. */
export const ALTO = 'h-9';

/**
 * El almacén. Es el filtro que manda, así que es el único con texto.
 */
export function SelectorAlmacen({ almacen, setAlmacen, almacenesConfig, className = '' }) {
  const almacenes = WAREHOUSES.filter(
    (w) => filterAlmacenesByConfig([w.key], almacenesConfig).length > 0,
  );
  const valido = almacenes.some((w) => w.key === almacen);

  return (
    <Select value={valido ? almacen : ''} onValueChange={setAlmacen}>
      {/* Lo justo para el nombre más largo. Antes se llevaba 208 px y dejaba
          a los demás filtros fuera de la fila. */}
      <SelectTrigger className={`${ALTO} w-[150px] text-xs ${className}`} style={{ borderRadius: '8px' }}>
        <SelectValue placeholder="Almacén" />
      </SelectTrigger>
      <SelectContent>
        {almacenes.map((w) => <SelectItem key={w.key} value={w.key}>{w.nombre}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/**
 * Un filtro de los de dentro: cuadrado, con su icono y nada más.
 *
 * @param {object} props
 * @param {React.ElementType} props.icono
 * @param {string} props.etiqueta   Para qué es. Va al lector de pantalla y al
 *                                  título, que en táctil nadie ve.
 * @param {string} props.porDefecto Qué valor significa «sin filtrar».
 * @param {{valor: string, label: string}[]} props.opciones
 */
export function FiltroIcono({ icono: Icono, etiqueta, valor, porDefecto, opciones, onChange }) {
  const puesto = valor !== porDefecto;
  const elegida = opciones.find((o) => o.valor === valor);

  return (
    <Select value={valor} onValueChange={onChange}>
      <SelectTrigger
        aria-label={puesto ? `${etiqueta}: ${elegida?.label ?? valor}` : etiqueta}
        title={puesto ? `${etiqueta}: ${elegida?.label ?? valor}` : etiqueta}
        // Cuadrado en pantalla estrecha, con su valor escrito a partir de
        // `lg`. Reducirlo a un icono era la solucion al movil, donde media
        // fila por filtro es cara; en un monitor el sitio sobra y obligar a
        // abrir el desplegable para saber por que esta filtrada la lista es
        // peor interfaz, no mejor.
        //
        // `:last-child` y no `[&>svg]`: el disparador pinta el icono que le
        // damos Y su propia flechita detras, asi que ocultando todos los svg
        // se iba tambien el icono y quedaban cuadrados en blanco. La flecha
        // solo estorba cuando no hay texto.
        className={`${ALTO} w-9 justify-center p-0 [&>svg:last-child]:hidden text-xs
          lg:w-auto lg:justify-between lg:gap-1.5 lg:px-3 lg:[&>svg:last-child]:block ${
          puesto
            ? 'border-[#4ade80]/40 text-[#4ade80] bg-[#4ade80]/10'
            : 'text-muted-foreground'
        }`}
        style={{ borderRadius: '8px' }}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <Icono className="w-4 h-4 shrink-0" />
          <span className="hidden lg:inline truncate max-w-[160px]">
            {elegida?.label ?? etiqueta}
          </span>
        </span>
      </SelectTrigger>
      <SelectContent>
        {opciones.map((o) => <SelectItem key={o.valor} value={o.valor}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
