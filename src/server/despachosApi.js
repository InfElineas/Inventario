/**
 * Cerrar los despachos de TKC desde Inventario.
 *
 *   GET  /api/despachos/almacenes            los almacenes con proveedor asignado
 *   GET  /api/despachos/pendientes?almacen=  lo que se cerraría: SOLO LEE
 *   POST /api/despachos/cerrar               lo cierra: trabajo en segundo plano (202)
 *   GET  /api/despachos/trabajo?id=          el avance de ese trabajo
 *   POST /api/despachos/cancelar?id=         lo para entre un despacho y el siguiente
 *
 * Es el workflow de n8n «Cierre despachos TKC» hecho función de la aplicación,
 * con una diferencia que importa: cada persona lo hace con SU cuenta de TKC (las
 * credenciales selladas en su sesión), no con una cuenta fija. Sin credenciales no
 * se hace nada, y nunca se cae a una cuenta de servicio.
 *
 * El almacén se traduce a su proveedor de TKC con `DESPACHOS_PROVEEDORES`, un JSON
 * `{"789":"1508"}` del .env: el workflow original trabajaba con un proveedor fijo,
 * y qué proveedor es de qué almacén no se puede adivinar.
 *
 * Los trabajos viven en memoria: si el contenedor se reinicia a mitad, el cierre
 * se corta, y no pasa nada que no se pueda repetir —lo cerrado en TKC ya no sale
 * como activo—. Un solo trabajo a la vez por almacén.
 */

import { randomUUID } from 'node:crypto'
import { resolverSesion } from './session.js'
import { leerCredenciales } from './credencialesTkc.js'
import { query } from './db.js'
import { puedeCerrarDespachos, rolesDe } from '../lib/roles.js'
import { warehouseName } from '../services/tkc/warehouses.js'
import {
  fechaLimite, iniciarSesion, leerPagina, parsearActivos, sesionActiva,
} from '../services/tkc/despachos.js'
import { ejecutarCierre, resumirFilas, MAX_DESPACHOS } from './cierreDespachos.js'

/** `{ "789": "1508" }` del entorno. Un JSON roto es «sin configurar», no una caída. */
export function proveedoresConfigurados(env = process.env) {
  try {
    const crudo = JSON.parse(env.DESPACHOS_PROVEEDORES || '{}')
    const salida = {}
    for (const [almacen, proveedor] of Object.entries(crudo ?? {})) {
      if (/^\d{1,10}$/.test(String(proveedor))) salida[String(almacen)] = String(proveedor)
    }
    return salida
  } catch {
    return {}
  }
}

const json = (res, status, payload) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}
const fallo = (res, status, code, message) => json(res, status, { error: { code, message } })

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let crudo = ''
    req.on('data', (t) => { crudo += t; if (crudo.length > 16 * 1024) reject(new Error('Cuerpo demasiado grande')) })
    req.on('end', () => { try { resolve(crudo ? JSON.parse(crudo) : {}) } catch { reject(new Error('El cuerpo no es JSON válido')) } })
    req.on('error', reject)
  })
}

// ── Trabajos en memoria ──────────────────────────────────────────────
const VIDA_TRABAJO_MS = 60 * 60 * 1000
const MAX_TRABAJOS = 50

function limpiar(trabajos) {
  const ahora = Date.now()
  for (const [id, t] of trabajos) {
    if (t.estado !== 'corriendo' && ahora - t.terminado > VIDA_TRABAJO_MS) trabajos.delete(id)
  }
  while (trabajos.size > MAX_TRABAJOS) trabajos.delete(trabajos.keys().next().value)
}

const instantanea = (t) => ({
  id: t.id, almacen: t.almacen, estado: t.estado, error: t.error ?? null, limite: t.limite ?? null,
  maximo: t.maximo, filas: t.filas, resumen: resumirFilas(t.filas), iniciado: t.iniciado,
})

