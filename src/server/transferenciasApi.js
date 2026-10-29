/**
 * Ajustes de aumento y de disminución contra la API de elineas-transferencia
 * (`/api/v1/adjustments` y `/api/v1/decreases`).
 *
 *   GET  /api/ajustes/{aumentos|disminuciones}              listado
 *   GET  /api/ajustes/{tipo}/:id/lines                       productos del documento
 *   POST /api/ajustes/{tipo}                                 monta el documento («editada»)
 *   POST /api/ajustes/{tipo}/:id/confirm                     lo confirma: MUEVE EXISTENCIA
 *
 * y los procesamientos (`/api/v1/process`: pasar un `NoMT…` a su código normal):
 *
 *   GET  /api/procesamientos/candidatos                      NoMT con existencia y si se pueden procesar
 *   GET  /api/procesamientos/documentos                      los TKCP más recientes
 *   POST /api/procesamientos/analizar                        solo lectura: lo que haría procesar
 *   POST /api/procesamientos                                 procesa: MUEVE EXISTENCIA
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
import { query } from './db.js'
import { leerCredenciales } from './credencialesTkc.js'
import { sellar } from './secretBox.js'
import { keyToTkcValue } from '../services/tkc/warehouses.js'
import { ROLES_AJUSTES, ROLES_TIENDA } from '../lib/ajustes.js'
import { rolesDe } from '../lib/roles.js'
import { cobertura, baseReportes } from './rotacionApi.js'

/** Quién puede ver la rotación de venta: quien decide qué reponer. */
const ROLES_ROTACION = ['inv', 'fact', 'ca', 'jefe_depto', 'supervisor', 'auditor', 'administrador', 'superadmin']

export { ROLES_AJUSTES, ROLES_TIENDA }

const TIPOS = {
  aumentos: { ruta: 'adjustments', etiqueta: 'aumento', clasificacionObligatoria: false },
  disminuciones: { ruta: 'decreases', etiqueta: 'disminución', clasificacionObligatoria: true },
}

/**
 * Subir y bajar de tienda. Dos pasos a propósito, como en su herramienta:
 * `plan` analiza y NO escribe, `ejecutar` mueve la existencia. Los dos son
 * trabajos asíncronos: devuelven 202 con un id y se consulta aparte.
 */
const TIENDA = {
  // Los modos NO son los mismos en los dos sentidos, y confundirlos da un 400
  // de su API. Subir puede dejar una reserva en almacén —su propia fórmula—;
  // bajar admite un tope porcentual sobre lo que hay en tienda.
  subir: { ruta: 'up-shop', etiqueta: 'subir a tienda', modos: ['integro', 'reserva'] },
  bajar: { ruta: 'down-shop', etiqueta: 'bajar de tienda', modos: ['integro', 'porcentaje'] },
}

const PROCESOS = {
  candidatos: { metodo: 'GET', ruta: 'process/candidates' },
  documentos: { metodo: 'GET', ruta: 'process/documents' },
  analizar: { metodo: 'POST', ruta: 'process/analyze' },
}

const MAX_BODY = 512 * 1024
const MAX_LINEAS = 500
/** Montar analiza cada código en TKC: puede tardar. */
const TIMEOUT_ESCRITURA_MS = 180_000
const TIMEOUT_LECTURA_MS = 60_000
/**
 * Procesar relee y escribe línea por línea en TKC (un documento por cada 50) y
 * analizar lee cada código: con cientos de líneas pasa del minuto.
 */
const TIMEOUT_PROCESO_MS = 600_000
const TIMEOUT_ANALISIS_MS = 180_000
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

const CABECERAS_RELEVANTES = ['x-total-count', 'x-truncated-warehouses', 'x-next-offset', 'idempotent-replay', 'retry-after']

/**
 * Mapea un error de la API a lo que el navegador debe ver. Un 401 de la API
 * NO se reenvía como 401: para el cliente un 401 es «tu sesión de Inventario
 * murió» y lo mandaría al login, cuando aquí el JWT acaba de validarse.
 */
function estadoPublico(status) {
  return status === 401 ? 502 : status
}

async function llamarApi(ctx, { metodo, ruta, consulta, cuerpo, idempotencia, timeoutMs }) {
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
    signal: AbortSignal.timeout(timeoutMs ?? (escritura ? TIMEOUT_ESCRITURA_MS : TIMEOUT_LECTURA_MS)),
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
  // Su API dice «el usuario del token no tiene ningún rol en este sistema»,
  // que para quien lo lee no quiere decir nada: su rol en inventario existe y
  // la pantalla le dejó llegar hasta aquí. El que falta es el del sistema de
  // transferencias, y se da en el Identity Server, no aquí.
  if (status === 403 && /ning[úu]n rol en este sistema/i.test(JSON.stringify(datos))) {
    return fallo(
      res, 403, 'sin_rol_transferencias',
      'Tu usuario no tiene rol en el sistema de transferencias, que es el que mueve la existencia en TKC. ' +
      'Pide que te lo asignen en el Identity Server, con permiso para subir y bajar de tienda. ' +
      'No se puede dar desde inventario.',
    )
  }
  return json(res, estadoPublico(status), datos, extra)
}

