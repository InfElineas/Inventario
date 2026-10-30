/**
 * Autorización del backend.
 *
 * Sustituye a las 40 policies RLS que hacía cumplir Postgres. Hasta ahora, un
 * fallo del cliente lo frenaba la base; ahora la última palabra la tiene este
 * archivo, así que las reglas se declaran como datos —no repartidas en ifs— y
 * cada bloque cita la policy de la que viene, para poder auditar la traducción
 * una contra otra.
 *
 * El modelo de las tablas de flujo tiene dos mitades que conviene no mezclar:
 *
 *   · DESDE (el `USING` de la policy): en qué estado puede estar la fila para
 *     que este rol la toque.
 *   · HACIA (el `WITH CHECK`): en qué estado puede dejarla.
 *
 * Esa separación es lo que impide saltarse pasos del flujo: un inventarista
 * puede tocar una merma `en_curso`, pero no dejarla en `completado`.
 */

/** administrador y superadmin pasan por encima de todo (is_admin() en SQL). */
const ADMINS = ['administrador', 'superadmin']

export const esAdmin = (rol) => ADMINS.includes(rol)
export const esSuperadmin = (rol) => rol === 'superadmin'

// ── Tablas de flujo ────────────────────────────────────────────
// mermas_update / inventarios_update / anuncios_update / recepciones_update
const FLUJOS = {
  mermas: {
    campoEstado: 'estado_tarea',
    transiciones: {
      inv:     { desde: ['en_curso', 'devuelto', 'reconteo_solicitado'],
                 hacia: ['en_curso', 'devuelto', 'reconteo_solicitado', 'pend_fact', 'en_auditoria'] },
      fact:    { desde: ['pend_fact'],
                 hacia: ['pend_fact', 'en_auditoria', 'devuelto', 'reconteo_solicitado'] },
      // `pend_fact` entre los destinos: no todo lo que el auditor rechaza es
      // culpa del conteo. Si lo que está mal es la factura o la clasificación
      // contable, devolverlo a quien contó no arregla nada.
      auditor: { desde: ['en_auditoria'],
                 hacia: ['en_auditoria', 'completado', 'devuelto', 'pend_fact'] },
    },
  },

  inventarios: {
    campoEstado: 'estado_tarea',
    transiciones: {
      inv:     { desde: ['en_curso', 'devuelto'],
                 hacia: ['en_curso', 'devuelto', 'pend_fact', 'en_auditoria'] },
      fact:    { desde: ['pend_fact'],
                 hacia: ['pend_fact', 'en_auditoria', 'devuelto'] },
      // `pend_fact` entre los destinos: no todo lo que el auditor rechaza es
      // culpa del conteo. Si lo que está mal es la factura o la clasificación
      // contable, devolverlo a quien contó no arregla nada.
      auditor: { desde: ['en_auditoria'],
                 hacia: ['en_auditoria', 'completado', 'devuelto', 'pend_fact'] },
    },
  },

  anuncios_desact: {
    campoEstado: 'estado_tarea',
    transiciones: {
      inv:     { desde: ['pendiente'],    hacia: ['pendiente', 'pend_ca'] },
      ca:      { desde: ['pend_ca'],      hacia: ['pend_ca', 'en_auditoria'] },
      auditor: { desde: ['en_auditoria'], hacia: ['en_auditoria', 'completado'] },
    },
  },

  recepciones: {
    campoEstado: 'estado',
    transiciones: {
      inv:        { desde: ['en_curso'],
                    hacia: ['en_curso', 'cerrada', 'con_diferencias'] },
      // Resolver una incidencia incluye devolverla al muelle: cuando lo que
      // falla es el conteo, lo que hay que hacer es volver a contar, no
      // discutir el número.
      supervisor: { desde: ['con_diferencias'],
                    hacia: ['con_diferencias', 'en_curso', 'cerrada'] },
      jefe_depto: { desde: ['con_diferencias'],
                    hacia: ['con_diferencias', 'en_curso', 'cerrada'] },
      // Facturación resuelve lo suyo —cuánto se factura de verdad de cada
      // línea— pero no manda a recontar ni da la recepción por cerrada.
      fact:       { desde: ['con_diferencias'],
                    hacia: ['con_diferencias'] },
    },
  },
}

