/**
 * Acceso a datos del navegador.
 *
 * Mantiene la interfaz que ya usaban las páginas (list, filter, count, create,
 * update, delete) y cambia solo por dentro: antes hablaba con Supabase
 * directamente desde el navegador; ahora llama a la API de este mismo servidor,
 * que es quien habla con ELINEAS_BD.
 *
 * El cambio importante no es el transporte, es dónde vive la autorización. Con
 * Supabase, las reglas las hacía cumplir RLS dentro de Postgres y el navegador
 * tenía credenciales para llegar a la base. Ahora el navegador no tiene ninguna:
 * la sesión viaja en cookies httpOnly que el JavaScript de la página no puede
 * leer, y quien decide qué se puede hacer es `src/server/permisos.js`.
 *
 * Por eso aquí no hay comprobaciones de permiso: serían decorativas. Lo que el
 * servidor rechace llega como un error y se muestra.
 */

const BASE = '/api/datos'

/** Entidades que acepta el servidor (ver TABLA en src/server/datosApi.js). */
const ENTIDADES = new Set([
  'Producto', 'AnuncioDesact', 'Merma', 'Lote', 'LoteIC',
  'Inventario', 'Recepcion', 'Notificacion', 'HistorialMovimiento', 'Usuario',
  'WorkflowEvento', 'ComentarioSupervision', 'AdminAuditLog', 'SyncAutoLog',
])

/**
 * Llamada a la API. `credentials: 'include'` es imprescindible: sin él el
 * navegador no manda las cookies de sesión y todo responde 401.
 */
async function pedir(entidad, accion, cuerpo = {}) {
  const res = await fetch(`${BASE}/${entidad}/${accion}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  })

  const datos = await res.json().catch(() => null)

  if (!res.ok) {
    // La sesión caducó o se revocó desde el IS: no tiene sentido seguir
    // mostrando una pantalla con datos a medias.
    if (res.status === 401) {
      window.location.href = '/login'
      throw new Error('Sesión expirada')
    }
    throw new Error(datos?.error ?? `Error ${res.status}`)
  }
  return datos
}

function entidad(nombre) {
  return {
    list: async (orderBy, limit, campos) =>
      (await pedir(nombre, 'list', { orderBy, limit, campos })).data ?? [],

    /**
     * `campos` limita las columnas que devuelve el servidor. Importa más de lo
     * que parece: `productos` tiene 31 columnas y una de ellas (`fotos`) es
     * jsonb. Una pantalla que solo pinta cinco no tiene por qué descargar las
     * otras veintiséis, y son 55.000 filas.
     */
    filter: async (conditions, orderBy, limit, offset, campos) =>
      (await pedir(nombre, 'filter', { conditions, orderBy, limit, offset, campos })).data ?? [],

    /**
     * Valores distintos de una columna, resueltos en la base.
     *
     * Para los desplegables de filtro. La alternativa —descargar la tabla
     * entera y quedarse con los únicos— costaba 56 peticiones por desplegable.
     */
    distinct: async (campo, conditions = {}) =>
      (await pedir(nombre, 'distinct', { campo, conditions })).data ?? [],

    /**
     * Recuento del catálogo por almacén y estado, hecho en la base. Solo
     * Producto. Devuelve unas 140 filas en lugar de las 55.000 del catálogo.
     */
    resumen: async (conditions = {}) =>
      (await pedir(nombre, 'resumen', { conditions })).data ?? [],

    /**
     * Busca texto en varias columnas a la vez (ILIKE con OR), combinado con
     * las condiciones. Lo usa el buscador de productos.
     */
    buscar: async (texto, campos, conditions = {}, orderBy, limit, offset, proyeccion) =>
      (await pedir(nombre, 'filter', {
        conditions, orderBy, limit, offset, campos: proyeccion,
        search: { texto, campos },
      })).data ?? [],

    /**
     * Cuenta sin traerse las filas. Un array se traduce a IN; un escalar, a =.
     * `search` acota igual que en `buscar`: hace falta para paginar una
     * búsqueda, donde el total tiene que ser el de lo encontrado.
     */
    count: async (conditions = {}, search) =>
      (await pedir(nombre, 'count', { conditions, search })).count ?? 0,

    create: async (data) => (await pedir(nombre, 'create', { data })).data,

    /** Inserta varias filas de una vez. Máximo 1000 por llamada. */
    createMany: async (filas) => (await pedir(nombre, 'createMany', { data: filas })).creadas ?? 0,

    update: async (id, data) => (await pedir(nombre, 'update', { id, data })).data,

    delete: async (id) => { await pedir(nombre, 'delete', { id }) },

    /**
     * Marca notificaciones como leídas. El servidor acota el UPDATE a las
     * filas del propio usuario, así que mandar ids ajenos no hace nada.
     */
    marcarLeidas: async (ids) => (await pedir(nombre, 'marcarLeidas', { ids })).actualizadas ?? 0,

    /**
     * Borra las filas que cumplan las condiciones. Solo administración y solo
     * tablas de registro. Las condiciones son obligatorias: sirve para limpiar
     * lo viejo, no para vaciar la tabla.
     */
    purgar: async (conditions) => (await pedir(nombre, 'purgar', { conditions })).borradas ?? 0,
  }
}

/** POST a /api/auth/tkc*: devuelve el perfil actualizado o lanza con el mensaje del servidor. */
async function postTkc(sufijo, cuerpo) {
  const res = await fetch(`/api/auth/tkc${sufijo}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  })
  const datos = await res.json().catch(() => null)
  if (!res.ok) throw new Error(datos?.error ?? `Error ${res.status} con las credenciales de TKC`)
  return datos.user
}

export const base44 = {
  entities: new Proxy({}, {
    get(_, nombre) {
      if (!ENTIDADES.has(nombre)) throw new Error(`Entidad no mapeada: ${nombre}`)
      return entidad(nombre)
    },
  }),

  auth: {
    /**
     * Usuario de la sesión actual, o null.
     *
     * El servidor renueva el JWT por dentro si hacía falta, así que desde aquí
     * solo hay dos respuestas posibles: hay sesión o no la hay.
     */
    me: async () => {
      const res = await fetch('/api/auth/me', { credentials: 'include' })
      if (!res.ok) return null
      const datos = await res.json().catch(() => null)
      return datos?.user ?? null
    },

    /** Guarda las credenciales de TKC (7 días); el servidor las prueba antes. */
    guardarTkc: ({ username, password }) => postTkc('', { username, password }),
    /** Borra las credenciales de TKC guardadas. */
    olvidarTkc: () => postTkc('/olvidar', {}),
    /** Preferencia: olvidarlas al cerrar sesión. */
    olvidarTkcAlSalir: (olvidarAlSalir) => postTkc('/preferencia', { olvidarAlSalir }),

    logout: async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    },

    redirectToLogin: () => { window.location.href = '/login' },
  },
}
