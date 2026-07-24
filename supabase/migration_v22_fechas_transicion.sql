-- ============================================================
-- Migration v22: fechas de transición en mermas e inventarios
-- Registra cuándo FACT procesó y cuándo el auditor actuó
-- EJECUTAR en: BD LOCAL (fiftxvdgwrbjudjtfhhi.supabase.co)
--              Dashboard → SQL Editor
-- ============================================================

ALTER TABLE mermas
  ADD COLUMN IF NOT EXISTS fact_fecha       text,   -- fecha en que FACT envió a auditoría
  ADD COLUMN IF NOT EXISTS auditoria_fecha  text;   -- fecha en que el auditor completó/devolvió

ALTER TABLE inventarios
  ADD COLUMN IF NOT EXISTS fact_fecha       text,
  ADD COLUMN IF NOT EXISTS auditoria_fecha  text;
