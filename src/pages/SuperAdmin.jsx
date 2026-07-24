import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ROLES, DEPARTAMENTOS } from '@/lib/constants';
import { useConfirm } from '@/lib/useConfirm';
import { fetchAlmacenes } from '@/services/syncService';
import { useSyncManager } from '@/lib/SyncContext';
import {
  Crown, Users, Activity, ShieldCheck, RefreshCw, Search,
  Trash2, Plus, UserCheck, Clock, Database, AlertTriangle,
  Wrench, Zap, CheckCircle, XCircle, Loader2, Send, Bell,
  BarChart3, HardDrive, ArrowRight, FileSearch, ChevronDown,
  ChevronRight, Copy, Info, Lightbulb, Bug, Upload,
} from 'lucide-react';
import TabImportar from '@/components/import/TabImportar';

const TABS = [
  { key: 'sistema',       label: 'Sistema',         icon: Activity   },
  { key: 'diagnostico',   label: 'Diagnóstico',      icon: Wrench     },
  { key: 'sincronizacion',label: 'Sincronización',   icon: Zap        },
  { key: 'logs_sync',     label: 'Logs Sync',        icon: FileSearch },
  { key: 'importar',      label: 'Importar',         icon: Upload     },
  { key: 'mantenimiento', label: 'Mantenimiento',    icon: HardDrive  },
  { key: 'usuarios',      label: 'Usuarios',         icon: Users      },
  { key: 'auditoria',     label: 'Auditoría',        icon: ShieldCheck},
];

const fmt = (iso) => iso ? new Date(iso).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '—';

