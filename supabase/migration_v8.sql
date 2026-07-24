-- ============================================================
-- Migration v8: configuración de almacenes por usuario
-- EJECUTAR en Supabase SQL Editor
-- ============================================================

-- Array de almacenes que el usuario tiene configurados para trabajar.
-- '{}' = sin restricción (ve todos, comportamiento por defecto).
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS almacenes_config text[] DEFAULT '{}';

-- Índice para consultas de "qué usuarios trabajan en este almacén"
CREATE INDEX IF NOT EXISTS idx_usuarios_almacenes_config
  ON usuarios USING gin(almacenes_config);
