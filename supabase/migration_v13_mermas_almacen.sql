-- ============================================================
-- Migration v13: agregar almacen_num a mermas
-- EJECUTAR en: BD LOCAL (fiftxvdgwrbjudjtfhhi.supabase.co)
--              Dashboard → SQL Editor
-- ============================================================

-- 1. Agregar columna
ALTER TABLE mermas ADD COLUMN IF NOT EXISTS almacen_num text;

-- 2. Backfill: llenar las mermas existentes con el almacen del producto vinculado
UPDATE mermas m
SET almacen_num = p.almacen_num
FROM productos p
WHERE m.producto_id = p.id
  AND m.almacen_num IS NULL;