/**
 * Subir/bajar de tienda. El cuerpo se reconstruye campo a campo, igual que en
 * los ajustes: nada de reenviar lo que mande el navegador.
 *
 * `mode` es suyo —«íntegro» o un porcentaje— y decide cuánto se mueve cuando
 * no cabe todo lo pedido. Se pasa tal cual porque es su vocabulario.
 */
async function atenderTienda(res, req, ctx, modulo, paso, consulta) {
  const cfg = TIENDA[modulo]

  if (paso === 'trabajo') {
    const id = consulta.get('id')
    if (!id) return fallo(res, 400, 'bad_request', 'Falta el id del trabajo.')
    // `wait` deja la petición colgando hasta que el trabajo avanza, que es
    // mucho más barato que sondear cada segundo.
    const espera = Math.min(30, Math.max(0, Number(consulta.get('wait')) || 0))
    const resultado = await llamarApi(ctx, {
      metodo: 'GET',
      ruta: `jobs/${encodeURIComponent(id)}`,
      consulta: espera ? { wait: String(espera) } : undefined,
      timeoutMs: (espera + 10) * 1000,
    })
    await aplicarMovimiento(id, resultado.datos)
    return reenviar(res, resultado)
  }

  const cuerpo = await leerCuerpo(req)
  const peticion = {
    warehouse: almacenId(cuerpo.almacen),
    lines: lineas(cuerpo.lineas),
  }
  // `mode` es obligatorio. Por defecto «integro», que es lo que se espera al
  // pedir N unidades; se comprueba aquí para dar un error claro en vez del
  // 400 de su API.
  const modo = texto(cuerpo.modo, 'modo', 32) ?? 'integro'
  if (!cfg.modos.includes(modo)) {
    throw new ErrorPeticion(400, `Para ${cfg.etiqueta} el modo es ${cfg.modos.join(' o ')}.`)
  }
  peticion.mode = modo

  // `percent` solo acompaña a «porcentaje»; mandarlo con otro modo es ruido.
  if (modo === 'porcentaje') {
    const p = Number(cuerpo.porcentaje)
    if (!Number.isInteger(p) || p < 1 || p > 100) {
      throw new ErrorPeticion(400, 'El porcentaje debe ser un entero entre 1 y 100.')
    }
    peticion.percent = p
  }

  const esEjecutar = paso === 'ejecutar'
  const resultado = await llamarApi(ctx, {
    metodo: 'POST',
    ruta: `${cfg.ruta}/${esEjecutar ? 'runs' : 'plans'}`,
    cuerpo: peticion,
    // Solo las escrituras llevan clave: un análisis repetido no duplica nada.
    idempotencia: esEjecutar ? (texto(cuerpo.idempotencyKey, 'idempotencyKey', 128) ?? randomUUID()) : undefined,
    timeoutMs: TIMEOUT_ANALISIS_MS,
  })

  // Se anota para poder reflejar el movimiento en nuestra copia cuando el
  // trabajo termine. Los análisis no: no mueven nada.
  const trabajo = resultado.datos?.jobId ?? resultado.datos?.id
  if (esEjecutar && trabajo) anotarTrabajo(trabajo, modulo, cuerpo.almacen)

  return reenviar(res, resultado)
}

// ── Reflejar el movimiento en nuestra copia ───────────────────────
//
// El catálogo no lee TKC: lee la copia que llena la sincronización cada hora.
// Sin esto, quien sube dos unidades desde esta pantalla las ve en TKC y aquí
// sigue viendo los números viejos hasta la hora siguiente —y de esos números
// salen el estado de tienda y la prioridad, o sea el orden del trabajo.
//
// En memoria a propósito: si el contenedor se reinicia solo se pierde el
// refresco, y la sincronización lo arregla igual. Tope para que un trabajo que
// nunca termina no acumule entradas sin fin.
const TRABAJOS_MAX = 500
const trabajosTienda = new Map()

function anotarTrabajo(id, modulo, almacen) {
  if (trabajosTienda.size >= TRABAJOS_MAX) {
    trabajosTienda.delete(trabajosTienda.keys().next().value)
  }
  trabajosTienda.set(id, { modulo, almacen })
}

