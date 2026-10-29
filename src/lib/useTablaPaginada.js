import { useQuery } from '@tanstack/react-query'
import { base44 } from '@/api/base44Client'

/**
 * Una página de una tabla, filtrada y contada por Postgres.
 *
 * Las pantallas de conteos y mermas traían «las últimas 200 filas» y filtraban
 * en el navegador. Eso tiene dos problemas que no se ven hasta que hay
 * volumen: lo que pasa de 200 deja de existir —sin avisar—, y lo que se
 * enseña filtrado son 200 filas filtradas, no las primeras de todas las que
 * cumplen, así que el total y el número de páginas mienten.
 *
 * Aquí filtra, busca, ordena y cuenta la base, y el navegador recibe solo la
 * página que se está mirando. Es lo mismo que ya hace el catálogo.
 *
 * @param {object} opciones
 * @param {string} opciones.entidad    Nombre en base44Client ('Inventario', 'Merma'…).
 * @param {Array}  opciones.clave      Clave de caché, sin la paginación.
 * @param {object} opciones.condiciones Igualdades y listas (`IN`) para el WHERE.
 * @param {string} [opciones.texto]    Búsqueda libre.
 * @param {string[]} [opciones.campos] Columnas donde buscar ese texto.
 * @param {string} opciones.orden      Columna; con `-` delante, descendente.
 * @param {number} opciones.pagina     Empieza en 1.
 * @param {number} opciones.porPagina
 * @param {boolean} [opciones.activa]
 */
export function useTablaPaginada({
  entidad, clave, condiciones, texto = '', campos = [],
  orden, pagina, porPagina, activa = true,
}) {
  const buscado = texto.trim()
  const offset = (pagina - 1) * porPagina

  const consulta = useQuery({
    queryKey: [...clave, orden, pagina, porPagina, buscado],
    queryFn: async () => {
      // Las dos a la vez: el total no depende de la página y esperarlo
      // después duplicaría el tiempo de carga.
      const [filas, total] = await Promise.all([
        buscado && campos.length
          ? base44.entities[entidad].buscar(buscado, campos, condiciones, orden, porPagina, offset)
          : base44.entities[entidad].filter(condiciones, orden, porPagina, offset),
        base44.entities[entidad].count(
          condiciones,
          buscado && campos.length ? { texto: buscado, campos } : undefined,
        ),
      ])
      return { filas: Array.isArray(filas) ? filas : [], total }
    },
    enabled: activa,
    placeholderData: (previo) => previo,   // paginar sin parpadeo
  })

  const total = consulta.data?.total ?? 0
  return {
    filas: consulta.data?.filas ?? [],
    total,
    paginas: Math.max(1, Math.ceil(total / porPagina)),
    cargando: consulta.isLoading,
    recargando: consulta.isFetching,
  }
}
