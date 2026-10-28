/**
 * Endpoints de autenticación: /api/auth/*
 *
 * El navegador nunca habla directamente con el Identity Server. Llama aquí, y
 * este servidor guarda el session token y el JWT en cookies httpOnly. Así el
 * token de larga duración no queda al alcance del JavaScript de la página.
 *
 * Middleware al estilo de `tkcApi.js`: (req, res, next).
 */

import { createHash, randomBytes } from 'node:crypto'
import {
  signIn, signOut, isIdentityConfigured, ipCliente, urlInicioGoogle, canjearGoogle,
} from './identity.js'
import { queryOne } from './db.js'
import { CAMPOS_PROPIOS_USUARIO } from './permisos.js'
import { resolverSesion, sincronizarDesdeIS } from './session.js'
import { recordarCredenciales, estadoCredenciales, verificarCredenciales } from './credencialesTkc.js'
import {
  fijarCookiesSesion, limpiarCookiesSesion, leerCookies, COOKIE_SESSION,
  COOKIE_GOOGLE, COOKIE_TKC_OLVIDAR, fijarCookieGoogle, limpiarCookieGoogle, limpiarCookieTkc, fijarOlvidarTkcAlSalir,
} from './cookies.js'

const LIMITE_CUERPO = 16 * 1024 // un login no ocupa más; corta cuerpos absurdos

function responder(res, status, cuerpo) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  // Nada de esto debe quedar en caché intermedia.
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(cuerpo))
}

