import { base44 } from '@/api/base44Client'

// ── Labels ─────────────────────────────────────────────────

const TABLA_LABEL = {
  mermas:          'Merma',
  inventarios:     'Inventario',
  anuncios_desact: 'Anuncio',
}

const TABLA_LINK = {
  mermas:          '/mermas',
  inventarios:     '/inventario',
  anuncios_desact: '/anuncios',
  lotes_ic:        '/lotes',
}

const ESTADO_LABEL = {
  en_curso:             'En curso',
  pend_fact:            'Pendiente facturación',
  en_auditoria:         'En auditoría',
  pend_ca:              'Pendiente CA',
  completado:           'Completado',
  devuelto:             'Devuelto',
  reconteo_solicitado:  'Reconteo solicitado',
}

// ── Helpers internos ────────────────────────────────────────

async function insertNotif(email, tipo, titulo, mensaje, link = null, es_error = false) {
  if (!email) return
  await base44.entities.Notificacion.create({ usuario_id: email, tipo, titulo, mensaje, leida: false, link, es_error })
}

async function notificarRol(rol, tipo, titulo, mensaje, excluirEmail = null, link = null) {
  // Consulta "quiénes tienen el rol X": el IS solo sabe responder por el
  // usuario autenticado, por eso usuarios.role se espeja en cada login.
  const usuarios = await base44.entities.Usuario.filter({ role: rol, activo: true })
  if (!usuarios.length) return
  await Promise.all(
    usuarios
      .filter(u => u.email !== excluirEmail)
      .map(u => insertNotif(u.email, tipo, titulo, mensaje, link))
  )
}

async function notificarJefe(departamento, tipo, titulo, mensaje, link = null) {
  const jefes = await base44.entities.Usuario.filter({
    role: 'jefe_depto', departamento, activo: true,
  })
  if (!jefes.length) return
  await Promise.all(jefes.map(j => insertNotif(j.email, tipo, titulo, mensaje, link)))
}

// ── API pública ─────────────────────────────────────────────

/**
 * Registra una transición de estado en workflow_eventos.
 * Llamar antes de ejecutar el update real.
 */
export async function logTransicion(tabla, registro, estadoNuevo, actor, datos = {}) {
  try {
    await base44.entities.WorkflowEvento.create({
      tabla,
      registro_id:  registro.id,
      estado_antes: registro.estado_tarea ?? null,
      estado_nuevo: estadoNuevo,
      actor_id:     actor?.email   || 'sistema',
      actor_nombre: actor?.full_name || actor?.email,
      actor_rol:    actor?.role,
      datos,
    })
  } catch {}
}

/**
 * Deja constancia de un borrado.
 *
 * Borrar un conteo o una merma hace desaparecer la fila, y con ella el motivo
 * por el que había una diferencia. La traza queda en dos sitios: en los
 * eventos del flujo —qué se borró y quién— y en el historial del producto,
 * que es donde mira quien investiga por qué una existencia no cuadra.
 *
 * Es best-effort a propósito: si falla el registro no se impide el borrado,
 * que ya fue una decisión consciente de quien tiene permiso.
 */
export async function logBorrado(tabla, registro, actor) {
  const quien = actor?.full_name || actor?.email || 'alguien'
  const resumen = [
    registro.producto_nombre || registro.producto_codigo || '—',
    registro.cantidad != null ? `cantidad ${registro.cantidad}` : null,
    registro.diferencia != null ? `diferencia ${registro.diferencia}` : null,
    registro.estado_tarea ? `estaba en ${registro.estado_tarea}` : null,
  ].filter(Boolean).join(' · ')

  try {
    await base44.entities.WorkflowEvento.create({
      tabla,
      registro_id:  registro.id,
      estado_antes: registro.estado_tarea ?? null,
      estado_nuevo: 'borrado',
      actor_id:     actor?.email || 'sistema',
      actor_nombre: quien,
      actor_rol:    actor?.role,
      datos:        registro,
    })
  } catch { /* la traza no puede impedir el borrado */ }

  if (!registro.producto_id) return
  try {
    await base44.entities.HistorialMovimiento.create({
      producto_id:     registro.producto_id,
      producto_nombre: registro.producto_nombre || '',
      producto_codigo: registro.producto_codigo || '',
      usuario_id:      actor?.email || 'sistema',
      usuario_nombre:  quien,
      tipo_cambio:     'borrado',
      campo:           tabla,
      valor_anterior:  resumen,
      valor_nuevo:     '',
      fecha:           new Date().toISOString(),
      origen:          'borrado',
    })
  } catch { /* idem */ }
}

