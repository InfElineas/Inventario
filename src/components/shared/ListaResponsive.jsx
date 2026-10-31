import { Card } from '@/components/ui/card';
import SortTh from '@/components/shared/SortTh';

/**
 * Una lista que es tabla en el escritorio y fichas en el teléfono.
 *
 * El módulo se usa sobre todo desde el móvil y las tablas se leían
 * desplazando a izquierda y derecha, perdiendo de vista el nombre del
 * producto justo cuando hacía falta para entender la fila. Debajo de `sm`
 * cada fila pasa a ser una ficha: arriba lo que la identifica, debajo los
 * datos con su etiqueta, y la acción al pie.
 *
 * No hay dos maquetaciones que mantener. La página describe sus columnas una
 * vez —qué va de título, qué de dato y qué de acción— y este componente
 * decide cómo pintarlas.
 *
 * @param {object}   props
 * @param {string[]} props.columnas  Claves visibles, en orden.
 * @param {object}   props.titulos   clave → { label, align }
 * @param {object[]} props.filas
 * @param {Function} props.claveDe   fila → clave de React
 * @param {Function} props.celda     (fila, clave) → nodo. Lo que va dentro.
 * @param {string}   [props.encabezado]  Clave que hace de título de la ficha.
 * @param {string}   [props.accion]      Clave que va al pie, sin etiqueta.
 * @param {Function} [props.alPulsar]    fila => void
 * @param {object}   [props.orden]       { sort, onSort } si se puede ordenar.
 * @param {string}   [props.vacio]       Qué decir cuando no hay nada.
 * @param {boolean}  [props.cargando]
 */
export default function ListaResponsive({
  columnas, titulos, filas, claveDe, celda,
  encabezado, accion, alPulsar, orden, vacio = 'Sin registros', cargando = false,
}) {
  const datos = columnas.filter((k) => k !== encabezado && k !== accion);

  if (cargando) return <Esqueleto columnas={columnas} />;

  if (filas.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground"
        style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
        {vacio}
      </Card>
    );
  }

  return (
    <>
      {/* Fichas: solo en pantallas estrechas. */}
      <div className="sm:hidden space-y-2">
        {filas.map((fila) => (
          <button
            key={claveDe(fila)}
            type="button"
            onClick={alPulsar ? () => alPulsar(fila) : undefined}
            // `active:scale-[0.99]`: el único aviso de que la ficha responde
            // al dedo, que en táctil no hay estado de hover.
            className={`w-full text-left rounded-xl border border-border bg-card p-3 transition-transform ${
              alPulsar ? 'active:scale-[0.99]' : 'cursor-default'
            }`}
            style={{ borderRadius: '12px' }}
          >
            {encabezado && <div className="mb-2">{celda(fila, encabezado)}</div>}

            {datos.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {datos.map((k) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {titulos[k]?.label ?? k}
                    </dt>
                    <dd className="text-sm truncate">{celda(fila, k)}</dd>
                  </div>
                ))}
              </dl>
            )}

            {accion && (
              <div className="mt-2 pt-2 border-t border-border flex justify-end"
                onClick={(e) => e.stopPropagation()}>
                {celda(fila, accion)}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Tabla: de `sm` para arriba, donde sí cabe. */}
      <Card className="hidden sm:block overflow-hidden" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                {columnas.map((k) => (orden ? (
                  <SortTh key={k} colKey={k} label={titulos[k]?.label ?? k}
                    align={titulos[k]?.align} sort={orden.sort} onSort={orden.onSort} />
                ) : (
                  <th key={k} className={`p-3 text-xs font-medium text-muted-foreground ${
                    titulos[k]?.align === 'right' ? 'text-right'
                      : titulos[k]?.align === 'center' ? 'text-center' : 'text-left'
                  }`}>{titulos[k]?.label ?? k}</th>
                )))}
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={claveDe(fila)}
                  onClick={alPulsar ? () => alPulsar(fila) : undefined}
                  className={`border-b last:border-0 transition-colors ${
                    alPulsar ? 'hover:bg-accent/50 cursor-pointer' : ''
                  }`}>
                  {columnas.map((k) => celda(fila, k, true))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/**
 * Lo que se ve mientras llega.
 *
 * Barras del tamaño de las filas que van a aparecer, no una rueda girando:
 * así la pantalla no da un salto cuando entran los datos.
 */
function Esqueleto({ columnas }) {
  return (
    <>
      <div className="sm:hidden space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-3 space-y-2"
            style={{ borderRadius: '12px' }}>
            <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-3 w-full rounded bg-muted animate-pulse" />
              <div className="h-3 w-full rounded bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>
      <Card className="hidden sm:block p-4 space-y-3" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-3">
            {columnas.map((k) => <div key={k} className="h-4 flex-1 rounded bg-muted animate-pulse" />)}
          </div>
        ))}
      </Card>
    </>
  );
}
