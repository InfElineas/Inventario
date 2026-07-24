import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { DEPARTAMENTOS } from '@/lib/constants';
import { sanitizeText } from '@/lib/security';
import AccessDenied from '@/components/shared/AccessDenied';
import StatusBadge from '@/components/shared/StatusBadge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, Send, ClipboardList, TrendingDown, PackageOpen, Megaphone, Clock, X, Eye } from 'lucide-react';
import { format } from 'date-fns';

// ── Configuración de pestañas por departamento ────────────────
const DEPT_TABS = {
  inventario: [
    { key: 'inventarios', label: 'Inventarios', tabla: 'inventarios',    icon: ClipboardList },
    { key: 'mermas',      label: 'Mermas',      tabla: 'mermas',          icon: TrendingDown  },
    { key: 'recepciones', label: 'Recepciones', tabla: 'recepciones',     icon: PackageOpen   },
  ],
  facturacion: [
    { key: 'inventarios', label: 'Inventarios', tabla: 'inventarios',    icon: ClipboardList },
    { key: 'mermas',      label: 'Mermas',      tabla: 'mermas',          icon: TrendingDown  },
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
    ['motivo_tkc','Motivo TKC'], ['accion_inv','Acción INV'],
    ['nota_inv','Nota INV'], ['especialista_inv_nombre','Especialista INV'],
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
  const role = user?.role;

  const defaultDept = role === 'jefe_depto' ? (user?.departamento || 'inventario') : 'inventario';

  const [viewDept, setViewDept]     = useState(defaultDept);
  const [activeTab, setActiveTab]   = useState(() => DEPT_TABS[defaultDept]?.[0]?.key || 'inventarios');
  const [selectedId, setSelectedId] = useState(null);
  const [comment, setComment]       = useState('');

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
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['supervision-tasks', tabla],
    queryFn: async () => {
      if (!tabla) return [];
      const { data } = await supabase
        .from(tabla)
        .select('*')
        .order('created_date', { ascending: false })
        .limit(150);
      return data ?? [];
    },
    enabled: !!tabla,
  });

  // ── Comentarios del registro seleccionado ──
  const { data: comments = [], refetch: refetchComments } = useQuery({
    queryKey: ['supervision-comments', tabla, selectedId],
    queryFn: async () => {
      if (!tabla || !selectedId) return [];
      const { data } = await supabase
        .from('comentarios_supervision')
        .select('*')
        .eq('tabla', tabla)
        .eq('registro_id', selectedId)
        .order('created_date', { ascending: true });
      return data ?? [];
    },
    enabled: !!selectedId && !!tabla,
  });

  // ── Agregar comentario ──
  const addCommentMut = useMutation({
    mutationFn: async (text) => {
      const { error } = await supabase.from('comentarios_supervision').insert({
        tabla,
        registro_id:  selectedId,
        autor_id:     user.email,
        autor_nombre: user.full_name || user.email,
        comentario:   sanitizeText(text, 1000),
      });
      if (error) throw error;
    },
    onSuccess: () => { setComment(''); refetchComments(); },
  });

  const selected = tasks.find(t => t.id === selectedId);

  // Estadísticas rápidas de tareas activas
  const stats = {
    total:      tasks.length,
    en_curso:   tasks.filter(t => t[cols.status] === 'en_curso').length,
    pendientes: tasks.filter(t => ['pendiente','pend_fact','pend_ca'].includes(t[cols.status])).length,
    devueltos:  tasks.filter(t => t[cols.status] === 'devuelto').length,
    completados:tasks.filter(t => t[cols.status] === 'completado').length,
  };

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: 'color-mix(in srgb, #6366F1 12%, transparent)' }}>
            <Eye className="w-5 h-5" style={{ color: '#6366F1' }} />
          </div>
          <div>
            <h1 className="text-xl font-medium">Supervisión</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {DEPARTAMENTOS[viewDept] || viewDept}
            </p>
          </div>
        </div>
        {role === 'administrador' && (
          <Select value={viewDept} onValueChange={handleDeptChange}>
            <SelectTrigger className="w-52 h-8 text-xs" style={{ borderRadius: '8px' }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DEPARTAMENTOS).map(([k, v]) => (
                <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',      value: stats.total,      color: 'text-foreground' },
          { label: 'En curso',   value: stats.en_curso,   color: 'text-[#378ADD]' },
          { label: 'Pendientes', value: stats.pendientes, color: 'text-[#BA7517]' },
          { label: 'Devueltos',  value: stats.devueltos,  color: 'text-[#E24B4A]' },
        ].map(s => (
          <Card key={s.label} className="px-4 py-3" style={{ borderRadius: '10px', borderWidth: '0.5px' }}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
            <p className={`text-2xl font-semibold mt-1 ${s.color}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Tabs de módulos */}
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

      {/* Layout: lista + panel de detalle */}
      <div className={selected ? 'grid gap-4 lg:grid-cols-[1fr_380px]' : ''}>

        {/* Lista de tareas */}
        <Card style={{ borderRadius: '12px', borderWidth: '0.5px' }} className="overflow-hidden">
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
                      <div className="flex-shrink-0 text-right">
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
            <Card style={{ borderRadius: '12px', borderWidth: '0.5px' }} className="overflow-hidden">
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
            <Card style={{ borderRadius: '12px', borderWidth: '0.5px' }} className="overflow-hidden">
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
                      <p className="text-xs font-semibold text-foreground">{c.autor_nombre}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {format(new Date(c.created_date), 'dd/MM/yy HH:mm')}
                      </p>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{c.comentario}</p>
                  </div>
                ))}

                {/* Input de nuevo comentario */}
                <div className="flex gap-2 pt-1">
                  <Textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Escribe un comentario para tu equipo..."
                    className="text-sm resize-none flex-1"
                    style={{ borderRadius: '8px', minHeight: '68px' }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && e.ctrlKey && comment.trim()) {
                        addCommentMut.mutate(comment.trim());
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    disabled={!comment.trim() || addCommentMut.isPending}
                    onClick={() => addCommentMut.mutate(comment.trim())}
                    className="self-end"
                    style={{ borderRadius: '8px' }}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">Ctrl + Enter para enviar</p>
              </div>
            </Card>

          </div>
        )}
      </div>

    </div>
  );
}