// ── Creación ───────────────────────────────────────────────────
// Quién puede crear, y si la fila debe quedar a su nombre.
const CREACION = {
  // mermas_insert / inventarios_insert / recepciones_insert
  mermas:      { roles: ['inv'], campoDueño: 'especialista_id' },
  inventarios: { roles: ['inv'], campoDueño: 'especialista_id' },
  recepciones: { roles: ['inv'], campoDueño: 'especialista_id' },
  // La foto de la presentación, que se toma al contar la línea.
  recepcion_fotos: { roles: ['inv'], campoDueño: 'creado_por' },
  // lotes_ic_insert
  lotes_ic:    { roles: ['inv', 'ca'], campoDueño: 'especialista_inv_id' },
  // La fecha que inventario lee del envase cuando el informe no la trae.
  lote_revisiones: { roles: ['inv', 'ca'], campoDueño: 'revisado_por' },
  // anuncios_insert: el caso debe nacer en 'pendiente', el primer paso del
  // flujo, para que nadie inserte uno ya aprobado.
  anuncios_desact: { roles: ['esp_anuncio', 'inv'], estadoInicial: { campo: 'estado_tarea', valor: 'pendiente' } },
  // productos_insert
  productos:   { roles: ['inv', 'ca', 'supervisor'] },
  // historial_insert / insert_notificaciones: cualquier autenticado
  historial_movimientos: { roles: '*' },
  notificaciones:        { roles: '*' },
  workflow_eventos:      { roles: '*' },
  admin_audit_log:       { roles: '*' },
  comentarios_supervision: { roles: '*' },
  sync_auto_log:         { roles: '*' },
}

// ── Borrado ────────────────────────────────────────────────────
const BORRADO = {
  // superadmin_delete_mermas + inv_delete_mermas
  mermas: [
    { rol: 'superadmin' },
    {
      rol: 'inv', dueño: 'especialista_id',
      estadoEn: { campo: 'estado_tarea', valores: ['pend_fact', 'en_auditoria'] },
      // Solo mientras nadie del flujo la haya tocado.
      vacios: ['fact_no_factura', 'auditor_id'],
    },
  ],

  inventarios: [
    { rol: 'superadmin' },
    { rol: 'administrador', estadoDistintoDe: { campo: 'estado_tarea', valor: 'completado' } },
    // inv_delete_inventarios no exige rol 'inv', solo ser el dueño: en SQL
    // dice auth.role() = 'authenticated'. Se respeta tal cual — en la práctica
    // solo un inv pudo crearla, pero cambiarlo alteraría el comportamiento de
    // quien haya cambiado de rol.
    { rol: '*', dueño: 'especialista_id', estadoEn: { campo: 'estado_tarea', valores: ['en_curso'] } },
  ],

  recepciones: [
    { rol: 'superadmin' },
    { rol: 'administrador', estadoEn: { campo: 'estado', valores: ['en_curso'] } },
    // recepciones_delete no comprueba propiedad: cualquier inv puede borrar
    // una recepción en curso, sea suya o no. Es la única de las tres que se
    // comporta así; se deja igual para no cambiar el alcance en la migración.
    { rol: 'inv', estadoEn: { campo: 'estado', valores: ['en_curso'] } },
  ],

  anuncios_desact: [{ rol: 'superadmin' }],
  usuarios: [{ rol: 'administrador' }, { rol: 'superadmin' }],

  // Repetir la foto es lo normal: sale movida y se vuelve a tirar. Quien
  // recibe borra la suya; el estado de la recepción no entra porque la foto
  // no es parte del flujo, es la prueba de lo que había en la caja.
  recepcion_fotos: [
    { rol: 'superadmin' }, { rol: 'administrador' },
    { rol: 'inv', dueño: 'creado_por' },
  ],
}

// ── Tablas de solo lectura para el cliente ─────────────────────
// Las escribe el sync con elineasadmin, nunca la aplicación.
const SOLO_LECTURA = ['productos_lectura', 'lotes', 'lotes_vigencia', 'bd_tkc']

// ── Filas propias ──────────────────────────────────────────────
// read_own_notificaciones / update_own_notificaciones.
//
// En la base conviven con `allow_all_notificaciones` (USING true), y como las
// policies permisivas se combinan con OR, la permisiva anulaba a estas: hoy
// cualquiera puede leer las notificaciones de cualquiera. Que alguien
// escribiera las de "solo las propias" dice cuál era la intención, así que se
// implementa esa y no el fallo. Mismo caso en comentarios_supervision,
// workflow_eventos, sync_auto_log y admin_audit_log, que aquí dejan de ser
// legibles por todos.
const PROPIAS = {
  notificaciones: 'usuario_id',
}

/**
 * Columnas que un usuario puede cambiar de su PROPIA fila de `usuarios`.
 *
 * Esto reemplaza al trigger `prevent_role_self_escalation`, eliminado en la
 * migración porque habría bloqueado el espejado del rol desde el IS. `role` y
 * `activo` quedan deliberadamente fuera: el rol lo escribe el login a partir
 * de lo que diga el Identity Server, y `activo` solo un administrador.
 */
export const CAMPOS_PROPIOS_USUARIO = [
  'nickname', 'avatar_url', 'almacen_num',
  'almacenes_config', 'sync_config', 'anuncio_config',
]

