/**
 * Resolución de la sesión en cada petición, y espejado del rol.
 *
 * El rol vive en el Identity Server, pero se copia a `usuarios.role` en cada
 * login. No es duplicar por gusto: tres puntos del sistema preguntan "¿quiénes
 * tienen el rol X?" para decidir a quién notificar (workflowService,
 * notificationService), y el IS solo sabe responder por el usuario
 * autenticado. Sin el espejo haría falta un endpoint que el IS no expone.
 *
 * Consecuencia: un cambio de rol en el IS surte efecto en el siguiente login.
 * Para que sea inmediato, se revoca la sesión desde el propio IS.
 */

import { resolveRole } from '../lib/roles.js'
import { verifyJwt, refreshJwt, getRoles } from './identity.js'
import { leerCookies, fijarCookiesSesion, COOKIE_SESSION, COOKIE_JWT } from './cookies.js'
import { queryOne } from './db.js'

/**
 * Perfil local del usuario, creado si es su primer acceso.
 *
 * El vínculo entre el IS y la aplicación es el EMAIL: `auth.users` no migró, y
 * `usuarios.id` dejó de ser clave foránea a nada.
 *
 * Reemplaza en código lo que antes hacía el trigger
 * `prevent_role_self_escalation`: el rol solo se escribe aquí, a partir de lo
 * que diga el IS, y nunca desde una petición del usuario.
 */
export async function sincronizarUsuario({ email, nombre, roles }) {
  const rol = resolveRole(roles)

  // Sin rol conocido en este sistema no se crea ni actualiza nada: que el IS
  // haya autenticado no implica acceso a Inventario.
  if (!rol) return null

  return queryOne(
    `INSERT INTO usuarios (email, full_name, role, activo)
          VALUES ($1, $2, $3, true)
     ON CONFLICT (email) DO UPDATE
            SET role = EXCLUDED.role,
                full_name = COALESCE(NULLIF(usuarios.full_name, ''), EXCLUDED.full_name)
      RETURNING id, email, full_name, role, activo, almacen_num,
                almacenes_config, sync_config, anuncio_config, nickname,
                avatar_url, departamento`,
    [email, nombre ?? '', rol],
  )
}

/** Perfil local por email, sin tocar el IS. */
export async function cargarUsuario(email) {
  return queryOne(
    `SELECT id, email, full_name, role, activo, almacen_num,
            almacenes_config, sync_config, anuncio_config, nickname,
            avatar_url, departamento
       FROM usuarios
      WHERE email = $1`,
    [email],
  )
}

/**
 * Resuelve la sesión de una petición.
 *
 * Si el JWT caducó (~15 min) lo renueva con el session token y refresca la
 * cookie, de modo que el usuario no nota el vencimiento.
 *
 * @returns {Promise<null | { email: string, usuario: object, sessionToken: string, jwt: string, sub: string }>}
 *          `jwt` es el vigente (el renovado, si hizo falta) y `sub` el id de la
 *          persona en el IS: lo que necesita quien llama a otro sistema en su
 *          nombre.
 *          null = no autenticado, o autenticado pero sin acceso a esta app.
 */
export async function resolverSesion(req, res) {
  const cookies = leerCookies(req)
  const sessionToken = cookies[COOKIE_SESSION]
  if (!sessionToken) return null

  let jwt = cookies[COOKIE_JWT]
  let payload = await verifyJwt(jwt)

  if (!payload) {
    const nuevo = await refreshJwt(sessionToken)
    if (!nuevo) return null // el session token también murió: hay que entrar de nuevo
    payload = await verifyJwt(nuevo)
    if (!payload) return null
    jwt = nuevo
    if (res) fijarCookiesSesion(res, { jwt: nuevo })
  }

  const email = payload.email
  if (!email) return null

  const usuario = await cargarUsuario(email)
  // `activo` es el interruptor local: permite bloquear a alguien en esta
  // aplicación sin tocar su cuenta del IS.
  if (!usuario || !usuario.activo) return null

  return { email, usuario, sessionToken, jwt, sub: payload.sub }
}

/** Refresca el rol desde el IS. Se usa en el login. */
export async function sincronizarDesdeIS({ email, nombre, sessionToken }) {
  const roles = await getRoles(sessionToken)
  return sincronizarUsuario({ email, nombre, roles })
}
