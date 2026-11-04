import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { MessageSquare } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { DESTINOS_COMENTARIO, supervisa, visiblesPara } from '@/lib/comentariosSupervision';

/**
 * Los comentarios que la supervisión dejó en un registro para ti.
 *
 * Va dentro del detalle de un conteo, una merma, un anuncio o una recepción:
 * quien lo abre ve lo que su jefe le dijo sobre ese registro, con quién lo dijo y
 * para quién. Solo salen los dirigidos a su departamento y los que escribió; si
 * no hay ninguno, no sale nada.
 *
 * @param {object} props
 * @param {string} props.tabla       `inventarios`, `mermas`, `recepciones`, `anuncios_desact`, `lotes_ic`.
 * @param {string} props.registroId
 * @param {object} props.usuario
 */
export default function ComentariosDeSupervision({ tabla, registroId, usuario }) {
  const { data: comentarios = [] } = useQuery({
    queryKey: ['supervision-comments', tabla, registroId],
    queryFn: async () => (await base44.entities.ComentarioSupervision.filter(
      { tabla, registro_id: registroId }, 'created_date',
    )) ?? [],
    enabled: Boolean(tabla && registroId && usuario?.email),
    staleTime: 30 * 1000,
  });

  const mios = visiblesPara(comentarios, usuario);
  if (mios.length === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--c-info-2)]/30 bg-[var(--c-info-2)]/5 p-3 space-y-2.5"
      style={{ borderRadius: 'var(--r-ctl)' }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <MessageSquare className="w-3 h-3" /> Comentarios de supervisión ({mios.length})
      </p>
      {mios.map((c) => (
        <div key={c.id} className="space-y-0.5">
          <p className="text-xs flex flex-wrap items-center gap-x-2">
            <span className="font-semibold">{c.autor_nombre || c.autor_id}</span>
            {c.para_depto && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                para {DESTINOS_COMENTARIO[c.para_depto] ?? c.para_depto}
              </span>
            )}
            {!c.para_depto && supervisa(usuario) && (
              <span className="text-[10px] text-muted-foreground">sin destinatario</span>
            )}
            {c.created_date && (
              <span className="text-[10px] text-muted-foreground ml-auto">{format(new Date(c.created_date), 'dd/MM/yy HH:mm')}</span>
            )}
          </p>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{c.comentario}</p>
        </div>
      ))}
    </div>
  );
}
