/**
 * Cifrado simétrico autenticado (AES-256-GCM) para lo único que este servidor
 * guarda y tiene que volver a leer en claro: las credenciales de TKC de cada
 * usuario.
 *
 * Mismo formato que `secret-box.ts` de elineas-transferencia y de elineas-auth:
 * `v1.<iv>.<tag>.<ciphertext>` en base64url. Importa porque el traspaso a la API
 * de transferencias (`X-Tkc-Credentials`) lo abre el otro lado con la clave
 * compartida.
 *
 * Hay DOS claves, a propósito, para que una comprometida no abra lo de la otra:
 *   · TKC_SECRET_KEY  — la de ESTA app: sella la cookie `tkc` del navegador.
 *   · TKC_HANDOFF_KEY — compartida con elineas-transferencia: sella lo que viaja
 *                       entre los dos servidores.
 *
 * Las claves se leen en cada uso (no al importar): en desarrollo el plugin de
 * Vite vuelca el .env a process.env después de importar los módulos.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITMO = 'aes-256-gcm'
const BYTES_CLAVE = 32
const BYTES_IV = 12
const BYTES_TAG = 16
const VERSION = 'v1'

export class SecretBoxError extends Error {
  constructor(mensaje) {
    super(mensaje)
    this.name = 'SecretBoxError'
  }
}

/** @typedef {'TKC_SECRET_KEY' | 'TKC_HANDOFF_KEY'} NombreClave */

function clave(nombre) {
  const crudo = process.env[nombre]
  if (!crudo) {
    throw new SecretBoxError(
      `Falta ${nombre} en el entorno. Genera una con \`openssl rand -base64 32\`.`,
    )
  }
  // base64 (44 caracteres) o hex (64): lo que produzca openssl.
  const bytes = crudo.length === BYTES_CLAVE * 2 && /^[0-9a-f]+$/i.test(crudo)
    ? Buffer.from(crudo, 'hex')
    : Buffer.from(crudo, 'base64')
  if (bytes.length !== BYTES_CLAVE) {
    throw new SecretBoxError(`${nombre} debe codificar ${BYTES_CLAVE} bytes (base64 o hex).`)
  }
  return bytes
}

/** Sella un texto. El IV es aleatorio en cada llamada: nunca debe reutilizarse. */
export function sellar(texto, nombre = 'TKC_SECRET_KEY') {
  const iv = randomBytes(BYTES_IV)
  const cifrador = createCipheriv(ALGORITMO, clave(nombre), iv)
  const cifrado = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()])
  return [
    VERSION,
    iv.toString('base64url'),
    cifrador.getAuthTag().toString('base64url'),
    cifrado.toString('base64url'),
  ].join('.')
}

/**
 * Abre lo que produjo `sellar`. Lanza si está manipulado, si se selló con otra
 * clave o si el formato no se reconoce; nunca devuelve un resultado dudoso.
 */
export function abrir(sellado, nombre = 'TKC_SECRET_KEY') {
  const partes = String(sellado).split('.')
  const [version, ivTxt, tagTxt, cifTxt] = partes
  if (partes.length !== 4 || version !== VERSION || !ivTxt || !tagTxt || !cifTxt) {
    throw new SecretBoxError('El secreto no tiene un formato reconocible')
  }
  const iv = Buffer.from(ivTxt, 'base64url')
  const tag = Buffer.from(tagTxt, 'base64url')
  if (iv.length !== BYTES_IV || tag.length !== BYTES_TAG) {
    throw new SecretBoxError('El secreto no tiene un formato reconocible')
  }
  const descifrador = createDecipheriv(ALGORITMO, clave(nombre), iv)
  descifrador.setAuthTag(tag)
  try {
    return Buffer.concat([
      descifrador.update(Buffer.from(cifTxt, 'base64url')),
      descifrador.final(),
    ]).toString('utf8')
  } catch {
    // Sin distinguir manipulación de clave distinta: el mensaje no es un oráculo.
    throw new SecretBoxError('No se pudo abrir el secreto: está alterado o sellado con otra clave')
  }
}
