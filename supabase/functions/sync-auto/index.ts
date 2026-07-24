import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SVC_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const EXT_URL           = Deno.env.get('EXTERNA_URL')!
const EXT_KEY           = Deno.env.get('EXTERNA_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY)
const PAGE = 1000

// ── Helpers de tiempo ───────────────────────────────────────

/**
 * tzOffset: valor de getTimezoneOffset() del navegador del usuario
 * (positivo para zonas al oeste de UTC, ej. 360 para UTC-6)
 * Returns true si el horario ya pasó hoy en la zona del usuario
 * y el último sync fue anterior a ese horario.
 */
function isDue(horario: string, lastSyncISO: string | null, tzOffset: number): boolean {
  const now = new Date()

  // Tiempo local del usuario expresado como timestamp "fake UTC"
  const localMs = now.getTime() - tzOffset * 60_000
  const local   = new Date(localMs)

  // Inicio del día local (medianoche) en fake UTC
  const midnight = new Date(localMs)
  midnight.setUTCHours(0, 0, 0, 0)

  const [h, m] = horario.split(':').map(Number)

  // Hora programada hoy en UTC real
  const scheduledUTC = new Date(midnight.getTime() + (h * 60 + m) * 60_000 + tzOffset * 60_000)

  if (scheduledUTC > now) return false   // aún no llega la hora
  if (!lastSyncISO)       return true    // nunca sincronizado
  return new Date(lastSyncISO) < scheduledUTC
}

// ── Acceso a BD externa ─────────────────────────────────────

async function extFetch(path: string) {
  const res = await fetch(`${EXT_URL}/rest/v1/${path}`, {
    headers: { apikey: EXT_KEY, Authorization: `Bearer ${EXT_KEY}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`External DB HTTP ${res.status}`)
  return res.json()
}

async function fetchPaginado(almacenNum: string): Promise<any[]> {
  const encoded = `%22No.%20Almac%C3%A9n%22=eq.${encodeURIComponent(almacenNum)}`
  const all: any[] = []
  let offset = 0
  while (true) {
    const rows = await extFetch(`invGlobal?${encoded}&limit=${PAGE}&offset=${offset}`)
    if (!Array.isArray(rows) || rows.length === 0) break
    all.push(...rows)
    if (rows.length < PAGE) break
    offset += PAGE
  }
  return all
}

function mapRow(row: any, almacenNum: string) {
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

// Mismo criterio que syncService.js (manual): un solo ganador por
// codigo_producto, prefiriendo la fila que trae id_tienda.
function deduplicateByCodigo(rows: any[]): any[] {
  const winner = new Map<string, any>()
  for (const m of rows) {
    const c = m.codigo_producto
    if (!c) continue
    const prev = winner.get(c)
    if (!prev) { winner.set(c, m); continue }
    if (m.id_tienda && !prev.id_tienda) winner.set(c, m)
  }
  return rows.filter(m => !m.codigo_producto || winner.get(m.codigo_producto) === m)
}

// ── Fetch de productos existentes (paginado) ────────────────

async function fetchExistentes(almacenNum: string) {
  const all: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('productos')
      .select('id, id_tienda, nombre, codigo_producto, exist_fisica, almacen, tienda, precio_costo, suministrador')
      .eq('almacen_num', almacenNum)
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

// ── Historial ───────────────────────────────────────────────

const TRACKED = ['exist_fisica', 'almacen', 'tienda', 'precio_costo', 'nombre', 'suministrador']

function buildHistorialChanges(incoming: any, existing: any): any[] {
  const changes: any[] = []
  const now = new Date().toISOString()
  for (const field of TRACKED) {
    const vNew = incoming[field]
    const vOld = existing[field]
    const changed = typeof vNew === 'number'
      ? Math.abs((vNew ?? 0) - (vOld ?? 0)) > 0.001
      : String(vNew ?? '') !== String(vOld ?? '')
    if (changed) {
      changes.push({
        producto_id:     existing.id,
        producto_nombre: existing.nombre,
        producto_codigo: existing.codigo_producto,
        usuario_id:      'sync-auto',
        usuario_nombre:  'Sync Automático TKC',
        tipo_cambio:     ['exist_fisica','almacen','tienda'].includes(field) ? 'stock'
                         : field.startsWith('precio') ? 'precio' : 'datos',
        campo:           field,
        valor_anterior:  String(vOld ?? ''),
        valor_nuevo:     String(vNew ?? ''),
        fecha:           now,
        origen:          'importacion',
      })
    }
  }
  return changes
}

// ── Sync de un almacén ──────────────────────────────────────

async function syncAlmacen(almacenNum: string): Promise<{ synced: number; errors: number }> {
  const [raw, existingAll] = await Promise.all([
    fetchPaginado(almacenNum),
    fetchExistentes(almacenNum),
  ])

  if (raw.length === 0) return { synced: 0, errors: 0 }

  const rowMap = new Map<string, any>()
  for (const r of raw) {
    const m = mapRow(r, almacenNum)
    const key = m.id_tienda ?? (m.codigo_producto ? `c:${m.codigo_producto}` : null)
    if (key) rowMap.set(key, m)
  }
  const incoming = deduplicateByCodigo([...rowMap.values()])

  const existingByIdTienda = new Map(
    existingAll.filter((p: any) => p.id_tienda).map((p: any) => [String(p.id_tienda), p])
  )

  // Upsert masivo vía la misma RPC que usa el sync manual (sync_productos_bulk),
  // no la versión fila-por-fila (sync_producto), para que ambos caminos manejen
  // igual los cambios de código/id_tienda y el índice único.
  let synced = 0, errors = 0
  const BULK = 500
  for (let i = 0; i < incoming.length; i += BULK) {
    const batch = incoming.slice(i, i + BULK)
    const { data, error } = await supabase.rpc('sync_productos_bulk', {
      p_rows:    batch,
      p_almacen: almacenNum,
    })
    if (error || !data) {
      errors += batch.length
    } else {
      synced += data.synced ?? 0
      errors += data.errors ?? 0
    }
  }

  // Desactivar productos que ya no existen en TKC para este almacén —
  // el cron nunca llamaba esto, dejando productos descontinuados activos.
  const allCodes = incoming.filter(r => r.codigo_producto).map(r => r.codigo_producto)
  if (allCodes.length > 0) {
    await supabase.rpc('deactivate_stale_sync', {
      p_almacen: String(almacenNum),
      p_codigos: allCodes,
    })
  }

  // Historial de cambios
  const allHistorial: any[] = []
  for (const row of incoming) {
    const existing = existingByIdTienda.get(String(row.id_tienda))
    if (existing) allHistorial.push(...buildHistorialChanges(row, existing))
  }

  if (allHistorial.length > 0) {
    const batches = Array.from(
      { length: Math.ceil(allHistorial.length / 500) },
      (_, i) => allHistorial.slice(i * 500, (i + 1) * 500)
    )
    await Promise.all(batches.map(b => supabase.from('historial_movimientos').insert(b)))
  }

  await supabase.from('historial_movimientos').insert({
    tipo_cambio: 'importacion',
    campo:       'sync_externo',
    valor_nuevo: `Almacén ${almacenNum}: ${synced}/${incoming.length} productos sincronizados (auto), ${allHistorial.length} cambios`,
    origen:      'importacion',
  })

  return { synced, errors }
}

// ── Handler principal ───────────────────────────────────────

Deno.serve(async (_req) => {
  try {
    if (!EXT_URL || !EXT_KEY) return new Response('EXTERNA_URL/EXTERNA_KEY not set', { status: 500 })

    // Usuarios con auto_sync activo
    const { data: users, error: usersErr } = await supabase
      .from('usuarios')
      .select('email, sync_config, almacenes_config')
      .filter('sync_config->>auto_sync', 'eq', 'true')

    if (usersErr) throw usersErr
    if (!users?.length) return new Response('no users with auto_sync', { status: 200 })

    // Último sync de cada usuario
    const emails = users.map((u: any) => u.email)
    const { data: logs } = await supabase
      .from('sync_auto_log')
      .select('user_email, almacen, synced_at')
      .in('user_email', emails)

    const logMap = new Map<string, string>()
    for (const log of (logs ?? [])) {
      logMap.set(`${log.user_email}_${log.almacen}`, log.synced_at)
    }

    // Determinar qué almacenes están pendientes
    const tasks: Array<{ email: string; almacen: string }> = []
    for (const user of users) {
      const cfg      = user.sync_config ?? {}
      const tzOffset = typeof cfg.timezone_offset === 'number' ? cfg.timezone_offset : 360
      const horarios: string[]  = Array.isArray(cfg.horarios) ? cfg.horarios : []
      const almacenes: string[] = Array.isArray(cfg.almacenes_sync) && cfg.almacenes_sync.length
        ? cfg.almacenes_sync
        : (Array.isArray(user.almacenes_config) ? user.almacenes_config : [])

      if (!horarios.length || !almacenes.length) continue

      for (const alm of almacenes) {
        const lastSync = logMap.get(`${user.email}_${alm}`) ?? null
        if (horarios.some(h => isDue(h, lastSync, tzOffset))) {
          tasks.push({ email: user.email, almacen: alm })
        }
      }
    }

    if (!tasks.length) return new Response('nothing due', { status: 200 })

    // Ejecutar syncs (secuencial para no saturar la BD externa)
    const results: any[] = []
    for (const { email, almacen } of tasks) {
      try {
        const { synced, errors } = await syncAlmacen(almacen)
        await supabase.from('sync_auto_log').upsert(
          { user_email: email, almacen, synced_at: new Date().toISOString(), synced, errors },
          { onConflict: 'user_email,almacen' }
        )
        if (errors > 0) {
          await supabase.from('notificaciones').insert({
            usuario_id: email,
            tipo:       'sistema',
            titulo:     `Sync automático: ${errors} error${errors > 1 ? 'es' : ''} — Almacén ${almacen}`,
            mensaje:    `${synced} productos sincronizados, ${errors} con error. Revisa el detalle en BD TKC.`,
            leida:      false,
            link:       '/bd-tkc',
            es_error:   true,
          })
        }
        results.push({ email, almacen, synced, errors })
      } catch (e: any) {
        await supabase.from('sync_auto_log').upsert(
          { user_email: email, almacen, synced_at: new Date().toISOString(), synced: 0, errors: 1 },
          { onConflict: 'user_email,almacen' }
        )
        await supabase.from('notificaciones').insert({
          usuario_id: email,
          tipo:       'sistema',
          titulo:     `Sync automático falló — Almacén ${almacen}`,
          mensaje:    e?.message ?? 'Error desconocido',
          leida:      false,
          link:       '/bd-tkc',
          es_error:   true,
        })
        results.push({ email, almacen, error: e?.message })
      }
    }

    return new Response(JSON.stringify({ tasks: results }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(e?.message ?? String(e), { status: 500 })
  }
})