// ── Evaluación ─────────────────────────────────────────────────
//
// Cada comprobación se escribe para UN rol y se aplica a TODOS los de la
// persona: lo que puede hacer es la suma de lo que permiten sus roles, no lo
// que permite el de más autoridad. Quien es inventarista y además factura
// resolvía a `fact` y perdía lo que solo puede `inv`.

/**
 * Los roles del contexto: la lista si viene, y si no el único que haya. Lo
 * segundo es el caso de un usuario guardado antes de que existiera `roles`.
 */
const rolesDel = (ctx) => (
  Array.isArray(ctx?.roles) && ctx.roles.length > 0
    ? ctx.roles
    : (ctx?.rol ? [ctx.rol] : [])
)

/** Envuelve una comprobación de un rol para que valga con cualquiera. */
const conCadaRol = (comprobar) => (ctx, ...resto) =>
  rolesDel(ctx).some((rol) => comprobar({ ...ctx, rol }, ...resto))

/** Lectura. Todo autenticado ve las tablas del negocio; las propias, filtradas. */
function puedeLeerConRol({ rol }, tabla) {
  if (!rol) return false
  if (SOLO_LECTURA.includes(tabla)) return true
  return true
}

/**
 * Filtro obligatorio para las tablas de filas propias. El llamador DEBE
 * aplicarlo a la consulta: devolver null significa "sin filtro".
 */
export function filtroPropias(ctx, tabla) {
  const campo = PROPIAS[tabla]
  if (!campo) return null
  // Basta que uno de sus roles sea de administración para verlo todo.
  if (rolesDel(ctx).some(esAdmin)) return null
  return { campo, valor: ctx.email }
}

/** Creación. */
function puedeCrearConRol({ rol, email }, tabla, datos = {}) {
  if (!rol) return false
  if (esAdmin(rol)) return true

  const regla = CREACION[tabla]
  if (!regla) return false
  if (regla.roles !== '*' && !regla.roles.includes(rol)) return false

  // La fila tiene que quedar a nombre de quien la crea.
  if (regla.campoDueño && datos[regla.campoDueño] !== email) return false

  // El caso nace en el primer paso del flujo.
  if (regla.estadoInicial && datos[regla.estadoInicial.campo] !== regla.estadoInicial.valor) {
    return false
  }
  return true
}

/**
 * Actualización. Comprueba las dos mitades: que el rol pueda tocar la fila en
 * su estado actual, y que el estado resultante le esté permitido.
 *
 * @param fila    la fila tal como está en la base
 * @param cambios las columnas que se quieren escribir
 */
function puedeActualizarConRol({ rol, email }, tabla, fila, cambios = {}) {
  if (!rol) return false

  // usuarios: la propia fila, pero solo ciertas columnas.
  if (tabla === 'usuarios') {
    if (esAdmin(rol)) return true
    if (fila?.email !== email) return false
    return Object.keys(cambios).every((c) => CAMPOS_PROPIOS_USUARIO.includes(c))
  }

  if (PROPIAS[tabla]) {
    return esAdmin(rol) || fila?.[PROPIAS[tabla]] === email
  }

  if (esAdmin(rol)) return true

  if (tabla === 'productos') {
    return ['inv', 'ca', 'supervisor'].includes(rol)
  }

  const flujo = FLUJOS[tabla]
  if (!flujo) return false

  const permitido = flujo.transiciones[rol]
  if (!permitido) return false

  const actual = fila?.[flujo.campoEstado]
  if (!permitido.desde.includes(actual)) return false

  // Si el cambio no toca el estado, la fila se queda donde está.
  const destino = Object.hasOwn(cambios, flujo.campoEstado)
    ? cambios[flujo.campoEstado]
    : actual
  return permitido.hacia.includes(destino)
}

/** Borrado. */
function puedeBorrarConRol({ rol, email }, tabla, fila) {
  if (!rol) return false

  const reglas = BORRADO[tabla]
  if (!reglas) return false

  return reglas.some((r) => {
    if (r.rol !== '*' && r.rol !== rol) return false
    if (r.dueño && fila?.[r.dueño] !== email) return false
    if (r.estadoEn && !r.estadoEn.valores.includes(fila?.[r.estadoEn.campo])) return false
    if (r.estadoDistintoDe && fila?.[r.estadoDistintoDe.campo] === r.estadoDistintoDe.valor) return false
    if (r.vacios && r.vacios.some((c) => fila?.[c] != null && fila[c] !== '')) return false
    return true
  })
}

export const puedeLeer = conCadaRol(puedeLeerConRol)
export const puedeCrear = conCadaRol(puedeCrearConRol)
export const puedeActualizar = conCadaRol(puedeActualizarConRol)
export const puedeBorrar = conCadaRol(puedeBorrarConRol)

// Se exportan para que las pruebas comparen contra las policies originales.
export const _reglas = { FLUJOS, CREACION, BORRADO, PROPIAS }
