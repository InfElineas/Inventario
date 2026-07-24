import { supabase } from '@/api/supabaseClient'
import { fetchAllRows } from '@/lib/supabaseUtils'

const EXT_URL = import.meta.env.VITE_SUPABASE_EXTERNA_URL
const EXT_KEY = import.meta.env.VITE_SUPABASE_EXTERNA_ANON_KEY
export const isExternaConfigured = Boolean(EXT_URL && EXT_KEY)

const PAGE = 1000

/**
 * Convierte mensajes técnicos de error de sincronización en texto
 * comprensible para usuarios no técnicos.
 */
export function humanizeSyncError(msg) {
  if (!msg) return 'Error desconocido al procesar el producto.'
  const m = msg.toLowerCase()
  if (m.includes('no unique or exclusion constraint') || m.includes('on conflict'))
    return 'El producto no pudo guardarse: falta una clave única en la base de datos. Ejecuta migration_v26 en el SQL Editor.'
  if (m.includes('violates unique constraint'))
    return 'Producto duplicado: ya existe un producto con el mismo código o ID en este almacén.'
  if (m.includes('violates not-null') || m.includes('null value'))
    return 'Dato obligatorio faltante: el producto no tiene un campo requerido (código o nombre).'
  if (m.includes('violates foreign key'))
    return 'Referencia inválida: el producto apunta a un registro que no existe.'
  if (m.includes('check_violation') || m.includes('check constraint'))
    return 'El producto fue rechazado por una regla de validación de la base de datos.'
  if (m.includes('connection') || m.includes('timeout') || m.includes('network'))
    return 'Error de conexión: no se pudo contactar la base de datos. Intenta de nuevo.'
  if (m.includes('http 4') || m.includes('status 4'))
    return 'Acceso denegado a la base de datos externa. Verifica las credenciales.'
  if (m.includes('http 5') || m.includes('status 5'))
    return 'Error en el servidor de la base de datos externa. Intenta más tarde.'
  if (m.includes('permission denied'))
    return 'Sin permiso para guardar este producto. Verifica las políticas de seguridad.'
  return 'Error al guardar el producto. Detalle técnico: ' + msg.slice(0, 80)
}

