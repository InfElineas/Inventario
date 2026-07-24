import { supabase } from '@/api/supabaseClient';

// ── Notificar a los jefes de departamento ─────────────────────
// Inserta una notificación directamente para cada jefe activo
// del departamento indicado. Sin deduplicación: es por evento real.
export async function notifyJefeDepto(departamento, tipo, titulo, mensaje) {
  try {
    const { data: jefes } = await supabase
      .from('usuarios')
      .select('email')
      .eq('role', 'jefe_depto')
      .eq('departamento', departamento)
      .eq('activo', true);
    if (!jefes?.length) return;
    await Promise.all(jefes.map(j =>
      supabase.from('notificaciones').insert({
        usuario_id: j.email,
        tipo,
        titulo,
        mensaje,
        leida: false,
      })
    ));
  } catch {}
}

// ── Deduplicación via localStorage (TTL 24 h) ──────────────
const STORE_KEY = 'almacen_notif_dedup';
const TTL_MS    = 24 * 60 * 60 * 1000;

// Exportadas (no solo internas) para poder probar el mecanismo de
// deduplicación directamente sin invocar runSmartNotifications completo.
export function getDedup() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const map = JSON.parse(raw);
    const now = Date.now();
    const clean = {};
    for (const [k, ts] of Object.entries(map)) {
      if (now - ts < TTL_MS) clean[k] = ts;
    }
    return clean;
  } catch { return {}; }
}

export function wasFired(key) { return !!getDedup()[key]; }

export function markFired(key) {
  const map = getDedup();
  map[key] = Date.now();
  try { localStorage.setItem(STORE_KEY, JSON.stringify(map)); } catch {}
}

// ── Crear una notificación en Supabase ─────────────────────
async function push(email, tipo, titulo, mensaje, dedupKey) {
  if (wasFired(dedupKey)) return;
  const { error } = await supabase.from('notificaciones').insert({
    usuario_id: email,
    tipo,
    titulo,
    mensaje,
    leida: false,
  });
  if (!error) {
    markFired(dedupKey);
    fireBrowser(titulo, mensaje);
  }
}

// ── Notificación nativa del navegador ──────────────────────
export function fireBrowser(titulo, mensaje) {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(titulo, { body: mensaje, icon: '/favicon.ico', tag: titulo });
  } catch {}
}

