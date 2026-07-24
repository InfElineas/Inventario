-- ============================================================
-- Migration v25: RLS por rol — reemplaza las políticas "auth_*"
-- (auth.role() = 'authenticated') que no distinguían rol ni estado.
--
-- Cierra:
--  - auto-escalación de privilegios vía la tabla usuarios
--  - registro con correo fuera de @mercadoelineas.com por API directa
--  - bypass del workflow de aprobación (inv/fact/auditor/ca) en
--    mermas, inventarios, anuncios_desact, recepciones
--  - escritura en productos por roles de solo lectura (fact/auditor/jefe_depto)
--  - update/delete de historial_movimientos (debía ser solo append)
--
-- EJECUTAR en: BD principal (bnopapasaiyksmndxvly.supabase.co) → SQL Editor
-- IMPORTANTE: antes de darlo por cerrado, probar el flujo completo con una
-- cuenta de cada rol (inv, fact, auditor, ca, jefe_depto, administrador,
-- superadmin) — un error aquí puede bloquear tareas reales en curso.
-- ============================================================

-- ── Helper: ¿el usuario actual es admin o superadmin? ─────────
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select public.get_user_role() in ('administrador', 'superadmin');
$$;

-- ============================================================
-- 1. USUARIOS — cierra la auto-escalación de privilegios
-- ============================================================
drop policy if exists "auth_usuarios" on usuarios;

create policy "usuarios_select" on usuarios
  for select using (auth.role() = 'authenticated');

-- Cada quien puede tocar su propia fila (p.ej. nombre); un admin, cualquiera.
-- El trigger de abajo es el que de verdad bloquea cambios de role/activo.
create policy "usuarios_update" on usuarios
  for update
  using (auth.role() = 'authenticated' and (email = auth.email() or public.is_admin()))
  with check (auth.role() = 'authenticated' and (email = auth.email() or public.is_admin()));

create policy "usuarios_delete_admin" on usuarios
  for delete using (public.is_admin());

-- Sin policy de INSERT: las filas solo las crea el trigger
-- handle_new_auth_user (SECURITY DEFINER), nunca el cliente directamente.

create or replace function public.prevent_role_self_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor_role text := public.get_user_role();
begin
  if v_actor_role not in ('administrador', 'superadmin') then
    if new.role is distinct from old.role or new.activo is distinct from old.activo then
      raise exception 'No autorizado: solo un administrador puede cambiar role/activo';
    end if;
  end if;
  if new.role = 'superadmin' and v_actor_role <> 'superadmin' then
    raise exception 'No autorizado: solo superadmin puede asignar el rol superadmin';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_self_escalation on usuarios;
create trigger trg_prevent_role_self_escalation
  before update on usuarios
  for each row execute procedure public.prevent_role_self_escalation();

-- ============================================================
-- 2. Dominio de correo — ahora también se valida en el servidor
-- (antes solo Login.jsx lo validaba; un signUp directo por API lo saltaba)
-- ============================================================
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email !~* '@mercadoelineas\.com$' then
    raise exception 'Dominio de correo no autorizado: %', new.email;
  end if;

  insert into public.usuarios (id, email, full_name, activo)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    false
  )
  on conflict (email) do nothing;
  return new;
end;
$$;

-- ============================================================
-- 3. MERMAS — reemplaza "auth_mermas"; sigue el flujo real de
-- MermaDetail.jsx: inv (en_curso/devuelto/reconteo_solicitado) →
-- fact (pend_fact) → auditor (en_auditoria) → completado.
-- ============================================================
drop policy if exists "auth_mermas" on mermas;

create policy "mermas_select" on mermas
  for select using (auth.role() = 'authenticated');

create policy "mermas_insert" on mermas
  for insert
  with check (
    public.is_admin()
    or (public.get_user_role() = 'inv' and especialista_id = auth.email())
  );

create policy "mermas_update" on mermas
  for update
  using (
    public.is_admin()
    or (public.get_user_role() = 'inv'     and estado_tarea in ('en_curso', 'devuelto', 'reconteo_solicitado'))
    or (public.get_user_role() = 'fact'    and estado_tarea = 'pend_fact')
    or (public.get_user_role() = 'auditor' and estado_tarea = 'en_auditoria')
  )
  with check (
    public.is_admin()
    or (public.get_user_role() = 'inv'     and estado_tarea in ('en_curso', 'devuelto', 'reconteo_solicitado', 'pend_fact', 'en_auditoria'))
    or (public.get_user_role() = 'fact'    and estado_tarea in ('pend_fact', 'en_auditoria', 'devuelto', 'reconteo_solicitado'))
    or (public.get_user_role() = 'auditor' and estado_tarea in ('en_auditoria', 'completado', 'devuelto'))
  );
-- DELETE ya cubierto por inv_delete_mermas (v18) y superadmin_delete_mermas (v19).

-- ============================================================
-- 4. INVENTARIOS — mismo patrón que mermas (sin reconteo)
-- ============================================================
drop policy if exists "auth_inventarios" on inventarios;

create policy "inventarios_select" on inventarios
  for select using (auth.role() = 'authenticated');

create policy "inventarios_insert" on inventarios
  for insert
  with check (
    public.is_admin()
    or (public.get_user_role() = 'inv' and especialista_id = auth.email())
  );

