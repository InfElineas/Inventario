-- ============================================================
-- TABLA: usuarios
-- Controla qué cuentas Google pueden acceder y con qué rol.
-- Ejecutar en Supabase SQL Editor DESPUÉS de schema.sql
-- ============================================================

create table if not exists usuarios (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text unique not null,
  full_name    text,
  role         text not null default 'inv',
  -- Roles válidos: 'inv' | 'fact' | 'auditor' | 'ca' | 'administrador'
  activo       boolean not null default false,
  -- false = pendiente de aprobación, true = acceso concedido
  created_date timestamptz default now()
);

alter table usuarios enable row level security;

create policy "allow_all_usuarios" on usuarios for all using (true) with check (true);

-- ============================================================
-- TRIGGER: registra automáticamente cada nuevo login de Google
-- como usuario pendiente (activo = false).
-- El administrador aprueba desde la página de gestión.
-- ============================================================
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- ============================================================
-- INSERTAR ADMINISTRADOR INICIAL
-- Después de que el admin inicie sesión con Google una vez,
-- su UUID aparecerá en Supabase > Authentication > Users.
-- Ejecuta este INSERT con ese UUID para darte acceso completo.
-- ============================================================
-- insert into usuarios (id, email, full_name, role, activo)
-- values (
--   'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
--   'admin@gmail.com',
--   'Nombre Administrador',
--   'administrador',
--   true
-- )
-- on conflict (email) do update set role = 'administrador', activo = true;
