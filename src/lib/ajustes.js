/**
 * Ajustes de aumento y de disminución de facturación (API de
 * elineas-transferencia). Lógica pura: sin red ni React, para probarla sola.
 *
 * Distinto de `ajusteFact.js`, que solo decide QUÉ ajuste proponer tras un
 * conteo; esto es lo que hace falta para montarlo y confirmarlo.
 */

/** Quién puede montar y confirmar ajustes. Lo comparten el menú, la ruta y el servidor. */
export const ROLES_AJUSTES = ['fact', 'administrador', 'superadmin']

/**
 * Quién puede subir y bajar de tienda.
 *
 * Inventario y facturación: las dos áreas lo hacen como parte de su trabajo.
 *
 * Hace falta nombrar a los dos porque la aplicación guarda UN rol por usuario,
 * y cuando alguien tiene varios en el Identity Server gana el de más autoridad
 * (ver `ROLE_PRECEDENCE`): quien es inventarista y además factura queda como
 * `fact`, y sin esto perdía los botones de tienda.
 *
 * Esto solo decide quién ve la pantalla. El permiso de verdad lo vuelve a
 * comprobar la API de transferencias contra el Identity Server
 * (`up-shop:execute`, `down-shop:execute`), y un 403 suyo llega tal cual.
 */
export const ROLES_TIENDA = ['inv', 'fact', 'jefe_depto', 'administrador', 'superadmin']

/** Las 8 etiquetas de TKC del ajuste de aumento. */
export const CLASIFICACIONES_AUMENTO = [
  'Carga inicial',
  'Devolución de productos',
  'Error contable',
  'Producto incontable',
  'Reclasificación de calidad',
  'Reposición de inventario',
  'Sobrante de inventario',
  'Sobrante picker',
]

/**
 * Las 34 de salida de TKC. Sin valor por defecto: TKC rechaza una línea sin
 * ella. Falta a propósito «Incidencias Picker Individual», que exige elegir un
 * picker por línea y la API no lo soporta.
 */
export const CLASIFICACIONES_DISMINUCION = [
  'Carga Inicial', 'Cobro al suministrador', 'Codigos MRD Cero',
  'Cuenta casa administrativa', 'Cuenta casa AQR', 'Cuenta casa atenciones',
  'Cuenta casa eventos', 'Cuenta Casa Yura', 'Decomisado', 'Destruido',
  'Devolución a Proveedor', 'Error contable', 'Faltante de Origen',
  'Faltante en inventario', 'Incidencia picker individual', 'Incidencias Picker',
  'Mal estado', 'Merma', 'Norma 01', 'Norma 02', 'Norma 03', 'Nota de Crédito',
  'Producto Incontable', 'Reclasificación de calidad', 'Reposición de inventario',
  'Reposición productos sobreventa', 'Responsabilidad Material', 'Robo',
  'Salida de Insumos', 'Sobrante en inventario', 'Sustitución de Inventario',
  'Transferencia Almacén Externo', 'Venta Directa', 'Venta SP',
]

/** `segmento` es el de la ruta `/api/ajustes/:segmento`. */
export const TIPOS_AJUSTE = {
  aumento: {
    segmento: 'aumentos',
    titulo: 'Ajuste de aumento',
    descripcion: 'Sube la existencia de los productos en TKC (sobrantes).',
    clasificaciones: CLASIFICACIONES_AUMENTO,
    clasificacionPorDefecto: 'Reposición de inventario',
    clasificacionObligatoria: false,
    efectoConfirmar: 'SUMARÁ',
  },
  disminucion: {
    segmento: 'disminuciones',
    titulo: 'Ajuste de disminución',
    descripcion: 'Baja la existencia de los productos en TKC (faltantes, mermas).',
    clasificaciones: CLASIFICACIONES_DISMINUCION,
    clasificacionPorDefecto: '',
    clasificacionObligatoria: true,
    efectoConfirmar: 'RESTARÁ',
  },
}

export const MAX_LINEAS = 500

/**
 * Lee el texto `CODIGO*CANTIDAD`, una línea por producto (la cantidad vale 1 si
 * falta). Un código repetido es un error y no se suma: en TKC quedarían todos
 * «No válidos», y sumarlos en silencio cambiaría lo que la persona escribió.
 *
 * @returns {{ lines: Array<{code: string, quantity: number}>,
 *             errores: Array<{linea: number, texto: string, motivo: string}> }}
 */
