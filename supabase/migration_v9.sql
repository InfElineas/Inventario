-- ============================================================
-- Migration v9: configuración de sincronización automática
-- EJECUTAR en Supabase SQL Editor
-- ============================================================

-- Configuración de sync del usuario.
-- Estructura esperada:
-- {
--   "auto_sync": true,
--   "horarios": ["08:00", "14:00", "20:00"],
--   "almacenes_sync": ["001", "003"]   ← vacío = todos los almacenes_config
-- }
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS sync_config jsonb DEFAULT '{}';
