import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { departamentosACargo, tieneRol } from '@/lib/roles';
import { DEPARTAMENTOS } from '@/lib/constants';
import { sanitizeText } from '@/lib/security';
import StatusBadge from '@/components/shared/StatusBadge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import HistorialPorUsuario from '@/components/inventario/HistorialPorUsuario';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, Send, ClipboardList, TrendingDown, PackageOpen, Megaphone, Clock, X, Eye, History } from 'lucide-react';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { notificarComentario } from '@/lib/notificationService';
import {
  DESTINOS_COMENTARIO, ROLES_DE_DESTINO, avisoDeComentario, nuevoComentario,
} from '@/lib/comentariosSupervision';

// Las pestañas trabajan con nombres de tabla; la API los expone por entidad.
const ENTIDAD_DE = {
  mermas:          'Merma',
  inventarios:     'Inventario',
  recepciones:     'Recepcion',
  anuncios_desact: 'AnuncioDesact',
  lotes_ic:        'LoteIC',
};

// ── Configuración de pestañas por departamento ────────────────
const DEPT_TABS = {
  inventario: [
    { key: 'inventarios', label: 'Inventarios', tabla: 'inventarios',    icon: ClipboardList },
    { key: 'mermas',      label: 'Mermas',      tabla: 'mermas',          icon: TrendingDown  },
    { key: 'recepciones', label: 'Recepciones', tabla: 'recepciones',     icon: PackageOpen   },
    // Sin tabla: no es una lista de tareas sino el historial de conteos de cada persona.
    { key: 'historial',   label: 'Historial por usuario', icon: History },
  ],
  facturacion: [
    { key: 'inventarios', label: 'Inventarios', tabla: 'inventarios',    icon: ClipboardList },
    { key: 'mermas',      label: 'Mermas',      tabla: 'mermas',          icon: TrendingDown  },
    // La revisión de los anuncios desactivados es de facturación.
    { key: 'anuncios',    label: 'Anuncios',    tabla: 'anuncios_desact', icon: Megaphone     },
  ],
  ca: [
    { key: 'anuncios',  label: 'Anuncios',  tabla: 'anuncios_desact', icon: Megaphone },
    { key: 'lotes_ic',  label: 'Lotes IC',  tabla: 'lotes_ic',        icon: Clock     },
  ],
};

// Columnas para extraer nombre, código, worker, fecha y estado de cada tabla
const TASK_COLS = {
  inventarios:     { name: 'producto_nombre', code: 'producto_codigo', worker: 'especialista_nombre',     date: 'fecha_inv',       status: 'estado_tarea' },
  mermas:          { name: 'producto_nombre', code: 'producto_codigo', worker: 'especialista_nombre',     date: 'fecha_inv',       status: 'estado_tarea' },
  recepciones:     { name: 'proveedor',       code: 'no_recepcion',   worker: 'especialista_nombre',     date: 'fecha',           status: 'estado'       },
  anuncios_desact: { name: 'producto_nombre', code: 'producto_codigo', worker: 'especialista_inv_nombre', date: 'fecha_inv',       status: 'estado_tarea' },
  lotes_ic:        { name: 'producto_nombre', code: 'producto_codigo', worker: 'especialista_inv_nombre', date: 'fecha_deteccion', status: 'estado_tarea' },
};