export function parseLineas(texto) {
  const lines = []
  const errores = []
  const vistos = new Map() // código → nº de línea donde apareció

  String(texto ?? '').split(/\r?\n/).forEach((crudo, i) => {
    const linea = i + 1
    const t = crudo.trim()
    if (!t) return

    const partes = t.split('*')
    if (partes.length > 2) {
      errores.push({ linea, texto: t, motivo: 'Demasiados «*»: usa CODIGO*CANTIDAD.' })
      return
    }
    const code = partes[0].trim()
    if (!code || /\s/.test(code)) {
      errores.push({ linea, texto: t, motivo: 'El código no puede estar vacío ni llevar espacios.' })
      return
    }
    let quantity = 1
    if (partes.length === 2) {
      const q = partes[1].trim()
      if (!/^\d+$/.test(q) || Number(q) < 1) {
        errores.push({ linea, texto: t, motivo: 'La cantidad debe ser un entero positivo.' })
        return
      }
      quantity = Number(q)
    }
    if (vistos.has(code)) {
      errores.push({ linea, texto: t, motivo: `Código repetido (ya está en la línea ${vistos.get(code)}).` })
      return
    }
    vistos.set(code, linea)
    lines.push({ code, quantity })
  })

  if (lines.length > MAX_LINEAS) {
    errores.push({ linea: 0, texto: '', motivo: `Máximo ${MAX_LINEAS} productos por ajuste (hay ${lines.length}).` })
  }
  return { lines, errores }
}

/**
 * Clave de idempotencia: un envío distinto, una clave distinta; repetir EL MISMO
 * envío (doble clic, reintento tras un corte) reutiliza la clave y la API
 * devuelve lo ya hecho en vez de duplicar el documento.
 */
export function nuevaClave(prefijo = 'inv') {
  return `${prefijo}-${globalThis.crypto.randomUUID()}`
}

/**
 * Qué significa la respuesta de la API para la pantalla.
 *
 *   creado | confirmado   — hecho.
 *   rechazado             — nada se envió a TKC; `rechazadas` dice por qué cada línea.
 *   fallo                 — TKC no lo aceptó. Se puede corregir y reintentar.
 *   sin_verificar         — se envió y NO se sabe si TKC lo aplicó: no repetir, mirar TKC.
 *   error                 — la petición no llegó a hacer nada (permisos, validación, caída).
 *
 * @param {number} status
 * @param {any} body
 */
export function interpretar(status, body) {
  const err = body?.error
  if (err && typeof err === 'object') {
    // La API usa `unverified` también en `error.code` (excepción tras empezar a escribir).
    if (err.code === 'unverified' || status === 504) {
      return { tipo: 'sin_verificar', mensaje: err.message }
    }
    return { tipo: 'error', codigo: err.code, mensaje: err.message, status }
  }

  const rechazadas = Array.isArray(body?.rejected) ? body.rejected : []
  const aceptadas = Array.isArray(body?.accepted) ? body.accepted : []
  const base = { aceptadas, rechazadas, documento: body?.document ?? null }

  switch (body?.status) {
    case 'created':
      return { tipo: 'creado', ...base }
    case 'confirmed':
      return { tipo: 'confirmado', mensaje: body.message, estado: body.state, aviso: body.warning ?? null }
    case 'rejected':
      return { tipo: 'rechazado', mensaje: typeof body.error === 'string' ? body.error : undefined, ...base }
    case 'failed':
      return { tipo: 'fallo', mensaje: typeof body.error === 'string' ? body.error : 'TKC no lo aceptó.', ...base }
    case 'unverified':
      return { tipo: 'sin_verificar', mensaje: body.message }
    default:
      return { tipo: 'error', mensaje: 'Respuesta inesperada de la API de transferencias.', status }
  }
}

/** ¿Se puede confirmar? Solo un documento «editada» (aún sin aplicar). */
export const puedeConfirmar = (estado) => String(estado ?? '').trim().toLowerCase() === 'editada'

/** Lo que muestra el banner de un resultado que no es un éxito. */
export function mensajeDeError(r) {
  if (r.codigo === 'no_tkc_credentials') return r.mensaje;
  if (r.codigo === 'forbidden' || r.codigo === 'no_access') {
    // Es un permiso de la API de transferencias, no tus credenciales de TKC.
    return `${r.mensaje} Esto no tiene que ver con tus credenciales de TKC: es un permiso de la ` +
      'API de transferencias. Pide que te asignen el rol en el Identity Server.';
  }
  return r.mensaje || 'No se pudo completar la operación.';
}
