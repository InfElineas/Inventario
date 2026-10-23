/**
 * Ajustes de aumento y de disminución contra la API de elineas-transferencia
 * (`/api/v1/adjustments` y `/api/v1/decreases`).
 *
 *   GET  /api/ajustes/{aumentos|disminuciones}              listado
 *   GET  /api/ajustes/{tipo}/:id/lines                       productos del documento
 *   POST /api/ajustes/{tipo}                                 monta el documento («editada»)
 *   POST /api/ajustes/{tipo}/:id/confirm                     lo confirma: MUEVE EXISTENCIA
 *
 * Middleware Connect `(req, res, next)`, como `tkcApi.js`: lo comparten dev
 * (`vite-plugin-tkc.js`) y producción (`server/index.js`).
 *
 * Qué hace de más que reenviar:
 *  · Exige sesión y un rol que facture (ROLES_AJUSTES). El permiso fino
 *    (`increase:*`, `decrease:*`) lo vuelve a comprobar la API: un 403 suyo llega
 *    tal cual.
 *  · Habla con la API como LA PERSONA: su JWT del IS de Bearer y sus credenciales
 *    de TKC selladas en `X-Tkc-Credentials` (ver `docs/integracion.md` de
 *    elineas-transferencia). Así el documento queda en TKC a su nombre, no a
 *    nombre de la cuenta de servicio. Las escrituras SIN credenciales se
 *    rechazan: caer a la cuenta de servicio las firmaría otra persona.
 *  · No es un proxy abierto: lista blanca de rutas, y el cuerpo se reconstruye
 *    campo a campo en vez de reenviarse.
 *  · Traduce la clave de almacén de la app ("789") al id de TKC ("351").
 *  · Pone la `Idempotency-Key` (la manda el cliente, para que un reintento del
 *    mismo envío no duplique el documento).
 */

import { randomUUID } from 'node:crypto'
import { resolverSesion } from './session.js'
import { leerCredenciales } from './credencialesTkc.js'
import { sellar } from './secretBox.js'
import { keyToTkcValue } from '../services/tkc/warehouses.js'
import { ROLES_AJUSTES } from '../lib/ajustes.js'

export { ROLES_AJUSTES }

const TIPOS = {
  aumentos: { ruta: 'adjustments', etiqueta: 'aumento', clasificacionObligatoria: false },
  disminuciones: { ruta: 'decreases', etiqueta: 'disminución', clasificacionObligatoria: true },
}

const MAX_BODY = 512 * 1024
const MAX_LINEAS = 500
/** Montar analiza cada código en TKC: puede tardar. */
const TIMEOUT_ESCRITURA_MS = 180_000
const TIMEOUT_LECTURA_MS = 60_000
const VIDA_TRASPASO_MS = 5 * 60 * 1000
const CLAVE_IDEMPOTENCIA = /^[A-Za-z0-9._:-]{8,128}$/
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/

const baseApi = () => (process.env.TRANSFERENCIAS_API_URL ?? '').replace(/\/+$/, '')

function json(res, status, payload, cabeceras = {}) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  for (const [k, v] of Object.entries(cabeceras)) res.setHeader(k, v)
  res.end(JSON.stringify(payload))
}

const fallo = (res, status, code, message) => json(res, status, { error: { code, message } })

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let crudo = ''
    req.on('data', (trozo) => {
      crudo += trozo
      if (crudo.length > MAX_BODY) reject(new ErrorPeticion(413, 'Cuerpo demasiado grande'))
    })
    req.on('end', () => {
      try {
        resolve(crudo ? JSON.parse(crudo) : {})
      } catch {
        reject(new ErrorPeticion(400, 'El cuerpo no es JSON válido'))
      }
    })
    req.on('error', reject)
  })
}

class ErrorPeticion extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/** Texto libre acotado; cualquier otra cosa es un error del cliente. */
function texto(valor, campo, max) {
  if (valor === undefined || valor === null || valor === '') return undefined
  if (typeof valor !== 'string') throw new ErrorPeticion(400, `\`${campo}\` debe ser texto.`)
  const limpio = valor.trim()
  if (limpio.length > max) throw new ErrorPeticion(400, `\`${campo}\` pasa de ${max} caracteres.`)
  return limpio || undefined
}

function almacenId(clave) {
  const id = keyToTkcValue(clave)
  if (!id) {
    throw new ErrorPeticion(400, `Almacén desconocido: "${clave ?? ''}". No está en el catálogo de TKC.`)
  }
  return id
}