// ── Helpers compartidos ───────────────────────────────────────
function StatusChip({ ok, label }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
      ok ? 'bg-[#4ade80]/10 text-[#4ade80]' : 'bg-[#e24b4a]/10 text-[#e24b4a]'
    }`}>
      {ok ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </span>
  );
}

// ── Tab Sistema ───────────────────────────────────────────────
function TabSistema() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['sa-sistema'],
    queryFn: async () => {
      const [
        { count: productos }, { count: usuarios }, { count: mermas },
        { count: inventarios }, { count: recepciones }, { count: notificaciones },
        { count: workflow_eventos }, { data: syncErrors }, { data: lastActivity },
        { data: pendientes },
      ] = await Promise.all([
        supabase.from('productos').select('*', { count: 'exact', head: true }),
        supabase.from('usuarios').select('*', { count: 'exact', head: true }).eq('activo', true),
        supabase.from('mermas').select('*', { count: 'exact', head: true }),
        supabase.from('inventarios').select('*', { count: 'exact', head: true }),
        supabase.from('recepciones').select('*', { count: 'exact', head: true }),
        supabase.from('notificaciones').select('*', { count: 'exact', head: true }).eq('leida', false),
        supabase.from('workflow_eventos').select('*', { count: 'exact', head: true }),
        supabase.from('notificaciones').select('mensaje, created_date').eq('es_error', true).eq('link', '/bd-tkc').order('created_date', { ascending: false }).limit(5),
        supabase.from('workflow_eventos').select('actor_id, actor_nombre, actor_rol, estado_nuevo, tabla, created_at').order('created_at', { ascending: false }).limit(8),
        supabase.from('mermas').select('id', { count: 'exact', head: true }).in('estado_tarea', ['pend_fact', 'en_auditoria', 'reconteo_solicitado']),
      ]);
      return { productos, usuarios, mermas, inventarios, recepciones, notificaciones, workflow_eventos, syncErrors: syncErrors ?? [], lastActivity: lastActivity ?? [], pendientes };
    },
  });

  const kpis = data ? [
    { label: 'Productos',       value: data.productos,        color: '#4ade80' },
    { label: 'Usuarios activos',value: data.usuarios,         color: '#60a5fa' },
    { label: 'Mermas',          value: data.mermas,           color: '#fb923c' },
    { label: 'Inventarios',     value: data.inventarios,      color: '#a78bfa' },
    { label: 'Recepciones',     value: data.recepciones,      color: '#f472b6' },
    { label: 'Notif. no leídas',value: data.notificaciones,   color: '#facc15' },
    { label: 'Eventos audit',   value: data.workflow_eventos, color: '#34d399' },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Estado general del sistema</p>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} style={{ borderRadius: '8px' }}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} /> Actualizar
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {isLoading ? Array(7).fill(0).map((_, i) => <div key={i} className="h-20 rounded-xl border border-border bg-card animate-pulse" />) :
          kpis.map(k => (
            <div key={k.label} className="p-3 rounded-xl border border-border bg-card space-y-1.5">
              <p className="text-[10px] text-muted-foreground">{k.label}</p>
              <p className="text-xl font-bold" style={{ color: k.color }}>{k.value?.toLocaleString() ?? '—'}</p>
            </div>
          ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-[#e24b4a]" />Errores de sync recientes</p>
          {!data?.syncErrors.length ? <p className="text-sm text-muted-foreground">Sin errores registrados.</p> :
            data.syncErrors.map((e, i) => {
              let p = {}; try { const parsed = JSON.parse(e.mensaje); if (parsed._type === 'sync_errors') p = parsed; } catch {}
              return (
                <div key={i} className="flex justify-between p-3 mb-2 rounded-lg border border-[#e24b4a]/20 bg-[#e24b4a]/5" style={{ borderRadius: '8px' }}>
                  <div>
                    <p className="text-xs font-medium text-[#e24b4a]">Almacén {p.almacen || '—'} · {p.fallidos || 0} fallos</p>
                    {p.muestra?.slice(0, 1).map((m, j) => <p key={j} className="text-[10px] text-muted-foreground mt-0.5">• {m.msg?.slice(0, 70)}</p>)}
                  </div>
                  <p className="text-[10px] text-muted-foreground ml-2">{fmt(e.created_date)}</p>
                </div>
              );
            })}
        </div>
        <div>
          <p className="text-sm font-medium mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-[#60a5fa]" />Actividad reciente</p>
          {data?.lastActivity.map((e, i) => (
            <div key={i} className="flex justify-between p-3 mb-1.5 rounded-lg border border-border bg-card" style={{ borderRadius: '8px' }}>
              <div>
                <p className="text-xs font-medium">{e.actor_nombre || e.actor_id}</p>
                <p className="text-[10px] text-muted-foreground">{e.tabla} → <span className="text-foreground">{e.estado_nuevo}</span></p>
              </div>
              <p className="text-[10px] text-muted-foreground">{fmt(e.created_at)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Tab Diagnóstico ───────────────────────────────────────────
function TabDiagnostico() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['sa-diagnostico'],
    queryFn: async () => {
      // Verificar seleccionando columnas específicas — si la columna/tabla no existe, da error
      const ok = async (fn) => { try { await fn(); return true; } catch { return false; } };
      const noErr = async (fn) => { const { error } = await fn(); return !error; };

      const [
        v11_tabla, v11_cols,
        v13_col,
        v16_tabla,
        v19_superadmin,
        v20_link, v20_eserror,
      ] = await Promise.all([
        // v11: tabla sync_auto_log
        noErr(() => supabase.from('sync_auto_log').select('user_email').limit(1)),
        // v11: columnas synced y errors
        noErr(() => supabase.from('sync_auto_log').select('synced, errors').limit(1)),
        // v13: columna mermas.almacen_num
        noErr(() => supabase.from('mermas').select('almacen_num').limit(1)),
        // v16: tabla workflow_eventos
        noErr(() => supabase.from('workflow_eventos').select('tabla, estado_nuevo, actor_id').limit(1)),
        // v19: rol superadmin existe en la tabla usuarios
        noErr(() => supabase.from('usuarios').select('id').eq('role', 'superadmin').limit(1)),
        // v20: columna notificaciones.link
        noErr(() => supabase.from('notificaciones').select('link').limit(1)),
        // v20: columna notificaciones.es_error
        noErr(() => supabase.from('notificaciones').select('es_error').limit(1)),
      ]);

      return { v11_tabla, v11_cols, v13_col, v16_tabla, v19_superadmin, v20_link, v20_eserror };
    },
  });

  const checks = data ? [
    { label: 'Tabla sync_auto_log',              ok: data.v11_tabla,       migration: 'migration_v11_sync_auto.sql'        },
    { label: 'Columnas synced/errors en sync_auto_log', ok: data.v11_cols, migration: 'migration_v11_sync_auto.sql'        },
    { label: 'Columna mermas.almacen_num',        ok: data.v13_col,        migration: 'migration_v13_mermas_almacen.sql'   },
    { label: 'Tabla workflow_eventos',            ok: data.v16_tabla,      migration: 'migration_v16_workflow_eventos.sql' },
    { label: 'Rol superadmin configurado',        ok: data.v19_superadmin, migration: 'migration_v19_superadmin.sql'       },
    { label: 'Columna notificaciones.link',       ok: data.v20_link,       migration: 'migration_v20_notif_link.sql'       },
    { label: 'Columna notificaciones.es_error',   ok: data.v20_eserror,    migration: 'migration_v20_notif_link.sql'       },
  ] : [];

  const allOk = checks.every(c => c.ok);
  const failCount = checks.filter(c => !c.ok).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">Estado de migraciones y estructura de BD</p>
          {!isLoading && (allOk
            ? <StatusChip ok label="Todo en orden" />
            : <StatusChip ok={false} label={`${failCount} pendiente${failCount > 1 ? 's' : ''}`} />
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} style={{ borderRadius: '8px' }}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} /> Verificar
        </Button>
      </div>

      <Card style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
        <div className="divide-y divide-border">
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground">Verificando...</div>
          ) : checks.map((c, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                {c.ok
                  ? <CheckCircle className="w-4 h-4 text-[#4ade80] flex-shrink-0" />
                  : <XCircle    className="w-4 h-4 text-[#e24b4a] flex-shrink-0" />
                }
                <div>
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-xs text-muted-foreground">Migration: {c.migration}</p>
                </div>
              </div>
              <StatusChip ok={c.ok} label={c.ok ? 'Aplicada' : 'Faltante'} />
            </div>
          ))}
        </div>
      </Card>

      {!isLoading && !allOk && (
        <div className="p-4 rounded-lg border border-[#e24b4a]/30 bg-[#e24b4a]/5" style={{ borderRadius: '8px' }}>
          <p className="text-sm font-medium text-[#e24b4a] mb-1">Migraciones pendientes</p>
          <p className="text-xs text-muted-foreground">
            Ejecuta los archivos indicados en el SQL Editor de la BD local en orden numérico.
          </p>
        </div>
      )}

      {/* Objetos que requieren verificación manual vía SQL */}
      <div>
        <p className="text-sm font-medium mb-3 flex items-center gap-2">
          <Database className="w-4 h-4 text-muted-foreground" />
          Verificaciones manuales (requieren SQL Editor)
        </p>
        <div className="text-xs text-muted-foreground space-y-1.5 p-4 rounded-lg border border-border bg-card" style={{ borderRadius: '8px' }}>
          <p className="font-medium text-foreground mb-2">Ejecuta en el SQL Editor para verificar:</p>
          <pre className="text-[10px] bg-secondary/50 p-3 rounded overflow-x-auto" style={{ borderRadius: '6px' }}>{`-- Índice único de productos (creado manualmente)
SELECT indexname FROM pg_indexes
WHERE tablename='productos' AND indexname='productos_almacen_codigo_unique';

-- Trigger de stock en mermas (v14/v15/v17)
SELECT tgname FROM pg_trigger WHERE tgname='trg_merma_stock_check';