// Campos a mostrar en el panel de detalle por tabla
const DETAIL_FIELDS = {
  inventarios: [
    ['producto_nombre','Producto'], ['producto_codigo','Código'],
    ['exist_fisica_tkc','EF TKC'], ['conteo_real','Conteo real'],
    ['diferencia','Diferencia'], ['resultado','Resultado'],
    ['clasif_ajuste','Clasif. ajuste'], ['notas_inv','Notas INV'],
    ['especialista_nombre','Especialista'], ['fecha_inv','Fecha'],
    ['estado_tarea','Estado'], ['fact_no_factura','N° Factura'],
    ['fact_clasif','Clasif. FACT'], ['fact_notas','Notas FACT'],
    ['nota_auditor','Nota auditor'],
  ],
  mermas: [
    ['producto_nombre','Producto'], ['producto_codigo','Código'],
    ['cantidad','Cantidad'], ['clasif_merma','Clasificación'],
    ['precio_unitario','Precio unit.'], ['total_perdida','Total pérdida'],
    ['destino_final','Destino'], ['notas','Notas'],
    ['especialista_nombre','Especialista'], ['fecha_inv','Fecha'],
    ['estado_tarea','Estado'], ['fact_no_factura','N° Factura'],
    ['nota_auditor','Nota auditor'],
  ],
  recepciones: [
    ['no_recepcion','N° Recepción'], ['proveedor','Proveedor'],
    ['no_orden','N° Orden'], ['fecha','Fecha'],
    ['total_items','Total items'], ['items_confirmados','Confirmados'],
    ['estado','Estado'], ['especialista_nombre','Especialista'],
  ],
  anuncios_desact: [
    ['producto_nombre','Producto'], ['producto_codigo','Código'],
    ['tipo_caso','Tipo caso'], ['ef_al_detectar','EF al detectar'],
    ['motivo_tkc','Motivo TKC'], ['accion_inv','Acción FACT'],
    ['nota_inv','Nota FACT'], ['especialista_inv_nombre','Especialista FACT'],
    ['estado_tarea','Estado'], ['accion_ca','Acción CA'],
    ['nota_ca','Nota CA'], ['nota_auditor','Nota auditor'],
  ],
  lotes_ic: [
    ['producto_nombre','Producto'], ['producto_codigo','Código'],
    ['cant_x_vencer','Cant. x vencer'], ['precio_actual','Precio actual'],
    ['propuesta_precio_ic','Precio propuesto'], ['fecha_vencimiento','Fecha venc.'],
    ['clasif_inv','Clasif. INV'], ['nota_inv','Nota INV'],
    ['especialista_inv_nombre','Especialista'], ['estado_tarea','Estado'],
  ],
};

