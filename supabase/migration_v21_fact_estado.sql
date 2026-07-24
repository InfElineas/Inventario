-- ============================================================
-- Migration v21: campo fact_estado en mermas e inventarios
-- Permite a facturación registrar el estado de gestión del ajuste
-- EJECUTAR en: BD LOCAL (fiftxvdgwrbjudjtfhhi.supabase.co)
--              Dashboard → SQL Editor
-- ============================================================

ALTER TABLE mermas
  ADD COLUMN IF NOT EXISTS fact_estado text;

ALTER TABLE inventarios
  ADD COLUMN IF NOT EXISTS fact_estado text;
