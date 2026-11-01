/**
 * La cabecera de una pantalla de listado, con el mismo orden en todas.
 *
 * Cada pantalla había llegado a su propia disposición: unas metían el
 * buscador entre los filtros, otras el recuento colgando de un `ml-auto` que
 * en el móvil caía donde tocara, y el subtítulo se partía en tres líneas
 * porque compartía fila con un desplegable. De pantalla a pantalla nada
 * estaba en el mismo sitio.
 *
 * El orden es fijo y de arriba abajo:
 *
 *   1. Título
 *   2. Subtítulo, en una sola línea
 *   3. Fila de filtros (almacén, filtros de icono, columnas, la acción)
 *   4. Buscador, a todo lo ancho
 *   5. Recuento, pegado a la derecha
 *   6. El contenido, que lo pone cada pantalla
 *
 * De `sm` para arriba el título y los filtros vuelven a compartir línea,
 * que ahí el ancho sobra y subirlos ahorra una franja de scroll.
 *
 * @param {object} props
 * @param {string} props.titulo
 * @param {string} [props.subtitulo]   Una línea. Si no cabe, se recorta.
 * @param {React.ReactNode} [props.filtros]
 * @param {React.ReactNode} [props.buscador]
 * @param {React.ReactNode} [props.recuento]
 */
export default function CabeceraLista({ titulo, subtitulo, filtros, buscador, recuento }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-medium">{titulo}</h1>
          {subtitulo && (
            // Una línea: el subtítulo explica la pantalla, y partido en tres
            // deja de explicar nada y solo gasta alto.
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitulo}</p>
          )}
        </div>
        {filtros && (
          <div className="flex flex-wrap items-center gap-2">{filtros}</div>
        )}
      </div>

      {buscador}

      {recuento && (
        <div className="flex justify-end text-xs text-muted-foreground">{recuento}</div>
      )}
    </div>
  );
}
