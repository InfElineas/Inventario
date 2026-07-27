import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'
import { tkcApiPlugin } from './vite-plugin-tkc.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // tkcApiPlugin sirve /api/tkc/inventario en dev y preview: el login de TKC
  // necesita cookies + CSRF, imposible desde el navegador.
  plugins: [react(), tkcApiPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy':        'strict-origin-when-cross-origin',
    },
  },
  test: {
    globals:      true,
    environment:  'jsdom',
    setupFiles:   './src/test/setup.js',
    css:          false,
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});