async function leerJson(req) {
  return new Promise((resolve, reject) => {
    let datos = ''
    req.on('data', (trozo) => {
      datos += trozo
      if (datos.length > LIMITE_CUERPO) {
        reject(new Error('Cuerpo demasiado grande'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(datos ? JSON.parse(datos) : {})
      } catch {
        reject(new Error('JSON inválido'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * Lo que se le devuelve al cliente. Deliberadamente NO incluye tokens: viven
 * en cookies httpOnly y el frontend no los necesita.
 */
function perfilPublico(usuario, tkc = {}) {
  return {
    id: usuario.id,
    email: usuario.email,
    full_name: usuario.full_name,
    role: usuario.role,
    // La lista completa: los permisos son la suma de lo que permite cada rol.
    // `role` se queda para lo que tiene que elegir uno (ver src/lib/roles.js).
    roles: Array.isArray(usuario.roles) && usuario.roles.length > 0
      ? usuario.roles
      : (usuario.role ? [usuario.role] : []),
    almacen_num: usuario.almacen_num ?? '',
    almacenes_config: Array.isArray(usuario.almacenes_config) ? usuario.almacenes_config : [],
    sync_config: usuario.sync_config ?? {},
    anuncio_config: usuario.anuncio_config ?? {},
    nickname: usuario.nickname ?? '',
    avatar_url: usuario.avatar_url ?? '',
    departamento: usuario.departamento ?? null,
    // Solo el estado: la contraseña de TKC no sale nunca del servidor.
    tiene_tkc: Boolean(tkc.tiene),
    tkc_expira: tkc.expira ?? null,
    tkc_olvidar_al_salir: Boolean(tkc.olvidarAlSalir),
  }
}

function redirigir(res, destino) {
  res.statusCode = 302
  res.setHeader('Location', destino)
  res.setHeader('Cache-Control', 'no-store')
  res.end()
}

/** Origen público de esta app, sin barra final. Vacío si no está configurado. */
const appUrl = () => (process.env.APP_URL ?? '').replace(/\/+$/, '')

/** Vuelve al login con el código de error que mostrará la pantalla. */
const falloGoogle = (res, codigo) =>
  redirigir(res, `/login?error=${encodeURIComponent(codigo)}`)

/**
 * Valida y crea la sesión a partir de lo que devolvió el IS (contraseña o
 * Google). Devuelve `{ usuario }` o `{ status, codigo, error }` si no hay acceso.
 */
async function abrirSesion(req, res, entrada, emailDeRespaldo = '') {
  const usuario = await sincronizarDesdeIS({
    email: entrada.user?.email ?? emailDeRespaldo,
    nombre: entrada.user?.name ?? '',
    sessionToken: entrada.sessionToken,
  })

  if (!usuario) {
    return { status: 403, codigo: 'NO_ROLES_IN_SYSTEM', error: 'Tu cuenta no tiene un rol válido en Inventario. Pide que te asignen uno.' }
  }
  if (!usuario.activo) {
    return { status: 403, codigo: 'ACCESO_DESACTIVADO', error: 'Tu acceso a Inventario está desactivado.' }
  }

  fijarCookiesSesion(res, { sessionToken: entrada.sessionToken, jwt: entrada.jwt })
  // Las credenciales de TKC del IS solo llegan en esta respuesta: o se guardan
  // ahora o no se vuelven a ver hasta el próximo login. Si el IS no trae
  // ninguna, NO se tocan las que la persona puso a mano (siguen vigentes).
  let tkc = estadoCredenciales(req, usuario.email)
  if (entrada.tkc) {
    const expira = recordarCredenciales(res, entrada.tkc, usuario.email)
    tkc = { ...tkc, tiene: expira !== null, expira }
  }
  return { usuario, tkc }
}

export function createAuthApiMiddleware({ tkcBase = '' } = {}) {
  return async function authApiMiddleware(req, res, next) {
    const ruta = (req.url ?? '/').split('?')[0]
    if (!ruta.startsWith('/api/auth/')) return next()

    if (!isIdentityConfigured()) {
      return responder(res, 503, { error: 'Falta AUTH_API_URL: el servidor de identidad no está configurado.' })
    }

    try {
      // ── Login ────────────────────────────────────────────────
      if (ruta === '/api/auth/login' && req.method === 'POST') {
        const { email, password } = await leerJson(req)
        if (!email || !password) {
          return responder(res, 400, { error: 'Email y contraseña son obligatorios.' })
        }

        const entrada = await signIn(email, password, { ip: ipCliente(req) })
        if (!entrada.ok) {
          return responder(res, entrada.status === 403 ? 403 : 401, { error: entrada.error })
        }

        // El rol se consulta al IS y se espeja en usuarios.role.
        const sesion = await abrirSesion(req, res, entrada, email)
        if (!sesion.usuario) return responder(res, sesion.status, { error: sesion.error })
        return responder(res, 200, { user: perfilPublico(sesion.usuario, sesion.tkc) })
      }

      // ── Login con Google: inicio ─────────────────────────────
      // Es una navegación del navegador (un <a href>), no un fetch: el IS
      // responde con redirects hacia Google.
      if (ruta === '/api/auth/google/start' && req.method === 'GET') {
        if (!appUrl()) return falloGoogle(res, 'APP_URL_NO_CONFIGURADA')

        const verifier = randomBytes(32).toString('base64url') // PKCE
        const state = randomBytes(16).toString('hex')          // anti-CSRF
        fijarCookieGoogle(res, { verifier, state })

        return redirigir(res, urlInicioGoogle({
          redirectTo: `${appUrl()}/api/auth/google/callback`,
          challenge: createHash('sha256').update(verifier).digest('base64url'),
          state,
        }))
      }

      // ── Login con Google: vuelta ─────────────────────────────
      if (ruta === '/api/auth/google/callback' && req.method === 'GET') {
        let flujo = null
        try {
          const crudo = leerCookies(req)[COOKIE_GOOGLE]
          flujo = crudo ? JSON.parse(crudo) : null
        } catch {
          flujo = null
        }
        limpiarCookieGoogle(res) // de un solo uso, pase lo que pase

        const params = new URL(req.url, 'http://local').searchParams
        const error = params.get('error')
        const codigo = params.get('code')

        // El IS devuelve ?error=ACCOUNT_NOT_FOUND | NO_ROLES_IN_SYSTEM | ...
        if (error) return falloGoogle(res, error)
        if (!flujo?.verifier || !codigo || params.get('state') !== flujo.state) {
          return falloGoogle(res, 'STATE_INVALID')
        }

        // Servidor a servidor: aquí viaja el code_verifier, que solo conoce
        // este backend.
        const entrada = await canjearGoogle(codigo, flujo.verifier, { ip: ipCliente(req) })
        if (!entrada.ok) return falloGoogle(res, entrada.code)

        const sesion = await abrirSesion(req, res, entrada)
        if (!sesion.usuario) {
          // Sin cookies de sesión: no se llegaron a fijar.
          return falloGoogle(res, sesion.codigo)
        }
        return redirigir(res, '/')
      }

      // ── Sesión actual ────────────────────────────────────────
      // Renueva el JWT por dentro si hacía falta, así que el frontend solo ve
      // "hay sesión" o "no la hay".
      if (ruta === '/api/auth/me' && req.method === 'GET') {
        const sesion = await resolverSesion(req, res)
        if (!sesion) return responder(res, 401, { error: 'Sin sesión' })
        return responder(res, 200, { user: perfilPublico(sesion.usuario, estadoCredenciales(req, sesion.email)) })
      }

      // ── Credenciales de TKC escritas por la persona ──────────
      // Para quien entró sin ellas (el IS no las tiene enlazadas, o la cookie
      // se perdió). Se prueban contra TKC ANTES de guardarlas: una contraseña
      // mala no debe quedar sellada para fallar luego a mitad de una acción.
      if (ruta === '/api/auth/tkc' && req.method === 'POST') {
        const sesion = await resolverSesion(req, res)
        if (!sesion) return responder(res, 401, { error: 'Sin sesión' })
        if (!tkcBase) return responder(res, 503, { error: 'Falta TKC_BASE: no se pueden comprobar credenciales de TKC.' })

        const { username, password } = await leerJson(req)
        if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
          return responder(res, 400, { error: 'Usuario y contraseña de TKC son obligatorios.' })
        }

        const credenciales = { username: username.trim(), password }
        let aceptadas
        try {
          aceptadas = await verificarCredenciales(tkcBase, credenciales)
        } catch (error) {
          console.error('[auth-api] TKC no respondió al verificar credenciales:', error?.message ?? error)
          return responder(res, 502, { error: 'No se pudo comprobar con TKC. Inténtalo de nuevo.' })
        }
        if (!aceptadas) return responder(res, 401, { error: 'TKC rechazó ese usuario o contraseña.' })

        const expira = recordarCredenciales(res, credenciales, sesion.email)
        if (expira === null) {
          return responder(res, 503, { error: 'No se pudieron guardar las credenciales (falta TKC_SECRET_KEY).' })
        }
        return responder(res, 200, {
          user: perfilPublico(sesion.usuario, {
            tiene: true, expira, olvidarAlSalir: estadoCredenciales(req, sesion.email).olvidarAlSalir,
          }),
        })
      }

      // Olvidar las credenciales guardadas, a petición de la persona.
      if (ruta === '/api/auth/tkc/olvidar' && req.method === 'POST') {
        const sesion = await resolverSesion(req, res)
        if (!sesion) return responder(res, 401, { error: 'Sin sesión' })
        limpiarCookieTkc(res)
        return responder(res, 200, {
          user: perfilPublico(sesion.usuario, {
            olvidarAlSalir: estadoCredenciales(req, sesion.email).olvidarAlSalir,
          }),
        })
      }

      // Preferencia: borrarlas al cerrar sesión (por defecto duran sus 7 días).
      if (ruta === '/api/auth/tkc/preferencia' && req.method === 'POST') {
        const sesion = await resolverSesion(req, res)
        if (!sesion) return responder(res, 401, { error: 'Sin sesión' })
        const { olvidarAlSalir } = await leerJson(req)
        fijarOlvidarTkcAlSalir(res, olvidarAlSalir === true)
        return responder(res, 200, {
          user: perfilPublico(sesion.usuario, {
            ...estadoCredenciales(req, sesion.email), olvidarAlSalir: olvidarAlSalir === true,
          }),
        })
      }

      // ── Preferencias del propio usuario ──────────────────────
      // Endpoint propio en vez del UPDATE genérico: la fila se identifica por
      // la sesión, no por un id que mande el cliente, y solo se aceptan las
      // columnas de preferencias. `role` y `activo` quedan fuera — el rol lo
      // escribe el login a partir de lo que diga el IS.
      if (ruta === '/api/auth/perfil' && req.method === 'POST') {
        const sesion = await resolverSesion(req, res)
        if (!sesion) return responder(res, 401, { error: 'Sin sesión' })

        const cuerpo = await leerJson(req)
        const cambios = {}
        for (const campo of CAMPOS_PROPIOS_USUARIO) {
          if (Object.hasOwn(cuerpo, campo)) cambios[campo] = cuerpo[campo]
        }
        if (Object.keys(cambios).length === 0) {
          return responder(res, 400, { error: 'Nada que guardar' })
        }

        const claves = Object.keys(cambios)
        const asignaciones = claves.map((c, i) => `"${c}" = $${i + 2}`)
        const usuario = await queryOne(
          `UPDATE usuarios SET ${asignaciones.join(', ')} WHERE email = $1 RETURNING *`,
          [sesion.email, ...claves.map((c) => cambios[c])],
        )
        return responder(res, 200, { user: perfilPublico(usuario, estadoCredenciales(req, sesion.email)) })
      }

      // ── Logout ───────────────────────────────────────────────
      if (ruta === '/api/auth/logout' && req.method === 'POST') {
        const cookies = leerCookies(req)
        await signOut(cookies[COOKIE_SESSION]) // best-effort contra el IS
        limpiarCookiesSesion(res)              // las de sesión se borran siempre
        // Las de TKC solo si la persona lo pidió; si no, duran sus 7 días.
        if (cookies[COOKIE_TKC_OLVIDAR] === '1') limpiarCookieTkc(res)
        return responder(res, 200, { ok: true })
      }

      return responder(res, 404, { error: 'No encontrado' })
    } catch (error) {
      console.error('[auth-api] error:', error)
      return responder(res, 500, { error: 'Error interno' })
    }
  }
}
