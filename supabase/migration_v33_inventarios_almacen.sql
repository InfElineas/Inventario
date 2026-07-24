-- ============================================================
-- Migration v33: agrega almacen_num a inventarios (mismo patrón que
-- migration_v13 ya hizo para mermas).
--
-- Sin esta columna, Dashboard.jsx no puede filtrar los KPIs/tablas de
-- "Inventarios" por el almacén seleccionado — mostraba el total de
-- TODOS los almacenes incluso con un almacén específico elegido.
--
-- EJECUTAR en: BD principal (bnopapasaiyksmndxvly.supabase.co) → SQL Editor
-- ============================================================

ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS almacen_num text;

-- Backfill: llenar los inventarios existentes con el almacén del producto vinculado
UPDATE inventarios i
SET almacen_num = p.almacen_num
FROM productos p
WHERE i.producto_id = p.id
  AND i.almacen_num IS NULL;

CREATE INDEX IF NOT EXISTS idx_inventarios_almacen_num ON inventarios (almacen_num);
