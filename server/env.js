/**
 * Carga variables desde un archivo `.env` a `process.env`, sin pisar las que
 * el entorno ya trae (Docker, systemd, PM2…). Misma precedencia que
 * `vite-plugin-tkc.js` en dev: el entorno real siempre gana sobre el archivo.
 *
 * No se usa `dotenv`: es la única pieza que este servidor necesita de un
 * `.env`, y el paquete no es una dependencia del proyecto.
 */

import { readFileSync } from 'node:fs'

/** Quita comillas envolventes si las hay: `KEY="valor"` → `valor`. */
function unquote(value) {
  if (value.length < 2) return value
  const first = value[0]
  const last = value[value.length - 1]
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1)
  }
  return value
}

/** Lee `path` si existe y define en `process.env` solo las claves ausentes. */
export function loadEnvFile(path) {
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return // sin .env no pasa nada: el entorno real puede bastar
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue

    const key = trimmed.slice(0, eq).trim()
    const value = unquote(trimmed.slice(eq + 1).trim())
    if (process.env[key] === undefined) process.env[key] = value
  }
}
