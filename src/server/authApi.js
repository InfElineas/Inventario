/**
 * Endpoints de autenticación: /api/auth/*
 *
 * El navegador nunca habla directamente con el Identity Server. Llama aquí, y
 * este servidor guarda el session token y el JWT en cookies httpOnly. Así el
 * token de larga duración no queda al alcance del JavaScript de la página.
 *
 * Middleware al estilo de `tkcApi.js`: (req, res, next).
 */

import { signIn, signOut, isIdentityConfigured } from './identity.js'
import { resolverSesion, sincronizarDesdeIS } from './session.js'
import { fijarCookiesSesion, limpiarCookiesSesion, leerCookies, COOKIE_SESSION } from './cookies.js'

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
function perfilPublico(usuario) {
  return {
    id: usuario.id,
    email: usuario.email,
    full_name: usuario.full_name,
    role: usuario.role,
    almacen_num: usuario.almacen_num ?? '',
    almacenes_config: Array.isArray(usuario.almacenes_config) ? usuario.almacenes_config : [],
    sync_config: usuario.sync_config ?? {},
    anuncio_config: usuario.anuncio_config ?? {},
    nickname: usuario.nickname ?? '',
    avatar_url: usuario.avatar_url ?? '',
    departamento: usuario.departamento ?? null,
  }
}

export function createAuthApiMiddleware() {
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

        const entrada = await signIn(email, password)
        if (!entrada.ok) {
          return responder(res, entrada.status === 403 ? 403 : 401, { error: entrada.error })
        }

        // El rol se consulta al IS y se espeja en usuarios.role.
        const usuario = await sincronizarDesdeIS({
          email: entrada.user?.email ?? email,
          nombre: entrada.user?.name ?? '',
          sessionToken: entrada.sessionToken,
        })

        if (!usuario) {
          return responder(res, 403, {
            error: 'Tu cuenta no tiene un rol válido en Inventario. Pide que te asignen uno.',
          })
        }
        if (!usuario.activo) {
          return responder(res, 403, { error: 'Tu acceso a Inventario está desactivado.' })
        }

        fijarCookiesSesion(res, { sessionToken: entrada.sessionToken, jwt: entrada.jwt })
        return responder(res, 200, { user: perfilPublico(usuario) })
      }

      // ── Sesión actual ────────────────────────────────────────
      // Renueva el JWT por dentro si hacía falta, así que el frontend solo ve
      // "hay sesión" o "no la hay".
      if (ruta === '/api/auth/me' && req.method === 'GET') {
        const sesion = await resolverSesion(req, res)
        if (!sesion) return responder(res, 401, { error: 'Sin sesión' })
        return responder(res, 200, { user: perfilPublico(sesion.usuario) })
      }

      // ── Logout ───────────────────────────────────────────────
      if (ruta === '/api/auth/logout' && req.method === 'POST') {
        const sessionToken = leerCookies(req)[COOKIE_SESSION]
        await signOut(sessionToken)      // best-effort contra el IS
        limpiarCookiesSesion(res)        // las cookies se borran siempre
        return responder(res, 200, { ok: true })
      }

      return responder(res, 404, { error: 'No encontrado' })
    } catch (error) {
      console.error('[auth-api] error:', error)
      return responder(res, 500, { error: 'Error interno' })
    }
  }
}
