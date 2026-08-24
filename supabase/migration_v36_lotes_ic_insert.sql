-- ============================================================
-- Migration v36: habilita el INSERT en lotes_ic (Enviar a IC)
--
-- Bug: el botón "Enviar a IC" del panel de Intervención Comercial
-- (src/pages/Lotes.jsx) siempre fallaba con
--   42501 new row violates row-level security policy for table "lotes_ic"
--
-- Causa: migration_v25_role_rls.sql solo creó "lotes_ic_select". El
-- comentario de v25 asumía que estas filas las escribe el sync con
-- service_role, pero no es así: las crea el usuario desde la UI, y la
-- UI ofrece el botón a inv/administrador (Lotes.jsx:145). Sin policy
-- de INSERT, ningún rol de cliente podía insertar.
--
-- Roles habilitados: los que el propio mapa de permisos de la app ya
-- declara con 'create_ic' sobre lotes (src/lib/security.js) — inv y ca —
-- más administrador/superadmin vía is_admin().
--
-- Se liga especialista_inv_id al usuario autenticado, mismo patrón que
-- "mermas_insert" en v25, para que nadie cree una IC a nombre de otro.
--
-- Solo INSERT: el cliente no hace UPDATE ni DELETE sobre lotes_ic
-- (Supervision.jsx solo lee), así que no se agregan más policies.
--
-- EJECUTAR en: BD principal (bnopapasaiyksmndxvly.supabase.co) → SQL Editor
-- ============================================================

drop policy if exists "lotes_ic_insert" on lotes_ic;

create policy "lotes_ic_insert" on lotes_ic
  for insert
  with check (
    public.is_admin()
    or (
      public.get_user_role() in ('inv', 'ca')
      and especialista_inv_id = auth.email()
    )
  );
