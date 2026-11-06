import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'
import { tkcApiPlugin } from './vite-plugin-tkc.js'
import { SECURITY_HEADERS } from './src/server/securityHeaders.js'
import { RELEASES } from './src/data/releases.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Identifica ESTA compilación. Cada `vite build` saca uno distinto, y el mismo se
// publica en /version.json: una pestaña abierta compara el suyo con el del
// servidor para saber que hay una versión nueva (ver src/lib/version.js).
const BUILD_ID = new Date().toISOString()

/** Publica `/version.json`: la compilación y la última entrada de novedades. */
const versionJson = () => ({
  name: 'version-json',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ build: BUILD_ID, release: RELEASES[0] ?? null }),
    })
  },
})

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  // tkcApiPlugin sirve /api/tkc/inventario en dev y preview: el login de TKC
  // necesita cookies + CSRF, imposible desde el navegador.
  plugins: [
    react(),
    // React Compiler: memoiza automáticamente, así que hace innecesarios los
    // useMemo/useCallback escritos a mano.
    //
    // Va como plugin propio y NO dentro de react({ babel: ... }): esa vía no
    // aplica el compiler y el build sale idéntico sin avisar de nada. Bajo
    // rolldown, Babel lo aporta @rolldown/plugin-babel, y reactCompilerPreset
    // es el helper que expone @vitejs/plugin-react 6 ya con el filtro puesto.
    //
    // El compiler solo transforma lo que puede probar que respeta las Rules of
    // React; el resto lo deja intacto en vez de romperlo. Por eso los hooks
    // condicionales de src/pages/AdminUsuarios.jsx no rompen el build: ese
    // componente se queda sin optimizar (los denuncia `bun run lint`).
    babel({ presets: [reactCompilerPreset()] }),
    // Tailwind 4 va como plugin de Vite en vez de por PostCSS: postcss.config.js
    // y autoprefixer sobran (v4 prefija con lightningcss).
    tailwindcss(),
    tkcApiPlugin(),
    versionJson(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Mismas cabeceras que en producción (server/index.js), en dev y en preview.
  server: { headers: SECURITY_HEADERS },
  preview: { headers: SECURITY_HEADERS },
  test: {
    globals:      true,
    environment:  'jsdom',
    setupFiles:   './src/test/setup.js',
    css:          false,
    // Las pruebas de formularios teclean con `userEvent`, que mete esperas
    // reales entre pulsaciones, y además montan diálogos de Radix. Con la
    // suite en paralelo eso pasa de los 5 s por defecto en una máquina
    // cargada: fallaban al azar y siempre pasaban al repetirlas solas. Un
    // rojo intermitente es peor que uno lento, porque enseña a ignorarlos.
    testTimeout: 20_000,
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});