create policy "inventarios_update" on inventarios
  for update
  using (
    public.is_admin()
    or (public.get_user_role() = 'inv'     and estado_tarea in ('en_curso', 'devuelto'))
    or (public.get_user_role() = 'fact'    and estado_tarea = 'pend_fact')
    or (public.get_user_role() = 'auditor' and estado_tarea = 'en_auditoria')
  )
  with check (
    public.is_admin()
    or (public.get_user_role() = 'inv'     and estado_tarea in ('en_curso', 'devuelto', 'pend_fact', 'en_auditoria', 'completado'))
    or (public.get_user_role() = 'fact'    and estado_tarea in ('pend_fact', 'en_auditoria', 'devuelto'))
    or (public.get_user_role() = 'auditor' and estado_tarea in ('en_auditoria', 'completado', 'devuelto'))
  );

-- La UI (Inventario.jsx) permite a "administrador" borrar inventarios no
-- completados; v18/v19 solo cubrían inv-propio y superadmin — se agrega:
create policy "administrador_delete_inventarios" on inventarios
  for delete
  using (public.get_user_role() = 'administrador' and estado_tarea is distinct from 'completado');

-- ============================================================
-- 5. ANUNCIOS_DESACT — inv (pendiente) → ca (pend_ca) → auditor (en_auditoria).
-- Los registros los crea el sync externo, no el cliente: sin policy de INSERT.
-- ============================================================
drop policy if exists "auth_anuncios_desact" on anuncios_desact;

create policy "anuncios_select" on anuncios_desact
  for select using (auth.role() = 'authenticated');

create policy "anuncios_update" on anuncios_desact
  for update
  using (
    public.is_admin()
    or (public.get_user_role() = 'inv'     and estado_tarea = 'pendiente')
    or (public.get_user_role() = 'ca'      and estado_tarea = 'pend_ca')
    or (public.get_user_role() = 'auditor' and estado_tarea = 'en_auditoria')
  )
  with check (
    public.is_admin()
    or (public.get_user_role() = 'inv'     and estado_tarea in ('pendiente', 'pend_ca'))
    or (public.get_user_role() = 'ca'      and estado_tarea in ('pend_ca', 'en_auditoria'))
    or (public.get_user_role() = 'auditor' and estado_tarea in ('en_auditoria', 'completado'))
  );
-- DELETE ya cubierto por superadmin_delete_anuncios (v19).

-- ============================================================
-- 6. RECEPCIONES — antes sin ninguna policy propia de insert/update/delete
-- (solo el "auth_recepciones" permisivo + superadmin_delete de v19).
-- ============================================================
drop policy if exists "auth_recepciones" on recepciones;

create policy "recepciones_select" on recepciones
  for select using (auth.role() = 'authenticated');

create policy "recepciones_insert" on recepciones
  for insert
  with check (
    public.is_admin()
    or (public.get_user_role() = 'inv' and especialista_id = auth.email())
  );

create policy "recepciones_update" on recepciones
  for update
  using (
    public.is_admin()
    or (public.get_user_role() = 'inv' and estado = 'en_curso')
    or (public.get_user_role() = 'supervisor' and estado = 'con_diferencias')
  )
  with check (
    public.is_admin()
    or (public.get_user_role() = 'inv' and estado in ('en_curso', 'cerrada', 'con_diferencias'))
    or (public.get_user_role() = 'supervisor' and estado = 'con_diferencias')
  );

create policy "recepciones_delete" on recepciones
  for delete
  using (public.get_user_role() = 'inv' and estado = 'en_curso');
-- superadmin_delete_recepciones (v19) cubre el caso superadmin.

-- ============================================================
-- 7. PRODUCTOS — bloquea escritura de roles de solo lectura
-- (fact/auditor/jefe_depto solo tenían 'read' en ROLE_PERMISSIONS,
-- pero la policy anterior dejaba escribir a cualquier autenticado).
-- ============================================================
drop policy if exists "auth_productos" on productos;

create policy "productos_select" on productos
  for select using (auth.role() = 'authenticated');

create policy "productos_insert" on productos
  for insert
  with check (public.is_admin() or public.get_user_role() in ('inv', 'ca', 'supervisor'));

create policy "productos_update" on productos
  for update
  using (public.is_admin() or public.get_user_role() in ('inv', 'ca', 'supervisor'))
  with check (public.is_admin() or public.get_user_role() in ('inv', 'ca', 'supervisor'));

-- Sin policy de DELETE: hoy no hay UI para borrar productos; antes cualquier
-- autenticado podía hacerlo vía API directa, ahora queda denegado por defecto.

-- ============================================================
-- 8. HISTORIAL_MOVIMIENTOS — log de auditoría: solo insert, nunca update/delete
-- ============================================================
drop policy if exists "auth_historial_movimientos" on historial_movimientos;

create policy "historial_select" on historial_movimientos
  for select using (auth.role() = 'authenticated');

create policy "historial_insert" on historial_movimientos
  for insert with check (auth.role() = 'authenticated');
-- Sin policy de UPDATE/DELETE: el historial es append-only.

-- ============================================================
-- 9. LOTES / LOTES_IC — hoy solo los escribe el sync (funciones RPC
-- SECURITY DEFINER, no sujetas a RLS). El cliente solo necesita lectura.
-- ============================================================
drop policy if exists "auth_lotes" on lotes;
create policy "lotes_select" on lotes for select using (auth.role() = 'authenticated');

drop policy if exists "auth_lotes_ic" on lotes_ic;
create policy "lotes_ic_select" on lotes_ic for select using (auth.role() = 'authenticated');