/** `[{code, quantity}]` o error: lo mismo que acepta la API, validado antes de salir. */
function lineas(valor) {
  if (!Array.isArray(valor) || valor.length === 0) {
    throw new ErrorPeticion(400, 'Faltan las líneas (`lines`): al menos un producto.')
  }
  if (valor.length > MAX_LINEAS) {
    throw new ErrorPeticion(400, `Máximo ${MAX_LINEAS} líneas por documento (mandaste ${valor.length}).`)
  }
  return valor.map((l, i) => {
    const code = typeof l?.code === 'string' ? l.code.trim() : ''
    if (!code || /[\s*]/.test(code)) {
      throw new ErrorPeticion(400, `Línea ${i + 1}: el código no puede estar vacío ni llevar espacios o «*».`)
    }
    const quantity = l.quantity === undefined ? 1 : l.quantity
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new ErrorPeticion(400, `Línea ${i + 1}: la cantidad debe ser un entero positivo.`)
    }
    return { code, quantity }
  })
}

function fecha(valor) {
  const f = texto(valor, 'date', 10)
  if (f && !FECHA_ISO.test(f)) throw new ErrorPeticion(400, '`date` es AAAA-MM-DD.')
  return f
}

/** Valor de `X-Tkc-Credentials`: las credenciales atadas a esta persona y con caducidad corta. */
export function traspasoCredenciales(credenciales, sub, ahora = Date.now()) {
  return sellar(
    JSON.stringify({ ...credenciales, sub, exp: ahora + VIDA_TRASPASO_MS }),
    'TKC_HANDOFF_KEY',
  )
}

const CABECERAS_RELEVANTES = ['x-total-count', 'x-next-offset', 'idempotent-replay', 'retry-after']

/**
 * Mapea un error de la API a lo que el navegador debe ver. Un 401 de la API
 * NO se reenvía como 401: para el cliente un 401 es «tu sesión de Inventario
 * murió» y lo mandaría al login, cuando aquí el JWT acaba de validarse.
 */
function estadoPublico(status) {
  return status === 401 ? 502 : status
}

async function llamarApi(ctx, { metodo, ruta, consulta, cuerpo, idempotencia }) {
  const url = new URL(`${baseApi()}/api/v1/${ruta}`)
  for (const [k, v] of Object.entries(consulta ?? {})) {
    if (v !== undefined && v !== '') url.searchParams.set(k, v)
  }
  const cabeceras = { Authorization: `Bearer ${ctx.jwt}`, Accept: 'application/json' }
  if (ctx.credenciales) {
    cabeceras['X-Tkc-Credentials'] = traspasoCredenciales(ctx.credenciales, ctx.sub)
  }
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json'
  if (idempotencia) cabeceras['Idempotency-Key'] = idempotencia

  const escritura = metodo !== 'GET'
  const respuesta = await fetch(url, {
    method: metodo,
    headers: cabeceras,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(escritura ? TIMEOUT_ESCRITURA_MS : TIMEOUT_LECTURA_MS),
  })
  const datos = await respuesta.json().catch(() => null)
  const extra = {}
  for (const nombre of CABECERAS_RELEVANTES) {
    const valor = respuesta.headers.get(nombre)
    if (valor !== null) extra[nombre] = valor
  }
  return { status: respuesta.status, datos, extra }
}

/** Reenvía lo que contestó la API (cuerpo y estado), con el 401 reetiquetado. */
function reenviar(res, { status, datos, extra }) {
  if (datos === null || datos === undefined) {
    return fallo(res, 502, 'upstream_error', 'La API de transferencias no devolvió una respuesta válida.')
  }
  if (status === 401) {
    return fallo(res, 502, 'upstream_rejected', 'La API de transferencias no aceptó tu sesión. Vuelve a entrar.')
  }
  return json(res, estadoPublico(status), datos, extra)
}

/**
 * @returns {(req: object, res: object, next: () => any) => Promise<void>}
 */
