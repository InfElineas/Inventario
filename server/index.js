/**
 * Servidor de producción: sirve el build estático de `dist/` y monta la misma
 * API de TKC que usa el middleware de Vite en dev/preview
 * (`src/server/tkcApi.js`), sin duplicar lógica.
 *
 * Hace falta porque `vite-plugin-tkc.js` solo funciona dentro del propio
 * proceso de Vite (`vite dev` / `vite preview`): un build publicado como
 * archivos estáticos (Base44, Netlify, nginx…) no ejecuta ese middleware, y
 * sin él `/api/tkc/*` respondería 404 — el catálogo TKC, el popover de
 * existencia y sus columnas dejarían de funcionar en producción.
 *
 * Uso:
 *   npm run build
 *   npm start          # = node server/index.js
 *
 * Variables de entorno: las mismas que en dev (ver `.env.example` / README) —
 * TKC_BASE, TKC_USER, TKC_PASS, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, y
 * opcionalmente PORT (por defecto 3000). Si hay un `.env` junto al proyecto se
 * carga, pero las variables ya presentes en el entorno del proceso ganan.
 */

import { createServer } from 'node:http'
import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnvFile } from './env.js'
import { createTkcApiMiddleware } from '../src/server/tkcApi.js'
import { createAuthApiMiddleware } from '../src/server/authApi.js'
import { createDatosApiMiddleware } from '../src/server/datosApi.js'
import { isIdentityConfigured } from '../src/server/identity.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.join(__dirname, '..')
const DIST_DIR = path.join(ROOT_DIR, 'dist')

loadEnvFile(path.join(ROOT_DIR, '.env'))

const PORT = Number(process.env.PORT) || 3000

const tkc = {
  tkcBase: (process.env.TKC_BASE ?? '').replace(/\/+$/, ''),
  tkcUser: process.env.TKC_USER ?? '',
  tkcPass: process.env.TKC_PASS ?? '',
}

if (!tkc.tkcBase || !tkc.tkcUser || !tkc.tkcPass) {
  console.warn('[tkc-api] Falta TKC_BASE/TKC_USER/TKC_PASS: /api/tkc/* responderá 503.')
}

if (!isIdentityConfigured()) {
  console.warn('[auth-api] Falta AUTH_API_URL: /api/auth/* responderá 503.')
}
if (!process.env.DATABASE_URL) {
  console.warn('[db] Falta DATABASE_URL: las rutas que tocan la base fallarán.')
}

const tkcMiddleware = createTkcApiMiddleware({ tkc })
const authMiddleware = createAuthApiMiddleware()
const datosMiddleware = createDatosApiMiddleware()

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

/**
 * Sirve `dist/`. SPA: cualquier ruta que no sea un archivo real (las rutas de
 * react-router, como `/productos`) cae en `index.html`, igual que hace
 * `vite preview`.
 */
async function serveStatic(req, res) {
  if (!existsSync(DIST_DIR)) {
    res.statusCode = 500
    res.end('Falta dist/. Corre `npm run build` antes de iniciar el servidor.')
    return
  }

  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
  // Evita escapar de dist/ con "../../etc/passwd" antes de unir la ruta.
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '')
  let filePath = path.join(DIST_DIR, safePath)

  const isFile = existsSync(filePath) && statSync(filePath).isFile()
  if (!isFile) filePath = path.join(DIST_DIR, 'index.html')

  const content = await readFile(filePath)
  const ext = path.extname(filePath)

  res.statusCode = 200
  res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream')
  // index.html cambia con cada build; los assets de Vite llevan hash en el
  // nombre, así que cachearlos "para siempre" no sirve contenido viejo bajo
  // una URL vieja.
  res.setHeader(
    'Cache-Control',
    filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
  )
  res.end(content)
}

const server = createServer((req, res) => {
  // Cadena: /api/auth/* → /api/tkc/* → estáticos de dist/.
  authMiddleware(req, res, () =>
    datosMiddleware(req, res, () =>
      tkcMiddleware(req, res, () => serveStatic(req, res)),
    ),
  ).catch((error) => {
    console.error('[server] error inesperado:', error)
    if (!res.headersSent) res.statusCode = 500
    res.end('Error interno')
  })
})

server.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`)
})