async function extFetch(path) {
  const res = await fetch(`${EXT_URL}/rest/v1/${path}`, {
    headers: { apikey: EXT_KEY, Authorization: `Bearer ${EXT_KEY}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── Lista de almacenes
let _almacenesMetaCache = null  // { id_tkc → nombre }

// "No. Almacén" correctamente URL-encoded (incluyendo el espacio como %20)
const ALMACEN_FIELD_ENC = '%22No.%20Almac%C3%A9n%22'

/**
 * Fuente primaria: pagina invGlobal y recoge TODOS los valores únicos de
 * "No. Almacén". Así cualquier almacén nuevo aparece automáticamente, sin
 * depender de la tabla `almacenes` que suele estar desactualizada.
 */
export async function fetchAlmacenes() {
  if (!isExternaConfigured) throw new Error('DB externa no configurada')

  const seen   = new Set()
  let   offset = 0
  const STEP   = 1000     // Supabase anon key cap is 1000 rows/request; larger values break early
  const MAX    = 500_000

  while (offset < MAX) {
    const batch = await extFetch(
      `invGlobal?select=${ALMACEN_FIELD_ENC}&limit=${STEP}&offset=${offset}`
    )
    if (!Array.isArray(batch) || batch.length === 0) break
    for (const r of batch) {
      // La clave JSON puede venir con o sin tilde dependiendo de la versión de PostgREST
      const v = String(r['No. Almacén'] ?? r['No. Almacen'] ?? r['No. AlmacÃ©n'] ?? '').trim()
      if (v && v !== 'undefined' && v !== 'null' && v !== '0') seen.add(v)
    }
    if (batch.length < STEP) break   // última página
    offset += STEP
  }

  if (seen.size === 0) throw new Error('No se encontraron almacenes en invGlobal')

  const unique = [...seen].sort((a, b) => {
    const na = parseInt(a, 10), nb = parseInt(b, 10)
    return (!isNaN(na) && !isNaN(nb)) ? na - nb : a.localeCompare(b)
  })

  // Intentar enriquecer con nombres desde la tabla `almacenes` (opcional)
  _almacenesMetaCache = {}
  try {
    const nameRows = await extFetch(`almacenes?select=id_tkc%2Cnombre&limit=500`)
    if (Array.isArray(nameRows)) {
      nameRows.filter(r => r.id_tkc != null).forEach(r => {
        _almacenesMetaCache[String(r.id_tkc)] = r.nombre || String(r.id_tkc)
      })
    }
  } catch { /* nombres opcionales */ }

  unique.forEach(id => { if (!_almacenesMetaCache[id]) _almacenesMetaCache[id] = id })
  return unique
}

export function getAlmacenNombre(idTkc) {
  return _almacenesMetaCache?.[String(idTkc)] || `Almacén ${idTkc}`
}

export function clearAlmacenesCache() {
  _almacenesMetaCache = null
}

// ── Mapeo invGlobal → productos
function mapRow(row, almacenNum) {
  return {
    almacen_num:       almacenNum,
    id_tienda:         row['IdTienda'] ? String(row['IdTienda']).trim() : null,
    codigo_producto:   String(row['Cód. Prod.']    ?? '').trim(),
    nombre:            String(row['Nombre']        ?? '').trim(),
    suministrador:     String(row['Suministrador'] ?? '').trim(),
    unidad_medida:     String(row['Unid/Alt.']     ?? 'u').trim(),
    exist_fisica:      Number(row['Exist. física'] ?? 0),
    almacen:           Number(row['Reserva']       ?? 0),
    tienda:            Number(row['Tienda']        ?? 0),
    precio_costo:      Number(row['Precio']        ?? 0),
    fotos:             Array.isArray(row['Fotos']) ? row['Fotos'] : [],
    categoria_elineas: row['Categoría Online']
      ? String(row['Categoría Online']).replace(/^\s*-\s*/, '').split(' - ')[0].trim()
      : null,
  }
}

/**
 * Elimina todos los productos que causarían una violación de
 * productos_almacen_codigo_unique: para cada codigo_producto solo puede
 * existir UNA fila. El ganador es el que tiene id_tienda; si hay empate
 * (dos con id_tienda distinto y mismo código), gana el primero en el mapa.
 */
export function deduplicateByCodigo(rows) {
  const winner = new Map()
  for (const m of rows) {
    const c = m.codigo_producto
    if (!c) continue
    const prev = winner.get(c)
    if (!prev) { winner.set(c, m); continue }
    if (m.id_tienda && !prev.id_tienda) winner.set(c, m)  // prefiere con id_tienda
  }
  return rows.filter(m => !m.codigo_producto || winner.get(m.codigo_producto) === m)
}

// ── Consulta directa sin sync: fetch + map en una sola llamada pública
export async function fetchProductosExterno(almacenNum) {
  if (!isExternaConfigured) throw new Error('DB externa no configurada')
  if (!almacenNum) return []
  const raw = await fetchPaginado(almacenNum)
  const rowMap = new Map()
  for (const r of raw) {
    const m = mapRow(r, almacenNum)
    const key = m.id_tienda ?? (m.codigo_producto ? `c:${m.codigo_producto}` : null)
    if (key) rowMap.set(key, m)
  }
  return deduplicateByCodigo([...rowMap.values()])
}

// ── Fetch paginado del almacén desde invGlobal
async function fetchPaginado(almacenNum, onProgress) {
  const filter = `%22No.%20Almac%C3%A9n%22=eq.${encodeURIComponent(almacenNum)}`
  const all = []
  let offset = 0
  while (true) {
    const rows = await extFetch(`invGlobal?${filter}&limit=${PAGE}&offset=${offset}`)
    if (!Array.isArray(rows) || rows.length === 0) break
    all.push(...rows)
    if (onProgress) onProgress({ stage: 'fetch', fetched: all.length })
    if (rows.length < PAGE) break
    offset += PAGE
  }
  return all
}

// ── Campos rastreados en historial
const TRACKED = ['exist_fisica', 'almacen', 'tienda', 'precio_costo', 'nombre', 'suministrador']

function buildHistorialChanges(incoming, existing, userEmail) {
  const changes = []
  const now = new Date().toISOString()
  for (const field of TRACKED) {
    const vNew = incoming[field]
    const vOld = existing[field]
    const changed = typeof vNew === 'number'
      ? Math.abs((vNew ?? 0) - (vOld ?? 0)) > 0.001
      : String(vNew ?? '') !== String(vOld ?? '')
    if (changed) {
      changes.push({
        producto_id:    existing.id,
        producto_nombre:existing.nombre,
        producto_codigo:existing.codigo_producto,
        usuario_id:     userEmail || 'sync',
        usuario_nombre: 'Sync TKC',
        tipo_cambio:    ['exist_fisica','almacen','tienda'].includes(field) ? 'stock'
                        : field.startsWith('precio') ? 'precio' : 'datos',
        campo:          field,
        valor_anterior: String(vOld ?? ''),
        valor_nuevo:    String(vNew ?? ''),
        fecha:          now,
        origen:         'importacion',
      })
    }
  }
  return changes
}

// ── Upsert masivo vía RPC bulk (1–2 llamadas para todo el almacén)
// La RPC sync_productos_bulk maneja los dos índices parciales correctamente en SQL.
// Supabase limita el body HTTP a ~10 MB; con BULK=500 y ~800 bytes/row ≈ 400 KB por llamada.
const BULK = 500

async function upsertBulk(rows, onProgress, totalCount) {
  let synced   = 0
  let errors   = 0
  const failures = []

  for (let i = 0; i < rows.length; i += BULK) {
    const batch = rows.slice(i, i + BULK)
    const almacenNum = batch[0].almacen_num

    // La RPC recibe el array completo y devuelve { synced, errors, error_msg }
    const { data, error } = await supabase.rpc('sync_productos_bulk', {
      p_rows:    batch,
      p_almacen: almacenNum,
    })

    if (error || !data) {
      // Fallo total del batch
      errors += batch.length
      const rawMsg = error?.message || 'Error en RPC bulk'
      batch.forEach(r => failures.push({
        nombre:    r.nombre,
        id_tienda: r.id_tienda,
        codigo:    r.codigo_producto,
        msg:       humanizeSyncError(rawMsg),
        msg_raw:   rawMsg,
      }))
    } else {
      synced += data.synced ?? 0
      errors += data.errors ?? 0
      if (data.error_msg) {
        // Error parcial dentro de la función — no tenemos qué fila exacta falló
        failures.push({
          nombre:    `Batch ${i}–${i + batch.length}`,
          id_tienda: null,
          codigo:    null,
          msg:       humanizeSyncError(data.error_msg),
          msg_raw:   data.error_msg,
        })
      }
    }

    if (onProgress) onProgress({ stage: 'upsert', synced, errors, total: totalCount })
  }

  return { synced, errors, failures }
}

// ── Sincronización principal
export async function syncFromExternal(almacenNum, onProgress = null, userEmail = null) {
  if (!isExternaConfigured) throw new Error('DB externa no configurada')
  if (!almacenNum)          throw new Error('Selecciona un almacén primero')

  // 1+3 en paralelo: descarga externa y pre-fetch de existentes son independientes
  const [raw, existingAll] = await Promise.all([
    fetchPaginado(almacenNum, onProgress),
    fetchAllRows(
      (from, to) => supabase
        .from('productos')
        .select('id, id_tienda, nombre, codigo_producto, exist_fisica, almacen, tienda, precio_costo, suministrador')
        .eq('almacen_num', almacenNum)
        .range(from, to)
    ),
  ])

  if (raw.length === 0) return { synced: 0, errors: 0, total: 0, failures: [], changes: 0 }

  // 2. Mapear por id_tienda, luego deduplicar por codigo_producto.
  //    La constraint productos_almacen_codigo_unique impide que dos filas del
  //    mismo almacén compartan codigo_producto, incluso si tienen id_tienda
  //    distinto. deduplicateByCodigo garantiza un solo ganador por código.
  const rowMap = new Map()
  for (const r of raw) {
    const m = mapRow(r, almacenNum)
    const key = m.id_tienda ?? (m.codigo_producto ? `c:${m.codigo_producto}` : null)
    if (key) rowMap.set(key, m)
  }
  const incoming = deduplicateByCodigo([...rowMap.values()])
  const total    = incoming.length

  if (onProgress) onProgress({ stage: 'upsert', synced: 0, errors: 0, total })

  const existingByIdTienda = new Map(
    existingAll
      .filter(p => p.id_tienda)
      .map(p => [String(p.id_tienda), p])
  )

  // 4. Upsert masivo
  const { synced, errors, failures } = await upsertBulk(incoming, onProgress, total)

  // 4b. Desactivar productos que ya no existen en TKC (ELíneas nunca debe tener
  //     más productos activos que TKC para el mismo almacén)
  const allCodes = incoming.filter(r => r.codigo_producto).map(r => r.codigo_producto)
  if (allCodes.length > 0) {
    await supabase.rpc('deactivate_stale_sync', {
      p_almacen: String(almacenNum),
      p_codigos: allCodes,
    })
  }

  // 5. Detectar y registrar cambios en historial
  const allHistorial = []
  for (const row of incoming) {
    const existing = existingByIdTienda.get(String(row.id_tienda))
    if (existing) {
      const changes = buildHistorialChanges(row, existing, userEmail)
      allHistorial.push(...changes)
    }
  }

  if (allHistorial.length > 0) {
    const batches = Array.from(
      { length: Math.ceil(allHistorial.length / 500) },
      (_, i) => allHistorial.slice(i * 500, (i + 1) * 500)
    )
    await Promise.all(batches.map(b => supabase.from('historial_movimientos').insert(b)))
  }

  // 6. Registro general
  await supabase.from('historial_movimientos').insert({
    tipo_cambio: 'importacion',
    campo:       'sync_externo',
    valor_nuevo: `Almacén ${almacenNum}: ${synced}/${total} productos sincronizados, ${allHistorial.length} cambios`,
    origen:      'importacion',
    fecha:       new Date().toISOString(),
  }).then(() => {})

  return { synced, errors, total, failures, changes: allHistorial.length }
}

// ── Reintento de fallidos
export async function retryFailed(failures, almacenNum, onProgress = null) {
  if (!failures?.length) return { synced: 0, errors: 0, total: 0, failures: [] }

  // Separa fallidos con y sin id_tienda
  const failedIds     = new Set(failures.filter(f => f.id_tienda).map(f => String(f.id_tienda)))
  const failedCodigos = new Set(failures.filter(f => !f.id_tienda && f.codigo).map(f => String(f.codigo)))

  const filter = `%22No.%20Almac%C3%A9n%22=eq.${encodeURIComponent(almacenNum)}`
  const all = []
  let offset = 0
  while (true) {
    const rows = await extFetch(`invGlobal?${filter}&limit=${PAGE}&offset=${offset}`)
    if (!Array.isArray(rows) || rows.length === 0) break
    rows.forEach(r => {
      const idT = r['IdTienda'] ? String(r['IdTienda']) : null
      const cod = r['Cód. Prod.'] ? String(r['Cód. Prod.']).trim() : null
      if ((idT && failedIds.has(idT)) || (!idT && cod && failedCodigos.has(cod))) {
        all.push(r)
      }
    })
    if (all.length >= failedIds.size + failedCodigos.size) break
    if (rows.length < PAGE) break
    offset += PAGE
  }

  const mapped = all.map(r => mapRow(r, almacenNum)).filter(r => r.id_tienda || r.codigo_producto)
  const { synced, errors, failures: newFailures } = await upsertBulk(mapped, onProgress, mapped.length)
  return { synced, errors, total: mapped.length, failures: newFailures }
}
