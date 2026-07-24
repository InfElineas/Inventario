-- ============================================================
-- Migration v6: eliminar duplicados + constraint único
-- EJECUTAR INMEDIATAMENTE en Supabase SQL Editor
-- ============================================================

-- 1. Eliminar duplicados SIN referencias FK (seguro, no rompe inventarios/mermas)
--    Mantiene el registro más antiguo (created_date ASC) de cada grupo duplicado
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY almacen_num, id_tienda
      ORDER BY created_date ASC NULLS LAST, id ASC
    ) AS rn
  FROM productos
  WHERE id_tienda IS NOT NULL AND id_tienda != ''
),
to_delete AS (
  SELECT id FROM ranked WHERE rn > 1
)
DELETE FROM productos
WHERE id IN (SELECT id FROM to_delete)
  -- Solo eliminar si NO tiene referencias activas
  AND id NOT IN (SELECT producto_id FROM inventarios WHERE producto_id IS NOT NULL)
  AND id NOT IN (SELECT producto_id FROM mermas     WHERE producto_id IS NOT NULL)
  AND id NOT IN (SELECT producto_id FROM lotes      WHERE producto_id IS NOT NULL)
  AND id NOT IN (SELECT producto_id FROM lotes_ic   WHERE producto_id IS NOT NULL);

-- 2. Normalizar id_tienda vacío → NULL (permite la constraint parcial)
UPDATE productos SET id_tienda = NULL WHERE id_tienda = '';

-- 3. Constraint único parcial — previene duplicados futuros a nivel BD
DROP INDEX IF EXISTS productos_almacen_idtienda_unique;
CREATE UNIQUE INDEX productos_almacen_idtienda_unique
  ON productos(almacen_num, id_tienda)
  WHERE id_tienda IS NOT NULL;

-- 4. Función RPC para sync seguro usando la constraint parcial del servidor
CREATE OR REPLACE FUNCTION sync_producto(
  p_almacen_num       text,
  p_id_tienda         text,
  p_codigo_producto   text,
  p_nombre            text,
  p_suministrador     text,
  p_unidad_medida     text,
  p_exist_fisica      numeric,
  p_almacen           numeric,
  p_tienda            numeric,
  p_precio_costo      numeric,
  p_fotos             jsonb,
  p_categoria_elineas text
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO productos (
    almacen_num, id_tienda, codigo_producto, nombre, suministrador,
    unidad_medida, exist_fisica, almacen, tienda, precio_costo,
    fotos, categoria_elineas, activo
  )
  VALUES (
    p_almacen_num, p_id_tienda, p_codigo_producto, p_nombre, p_suministrador,
    p_unidad_medida, p_exist_fisica, p_almacen, p_tienda, p_precio_costo,
    p_fotos, p_categoria_elineas, true
  )
  ON CONFLICT (almacen_num, id_tienda) WHERE id_tienda IS NOT NULL
  DO UPDATE SET
    codigo_producto   = EXCLUDED.codigo_producto,
    nombre            = EXCLUDED.nombre,
    suministrador     = EXCLUDED.suministrador,
    unidad_medida     = EXCLUDED.unidad_medida,
    exist_fisica      = EXCLUDED.exist_fisica,
    almacen           = EXCLUDED.almacen,
    tienda            = EXCLUDED.tienda,
    precio_costo      = EXCLUDED.precio_costo,
    fotos             = EXCLUDED.fotos,
    categoria_elineas = EXCLUDED.categoria_elineas,
    activo            = true,
    updated_date      = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