export function createTransferenciasApiMiddleware() {
  return async function transferenciasApiMiddleware(req, res, next) {
    const ruta = (req.url ?? '/').split('?')[0]
    if (!ruta.startsWith('/api/ajustes/')) return next()

    const partes = ruta.split('/').slice(3).filter(Boolean) // [tipo, id?, accion?]
    const tipo = TIPOS[partes[0]]
    const id = partes[1]
    const accion = partes[2]

    let operacion
    if (partes.length === 1) operacion = req.method === 'GET' ? 'listar' : req.method === 'POST' ? 'crear' : null
    else if (partes.length === 3 && /^\d+$/.test(id ?? '')) {
      if (accion === 'confirm' && req.method === 'POST') operacion = 'confirmar'
      if (accion === 'lines' && req.method === 'GET') operacion = 'lineas'
    }
    if (!tipo || !operacion) return fallo(res, 404, 'not_found', 'No encontrado')

    if (!baseApi()) {
      return fallo(res, 503, 'not_configured', 'Falta TRANSFERENCIAS_API_URL: la API de transferencias no está configurada.')
    }

    try {
      const sesion = await resolverSesion(req, res)
      if (!sesion) return fallo(res, 401, 'unauthorized', 'Sesión no válida')
      if (!ROLES_AJUSTES.includes(sesion.usuario.role)) {
        return fallo(res, 403, 'forbidden', 'Tu rol no puede gestionar ajustes de facturación.')
      }

      const escritura = operacion === 'crear' || operacion === 'confirmar'
      const credenciales = leerCredenciales(req)
      if (escritura && !credenciales) {
        return fallo(
          res, 403, 'no_tkc_credentials',
          'Tu cuenta no tiene credenciales de TKC en esta sesión. Cierra sesión y vuelve a entrar; si persiste, pide que te las enlacen.',
        )
      }
      if (escritura && !process.env.TKC_HANDOFF_KEY) {
        return fallo(res, 503, 'not_configured', 'Falta TKC_HANDOFF_KEY: no se pueden mandar tus credenciales de TKC a la API.')
      }

      const ctx = { jwt: sesion.jwt, sub: sesion.sub, credenciales }
      const consulta = new URL(req.url, 'http://local').searchParams
      const prefijo = tipo.ruta

      if (operacion === 'listar') {
        const resultado = await llamarApi(ctx, {
          metodo: 'GET',
          ruta: prefijo,
          consulta: {
            warehouse: consulta.get('almacen') ? almacenId(consulta.get('almacen')) : undefined,
            from: consulta.get('from') ?? undefined,
            to: consulta.get('to') ?? undefined,
            status: consulta.get('status') ?? undefined,
            q: consulta.get('q') ?? undefined,
            limit: consulta.get('limit') ?? undefined,
            offset: consulta.get('offset') ?? undefined,
          },
        })
        return reenviar(res, resultado)
      }

      if (operacion === 'lineas') {
        return reenviar(res, await llamarApi(ctx, { metodo: 'GET', ruta: `${prefijo}/${id}/lines` }))
      }

      const cuerpo = await leerCuerpo(req)
      const idempotencia = texto(cuerpo.idempotencyKey, 'idempotencyKey', 128) ?? randomUUID()
      if (!CLAVE_IDEMPOTENCIA.test(idempotencia)) {
        throw new ErrorPeticion(400, '`idempotencyKey`: 8 a 128 caracteres (letras, números y . _ : -).')
      }

      if (operacion === 'crear') {
        const clasificacion = texto(cuerpo.classification, 'classification', 100)
        if (tipo.clasificacionObligatoria && !clasificacion) {
          throw new ErrorPeticion(400, 'La clasificación es obligatoria en un ajuste de disminución.')
        }
        // Se reconstruye campo a campo: lo que no está aquí no llega a la API.
        const aPeticion = {
          warehouse: almacenId(cuerpo.almacen),
          lines: lineas(cuerpo.lines),
          date: fecha(cuerpo.date),
          notes: texto(cuerpo.notes, 'notes', 500),
          classification: clasificacion,
        }
        return reenviar(res, await llamarApi(ctx, {
          metodo: 'POST', ruta: prefijo, cuerpo: aPeticion, idempotencia,
        }))
      }

      // confirmar
      const aPeticion = {
        warehouse: almacenId(cuerpo.almacen),
        date: fecha(cuerpo.date),
        code: texto(cuerpo.code, 'code', 64),
      }
      return reenviar(res, await llamarApi(ctx, {
        metodo: 'POST', ruta: `${prefijo}/${id}/confirm`, cuerpo: aPeticion, idempotencia,
      }))
    } catch (error) {
      if (error instanceof ErrorPeticion) return fallo(res, error.status, 'bad_request', error.message)
      const msg = error instanceof Error ? error.message : String(error)
      console.error('[ajustes-api] error:', msg)
      // Una escritura que se cortó a medias puede haber llegado: se avisa
      // distinto de un fallo limpio, para que no se reintente a ciegas.
      const escritura = req.method === 'POST'
      // Conexión que ni llegó a abrirse: seguro que no se escribió nada.
      // Node lo deja en `cause.code`; Bun, en `code` y en el mensaje.
      const sinLlegar = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN/.test(
        `${error?.cause?.code ?? ''} ${error?.code ?? ''} ${msg}`,
      )
      if (sinLlegar) {
        return fallo(res, 502, 'upstream_error', 'No se pudo conectar con la API de transferencias. No se envió nada a TKC.')
      }
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        return fallo(
          res, 504, escritura ? 'unverified' : 'timeout',
          escritura
            ? 'La API tardó demasiado y no se sabe si el documento llegó a TKC. Revisa TKC antes de repetir.'
            : 'La API de transferencias tardó demasiado en responder.',
        )
      }
      return fallo(
        res, 502, escritura ? 'unverified' : 'upstream_error',
        escritura
          ? 'No se pudo confirmar si TKC aplicó la escritura. Revisa TKC antes de repetir.'
          : 'No se pudo consultar la API de transferencias.',
      )
    }
  }
}
