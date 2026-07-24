-- ============================================================
-- Migration v20: campo link en notificaciones
-- Permite navegar directamente al recurso desde la notificación
-- EJECUTAR en: BD LOCAL (fiftxvdgwrbjudjtfhhi.supabase.co)
--              Dashboard → SQL Editor
-- ============================================================

ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS link       text,      -- ruta de destino ej. '/mermas'
  ADD COLUMN IF NOT EXISTS es_error   boolean DEFAULT false; -- true = notificación de error reportable
