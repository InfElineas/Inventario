-- ============================================================
-- Migration v37: rol "Especialista de Anuncios" (esp_anuncio)
--
-- Aporta lo que el rol necesita del lado de la BD:
--   1. usuarios.anuncio_config — los fragmentos de código que el propio
--      especialista define en Configuración para marcar productos.
--   2. Policy de INSERT en anuncios_desact — para poder escalar un
--      producto detectado en TKC al workflow existente del caso.
--
-- usuarios.role es text sin CHECK, así que el rol en sí no requiere
-- cambios de esquema: basta agregarlo a ROLES en src/lib/constants.js
-- (de ahí lo toma el selector de AdminUsuarios).
--
-- EJECUTAR en: BD principal (bnopapasaiyksmndxvly.supabase.co) → SQL Editor
-- ============================================================

-- ── 1. Config por usuario ───────────────────────────────────
-- Mismo patrón que sync_config (v9): jsonb en la fila del usuario, que
-- él mismo edita vía la policy "usuarios_update" (email = auth.email()).
alter table usuarios
  add column if not exists anuncio_config jsonb default '{}';

-- ── 2. Escalar a anuncios_desact ────────────────────────────
-- v25 dejó anuncios_desact sin policy de INSERT porque asumía que las
-- filas solo las crea el sync externo. Escalar desde la detección de TKC
-- es un insert hecho por el usuario, así que hace falta habilitarlo.
--
-- Se restringe a los roles que pueden originar un caso (esp_anuncio e
-- inv) y se fuerza que el caso nazca en 'pendiente', el primer paso del
-- workflow: así nadie puede insertar un caso ya "aprobado" saltándose
-- los pasos INV/CA/Auditor que valida "anuncios_update".
drop policy if exists "anuncios_insert" on anuncios_desact;

create policy "anuncios_insert" on anuncios_desact
  for insert
  with check (
    public.is_admin()
    or (
      public.get_user_role() in ('esp_anuncio', 'inv')
      and estado_tarea = 'pendiente'
    )
  );
