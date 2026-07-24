import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { sanitizeError } from '@/lib/security';
import AccessDenied from '@/components/shared/AccessDenied';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, UserCheck, UserX, UserCog } from 'lucide-react';
import { ROLES, DEPARTAMENTOS } from '@/lib/constants';
import { format } from 'date-fns';
import { useConfirm } from '@/lib/useConfirm';

// superadmin solo puede asignarse desde el panel SA, no desde aquí
const ROLE_OPTIONS = ['inv', 'fact', 'auditor', 'ca', 'supervisor', 'jefe_depto', 'administrador'];
const ROLE_OPTIONS_SA = [...ROLE_OPTIONS, 'superadmin'];

// ── Audit log helper ─────────────────────────────────────
async function logAdminAction(adminEmail, accion, targetEmail, detalle = {}) {
  await supabase.from('admin_audit_log').insert({
    admin_email:  adminEmail,
    accion,
    target_email: targetEmail,
    detalle,
  });
}

export default function AdminUsuarios() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── Verificación de rol — primera línea de defensa en cliente ──
  if (!user || (user.role !== 'administrador' && user.role !== 'superadmin')) return <AccessDenied />;
  const isSuperAdmin = user.role === 'superadmin';

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { confirmDialog, ConfirmDialogNode } = useConfirm();

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ['admin-usuarios'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .order('created_date', { ascending: false });
      if (error) throw new Error(sanitizeError(error));
      // Admins regulares no ven usuarios superadmin
      return (data ?? []).filter(u => isSuperAdmin || u.role !== 'superadmin');
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, targetEmail, data: updateData, accion }) => {
      // Segunda línea de defensa: verificar rol en el momento de la mutación
      if (user?.role !== 'administrador' && user?.role !== 'superadmin') throw new Error('No autorizado');
      const { error } = await supabase.from('usuarios').update(updateData).eq('id', id);
      if (error) throw new Error(sanitizeError(error));
      await logAdminAction(user.email, accion, targetEmail, updateData);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-usuarios'] }),
  });

  const deleteMut = useMutation({
    mutationFn: async ({ id, targetEmail }) => {
      if (user?.role !== 'administrador' && user?.role !== 'superadmin') throw new Error('No autorizado');
      const { error } = await supabase.from('usuarios').delete().eq('id', id);
      if (error) throw new Error(sanitizeError(error));
      await logAdminAction(user.email, 'rechazar', targetEmail, {});
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-usuarios'] }),
  });

  const pendientes = usuarios.filter(u => !u.activo);
  const activos    = usuarios.filter(u => u.activo);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
    {ConfirmDialogNode}
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <UserCog className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-medium">Gestión de usuarios</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {activos.length} activo{activos.length !== 1 ? 's' : ''}
            {pendientes.length > 0 && ` · ${pendientes.length} pendiente${pendientes.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Pendientes */}
      {pendientes.length > 0 && (
        <Card className="overflow-hidden" style={{ borderRadius: '12px', borderWidth: '0.5px', borderColor: 'color-mix(in srgb, #BA7517 30%, transparent)' }}>
          <div className="px-4 py-3 flex items-center gap-2.5" style={{ borderBottom: '0.5px solid color-mix(in srgb, #BA7517 20%, transparent)', background: 'color-mix(in srgb, #BA7517 5%, transparent)' }}>
            <span className="w-2 h-2 rounded-full bg-[#BA7517] animate-pulse flex-shrink-0" />
            <span className="text-xs font-medium text-[#BA7517]">
              {pendientes.length} solicitud{pendientes.length !== 1 ? 'es' : ''} pendiente{pendientes.length !== 1 ? 's' : ''} de aprobación
            </span>
          </div>
          <div className="divide-y">
            {pendientes.map(u => (
              <UsuarioRow
                key={u.id}
                usuario={u}
                isPending
                onApprove={({ role, departamento }) => updateMut.mutate({
                  id: u.id,
                  targetEmail: u.email,
                  data: { activo: true, role, ...(departamento ? { departamento } : {}) },
                  accion: 'aprobar',
                })}
                onReject={async () => {
                  if (await confirmDialog(`Se eliminará permanentemente del sistema.`, { title: `¿Rechazar a ${u.email}?`, destructive: true })) {
                    deleteMut.mutate({ id: u.id, targetEmail: u.email });
                  }
                }}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Sin solicitudes */}
      {pendientes.length === 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-[#1D9E75]/5 rounded-lg text-xs text-[#1D9E75]" style={{ borderRadius: '8px' }}>
          <UserCheck className="w-4 h-4 flex-shrink-0" />
          No hay solicitudes pendientes
        </div>
      )}

      {/* Activos */}
      <Card className="overflow-hidden" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
        <div className="px-4 py-3" style={{ borderBottom: '0.5px solid hsl(var(--border))' }}>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Usuarios activos — {activos.length}
          </span>
        </div>
        {activos.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Sin usuarios activos</div>
        ) : (
          <div className="divide-y">
            {activos.map(u => (
              <UsuarioRow
                key={u.id}
                usuario={u}
                isPending={false}
                onRoleChange={({ role, departamento }) => updateMut.mutate({
                  id: u.id,
                  targetEmail: u.email,
                  data: { role, departamento: departamento ?? null },
                  accion: 'cambiar_rol',
                })}
                onDeactivate={async () => {
                  if (await confirmDialog(`Perderá el acceso inmediatamente.`, { title: `¿Desactivar a ${u.email}?`, destructive: true })) {
                    updateMut.mutate({
                      id: u.id,
                      targetEmail: u.email,
                      data: { activo: false },
                      accion: 'desactivar',
                    });
                  }
                }}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
    </>
  );
}

function UsuarioRow({ usuario, isPending, onApprove, onReject, onRoleChange, onDeactivate }) {
  const [role, setRole]               = useState(usuario.role || 'inv');
  const [departamento, setDepartamento] = useState(usuario.departamento || '');

  const initials = (usuario.full_name || usuario.email || '??')
    .split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const handleRoleChange = (v) => {
    setRole(v);
    const newDept = v === 'jefe_depto' ? departamento : null;
    if (v !== 'jefe_depto') setDepartamento('');
    if (!isPending) onRoleChange({ role: v, departamento: newDept });
  };

  const handleDeptChange = (v) => {
    setDepartamento(v);
    if (!isPending && role === 'jefe_depto') {
      onRoleChange({ role, departamento: v });
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 text-xs font-semibold text-foreground">
        {initials}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate leading-tight">
          {usuario.full_name || <span className="text-muted-foreground italic">Sin nombre</span>}
        </p>
        <p className="text-xs text-muted-foreground truncate">{usuario.email}</p>
      </div>

      {role !== 'jefe_depto' && (
        <span className="hidden md:block text-[11px] text-muted-foreground flex-shrink-0 w-20 text-right">
          {usuario.created_date ? format(new Date(usuario.created_date), 'dd/MM/yy') : '—'}
        </span>
      )}

      {/* Rol */}
      <Select value={role} onValueChange={handleRoleChange}>
        <SelectTrigger className="w-36 h-8 text-xs flex-shrink-0" style={{ borderRadius: '6px' }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.map(r => (
            <SelectItem key={r} value={r} className="text-xs">
              {ROLES[r]?.label || r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Departamento — solo visible cuando rol = jefe_depto */}
      {role === 'jefe_depto' && (
        <Select value={departamento} onValueChange={handleDeptChange}>
          <SelectTrigger className="w-40 h-8 text-xs flex-shrink-0" style={{ borderRadius: '6px' }}>
            <SelectValue placeholder="Departamento..." />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(DEPARTAMENTOS).map(([k, v]) => (
              <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {isPending ? (
          <>
            <Button
              size="sm"
              className="h-8 px-3 text-xs gap-1.5"
              style={{ borderRadius: '6px', background: '#1D9E75', color: '#fff', border: 'none' }}
              onClick={() => onApprove({ role, departamento: role === 'jefe_depto' ? departamento : null })}
            >
              <UserCheck className="w-3.5 h-3.5" />
              Aprobar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs gap-1.5"
              style={{ borderRadius: '6px', color: '#E24B4A', borderColor: 'color-mix(in srgb, #E24B4A 30%, transparent)' }}
              onClick={onReject}
            >
              <UserX className="w-3.5 h-3.5" />
              Rechazar
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 text-xs"
            style={{ borderRadius: '6px' }}
            onClick={onDeactivate}
          >
            Desactivar
          </Button>
        )}
      </div>
    </div>
  );
}
