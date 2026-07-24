import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
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