/** Anota en el historial quién cerró qué: es lo que se cierra en TKC a nombre de esa persona. */
async function registrar(t, usuario) {
  try {
    const r = resumirFilas(t.filas)
    await query(
      `INSERT INTO historial_movimientos (usuario_id, usuario_nombre, tipo_cambio, campo, valor_nuevo, origen)
            VALUES ($1, $2, 'cierre_despachos', $3, $4, 'web')`,
      [
        usuario.email, usuario.full_name ?? usuario.email, `almacen ${t.almacen}`,
        `${t.estado}: ${r.cerrados} cerrados, ${r.omitidos} omitidos, ${r.fallidos} fallidos`
          + (t.filas.length ? ` (${t.filas.filter((f) => f.estado === 'cerrado').map((f) => `#${f.numDespacho ?? f.despachoId}`).join(', ')})` : ''),
      ],
    )
  } catch (e) {
    console.error('[despachos] no se pudo anotar el cierre en el historial:', e.message)
  }
}

export function createDespachosApiMiddleware({ ejecutar = ejecutarCierre } = {}) {
  // El estado vive en cada instancia, no en el módulo: así las pruebas no se pisan.
  const trabajos = new Map()
  const enCurso = new Set()   // almacenes con un cierre en marcha

  return async function despachosApiMiddleware(req, res, next) {
    const ruta = (req.url ?? '/').split('?')[0]
    if (!ruta.startsWith('/api/despachos/')) return next()
    const accion = ruta.split('/')[3]
    const consulta = new URL(req.url, 'http://local').searchParams

    const permitido = {
      almacenes: 'GET', pendientes: 'GET', cerrar: 'POST', trabajo: 'GET', cancelar: 'POST',
    }
    if (!permitido[accion] || permitido[accion] !== req.method) return fallo(res, 404, 'not_found', 'No encontrado')

    try {
      const sesion = await resolverSesion(req, res)
      if (!sesion) return fallo(res, 401, 'unauthorized', 'Sesión no válida')
      if (!puedeCerrarDespachos(sesion.usuario)) {
        return fallo(res, 403, 'forbidden', 'Tu rol no puede cerrar despachos de TKC.')
      }

      const proveedores = proveedoresConfigurados()

      if (accion === 'almacenes') {
        return json(res, 200, {
          almacenes: Object.keys(proveedores).map((k) => ({ key: k, nombre: warehouseName(k) })),
          configurado: Object.keys(proveedores).length > 0,
        })
      }

      if (accion === 'trabajo' || accion === 'cancelar') {
        const t = trabajos.get(consulta.get('id') ?? '')
        // Cada quien ve sus trabajos; un administrador, todos.
        const suyo = t && (t.email === sesion.email || rolesDe(sesion.usuario).some((r) => ['administrador', 'superadmin'].includes(r)))
        if (!suyo) return fallo(res, 404, 'not_found', 'No existe ese trabajo.')
        if (accion === 'cancelar') t.cancelar = true
        return json(res, 200, instantanea(t))
      }

      // Pendientes y cerrar hablan con TKC: almacén con proveedor, y la cuenta de quien lo pide.
      const almacen = accion === 'cerrar' ? null : consulta.get('almacen')
      let cuerpo = {}
      if (accion === 'cerrar') {
        try { cuerpo = await leerCuerpo(req) } catch (e) { return fallo(res, 400, 'bad_request', e.message) }
      }
      const clave = String(almacen ?? cuerpo.almacen ?? '')
      const proveedorId = proveedores[clave]
      if (!proveedorId) {
        return fallo(res, 400, 'sin_proveedor',
          `El almacén ${clave || '—'} no tiene un proveedor de TKC asignado. Un administrador debe añadirlo a DESPACHOS_PROVEEDORES.`)
      }

      const credenciales = leerCredenciales(req, sesion.email)
      if (!credenciales) {
        return fallo(res, 403, 'no_tkc_credentials',
          'Tu cuenta no tiene credenciales de TKC en esta sesión. Cierra sesión y vuelve a entrar; si persiste, pide que te las enlacen.')
      }
      const tkcBase = (process.env.TKC_BASE ?? '').replace(/\/+$/, '')
      if (!tkcBase) return fallo(res, 503, 'not_configured', 'Falta TKC_BASE: no se puede hablar con TKC.')
      const config = { tkcBase, tkcUser: credenciales.username, tkcPass: credenciales.password }

      if (accion === 'pendientes') {
        let cookie
        try { cookie = await iniciarSesion(config) } catch (e) {
          return fallo(res, 502, 'tkc_login', `No se pudo iniciar sesión en TKC con tu cuenta: ${e.message}`)
        }
        const pagina = await leerPagina(config, cookie)
        if (!sesionActiva(pagina)) {
          return fallo(res, 502, 'tkc_sin_acceso',
            'TKC no enseña la página de despachos con tu cuenta: no tiene acceso a ella, o la sesión no es válida.')
        }
        const limite = fechaLimite()
        const { estructuraOk, despachos } = parsearActivos(pagina.html, { limite })
        if (!estructuraOk) {
          return fallo(res, 502, 'tkc_estructura', 'No se encuentra la sección de despachos activos: TKC pudo cambiar la página.')
        }
        return json(res, 200, { almacen: clave, proveedorId, limite, despachos, total: despachos.length })
      }

      // ── cerrar ──
      if (enCurso.has(clave)) {
        return fallo(res, 409, 'en_curso', `Ya hay un cierre de despachos en marcha para el almacén ${clave}.`)
      }
      const maximo = Number.isInteger(cuerpo.maximo) && cuerpo.maximo > 0 ? Math.min(cuerpo.maximo, MAX_DESPACHOS) : MAX_DESPACHOS

      limpiar(trabajos)
      const t = {
        id: randomUUID(), email: sesion.email, almacen: clave, estado: 'corriendo', filas: [],
        maximo, iniciado: Date.now(), cancelar: false,
      }
      trabajos.set(t.id, t)
      enCurso.add(clave)

      // En segundo plano: la petición no espera, el avance se consulta aparte.
      ejecutar({
        config, proveedorId, maximo,
        alFila: (fila) => { t.filas.push(fila) },
        cancelado: () => t.cancelar,
      }).then((r) => {
        t.estado = r.estado
        t.error = r.error
        t.limite = r.limite
      }).catch((e) => {
        t.estado = 'fallido'
        t.error = e.message
      }).finally(async () => {
        t.terminado = Date.now()
        enCurso.delete(clave)
        await registrar(t, sesion.usuario)
      })

      return json(res, 202, instantanea(t))
    } catch (error) {
      console.error('[despachos-api] error:', error?.message ?? error)
      return fallo(res, 500, 'error', 'No se pudo atender la petición de despachos.')
    }
  }
}
