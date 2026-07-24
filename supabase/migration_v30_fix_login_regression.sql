-- ============================================================
-- Migration v30: corrige una regresión introducida por migration_v25.
--
-- v25 hizo que handle_new_auth_user() rechazara CUALQUIER registro
-- nuevo (auth.users insert) que no fuera @mercadoelineas.com. Pero
-- Login.jsx tiene dos caminos distintos:
--   - "Continuar con Google"  → acceso general del staff, SIN
--     restricción de dominio en el código (así fue diseñado).
--   - "Acceso soporte" (email/contraseña) → sí restringido a
--     @mercadoelineas.com, y esa validación de dominio YA existe en
--     el cliente (Login.jsx validateEmail).
--
-- Al aplicar la restricción de dominio a TODOS los signups, cualquier
-- primer login con Google usando un correo que no termina en
-- @mercadoelineas.com queda rechazado por el trigger — eso rompió el
-- login para el resto del staff.
--
-- Esta migración restringe el chequeo de dominio solo al proveedor
-- 'email' (el flujo de "soporte"), dejando Google OAuth sin
-- restricción, como estaba diseñado originalmente.
--
-- EJECUTAR en: BD principal (bnopapasaiyksmndxvly.supabase.co) → SQL Editor
-- URGENTE: corre esto de inmediato si el login está bloqueado ahora mismo.
-- ============================================================

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Solo el flujo de "Acceso soporte" (email/contraseña) está
  -- restringido a @mercadoelineas.com. Google OAuth no lo está.
  if new.raw_app_meta_data ->> 'provider' = 'email'
     and new.email !~* '@mercadoelineas\.com$'
  then
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