/** Las líneas que de verdad se movieron, con lo concedido por TKC. */
function movidas(datos) {
  const r = datos?.result ?? datos ?? {}
  return (Array.isArray(r.exito) ? r.exito : [])
    .map((l) => ({ code: l.code, granted: Number(l.granted) || 0 }))
    .filter((l) => l.code && l.granted > 0)
}

/**
 * Pasa a nuestra copia lo que acaba de moverse en TKC.
 *
 * `estado_tienda` y `prioridad_tienda` son columnas generadas: se recalculan
 * solas con el UPDATE. La existencia física no cambia —la mercancía sigue en
 * el mismo almacén, solo cambia de lado— así que `exist_fisica` no se toca.
 */
async function aplicarMovimiento(id, datos) {
  const anotado = trabajosTienda.get(id)
  if (!anotado) return
  if ((datos?.status ?? datos?.estado) !== 'succeeded') return
  trabajosTienda.delete(id)

  const lineas = movidas(datos)
  if (lineas.length === 0) return

  // Subir mueve del almacén a la tienda; bajar, al revés.
  const signo = anotado.modulo === 'subir' ? 1 : -1
  for (const l of lineas) {
    try {
      await query(
        `UPDATE productos
            SET almacen = GREATEST(COALESCE(almacen, 0) - $1, 0),
                tienda  = GREATEST(COALESCE(tienda, 0)  + $1, 0),
                -- Sin esto la sincronización de la hora siguiente vuelve a
                -- poner la foto del submayor, que es de la mañana: el
                -- movimiento desaparecería de la pantalla estando hecho.
                existencias_en = now()
          WHERE codigo_producto = $2 AND almacen_num = $3`,
        [signo * l.granted, l.code, String(anotado.almacen)],
      )
    } catch (e) {
      // Que falle el reflejo no puede tumbar la respuesta: el movimiento en
      // TKC ya se hizo y hay que contárselo a quien lo pidió.
      console.error('[tienda] no se pudo reflejar el movimiento', l.code, e.message)
    }
  }
}

/** Los procesamientos: mismas garantías que los ajustes (rol, credenciales, cuerpo reconstruido). */
async function atenderProceso(res, req, ctx, operacion, consulta) {
  if (operacion === 'candidatos' || operacion === 'documentos') {
    const resultado = await llamarApi(ctx, {
      metodo: 'GET',
      ruta: PROCESOS[operacion].ruta,
      consulta: {
        warehouse: consulta.get('almacen') ? almacenId(consulta.get('almacen')) : undefined,
        refresh: consulta.get('refresh') === 'true' ? 'true' : undefined,
        status: consulta.get('status') ?? undefined,
        q: consulta.get('q') ?? undefined,
        limit: consulta.get('limit') ?? undefined,
        offset: consulta.get('offset') ?? undefined,
      },
      // Sin filtro de almacén TKC tarda ~10 s: el margen de lectura alcanza.
    })
    return reenviar(res, resultado)
  }

  const cuerpo = await leerCuerpo(req)
  // Se reconstruye campo a campo: lo que no está aquí no llega a la API.
  const aPeticion = { warehouse: almacenId(cuerpo.almacen), lines: lineas(cuerpo.lines) }

  if (operacion === 'analizar') {
    return reenviar(res, await llamarApi(ctx, {
      metodo: 'POST', ruta: PROCESOS.analizar.ruta, cuerpo: aPeticion, timeoutMs: TIMEOUT_ANALISIS_MS,
    }))
  }

  const idempotencia = texto(cuerpo.idempotencyKey, 'idempotencyKey', 128) ?? randomUUID()
  if (!CLAVE_IDEMPOTENCIA.test(idempotencia)) {
    throw new ErrorPeticion(400, '`idempotencyKey`: 8 a 128 caracteres (letras, números y . _ : -).')
  }
  return reenviar(res, await llamarApi(ctx, {
    metodo: 'POST', ruta: 'process', cuerpo: aPeticion, idempotencia, timeoutMs: TIMEOUT_PROCESO_MS,
  }))
}

/**
 * @returns {(req: object, res: object, next: () => any) => Promise<void>}
 */
