import { supabase } from '@/api/supabaseClient'
import { toast } from '@/components/ui/use-toast'

/**
 * Muestra un toast temporal Y crea una notificación en la BD.
 *
 * Comportamiento:
 *  - El toast desaparece solo después de `duration` ms (default 5 s).
 *  - Si el usuario hace clic en X antes de que desaparezca → notificación marcada como leída.
 *  - Si el toast desaparece solo (sin X) → notificación queda sin leer en la campana.
 *
 * @param {object} opts
 * @param {string} opts.titulo       - Título del toast/notificación
 * @param {string} opts.mensaje      - Cuerpo del mensaje
 * @param {string} opts.tipo         - Tipo: 'merma'|'lote'|'recepcion'|'reconteo'|'devuelto'|'sistema'
 * @param {string} opts.userEmail    - Email del usuario destinatario
 * @param {object} opts.queryClient  - Instancia de QueryClient para invalidar queries
 * @param {number} [opts.duration]   - Duración en ms (default 5000)
 * @param {'default'|'destructive'} [opts.variant]
 */
export async function notifToast({
  titulo,
  mensaje,
  tipo = 'sistema',
  userEmail,
  queryClient,
  duration = 5000,
  variant = 'default',
}) {
  // 1. Insertar notificación en BD como NO LEÍDA
  const { data: notif, error } = await supabase
    .from('notificaciones')
    .insert({
      usuario_id: userEmail,
      tipo,
      titulo,
      mensaje,
      leida: false,
    })
    .select('id')
    .single()

  if (error) console.error('notifToast: error insertando notificación', error.message)

  // 2. Invalidar campana para mostrar el badge inmediatamente
  queryClient?.invalidateQueries({ queryKey: ['notifications-unread'] })

  // 3. Mostrar toast temporal
  //    onClose se llama SOLO si el usuario hace clic en X
  toast({
    title: titulo,
    description: mensaje,
    variant,
    duration,
    onClose: async () => {
      if (!notif?.id) return
      await supabase
        .from('notificaciones')
        .update({ leida: true })
        .eq('id', notif.id)
      queryClient?.invalidateQueries({ queryKey: ['notifications-unread'] })
    },
  })
}
