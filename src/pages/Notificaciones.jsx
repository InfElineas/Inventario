import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { sanitizeError } from '@/lib/security';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { format } from 'date-fns';

export default function Notificaciones() {
  const queryClient = useQueryClient();
  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

  const { data: notifs = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      if (!user?.email) return [];
      return base44.entities.Notificacion.filter({ usuario_id: user.email }, '-created_date', 100);
    },
    enabled: !!user?.email,
    select: (d) => Array.isArray(d) ? d : [],
  });

  const markReadMut = useMutation({
    mutationFn: (id) => base44.entities.Notificacion.update(id, { leida: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllRead = async () => {
    const ids = notifs.filter(n => !n.leida).map(n => n.id);
    if (!ids.length) return;
    const { error } = await supabase.from('notificaciones').update({ leida: true }).in('id', ids);
    if (error) { alert(sanitizeError(error)); return; }
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const typeIcons = {
    merma: '📦', lote: '⏰', recepcion: '🚚', reconteo: '🔄', devuelto: '↩️',
    sistema: '🖥️', usuario: '👤',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium">Notificaciones</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{notifs.filter(n => !n.leida).length} sin leer</p>
        </div>
        <Button variant="outline" size="sm" onClick={markAllRead} style={{ borderRadius: '8px' }}>
          <CheckCheck className="w-4 h-4 mr-1.5" /> Marcar todas como leídas
        </Button>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Cargando...</p>
        ) : notifs.length === 0 ? (
          <Card className="p-8 text-center" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
            <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Sin notificaciones</p>
          </Card>
        ) : notifs.map(n => (
          <Card key={n.id}
            className={`p-4 flex items-start gap-3 transition-all ${n.leida ? 'opacity-60' : ''}`}
            style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
            <span className="text-lg">{typeIcons[n.tipo] || '🔔'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{n.titulo}</p>
              {n.mensaje && <p className="text-xs text-muted-foreground mt-0.5">{n.mensaje}</p>}
              <p className="text-[10px] text-muted-foreground mt-1">
                {n.created_date ? format(new Date(n.created_date), 'dd/MM/yyyy HH:mm') : ''}
              </p>
            </div>
            {!n.leida && (
              <Button variant="ghost" size="sm" onClick={() => markReadMut.mutate(n.id)}>
                <Check className="w-3.5 h-3.5" />
              </Button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}