/**
 * Plugin de Vite que expone la API de TKC dentro del propio proceso de Vite,
 * en `dev` y en `preview`:
 *
 *   POST /api/tkc/inventario   — una página del listado.
 *   POST /api/tkc/existencia   — el desglose EF / almacén / tienda de UN producto,
 *                                que solo publica el submayor. Réplica de
 *                                `GET /api/inventory/{idTienda}?almacen=` de ap-api.
 *   POST /api/tkc/existencias  — el mismo desglose para muchos ids de golpe,
 *                                servido desde el mapa por almacén (existencias.js).
 *
 * Existe porque el flujo de TKC **no puede correr en el navegador**: hace login
 * por formulario manejando CSRF y cabeceras Cookie/Set-Cookie (prohibidas para
 * `fetch`), TKC no envía cabeceras CORS para el origen de la app, y las
 * credenciales de servicio no deben acabar en el bundle. Este plugin solo sirve
 * dentro del proceso de Vite (`vite dev` / `vite preview`); para un build
 * publicado como archivos estáticos, `server/index.js` monta exactamente el
 * mismo middleware (`src/server/tkcApi.js`) sobre un `http.Server` de Node, sin
 * duplicar lógica.
 *
 * Los secretos se leen SIN prefijo `VITE_` (`loadEnv(mode, root, '')`), así que
 * Vite nunca los inyecta en el código del cliente.
 */

import { loadEnv } from 'vite'
import { createTkcApiMiddleware, makeTokenVerifier } from './src/server/tkcApi.js'

export function tkcApiPlugin() {
  let middleware = null

  const dispatch = (req, res, next) => middleware(req, res, next)

  return {
    name: 'tkc-api',

    configResolved(resolved) {
      // Prefijo '' → carga TODAS las claves del .env, también las sin VITE_.
      //
      // Ojo con la precedencia: con prefijo '' loadEnv también vuelca process.env
      // encima de lo leído del fichero, así que una variable exportada en el shell
      // GANA sobre .env (es la convención habitual, pero sorprende). Si un TKC_*
      // exportado no coincide con el .env, manda el del shell.
      const env = loadEnv(resolved.mode, resolved.root, '')
      const pick = (name) => env[name] ?? ''

      const tkc = {
        tkcBase: pick('TKC_BASE').replace(/\/+$/, ''),
        tkcUser: pick('TKC_USER'),
        tkcPass: pick('TKC_PASS'),
      }

      const supabaseUrl = pick('VITE_SUPABASE_URL').replace(/\/+$/, '')
      const supabaseKey = pick('VITE_SUPABASE_ANON_KEY')
      const verifyToken = supabaseUrl && supabaseKey
        ? makeTokenVerifier({ supabaseUrl, supabaseKey })
        : null

      middleware = createTkcApiMiddleware({ tkc, verifyToken })
    },

    configureServer(server) {
      server.middlewares.use(dispatch)
    },

    configurePreviewServer(server) {
      server.middlewares.use(dispatch)
    },
  }
}

export default tkcApiPlugin