// ── Componente principal ──────────────────────────────────────
export default function Supervision() {
  const { user } = useAuth();

  // Los departamentos que dirige, de sus roles de jefe: `jefe_facturacion` es jefe
  // de Facturación. Un administrador puede mirar cualquiera.
  const suyos = departamentosACargo(user);
  const esAdmin = tieneRol(user, ['administrador']);
  const defaultDept = suyos[0] || 'inventario';
  const elegibles = esAdmin ? Object.entries(DEPARTAMENTOS) : Object.entries(DEPARTAMENTOS).filter(([k]) => suyos.includes(k));

  const [viewDept, setViewDept]     = useState(defaultDept);
  const [activeTab, setActiveTab]   = useState(() => DEPT_TABS[defaultDept]?.[0]?.key || 'inventarios');
  const [selectedId, setSelectedId] = useState(null);
  const [comment, setComment]       = useState('');
  // A qué departamento va el comentario: sin elegirlo no se envía, porque un
  // comentario sin destinatario no le llega a nadie.
  const [para, setPara]             = useState('');

  const tabs      = DEPT_TABS[viewDept] || DEPT_TABS.inventario;
  const activeTabCfg = tabs.find(t => t.key === activeTab) || tabs[0];
  const tabla     = activeTabCfg?.tabla;
  const cols      = TASK_COLS[tabla] || {};
  const fields    = DETAIL_FIELDS[tabla] || [];

  const handleDeptChange = (d) => {
    setViewDept(d);
    const newTabs = DEPT_TABS[d] || DEPT_TABS.inventario;
    setActiveTab(newTabs[0]?.key || '');
    setSelectedId(null);
    setComment('');
  };

  const handleTabChange = (v) => {
    setActiveTab(v);
    setSelectedId(null);
    setComment('');
  };

  // ── Tareas del módulo activo ──
  const { data: tasksRaw, isLoading } = useQuery({
    queryKey: ['supervision-tasks', tabla],
    queryFn: async () => {
      if (!tabla) return [];
      return base44.entities[ENTIDAD_DE[tabla]].list('-created_date', 150);
    },
    enabled: !!tabla,
  });
  const tasks = tasksRaw ?? [];

  // ── Comentarios del registro seleccionado ──
  const { data: commentsRaw, refetch: refetchComments } = useQuery({
    queryKey: ['supervision-comments', tabla, selectedId],
    queryFn: async () => {
      if (!tabla || !selectedId) return [];
      const data = await base44.entities.ComentarioSupervision.filter(
        { tabla, registro_id: selectedId }, 'created_date',
      );
      return data ?? [];
    },
    enabled: !!selectedId && !!tabla,
  });
  const comments = commentsRaw ?? [];

  const selected = tasks.find(t => t.id === selectedId);

  // ── Agregar comentario ──
  const addCommentMut = useMutation({
    mutationFn: async (text) => {
      const texto = sanitizeText(text, 1000);
      await base44.entities.ComentarioSupervision.create(nuevoComentario({
        tabla, registroId: selectedId, usuario: user, para, texto,
      }));
      // El aviso al departamento. Que falle no deshace el comentario, que ya
      // está guardado y lo verá igual dentro del registro.
      const aviso = avisoDeComentario({
        tabla, registroId: selectedId, autor: user.full_name || user.email, para,
        producto: selected?.[cols.name], texto,
      });
      await notificarComentario({
        para, roles: ROLES_DE_DESTINO[para] ?? [], autor: user.email, ...aviso,
      }).catch(() => {});
    },
    onSuccess: () => { setComment(''); refetchComments(); },
  });

  // Estadísticas rápidas de tareas activas
  const stats = {
    total:      tasks.length,
    en_curso:   tasks.filter(t => t[cols.status] === 'en_curso').length,
    pendientes: tasks.filter(t => ['pendiente','pend_fact','pend_ca'].includes(t[cols.status])).length,
    devueltos:  tasks.filter(t => t[cols.status] === 'devuelto').length,
    completados:tasks.filter(t => t[cols.status] === 'completado').length,
  };

  const pestanasNodo = (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList>
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <TabsTrigger key={t.key} value={t.key} className="text-xs gap-1.5">
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg" style={{ background: 'color-mix(in srgb, #6366F1 12%, transparent)' }}>
            <Eye className="w-5 h-5" style={{ color: '#6366F1' }} />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-medium">Supervisión</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {DEPARTAMENTOS[viewDept] || viewDept}
            </p>
          </div>
        </div>
        {elegibles.length > 1 && (
          <Select value={viewDept} onValueChange={handleDeptChange}>
            <SelectTrigger className="w-[150px] h-9 text-xs" style={{ borderRadius: 'var(--r-ctl)' }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {elegibles.map(([k, v]) => (
                <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* KPIs */}
      {activeTabCfg?.key !== 'historial' && (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',      value: stats.total,      color: 'text-foreground' },
          { label: 'En curso',   value: stats.en_curso,   color: 'text-[var(--c-info)]' },
          { label: 'Pendientes', value: stats.pendientes, color: 'text-[var(--c-warn)]' },
          { label: 'Devueltos',  value: stats.devueltos,  color: 'text-[var(--c-bad)]' },
        ].map(s => (
          <Card key={s.label} className="px-4 py-3" style={{ borderRadius: 'var(--r-card)', borderWidth: '0.5px' }}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
            <p className={`text-2xl font-semibold mt-1 ${s.color}`}>{s.value}</p>
          </Card>
        ))}
      </div>
      )}

      {activeTabCfg?.key !== 'historial' && pestanasNodo}

      {activeTabCfg?.key === 'historial' ? (
        // Quien supervisa elige de quién mirar los conteos.
        // Las tarjetas van antes de las pestañas, como en el resto de la pantalla:
        // las pone el propio historial y recibe las pestañas para ponerlas debajo.
        <HistorialPorUsuario user={user} vistaGlobal embebido pestanas={pestanasNodo} />
      ) : (
      <>
      {/* Layout: lista + panel de detalle */}
      <div className={selected ? 'grid gap-4 lg:grid-cols-[1fr_380px]' : ''}>

        {/* Lista de tareas */}
        <Card style={{ borderRadius: 'var(--r-card)', borderWidth: '0.5px' }} className="overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-14">
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="py-14 text-center text-sm text-muted-foreground">Sin tareas en este módulo</div>
          ) : (
            <div className="divide-y overflow-y-auto" style={{ maxHeight: 'calc(100vh - 340px)' }}>
              {tasks.map(task => {
                const statusVal = task[cols.status] || '';
                const dateVal   = task[cols.date];
                return (
                  <button
                    key={task.id}
                    className={`w-full text-left px-4 py-3 transition-colors hover:bg-secondary/50
                      ${selectedId === task.id ? 'bg-secondary/70' : ''}`}
                    onClick={() => setSelectedId(selectedId === task.id ? null : task.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {task[cols.name] || '—'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {task[cols.code] && (
                            <span className="font-mono mr-2">{task[cols.code]}</span>
                          )}
                          {task[cols.worker] && <span>{task[cols.worker]}</span>}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <StatusBadge status={statusVal} />
                        {dateVal && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {format(new Date(dateVal), 'dd/MM/yy')}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* Panel de detalle */}
        {selected && (
          <div className="space-y-4">

            {/* Campos del registro */}
            <Card style={{ borderRadius: 'var(--r-card)', borderWidth: '0.5px' }} className="overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between"
                   style={{ borderBottom: '0.5px solid hsl(var(--border))' }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Detalle del registro
                </p>
                <button
                  onClick={() => setSelectedId(null)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-3 overflow-y-auto" style={{ maxHeight: '320px' }}>
                {fields.map(([key, label]) => {
                  const val = selected[key];
                  if (val === undefined || val === null || val === '') return null;
                  return (
                    <div key={key}>
                      <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
                      <p className="text-sm font-medium text-foreground break-words">{String(val)}</p>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Comentarios */}
            <Card style={{ borderRadius: 'var(--r-card)', borderWidth: '0.5px' }} className="overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-2"
                   style={{ borderBottom: '0.5px solid hsl(var(--border))' }}>
                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Comentarios ({comments.length})
                </p>
              </div>
              <div className="p-4 space-y-3">
                {comments.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">Sin comentarios — sé el primero en comentar.</p>
                )}
                {comments.map(c => (
                  <div key={c.id} className="rounded-lg p-3" style={{ background: 'hsl(var(--secondary) / 0.5)' }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-semibold text-foreground flex flex-wrap items-center gap-x-2">
                        {c.autor_nombre}
                        {c.para_depto
                          ? (
                            <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                              para {DESTINOS_COMENTARIO[c.para_depto] ?? c.para_depto}
                            </span>
                          )
                          : <span className="text-[10px] font-normal text-muted-foreground">sin destinatario</span>}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {format(new Date(c.created_date), 'dd/MM/yy HH:mm')}
                      </p>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{c.comentario}</p>
                  </div>
                ))}

                {/* A quién va. Es lo que decide quién lo recibe y quién lo ve. */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">Para</span>
                  <Select value={para} onValueChange={setPara}>
                    <SelectTrigger className="h-8 w-[190px] text-xs" aria-label="Para" style={{ borderRadius: 'var(--r-ctl)' }}>
                      <SelectValue placeholder="Elige un departamento" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(DESTINOS_COMENTARIO).map(([k, v]) => (
                        <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Input de nuevo comentario */}
                <div className="flex gap-2">
                  <Textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder={para ? `Escribe un comentario para ${DESTINOS_COMENTARIO[para]}...` : 'Elige para quién es y escribe tu comentario...'}
                    className="text-sm resize-none flex-1"
                    style={{ borderRadius: 'var(--r-ctl)', minHeight: '68px' }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && e.ctrlKey && comment.trim() && para) {
                        addCommentMut.mutate(comment.trim());
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    disabled={!comment.trim() || !para || addCommentMut.isPending}
                    aria-label="Enviar comentario"
                    onClick={() => addCommentMut.mutate(comment.trim())}
                    className="self-end"
                    style={{ borderRadius: 'var(--r-ctl)' }}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {para
                    ? `Le llegará un aviso a ${DESTINOS_COMENTARIO[para]}, y lo verá dentro del registro. `
                    : 'Sin elegir un destinatario no se puede enviar. '}
                  Ctrl + Enter para enviar
                </p>
              </div>
            </Card>

          </div>
        )}
      </div>
      </>
      )}

    </div>
  );
}