export function createTransferenciasApiMiddleware() {
  return async function transferenciasApiMiddleware(req, res, next) {
    const ruta = (req.url ?? '/').split('?')[0]
    const esProceso = ruta === '/api/procesamientos' || ruta.startsWith('/api/procesamientos/')
    const esTienda = ruta.startsWith('/api/tienda/')
    // Solo lectura, y de un informe: no toca TKC ni necesita credenciales.
    const esRotacion = ruta === '/api/rotacion' && req.method === 'GET'
    if (!esProceso && !esTienda && !esRotacion && !ruta.startsWith('/api/ajustes/')) return next()

    let tipo
    let id
    let operacion
    let modulo
    if (esTienda) {
      // /api/tienda/{subir|bajar}/{plan|ejecutar}  ·  /api/tienda/trabajo
      const [uno, dos] = ruta.split('/').slice(3).filter(Boolean)
      if (uno === 'trabajo' && req.method === 'GET') { modulo = 'subir'; operacion = 'trabajo' }
      else if (TIENDA[uno] && (dos === 'plan' || dos === 'ejecutar') && req.method === 'POST') {
        modulo = uno
        operacion = dos
      }
    } else if (esProceso) {
      const partes = ruta.split('/').slice(3).filter(Boolean) // [accion?]
      if (partes.length === 0 && req.method === 'POST') operacion = 'procesar'
      else if (partes.length === 1 && PROCESOS[partes[0]]?.metodo === req.method) operacion = partes[0]
    } else if (esRotacion) {
      // No pasa por el despachador de ajustes: no tiene tipo ni id, es una
      // sola ruta de lectura. Sin esto caía en la rama de abajo, se quedaba
      // sin `operacion` y respondía «No encontrado» antes de llegar a su
      // manejador.
      operacion = 'rotacion'
    } else {
      const partes = ruta.split('/').slice(3).filter(Boolean) // [tipo, id?, accion?]
      tipo = TIPOS[partes[0]]
      id = partes[1]
      const accion = partes[2]
      if (partes.length === 1) operacion = req.method === 'GET' ? 'listar' : req.method === 'POST' ? 'crear' : null
      else if (partes.length === 3 && /^\d+$/.test(id ?? '')) {
        if (accion === 'confirm' && req.method === 'POST') operacion = 'confirmar'
        if (accion === 'lines' && req.method === 'GET') operacion = 'lineas'
      }
      if (!tipo) operacion = null
    }
    if (!operacion) return fallo(res, 404, 'not_found', 'No encontrado')

    if (!baseApi()) {
      return fallo(res, 503, 'not_configured', 'Falta TRANSFERENCIAS_API_URL: la API de transferencias no está configurada.')
    }

    try {
      const sesion = await resolverSesion(req, res)
      if (!sesion) return fallo(res, 401, 'unauthorized', 'Sesión no válida')

      // La rotación la mira quien decide qué reponer: inventario y quien
      // supervisa. Es un informe, así que no hay nada que escribir ni
      // credenciales de TKC que hagan falta.
      if (esRotacion) {
        if (!baseReportes()) {
          return fallo(res, 503, 'not_configured',
            'Falta REPORTES_API_URL: la API de informes no está configurada. Es otra aplicación, distinta de la de transferencias.')
        }
        if (!ROLES_ROTACION.includes(sesion.usuario.role) && !rolesDe(sesion.usuario).some((r) => ROLES_ROTACION.includes(r))) {
          return fallo(res, 403, 'forbidden', 'Tu rol no puede consultar la rotación de venta.')
        }
        const consultaRot = new URL(req.url, 'http://local').searchParams
        const refrescar = consultaRot.get('refrescar') === 'true'
        const almacenRot = consultaRot.get('almacen')
        if (!almacenRot) return fallo(res, 400, 'bad_request', 'Falta el almacén.')

        const dias = Math.min(365, Math.max(1, Number(consultaRot.get('dias')) || 15))
        const filas = await cobertura({ jwt: sesion.jwt }, { almacen: almacenRot, dias, refrescar })
        return json(res, 200, { filas, dias })
      }

      // Subir y bajar de tienda es de inventario; los ajustes y
      // procesamientos, de facturación. Esto solo decide quién ve la pantalla:
      // el permiso de verdad lo comprueba la API contra el Identity Server.
      const rolesPermitidos = esTienda ? ROLES_TIENDA : ROLES_AJUSTES
      if (!rolesPermitidos.includes(sesion.usuario.role)) {
        return fallo(res, 403, 'forbidden', esTienda
          ? 'Tu rol no puede subir ni bajar de tienda.'
          : 'Tu rol no puede gestionar ajustes ni procesamientos de facturación.')
      }

      const escritura = operacion === 'crear' || operacion === 'confirmar'
        || operacion === 'procesar' || operacion === 'ejecutar'
      const credenciales = leerCredenciales(req, sesion.email)
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

      if (esTienda) return await atenderTienda(res, req, ctx, modulo, operacion, consulta)
      if (esProceso) return await atenderProceso(res, req, ctx, operacion, consulta)

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
      // Analizar es un POST pero solo lee: nada que verificar en TKC.
      const escritura = req.method === 'POST' && operacion !== 'analizar'
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
