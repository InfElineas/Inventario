-- ============================================================
-- SECURITY MIGRATION — Reemplaza políticas permisivas allow_all
-- Ejecutar en Supabase SQL Editor DESPUÉS de schema.sql + usuarios.sql
-- ============================================================

-- ── Eliminar políticas excesivamente permisivas ────────────
drop policy if exists "allow_all_productos"            on productos;
drop policy if exists "allow_all_anuncios_desact"      on anuncios_desact;
drop policy if exists "allow_all_mermas"               on mermas;
drop policy if exists "allow_all_lotes"                on lotes;
drop policy if exists "allow_all_lotes_ic"             on lotes_ic;
drop policy if exists "allow_all_inventarios"          on inventarios;
drop policy if exists "allow_all_recepciones"          on recepciones;
drop policy if exists "allow_all_notificaciones"       on notificaciones;
drop policy if exists "allow_all_historial"            on historial_movimientos;
drop policy if exists "allow_all_usuarios"             on usuarios;

-- ── Tablas de almacén: solo usuarios autenticados ─────────
-- La lógica de roles se aplica en la capa de aplicación.
-- Esto garantiza que nadie con solo la anon key pueda leer datos.

create policy "auth_productos" on productos
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "auth_anuncios_desact" on anuncios_desact
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "auth_mermas" on mermas
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "auth_lotes" on lotes
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "auth_lotes_ic" on lotes_ic
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "auth_inventarios" on inventarios
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "auth_recepciones" on recepciones
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "auth_historial_movimientos" on historial_movimientos
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ── Usuarios: autenticado + puede leer todos para lookups ─
create policy "auth_usuarios" on usuarios
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ── Notificaciones: AISLAMIENTO POR USUARIO ──────────────
-- Cada usuario solo puede ver y modificar SUS propias notificaciones.
create policy "own_notificaciones" on notificaciones
  for all
  using  (auth.role() = 'authenticated' and usuario_id = auth.email())
  with check (auth.role() = 'authenticated' and usuario_id = auth.email());

-- ── Audit log de operaciones de admin ─────────────────────
create table if not exists admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  admin_email  text not null,
  accion       text not null,  -- 'aprobar' | 'rechazar' | 'desactivar' | 'cambiar_rol'
  target_email text not null,
  detalle      jsonb,
  created_at   timestamptz default now()
);

alter table admin_audit_log enable row level security;

-- Solo admins pueden leer el audit log (queda para cuando se implementen JWT custom claims)
create policy "auth_admin_audit" on admin_audit_log
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ── Función auxiliar: obtener rol del usuario actual ──────
-- Permite que futuras políticas RLS consulten el rol del usuario
-- sin necesidad de JWT custom claims.
create or replace function public.get_user_role()
returns text language plpgsql security definer as $$
declare
  v_role text;
begin
  select role into v_role
  from public.usuarios
  where email = auth.email()
    and activo = true
  limit 1;
  return coalesce(v_role, 'inv');
end;
$$;
