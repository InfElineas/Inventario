-- ============================================================
-- Migration v5: perfil de usuario — nickname y avatar_url
-- Ejecutar en Supabase SQL Editor (bnopapasaiyksmndxvly)
-- ============================================================

alter table usuarios
  add column if not exists nickname    text,
  add column if not exists avatar_url  text;
