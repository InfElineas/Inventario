import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Package, Clock, Truck, RefreshCw, Undo2, CheckCheck,
  ArrowRight, Database, UserPlus, AlertTriangle, Send, ExternalLink,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

const TYPE_CFG = {
  merma:     { Icon: Package,       color: '#E24B4A', defaultLink: '/mermas'    },
  lote:      { Icon: Clock,         color: '#BA7517', defaultLink: '/lotes'     },
  recepcion: { Icon: Truck,         color: '#378ADD', defaultLink: '/recepciones'},
  reconteo:  { Icon: RefreshCw,     color: '#BA7517', defaultLink: '/mermas'    },
  devuelto:  { Icon: Undo2,         color: '#E24B4A', defaultLink: '/mermas'    },
  sistema:   { Icon: Database,      color: '#4ade80', defaultLink: null         },
  usuario:   { Icon: UserPlus,      color: '#a78bfa', defaultLink: '/admin/usuarios' },
  Merma:     { Icon: Package,       color: '#E24B4A', defaultLink: '/mermas'    },
  Inventario:{ Icon: CheckCheck,    color: '#60a5fa', defaultLink: '/inventario'},
  Anuncio:   { Icon: AlertTriangle, color: '#fb923c', defaultLink: '/anuncios'  },
};

function timeAgo(date) {
  if (!date) return '';
  try { return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es }); }
  catch { return ''; }
}

function getLink(notif) {
  if (notif.link) return notif.link;
  return TYPE_CFG[notif.tipo]?.defaultLink || null;
}

export default function NotifDropdown({ notifications = [] }) {
  const [open, setOpen]         = useState(false);
  const [reporting, setReporting] = useState(null); // id de notif en reporte
  const ref                     = useRef(null);
  const navigate                = useNavigate();
  const queryClient             = useQueryClient();

  const shown       = notifications.slice(0, 5);
  const unreadCount = notifications.length;

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const markOne = useMutation({
    mutationFn: (id) => supabase.from('notificaciones').update({ leida: true }).eq('id', id),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['notifications-unread'] }),
  });

  const markAll = useMutation({
    mutationFn: () => {
      const ids = notifications.map(n => n.id);
      if (!ids.length) return Promise.resolve();
      return supabase.from('notificaciones').update({ leida: true }).in('id', ids);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications-unread'] }),
  });

  const reportToSupport = useMutation({
    mutationFn: async (notif) => {
      await supabase.from('notificaciones').insert({
        usuario_id: 'soporte@mercadoelineas.com',
        tipo:       'sistema',
        titulo:     `[REPORTE] ${notif.titulo}`,
        mensaje:    `Reportado por usuario. Detalle: ${notif.mensaje || '—'}`,
        leida:      false,
        link:       notif.link || '/bd-tkc',
        es_error:   true,
      });
    },
    onSuccess: (_, notif) => {
      setReporting(null);
      markOne.mutate(notif.id);
    },
  });

  const handleClick = (notif) => {
    markOne.mutate(notif.id);
    const link = getLink(notif);
    if (link) {
      setOpen(false);
      navigate(link);
    }
  };

  return (
    <div className="relative" ref={ref}>

      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Notificaciones"
        aria-haspopup="true"
        aria-expanded={open}
        data-testid="btn-notifications"
        className="relative p-2.5 sm:p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
      >
        <Bell className="w-5 h-5 sm:w-4 sm:h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 sm:-top-0.5 sm:-right-0.5 w-4 h-4 flex items-center justify-center rounded-full text-[9px] font-bold text-black bg-[#4ade80]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-[40px] rounded-xl shadow-2xl z-50 overflow-hidden"
          style={{ width: '340px', background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-semibold text-foreground">Notificaciones</p>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold text-black px-1.5 py-0.5 rounded-full bg-[#4ade80]">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-[#4ade80] transition-colors"
              >
                <CheckCheck className="w-3 h-3" />
                Marcar leídas
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {shown.length === 0 ? (
              <div className="py-10 flex flex-col items-center gap-2">
                <Bell className="w-7 h-7 text-muted-foreground opacity-30" />
                <p className="text-[12px] text-muted-foreground">Sin notificaciones nuevas</p>
              </div>
            ) : (
              shown.map((n, i) => {
                const { Icon, color } = TYPE_CFG[n.tipo] || { Icon: Bell, color: '#888' };
                const link = getLink(n);
                const isReporting = reporting === n.id;

                return (
                  <div
                    key={n.id}
                    style={{ borderBottom: i < shown.length - 1 ? '1px solid hsl(var(--border))' : 'none' }}
                  >
                    <div
                      className={`flex items-start gap-3 px-4 py-3 transition-colors ${link ? 'cursor-pointer hover:bg-accent' : ''}`}
                      onClick={() => !isReporting && handleClick(n)}
                    >
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: `${color}18` }}>
                        <Icon className="w-3.5 h-3.5" style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-[12px] font-medium text-foreground leading-snug">{n.titulo}</p>
                          {link && <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" />}
                        </div>
                        {n.mensaje && (
                          <p className="text-[11px] leading-snug mt-0.5 text-muted-foreground line-clamp-2">{n.mensaje}</p>
                        )}
                        <div className="flex items-center justify-between mt-1.5">
                          <p className="text-[10px] text-muted-foreground opacity-70">{timeAgo(n.created_date)}</p>
                          {/* Botón reportar a soporte para errores técnicos */}
                          {n.es_error && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setReporting(n.id); }}
                              className="flex items-center gap-1 text-[10px] text-[#e24b4a] hover:opacity-70 transition-opacity"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              Reportar
                            </button>
                          )}
                        </div>
                      </div>
                      <span className="w-[6px] h-[6px] rounded-full flex-shrink-0 mt-1.5 bg-[#4ade80]" />
                    </div>

                    {/* Formulario de reporte */}
                    {isReporting && (
                      <div className="px-4 pb-3 space-y-2 bg-[#e24b4a]/5 border-t border-[#e24b4a]/20">
                        <p className="text-[11px] font-medium text-[#e24b4a] pt-2">Enviar reporte a soporte</p>
                        <p className="text-[10px] text-muted-foreground">
                          Se enviará la notificación con contexto técnico a soporte@mercadoelineas.com
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => reportToSupport.mutate(n)}
                            disabled={reportToSupport.isPending}
                            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md bg-[#e24b4a]/10 text-[#e24b4a] hover:bg-[#e24b4a]/20 transition-colors disabled:opacity-50"
                          >
                            <Send className="w-3 h-3" />
                            {reportToSupport.isPending ? 'Enviando...' : 'Enviar reporte'}
                          </button>
                          <button
                            onClick={() => setReporting(null)}
                            className="text-[11px] px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <button
            onClick={() => { setOpen(false); navigate('/notificaciones'); }}
            className="w-full flex items-center justify-center gap-1.5 py-3 text-[12px] font-medium text-[#4ade80] hover:bg-[#4ade80]/5 transition-colors border-t border-border"
          >
            Ver todas las notificaciones
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