export async function requestBrowserPermission() {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

// ── Reglas de notificaciones inteligentes ─────────────────
//   Se ejecuta una vez cuando los datos del layout están listos.
export async function runSmartNotifications({
  user,
  productos = [],
  lotes     = [],
  mermas    = [],
  inventarios = [],
  anuncios  = [],
}) {
  if (!user?.email) return;
  const email = user.email;
  const role  = user.role || 'inv';
  const today = new Date().toDateString();    // cambia cada día → nuevos alerts

  const rules = [];

  // 1. Lotes vencidos con stock
  const vencidos = lotes.filter(l => l.estado_fv === 'vencido' && (l.cantidad || 0) > 0);
  if (vencidos.length > 0) {
    rules.push({
      tipo: 'lote', dedupKey: `lotes_vencidos_${today}`,
      titulo: `${vencidos.length} lote${vencidos.length > 1 ? 's' : ''} vencido${vencidos.length > 1 ? 's' : ''}`,
      mensaje: 'Mercancía vencida con stock — requiere atención inmediata.',
    });
  }

  // 2. Lotes en estado crítico
  const criticos = lotes.filter(l => l.estado_fv === 'critico');
  if (criticos.length > 0) {
    rules.push({
      tipo: 'lote', dedupKey: `lotes_criticos_${today}`,
      titulo: `${criticos.length} lote${criticos.length > 1 ? 's' : ''} en estado crítico`,
      mensaje: 'Vencen en menos de 7 días — gestionar intervención comercial.',
    });
  }

  // 3. Stock bajo mínimo (inv / admin)
  if (['inv', 'administrador'].includes(role)) {
    const bajos = productos.filter(
      p => p.activo !== false && (p.stock_minimo || 0) > 0 && (p.exist_fisica || 0) < (p.stock_minimo || 0)
    );
    if (bajos.length > 0) {
      rules.push({
        tipo: 'recepcion', dedupKey: `stock_bajo_${today}`,
        titulo: `${bajos.length} producto${bajos.length > 1 ? 's' : ''} bajo stock mínimo`,
        mensaje: 'Requieren orden de reabastecimiento.',
      });
    }
  }

  // 4. Reconteos pendientes (inv)
  if (['inv', 'administrador'].includes(role)) {
    const rc = mermas.filter(m => m.estado_tarea === 'reconteo_solicitado');
    if (rc.length > 0) {
      rules.push({
        tipo: 'reconteo', dedupKey: `reconteos_${today}`,
        titulo: `${rc.length} reconteo${rc.length > 1 ? 's' : ''} solicitado${rc.length > 1 ? 's' : ''}`,
        mensaje: 'Mermas que requieren reconteo físico.',
      });
    }
    const dev = inventarios.filter(i => i.estado_tarea === 'devuelto');
    if (dev.length > 0) {
      rules.push({
        tipo: 'devuelto', dedupKey: `devueltos_${today}`,
        titulo: `${dev.length} inventario${dev.length > 1 ? 's' : ''} devuelto${dev.length > 1 ? 's' : ''}`,
        mensaje: 'Inventarios devueltos que requieren revisión.',
      });
    }
  }

  // 5. Pendientes de facturación (fact)
  if (['fact', 'administrador'].includes(role)) {
    const pf = mermas.filter(m => m.estado_tarea === 'pend_fact').length
             + inventarios.filter(i => i.estado_tarea === 'pend_fact').length;
    if (pf > 0) {
      rules.push({
        tipo: 'merma', dedupKey: `pend_fact_${today}`,
        titulo: `${pf} tarea${pf > 1 ? 's' : ''} pend. de facturación`,
        mensaje: 'Mermas e inventarios esperando procesamiento FACT.',
      });
    }
  }

  // 6. En auditoría (auditor)
  if (['auditor', 'administrador'].includes(role)) {
    const ea = mermas.filter(m => m.estado_tarea === 'en_auditoria').length
             + inventarios.filter(i => i.estado_tarea === 'en_auditoria').length
             + anuncios.filter(a => a.estado_tarea === 'en_auditoria').length;
    if (ea > 0) {
      rules.push({
        tipo: 'merma', dedupKey: `en_auditoria_${today}`,
        titulo: `${ea} tarea${ea > 1 ? 's' : ''} en auditoría`,
        mensaje: 'Pendientes de revisión y aprobación.',
      });
    }
  }

  // 7. Pendientes CA (ca)
  if (['ca', 'administrador'].includes(role)) {
    const pca = anuncios.filter(a => a.estado_tarea === 'pend_ca').length;
    if (pca > 0) {
      rules.push({
        tipo: 'merma', dedupKey: `pend_ca_${today}`,
        titulo: `${pca} anuncio${pca > 1 ? 's' : ''} pend. CA`,
        mensaje: 'Anuncios esperando acción del área comercial.',
      });
    }
  }

  // 8. Jefe de departamento — resumen diario según depto asignado
  if (role === 'jefe_depto' && user.departamento) {
    const dept = user.departamento;

    if (dept === 'inventario') {
      const devueltos = inventarios.filter(i => i.estado_tarea === 'devuelto').length
                      + mermas.filter(m => m.estado_tarea === 'devuelto').length;
      if (devueltos > 0) {
        rules.push({
          tipo: 'devuelto',
          dedupKey: `jefe_devueltos_${today}`,
          titulo: `${devueltos} tarea${devueltos > 1 ? 's' : ''} devuelta${devueltos > 1 ? 's' : ''} — INV`,
          mensaje: 'Tareas de tu equipo devueltas por auditoría. Revisa en Supervisión.',
        });
      }
      const enCurso = inventarios.filter(i => i.estado_tarea === 'en_curso').length
                    + mermas.filter(m => m.estado_tarea === 'en_curso').length;
      if (enCurso > 0) {
        rules.push({
          tipo: 'sistema',
          dedupKey: `jefe_en_curso_${today}`,
          titulo: `${enCurso} tarea${enCurso > 1 ? 's' : ''} activa${enCurso > 1 ? 's' : ''} — INV`,
          mensaje: 'Tu equipo tiene tareas en curso en inventario y mermas.',
        });
      }
    }

    if (dept === 'facturacion') {
      const pf = inventarios.filter(i => i.estado_tarea === 'pend_fact').length
               + mermas.filter(m => m.estado_tarea === 'pend_fact').length;
      if (pf > 0) {
        rules.push({
          tipo: 'merma',
          dedupKey: `jefe_fact_pend_${today}`,
          titulo: `${pf} tarea${pf > 1 ? 's' : ''} pendiente${pf > 1 ? 's' : ''} — FACT`,
          mensaje: 'Mermas e inventarios esperando facturación de tu equipo.',
        });
      }
    }

    if (dept === 'ca') {
      const pca = anuncios.filter(a => a.estado_tarea === 'pend_ca').length;
      if (pca > 0) {
        rules.push({
          tipo: 'merma',
          dedupKey: `jefe_ca_pend_${today}`,
          titulo: `${pca} anuncio${pca > 1 ? 's' : ''} pendiente${pca > 1 ? 's' : ''} — CA`,
          mensaje: 'Anuncios esperando acción comercial de tu equipo.',
        });
      }
    }
  }

  // 9. Usuarios pendientes de aprobación (admin) — consulta directa a DB
  if (role === 'administrador') {
    const { count: np } = await supabase
      .from('usuarios')
      .select('*', { count: 'exact', head: true })
      .eq('activo', false);
    if ((np ?? 0) > 0) {
      rules.push({
        tipo: 'usuario',
        dedupKey: `usuarios_pendientes_${today}`,
        titulo: `${np} usuario${np > 1 ? 's' : ''} pendiente${np > 1 ? 's' : ''} de aprobación`,
        mensaje: 'Nuevos usuarios esperando acceso — ir a Gestión de usuarios.',
      });
    }
  }

  // 9. Recepciones con diferencias (inv / admin)
  if (['inv', 'administrador'].includes(role)) {
    const { count: nd } = await supabase
      .from('recepciones')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'con_diferencias');
    if ((nd ?? 0) > 0) {
      rules.push({
        tipo: 'recepcion',
        dedupKey: `recep_diferencias_${today}`,
        titulo: `${nd} recepción${nd > 1 ? 'es' : ''} con diferencias`,
        mensaje: 'Revisión pendiente en el módulo de recepciones.',
      });
    }
  }

  // 10. Lotes próximos a vencer — 30 días (todos los roles)
  const proximos = lotes.filter(l => l.estado_fv === 'por_vencer' && (l.cantidad || 0) > 0);
  if (proximos.length > 0) {
    rules.push({
      tipo: 'lote',
      dedupKey: `lotes_proximos_${today}`,
      titulo: `${proximos.length} lote${proximos.length > 1 ? 's' : ''} próximo${proximos.length > 1 ? 's' : ''} a vencer`,
      mensaje: 'Vencen en los próximos 30 días — considerar intervención comercial.',
    });
  }

  // Insertar en DB todas en paralelo (no se bloquean entre sí)
  await Promise.all(rules.map(r => push(email, r.tipo, r.titulo, r.mensaje, r.dedupKey)));
}