/**
 * Envía notificaciones dirigidas según la transición de estado.
 * Reglas:
 *   pend_fact            → todos los usuarios de 'fact' + jefe facturacion
 *   en_auditoria         → todos los 'auditor'
 *   pend_ca              → todos los 'ca' + jefe ca
 *   completado           → creador del registro
 *   devuelto             → creador del registro
 *   reconteo_solicitado  → creador del registro
 */
export async function notificarTransicion(tabla, registro, estadoNuevo, actor) {
  try {
    const tipo        = TABLA_LABEL[tabla] || tabla
    const producto    = registro.producto_nombre || '—'
    const actorNombre = actor?.full_name || actor?.email || '—'
    const estadoLabel = ESTADO_LABEL[estadoNuevo] || estadoNuevo
    const titulo      = `${tipo}: ${estadoLabel}`
    const base        = `${producto} — por ${actorNombre}`
    const link        = TABLA_LINK[tabla] || null

    const creatorEmail = registro.especialista_id || registro.especialista_inv_id

    // Email del especialista FACT que procesó el registro
    const factEmail = registro.fact_especialista_id || null

    // Helper: notifica a un email solo si existe y no es el actor
    const notifOther = (email, msg) => {
      if (email && email !== actor?.email) return insertNotif(email, tipo, titulo, msg, link)
    }

    switch (estadoNuevo) {
      // INV → FACT: FACT + jefe reciben la merma/ajuste con notas de INV
      case 'pend_fact': {
        const notasInv = registro.notas || registro.notas_inv || null
        const mensaje = notasInv ? `${base}\nNotas: ${notasInv}` : base
        await notificarRol('fact', tipo, titulo, mensaje, actor?.email, link)
        await notificarJefe('facturacion', tipo, titulo, mensaje, link)
        break
      }

      // FACT → Auditor: auditor recibe + INV sabe que avanzó a auditoría
      case 'en_auditoria': {
        const factParts = [
          registro.fact_clasif  && `Clasif: ${registro.fact_clasif}`,
          registro.fact_estado  && `Estado: ${registro.fact_estado}`,
          registro.fact_notas   && `Notas FACT: ${registro.fact_notas}`,
        ].filter(Boolean)
        const mensaje = factParts.length ? `${base}\n${factParts.join(' · ')}` : base
        await notificarRol('auditor', tipo, titulo, mensaje, actor?.email, link)
        await notifOther(creatorEmail, mensaje)   // INV ve que avanzó a auditoría
        break
      }

      case 'pend_ca':
        await notificarRol('ca', tipo, titulo, base, actor?.email, link)
        await notificarJefe('ca', tipo, titulo, base, link)
        await notifOther(creatorEmail, base)       // INV informado
        break

      // Auditor → completado: INV + FACT especialista notificados
      case 'completado': {
        const extra = [
          registro.fact_clasif  && `Clasif: ${registro.fact_clasif}`,
          registro.nota_auditor && `Nota auditor: ${registro.nota_auditor}`,
        ].filter(Boolean).join(' · ')
        const mensaje = extra ? `${base} · ${extra}` : base
        await notifOther(creatorEmail, mensaje)   // INV
        await notifOther(factEmail, mensaje)       // FACT especialista
        break
      }

      // Devuelto: INV siempre notificado; FACT notificado si no fue él el actor
      case 'devuelto': {
        const extra = registro.nota_auditor ? `Nota: ${registro.nota_auditor}` : ''
        const mensaje = extra ? `${base} · ${extra}` : base
        await notifOther(creatorEmail, mensaje)   // INV
        await notifOther(factEmail, mensaje)       // FACT (solo llega si actor ≠ FACT)
        break
      }

      // FACT pide reconteo → INV recibe la solicitud
      case 'reconteo_solicitado': {
        const motivo = registro.reconteos?.at?.(-1)?.motivo_categoria
        const mensaje = motivo ? `${base}\nMotivo: ${motivo}` : base
        await notifOther(creatorEmail, mensaje)   // INV
        break
      }
    }
  } catch {}
}
