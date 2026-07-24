-- ============================================================
-- Migration v31: exige @mercadoelineas.com para TODO registro nuevo
-- (Google incluido), como decisión de producto: la empresa quiere
-- migrar de Gmail personal a cuentas @mercadoelineas.com para el
-- personal con laptop/usuario oficial.
--
-- Revierte el scoping de migration_v30 (que solo restringía el
-- flujo de "Acceso soporte" por email/contraseña) — ahora aplica
-- también a Google OAuth.
--
-- Solo afecta registros NUEVOS (primer insert en auth.users). Las
-- cuentas que ya existen hoy con otro dominio (Gmail personal, etc.)
-- NO se tocan y siguen funcionando con normalidad — decisión
-- explícita de no migrarlas de golpe.
--
-- EJECUTAR en: BD principal (bnopapasaiyksmndxvly.supabase.co) → SQL Editor
-- ============================================================

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email !~* '@mercadoelineas\.com$' then
    raise exception 'Dominio de correo no autorizado: %. Usa un correo @mercadoelineas.com.', new.email;
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