-- Políticas delete superadmin (v18/v19)
SELECT policyname FROM pg_policies
WHERE tablename IN ('mermas','inventarios') AND policyname LIKE 'superadmin%';`}</pre>
        </div>
      </div>
    </div>
  );
}

// ── Tab Sincronización ────────────────────────────────────────
function TabSincronizacion() {
  const { isRunning, syncState, syncOne, syncAll, lastResults } = useSyncManager();

  const { data: syncLog = [] } = useQuery({
    queryKey: ['sa-sync-log'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sync_auto_log')
        .select('*')
        .order('synced_at', { ascending: false })
        .limit(100);
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  const { data: almacenes = [] } = useQuery({
    queryKey: ['sa-almacenes'],
    queryFn: () => fetchAlmacenes(),
  });

  const { data: schedules = [] } = useQuery({
    queryKey: ['sa-schedules'],
    queryFn: async () => {
      const { data } = await supabase
        .from('usuarios')
        .select('email, full_name, sync_config')
        .eq('activo', true)
        .filter('sync_config->>auto_sync', 'eq', 'true');
      return data ?? [];
    },
  });


  const groupedLog = syncLog.reduce((acc, row) => {
    if (!acc[row.almacen]) acc[row.almacen] = row;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Schedules activos */}
      <div>
        <p className="text-sm font-medium mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#60a5fa]" /> Sincronización automática activa
        </p>
        {!schedules.length ? (
          <p className="text-sm text-muted-foreground">Ningún usuario tiene sync automático activado.</p>
        ) : (
          <div className="space-y-2">
            {schedules.map(u => (
              <div key={u.email} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card" style={{ borderRadius: '8px' }}>
                <div>
                  <p className="text-xs font-medium">{u.full_name || u.email}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Horarios: {(u.sync_config?.horarios || []).join(', ') || '—'} ·
                    Almacenes: {(u.sync_config?.almacenes_sync || []).length || 'todos'}
                  </p>
                </div>
                <StatusChip ok label="Activo" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sync manual por almacén */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#4ade80]" /> Sync manual por almacén
          </p>
          <button
            onClick={() => syncAll(almacenes)}
            disabled={isRunning || !almacenes.length}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50
              bg-[#4ade80]/10 hover:bg-[#4ade80]/20 text-[#4ade80] border-[#4ade80]/20"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunning && syncState?.type === 'all' ? 'animate-spin' : ''}`} />
            {isRunning && syncState?.type === 'all'
              ? `${syncState.idx + 1} / ${almacenes.length} almacenes…`
              : `Sincronizar todos (${almacenes.length})`}
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {almacenes.slice(0, 20).map(alm => {
            const result  = lastResults[alm];
            const loading = isRunning && syncState?.current === alm;
            const log     = groupedLog[alm];
            return (
              <div key={alm} className="p-3 rounded-lg border border-border bg-card space-y-2" style={{ borderRadius: '8px' }}>
                <div className="flex justify-between items-center">
                  <p className="text-xs font-medium">Almacén {alm}</p>
                  {result && <StatusChip ok={result.ok} label={result.ok ? `${result.synced} sync` : 'Error'} />}
                </div>
                {log && <p className="text-[10px] text-muted-foreground">Último: {fmt(log.synced_at)}</p>}
                {result?.ok === false && <p className="text-[10px] text-[#e24b4a] line-clamp-2">{result.msg}</p>}
                <Button
                  size="sm" className="w-full h-7 text-xs"
                  variant="outline"
                  disabled={isRunning}
                  onClick={() => syncOne(alm)}
                  style={{ borderRadius: '6px' }}
                >
                  {loading ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Sincronizando</> : <><RefreshCw className="w-3 h-3 mr-1" />Sincronizar</>}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Log reciente */}
      <div>
        <p className="text-sm font-medium mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#a78bfa]" /> Log de sincronizaciones ({syncLog.length})
        </p>
        <Card style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card border-b">
                <tr>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Usuario</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Almacén</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">Sync</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">Errores</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {!syncLog.length ? (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Sin registros</td></tr>
                ) : syncLog.map((r, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-accent/30">
                    <td className="p-3 text-xs">{r.user_email}</td>
                    <td className="p-3 text-xs font-medium">Almacén {r.almacen}</td>
                    <td className="p-3 text-xs text-right text-[#4ade80]">{r.synced ?? '—'}</td>
                    <td className="p-3 text-xs text-right text-[#e24b4a]">{r.errors || 0}</td>
                    <td className="p-3 text-xs text-muted-foreground">{fmt(r.synced_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Catálogo de causas conocidas ─────────────────────────────
const ERROR_CATALOG = [
  {
    patron: 'duplicado',
    titulo: 'Producto duplicado (violates unique constraint)',
    causa: 'invGlobal contiene más de una fila con el mismo IdTienda o Cód. Prod. dentro del mismo almacén.',
    porque: 'La BD local impone un índice único (almacen_num, id_tienda) y (almacen_num, codigo_producto). La función sync_producto hace ON CONFLICT sobre esa clave — si dos filas en invGlobal tienen el mismo par, la segunda falla porque no hay un valor único para hacer upsert.',
    solucion: 'Identifica los duplicados en invGlobal desde el SQL Editor de la BD externa. Coordina con el equipo de TKC para depurar la fuente. Mientras tanto, el producto ya está guardado (del primer registro), solo falla el segundo.',
    sql_diagnostico: `-- Ejecutar en BD EXTERNA (SQL Editor de Supabase externa)\nSELECT "No. Almacén", "IdTienda", COUNT(*) AS duplicados\nFROM "invGlobal"\nGROUP BY "No. Almacén", "IdTienda"\nHAVING COUNT(*) > 1\nORDER BY duplicados DESC, "No. Almacén";`,
    sql_local: `-- Verificar en BD LOCAL si el producto ya existe\nSELECT almacen_num, id_tienda, codigo_producto, nombre\nFROM productos\nWHERE almacen_num = '<ALMACEN>'\nORDER BY id_tienda;`,
    impacto: 'bajo',
    accion: 'El primer registro se guarda correctamente. El error es el segundo intento de insertar el mismo producto. Los datos NO se pierden.',
  },
  {
    patron: 'obligatorio',
    titulo: 'Campo obligatorio faltante (null value / not-null constraint)',
    causa: 'El registro en invGlobal no tiene valor en el campo Cód. Prod. o Nombre, que son requeridos en la BD local.',
    porque: 'La BD local exige código y nombre no nulos. Si invGlobal tiene filas con esos campos vacíos o nulos, el mapeo produce null y el insert es rechazado.',
    solucion: 'Revisar en invGlobal los registros sin código de producto o sin nombre. Filtrar con: WHERE "Cód. Prod." IS NULL OR "Nombre" IS NULL.',
    sql_diagnostico: `-- Ejecutar en BD EXTERNA\nSELECT "No. Almacén", "IdTienda", "Cód. Prod.", "Nombre"\nFROM "invGlobal"\nWHERE "No. Almacén" = '<ALMACEN>'\n  AND ("Cód. Prod." IS NULL OR "Nombre" IS NULL OR trim("Cód. Prod.") = '');`,
    sql_local: null,
    impacto: 'medio',
    accion: 'Corregir en el sistema fuente (TKC) los registros sin código o nombre, luego re-sincronizar.',
  },
  {
    patron: 'acceso',
    titulo: 'Acceso denegado / credenciales (HTTP 4xx)',
    causa: 'La clave API de la BD externa está expirada, revocada o incorrecta.',
    porque: 'Supabase devuelve 401/403 cuando la anon key no tiene permisos sobre la tabla invGlobal, o cuando la clave fue rotada.',
    solucion: 'Verifica VITE_SUPABASE_EXTERNA_ANON_KEY en el archivo .env. Confirma en Supabase externa → Settings → API que la clave sigue activa y tiene acceso a invGlobal.',
    sql_diagnostico: null,
    sql_local: null,
    impacto: 'critico',
    accion: 'Actualizar la clave en .env y reiniciar la app. Si el problema persiste, revisar las políticas RLS en la BD externa.',
  },
  {
    patron: 'conexion',
    titulo: 'Error de conexión / timeout',
    causa: 'La BD externa no respondió dentro del tiempo límite, o no hay conectividad.',
    porque: 'El fetch de invGlobal se hace sin reintentos automáticos. Una conexión lenta o inestable aborta la descarga parcialmente.',
    solucion: 'Volver a lanzar la sincronización del almacén afectado. Si el error persiste, verificar conectividad y el estado de Supabase externa.',
    sql_diagnostico: null,
    sql_local: null,
    impacto: 'bajo',
    accion: 'Reintentar sync. Los productos ya guardados no se duplican (upsert). Solo fallaron los que no alcanzaron a procesarse.',
  },
];

function impactoColor(imp) {
  if (imp === 'critico') return { bg: 'bg-[#e24b4a]/10', border: 'border-[#e24b4a]/30', text: 'text-[#e24b4a]', badge: 'bg-[#e24b4a]/10 text-[#e24b4a]' };
  if (imp === 'medio')   return { bg: 'bg-[#ba7517]/10', border: 'border-[#ba7517]/30', text: 'text-[#ba7517]', badge: 'bg-[#ba7517]/10 text-[#ba7517]' };
  return { bg: 'bg-secondary/50', border: 'border-border', text: 'text-muted-foreground', badge: 'bg-secondary text-muted-foreground' };
}

function SqlBlock({ code }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div className="relative">
      <pre className="text-[10px] bg-secondary/70 p-3 rounded-lg overflow-x-auto leading-relaxed" style={{ borderRadius: '6px' }}>{code}</pre>
      <button onClick={copy} className="absolute top-2 right-2 p-1 rounded opacity-60 hover:opacity-100 transition-opacity bg-background border border-border">
        <Copy className="w-3 h-3" />
      </button>
      {copied && <span className="absolute top-2 right-7 text-[10px] text-[#4ade80]">¡Copiado!</span>}
    </div>
  );
}

// ── Tab Logs Sync ─────────────────────────────────────────────
function TabLogsSinc() {
  const [filtroAlmacen, setFiltroAlmacen] = useState('all');
  const [filtroError, setFiltroError]     = useState('all');
  const [expandedRows, setExpandedRows]   = useState(new Set());
  const [expandedCausa, setExpandedCausa] = useState(null);
  const [searchQ, setSearchQ]             = useState('');

  const { data: rawLogs = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['sa-logs-sync'],
    queryFn: async () => {
      const { data } = await supabase
        .from('notificaciones')
        .select('mensaje, created_date')
        .eq('es_error', true)
        .eq('link', '/bd-tkc')
        .order('created_date', { ascending: false })
        .limit(500);
      return data ?? [];
    },
  });

  // Parsear y aplanar todos los errores (usa `failures` completo si existe, sino `muestra`)
  const logs = rawLogs.map(r => {
    try { const p = JSON.parse(r.mensaje); return p._type === 'sync_errors' ? { ...p, fecha: r.created_date } : null; } catch { return null; }
  }).filter(Boolean);

  const failures = logs.flatMap(l => {
    const lista = l.failures?.length ? l.failures : (l.muestra || []);
    return lista.map(f => ({ ...f, almacen: l.almacen, fecha: l.fecha }));
  });

  // Detectar patrón de cada fallo
  const detectPatron = (f) => {
    const m = (f.msg_raw || f.msg || '').toLowerCase();
    if (m.includes('unique') || m.includes('duplicado')) return 'duplicado';
    if (m.includes('null') || m.includes('not-null') || m.includes('obligatorio')) return 'obligatorio';
    if (m.includes('http 4') || m.includes('status 4') || m.includes('denegado') || m.includes('acceso')) return 'acceso';
    if (m.includes('connection') || m.includes('timeout') || m.includes('network') || m.includes('conexi')) return 'conexion';
    return 'otro';
  };

  const failuresConPatron = failures.map(f => ({ ...f, patron: detectPatron(f) }));

  // KPIs
  const almacenesAfectados = [...new Set(failures.map(f => f.almacen))];
  const patronCount = failuresConPatron.reduce((acc, f) => { acc[f.patron] = (acc[f.patron] || 0) + 1; return acc; }, {});
  const patronMasFrecuente = Object.entries(patronCount).sort((a, b) => b[1] - a[1])[0];
  const almacenMasAfectado = [...failures.reduce((acc, f) => { acc.set(f.almacen, (acc.get(f.almacen) || 0) + 1); return acc; }, new Map())].sort((a, b) => b[1] - a[1])[0];

  // Filtros
  const allAlmacenes = [...new Set(failures.map(f => f.almacen))].sort((a, b) => Number(a) - Number(b));
  const allPatrones  = [...new Set(failuresConPatron.map(f => f.patron))];

  const filtered = failuresConPatron.filter(f => {
    if (filtroAlmacen !== 'all' && String(f.almacen) !== filtroAlmacen) return false;
    if (filtroError !== 'all' && f.patron !== filtroError) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      return f.nombre?.toLowerCase().includes(q) || f.codigo?.toLowerCase().includes(q) || String(f.id_tienda).includes(q);
    }
    return true;
  });

  const toggleRow = (i) => setExpandedRows(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  const catalogoActivos = ERROR_CATALOG.filter(c => patronCount[c.patron] > 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Análisis detallado de errores de sincronización</p>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} style={{ borderRadius: '8px' }}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} /> Actualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total fallos registrados', value: failures.length, color: '#e24b4a' },
          { label: 'Almacenes afectados',       value: almacenesAfectados.length, color: '#fb923c' },
          { label: 'Tipo de error más común',   value: patronMasFrecuente ? `${patronMasFrecuente[0]} (${patronMasFrecuente[1]})` : '—', color: '#facc15', small: true },
          { label: 'Almacén más afectado',      value: almacenMasAfectado ? `Alm. ${almacenMasAfectado[0]} (${almacenMasAfectado[1]})` : '—', color: '#60a5fa', small: true },
        ].map(k => (
          <div key={k.label} className="p-3 rounded-xl border border-border bg-card space-y-1">
            <p className="text-[10px] text-muted-foreground">{k.label}</p>
            <p className={`font-bold ${k.small ? 'text-sm' : 'text-xl'}`} style={{ color: k.color }}>{k.value ?? '—'}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Cargando logs...</div>
      ) : failures.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          <CheckCircle className="w-8 h-8 mx-auto mb-2 text-[#4ade80]" />
          <p className="text-sm">Sin errores de sincronización registrados.</p>
        </div>
      ) : (
        <>
          {/* Análisis por causa */}
          <div>
            <p className="text-sm font-medium mb-3 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-[#facc15]" /> Causas identificadas
            </p>
            <div className="space-y-2">
              {catalogoActivos.map(c => {
                const col = impactoColor(c.impacto);
                const count = patronCount[c.patron] || 0;
                const open = expandedCausa === c.patron;
                return (
                  <div key={c.patron} className={`rounded-xl border ${col.border} ${col.bg}`} style={{ borderRadius: '10px' }}>
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 text-left"
                      onClick={() => setExpandedCausa(open ? null : c.patron)}
                    >
                      <div className="flex items-center gap-3">
                        <Bug className={`w-4 h-4 flex-shrink-0 ${col.text}`} />
                        <div>
                          <p className="text-sm font-medium">{c.titulo}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{count} ocurrencia{count !== 1 ? 's' : ''} registradas</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${col.badge}`}>{c.impacto}</span>
                        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </button>
                    {open && (
                      <div className="px-4 pb-4 space-y-4 border-t border-border/50 pt-4">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Info className="w-3 h-3" /> Causa raíz</p>
                            <p className="text-xs leading-relaxed">{c.causa}</p>
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Bug className="w-3 h-3" /> Por qué ocurre</p>
                            <p className="text-xs leading-relaxed">{c.porque}</p>
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-[#4ade80] flex items-center gap-1.5"><CheckCircle className="w-3 h-3" /> Impacto real</p>
                            <p className="text-xs leading-relaxed">{c.accion}</p>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Lightbulb className="w-3 h-3" /> Solución recomendada</p>
                          <p className="text-xs leading-relaxed">{c.solucion}</p>
                        </div>
                        {c.sql_diagnostico && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-muted-foreground">Query diagnóstico (BD externa)</p>
                            <SqlBlock code={c.sql_diagnostico} />
                          </div>
                        )}
                        {c.sql_local && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-muted-foreground">Query verificación (BD local)</p>
                            <SqlBlock code={c.sql_local} />
                          </div>
                        )}
                        {/* Ejemplos específicos de este patrón */}
                        {(() => {
                          const ejemplos = filtered.filter(f => f.patron === c.patron).slice(0, 5);
                          if (!ejemplos.length) return null;
                          return (
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-muted-foreground">Ejemplos de productos afectados</p>
                              <div className="rounded-lg border border-border overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead className="bg-secondary/50"><tr>
                                    <th className="text-left p-2 font-medium text-muted-foreground">Nombre</th>
                                    <th className="text-left p-2 font-medium text-muted-foreground">Código</th>
                                    <th className="text-left p-2 font-medium text-muted-foreground">IdTienda</th>
                                    <th className="text-left p-2 font-medium text-muted-foreground">Almacén</th>
                                  </tr></thead>
                                  <tbody>
                                    {ejemplos.map((f, i) => (
                                      <tr key={i} className="border-t border-border/50">
                                        <td className="p-2 font-medium">{f.nombre || '—'}</td>
                                        <td className="p-2 text-muted-foreground font-mono">{f.codigo || '—'}</td>
                                        <td className="p-2 text-muted-foreground font-mono">{f.id_tienda || '—'}</td>
                                        <td className="p-2 text-muted-foreground">{f.almacen}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tabla detallada filtrable */}
          <div>
            <p className="text-sm font-medium mb-3 flex items-center gap-2">
              <Database className="w-4 h-4 text-[#60a5fa]" /> Log detallado de fallos ({filtered.length})
            </p>
            <div className="flex gap-2 mb-3 flex-wrap">
              <Select value={filtroAlmacen} onValueChange={setFiltroAlmacen}>
                <SelectTrigger className="h-8 text-xs w-44" style={{ borderRadius: '8px' }}>
                  <SelectValue placeholder="Almacén" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los almacenes</SelectItem>
                  {allAlmacenes.map(a => <SelectItem key={a} value={String(a)}>Almacén {a}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtroError} onValueChange={setFiltroError}>
                <SelectTrigger className="h-8 text-xs w-40" style={{ borderRadius: '8px' }}>
                  <SelectValue placeholder="Tipo error" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  {allPatrones.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={searchQ} onChange={e => setSearchQ(e.target.value)}
                  placeholder="Buscar producto, código, ID..."
                  className="pl-9 h-8 text-xs" style={{ borderRadius: '8px' }}
                />
              </div>
            </div>
            <Card style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card border-b">
                    <tr>
                      <th className="w-6 p-3" />
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Producto</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Código</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">IdTienda</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Almacén</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Tipo</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Sin resultados</td></tr>
                    ) : filtered.map((f, i) => {
                      const open = expandedRows.has(i);
                      const col = impactoColor(
                        f.patron === 'acceso' ? 'critico' : f.patron === 'obligatorio' ? 'medio' : 'bajo'
                      );
                      return (
                        <>
                          <tr key={i} className="border-b last:border-0 hover:bg-accent/30 cursor-pointer" onClick={() => toggleRow(i)}>
                            <td className="p-3 text-center">
                              {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                            </td>
                            <td className="p-3 text-xs font-medium max-w-[180px] truncate">{f.nombre || '—'}</td>
                            <td className="p-3 text-xs font-mono text-muted-foreground">{f.codigo || '—'}</td>
                            <td className="p-3 text-xs font-mono text-muted-foreground">{f.id_tienda || '—'}</td>
                            <td className="p-3 text-xs text-muted-foreground">{f.almacen}</td>
                            <td className="p-3">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${col.badge}`}>{f.patron}</span>
                            </td>
                            <td className="p-3 text-[10px] text-muted-foreground">{fmt(f.fecha)}</td>
                          </tr>
                          {open && (
                            <tr key={`${i}-detail`} className="bg-secondary/30 border-b">
                              <td colSpan={7} className="px-6 py-3 space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">Mensaje para el usuario</p>
                                <p className="text-xs">{f.msg}</p>
                                {f.msg_raw && f.msg_raw !== f.msg && (
                                  <>
                                    <p className="text-xs font-medium text-muted-foreground mt-2">Error técnico raw</p>
                                    <p className="text-[10px] font-mono text-muted-foreground bg-secondary/50 px-2 py-1.5 rounded">{f.msg_raw}</p>
                                  </>
                                )}
                                {(() => {
                                  const catalogo = ERROR_CATALOG.find(c => c.patron === f.patron);
                                  if (!catalogo) return null;
                                  return (
                                    <div className="mt-2 p-3 rounded-lg bg-card border border-border space-y-1.5">
                                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Recomendación</p>
                                      <p className="text-xs">{catalogo.solucion}</p>
                                    </div>
                                  );
                                })()}
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab Mantenimiento ─────────────────────────────────────────
function TabMantenimiento({ confirmDialog }) {
  const queryClient = useQueryClient();
  const [results, setResults] = useState({});

  const run = async (key, fn) => {
    setResults(r => ({ ...r, [key]: { loading: true } }));
    try {
      const res = await fn();
      setResults(r => ({ ...r, [key]: { ok: true, msg: res } }));
      queryClient.invalidateQueries();
    } catch (e) {
      setResults(r => ({ ...r, [key]: { ok: false, msg: e.message } }));
    }
  };

  const TASKS = [
    {
      key: 'clean_notif',
      label: 'Limpiar notificaciones leídas',
      desc: 'Elimina notificaciones leídas con más de 30 días',
      icon: Bell,
      color: '#facc15',
      confirm: '¿Eliminar notificaciones leídas con más de 30 días?',
      fn: async () => {
        const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
        const { count } = await supabase.from('notificaciones').delete({ count: 'exact' })
          .eq('leida', true).lt('created_date', cutoff);
        return `${count ?? 0} notificaciones eliminadas`;
      },
    },
    {
      key: 'clean_workflow',
      label: 'Limpiar eventos de auditoría',
      desc: 'Elimina workflow_eventos con más de 90 días',
      icon: ShieldCheck,
      color: '#34d399',
      confirm: '¿Eliminar eventos de auditoría con más de 90 días?',
      fn: async () => {
        const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
        const { count } = await supabase.from('workflow_eventos').delete({ count: 'exact' })
          .lt('created_at', cutoff);
        return `${count ?? 0} eventos eliminados`;
      },
    },
    {
      key: 'clean_historial',
      label: 'Limpiar historial de movimientos',
      desc: 'Elimina registros de historial con más de 180 días',
      icon: Database,
      color: '#60a5fa',
      confirm: '¿Eliminar historial con más de 180 días?',
      fn: async () => {
        const cutoff = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString();
        const { count } = await supabase.from('historial_movimientos').delete({ count: 'exact' })
          .lt('fecha', cutoff);
        return `${count ?? 0} registros eliminados`;
      },
    },
    {
      key: 'clean_sync_log',
      label: 'Limpiar log de sync antiguo',
      desc: 'Conserva solo el último sync por usuario/almacén (ya es upsert, no aplica)',
      icon: RefreshCw,
      color: '#4ade80',
      confirm: '¿Limpiar sync_auto_log de entradas antiguas (más de 60 días)?',
      fn: async () => {
        const { count } = await supabase.from('sync_auto_log').select('*', { count: 'exact', head: true });
        return `sync_auto_log tiene ${count ?? 0} registros (uno por usuario/almacén — no se limpia)`;
      },
    },
    {
      key: 'notif_broadcast',
      label: 'Enviar notificación a todos',
      desc: 'Envía un mensaje de sistema a todos los usuarios activos',
      icon: Send,
      color: '#f472b6',
      isCustom: true,
    },
  ];

  const [broadcastMsg, setBroadcastMsg] = useState('');

  const sendBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    const { data: users } = await supabase.from('usuarios').select('email').eq('activo', true);
    if (!users?.length) return;
    await Promise.all(users.map(u =>
      supabase.from('notificaciones').insert({
        usuario_id: u.email, tipo: 'sistema',
        titulo: 'Comunicado del sistema', mensaje: broadcastMsg, leida: false,
      })
    ));
    setBroadcastMsg('');
    setResults(r => ({ ...r, notif_broadcast: { ok: true, msg: `Notificación enviada a ${users.length} usuarios` } }));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Tareas de mantenimiento del sistema. Usar con precaución.</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {TASKS.map(task => {
          const Icon   = task.icon;
          const result = results[task.key];

          if (task.isCustom) {
            return (
              <Card key={task.key} className="p-4 space-y-3" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg flex-shrink-0" style={{ background: `${task.color}18` }}>
                    <Icon className="w-4 h-4" style={{ color: task.color }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{task.label}</p>
                    <p className="text-xs text-muted-foreground">{task.desc}</p>
                  </div>
                </div>
                <Input
                  placeholder="Mensaje de notificación..."
                  value={broadcastMsg}
                  onChange={e => setBroadcastMsg(e.target.value)}
                  style={{ borderRadius: '8px' }}
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={sendBroadcast} disabled={!broadcastMsg.trim()} style={{ borderRadius: '8px' }}>
                    <Send className="w-3.5 h-3.5 mr-1.5" /> Enviar a todos
                  </Button>
                  {result && <StatusChip ok={result.ok} label={result.msg} />}
                </div>
              </Card>
            );
          }

          return (
            <Card key={task.key} className="p-4 space-y-3" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg flex-shrink-0" style={{ background: `${task.color}18` }}>
                  <Icon className="w-4 h-4" style={{ color: task.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{task.label}</p>
                  <p className="text-xs text-muted-foreground">{task.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm" variant="outline"
                  disabled={result?.loading}
                  onClick={async () => {
                    if (await confirmDialog(task.confirm, { title: '¿Ejecutar tarea?', destructive: true }))
                      run(task.key, task.fn);
                  }}
                  style={{ borderRadius: '8px' }}
                >
                  {result?.loading
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Ejecutando...</>
                    : <><Zap className="w-3.5 h-3.5 mr-1.5" />Ejecutar</>}
                </Button>
                {result && !result.loading && <StatusChip ok={result.ok} label={result.msg?.slice(0, 40)} />}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab Gestión usuarios ──────────────────────────────────────
function TabUsuarios({ confirmDialog }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ email: '', full_name: '', role: 'inv', departamento: '', password: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [createError, setCreateError] = useState('');

  const { data: usuarios = [] } = useQuery({
    queryKey: ['sa-usuarios'],
    queryFn: async () => {
      const { data } = await supabase.from('usuarios').select('*').order('created_date', { ascending: false });
      return data ?? [];
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => supabase.from('usuarios').update(data).eq('id', id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sa-usuarios'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => supabase.from('usuarios').delete().eq('id', id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sa-usuarios'] }),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      setCreateError('');
      if (form.password) {
        const { error } = await supabase.auth.signUp({ email: form.email, password: form.password });
        if (error && !error.message.toLowerCase().includes('already registered')) throw error;
      }
      const { error } = await supabase.from('usuarios').upsert({
        email: form.email, full_name: form.full_name, role: form.role,
        departamento: form.role === 'jefe_depto' ? form.departamento : null, activo: true,
      }, { onConflict: 'email' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sa-usuarios'] });
      setForm({ email: '', full_name: '', role: 'inv', departamento: '', password: '' });
      setShowCreate(false);
    },
    onError: (e) => setCreateError(e.message),
  });

  const filtered = usuarios.filter(u =>
    !searchQ || u.email?.toLowerCase().includes(searchQ.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(searchQ.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Buscar..." className="pl-9" style={{ borderRadius: '8px' }} />
        </div>
        <Button onClick={() => setShowCreate(v => !v)} style={{ borderRadius: '8px' }}><Plus className="w-4 h-4 mr-1.5" />Nuevo</Button>
      </div>
      {showCreate && (
        <Card className="p-4 space-y-3 border-[#6798ff]/30 bg-[#6798ff]/5" style={{ borderRadius: '12px' }}>
          <p className="text-sm font-medium text-[#6798ff]">Crear usuario</p>
          {createError && <p className="text-xs text-[#e24b4a]">{createError}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Email *" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={{ borderRadius: '8px' }} />
            <Input placeholder="Nombre" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} style={{ borderRadius: '8px' }} />
            <Input type="password" placeholder="Contraseña (vacío = solo Google)" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} style={{ borderRadius: '8px' }} />
            <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
              <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(ROLES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => createMut.mutate()} disabled={!form.email || createMut.isPending} style={{ borderRadius: '8px' }}>{createMut.isPending ? 'Creando...' : 'Crear'}</Button>
            <Button size="sm" variant="outline" onClick={() => setShowCreate(false)} style={{ borderRadius: '8px' }}>Cancelar</Button>
          </div>
        </Card>
      )}
      <Card style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b">
              <th className="text-left p-3 text-xs font-medium text-muted-foreground">Usuario</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground">Rol</th>
              <th className="text-center p-3 text-xs font-medium text-muted-foreground">Estado</th>
              <th className="text-left p-3 text-xs font-medium text-muted-foreground">Registrado</th>
              <th className="text-center p-3 text-xs font-medium text-muted-foreground">Acciones</th>
            </tr></thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-accent/30">
                  <td className="p-3"><p className="font-medium text-sm">{u.full_name || '—'}</p><p className="text-xs text-muted-foreground">{u.email}</p></td>
                  <td className="p-3">
                    <Select value={u.role || 'inv'} onValueChange={v => updateMut.mutate({ id: u.id, data: { role: v } })}>
                      <SelectTrigger className="h-7 text-xs w-36" style={{ borderRadius: '6px' }}><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(ROLES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="p-3 text-center">
                    <button onClick={() => updateMut.mutate({ id: u.id, data: { activo: !u.activo } })}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.activo ? 'bg-[#4ade80]/10 text-[#4ade80]' : 'bg-[#e24b4a]/10 text-[#e24b4a]'}`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{fmt(u.created_date)}</td>
                  <td className="p-3 text-center">
                    <button className="text-[#e24b4a] hover:opacity-70"
                      onClick={async () => { if (await confirmDialog(`Se eliminará a ${u.email}.`, { title: '¿Eliminar usuario?', destructive: true })) deleteMut.mutate(u.id) }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Tab Auditoría ─────────────────────────────────────────────
function TabAuditoria() {
  const [searchQ, setSearchQ] = useState('');
  const [filtroTabla, setFiltroTabla] = useState('all');

  const { data: eventos = [], isLoading } = useQuery({
    queryKey: ['sa-auditoria'],
    queryFn: async () => {
      const { data } = await supabase.from('workflow_eventos').select('*').order('created_at', { ascending: false }).limit(300);
      return data ?? [];
    },
  });

  const { data: adminLog = [] } = useQuery({
    queryKey: ['sa-admin-log'],
    queryFn: async () => {
      const { data } = await supabase.from('admin_audit_log').select('*').order('created_at', { ascending: false }).limit(100);
      return data ?? [];
    },
  });

  const tablas = ['all', ...new Set(eventos.map(e => e.tabla))];
  const filtered = eventos.filter(e => {
    if (filtroTabla !== 'all' && e.tabla !== filtroTabla) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      return e.actor_id?.toLowerCase().includes(q) || e.actor_nombre?.toLowerCase().includes(q) || e.estado_nuevo?.toLowerCase().includes(q);
    }
    return true;
  });

  const estadoColor = { completado: 'text-[#4ade80]', devuelto: 'text-[#e24b4a]', pend_fact: 'text-[#ba7517]', en_auditoria: 'text-[#60a5fa]' };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        {tablas.map(t => (
          <button key={t} onClick={() => setFiltroTabla(t)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${filtroTabla === t ? 'bg-[#6798ff]/10 text-[#6798ff] border-[#6798ff]/30' : 'text-muted-foreground border-border'}`}>
            {t === 'all' ? 'Todos' : t}
          </button>
        ))}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Buscar actor..." className="pl-9 h-8 text-xs" style={{ borderRadius: '8px' }} />
        </div>
      </div>
      <div>
        <p className="text-sm font-medium mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-[#60a5fa]" />Transiciones de workflow ({filtered.length})</p>
        <Card style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card border-b">
                <tr>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Actor</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Tabla</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Transición</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Cargando...</td></tr> :
                  filtered.length === 0 ? <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Sin eventos</td></tr> :
                  filtered.map(e => (
                    <tr key={e.id} className="border-b last:border-0 hover:bg-accent/30">
                      <td className="p-3"><p className="text-xs font-medium">{e.actor_nombre || e.actor_id}</p><p className="text-[10px] text-muted-foreground">{e.actor_rol}</p></td>
                      <td className="p-3 text-xs text-muted-foreground">{e.tabla}</td>
                      <td className="p-3 text-xs">
                        <span className="text-muted-foreground">{e.estado_antes || 'nuevo'}</span>
                        <span className="mx-1">→</span>
                        <span className={estadoColor[e.estado_nuevo] || 'text-foreground'}>{e.estado_nuevo}</span>
                      </td>
                      <td className="p-3 text-[10px] text-muted-foreground">{fmt(e.created_at)}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <div>
        <p className="text-sm font-medium mb-3 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#4ade80]" />Acciones administrativas ({adminLog.length})</p>
        <Card style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
          <div className="overflow-x-auto max-h-56">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card border-b">
                <tr>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Admin</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Acción</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Objetivo</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {!adminLog.length ? <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Sin registros</td></tr> :
                  adminLog.map(a => (
                    <tr key={a.id} className="border-b last:border-0 hover:bg-accent/30">
                      <td className="p-3 text-xs font-medium">{a.admin_email}</td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${a.accion === 'aprobar' ? 'bg-[#4ade80]/10 text-[#4ade80]' : a.accion === 'rechazar' || a.accion === 'desactivar' ? 'bg-[#e24b4a]/10 text-[#e24b4a]' : 'bg-secondary text-muted-foreground'}`}>{a.accion}</span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{a.target_email}</td>
                      <td className="p-3 text-[10px] text-muted-foreground">{fmt(a.created_at)}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────
export default function SuperAdmin() {
  const { user } = useAuth();
  const [tab, setTab] = useState('sistema');
  const { confirmDialog, ConfirmDialogNode } = useConfirm();

  if (user?.role !== 'superadmin') return null;

  return (
    <>
      {ConfirmDialogNode}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#e24b4a]/10">
            <Crown className="w-5 h-5 text-[#e24b4a]" />
          </div>
          <div>
            <h1 className="text-xl font-medium">Panel Super Admin</h1>
            <p className="text-sm text-muted-foreground">Operabilidad · Trazabilidad · Auditoría</p>
          </div>
        </div>

        <div className="flex gap-1 flex-wrap bg-secondary/50 p-1 rounded-lg w-fit">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                <Icon className="w-3.5 h-3.5" />{t.label}
              </button>
            );
          })}
        </div>

        {tab === 'sistema'        && <TabSistema />}
        {tab === 'diagnostico'    && <TabDiagnostico />}
        {tab === 'sincronizacion' && <TabSincronizacion />}
        {tab === 'logs_sync'      && <TabLogsSinc />}
        {tab === 'importar'       && <TabImportar />}
        {tab === 'mantenimiento'  && <TabMantenimiento confirmDialog={confirmDialog} />}
        {tab === 'usuarios'       && <TabUsuarios confirmDialog={confirmDialog} />}
        {tab === 'auditoria'      && <TabAuditoria />}
      </div>
    </>
  );
}
