-- ============================================================
-- Migration v23: sync masivo de productos en una sola llamada
-- Reemplaza llamadas 1-por-producto con una función que recibe
-- un array JSONB completo y hace 2 INSERT ... ON CONFLICT.
-- EJECUTAR en Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION sync_productos_bulk(
  p_rows      jsonb,   -- array de objetos producto
  p_almacen   text     -- almacén al que pertenecen todos los rows
)
RETURNS jsonb          -- { synced: int, errors: int, error_msg: text|null }
LANGUAGE plpgsql AS $$
DECLARE
  v_synced  int := 0;
  v_errors  int := 0;
  v_errmsg  text;
  v_count   int := 0;
BEGIN
  -- Grupo 1: productos CON id_tienda → usa índice parcial (almacen_num, id_tienda) WHERE NOT NULL
  BEGIN
    WITH src AS (
      SELECT
        p_almacen                                AS almacen_num,
        (r->>'id_tienda')                        AS id_tienda,
        (r->>'codigo_producto')                  AS codigo_producto,
        (r->>'nombre')                           AS nombre,
        (r->>'suministrador')                    AS suministrador,
        COALESCE(r->>'unidad_medida', 'u')       AS unidad_medida,
        COALESCE((r->>'exist_fisica')::numeric, 0) AS exist_fisica,
        COALESCE((r->>'almacen')::numeric, 0)    AS almacen,
        COALESCE((r->>'tienda')::numeric, 0)     AS tienda,
        COALESCE((r->>'precio_costo')::numeric, 0) AS precio_costo,
        COALESCE(r->'fotos', '[]'::jsonb)        AS fotos,
        r->>'categoria_elineas'                  AS categoria_elineas
      FROM jsonb_array_elements(p_rows) AS r
      WHERE r->>'id_tienda' IS NOT NULL
    )
    INSERT INTO productos (
      almacen_num, id_tienda, codigo_producto, nombre, suministrador,
      unidad_medida, exist_fisica, almacen, tienda, precio_costo,
      fotos, categoria_elineas, activo
    )
    SELECT
      almacen_num, id_tienda, codigo_producto, nombre, suministrador,
      unidad_medida, exist_fisica, almacen, tienda, precio_costo,
      fotos, categoria_elineas, true
    FROM src
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
      updated_date      = now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_synced := v_synced + v_count;
  EXCEPTION WHEN OTHERS THEN
    v_errors  := v_errors + 1;
    v_errmsg  := SQLERRM;
  END;

  -- Grupo 2: productos SIN id_tienda → usa índice (almacen_num, codigo_producto)
  BEGIN
    WITH src AS (
      SELECT
        p_almacen                                AS almacen_num,
        (r->>'codigo_producto')                  AS codigo_producto,
        (r->>'nombre')                           AS nombre,
        (r->>'suministrador')                    AS suministrador,
        COALESCE(r->>'unidad_medida', 'u')       AS unidad_medida,
        COALESCE((r->>'exist_fisica')::numeric, 0) AS exist_fisica,
        COALESCE((r->>'almacen')::numeric, 0)    AS almacen,
        COALESCE((r->>'tienda')::numeric, 0)     AS tienda,
        COALESCE((r->>'precio_costo')::numeric, 0) AS precio_costo,
        COALESCE(r->'fotos', '[]'::jsonb)        AS fotos,
        r->>'categoria_elineas'                  AS categoria_elineas
      FROM jsonb_array_elements(p_rows) AS r
      WHERE r->>'id_tienda' IS NULL
    )
    INSERT INTO productos (
      almacen_num, id_tienda, codigo_producto, nombre, suministrador,
      unidad_medida, exist_fisica, almacen, tienda, precio_costo,
      fotos, categoria_elineas, activo
    )
    SELECT
      almacen_num, NULL, codigo_producto, nombre, suministrador,
      unidad_medida, exist_fisica, almacen, tienda, precio_costo,
      fotos, categoria_elineas, true
    FROM src
    ON CONFLICT (almacen_num, codigo_producto)
    DO UPDATE SET
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
      updated_date      = now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_synced := v_synced + v_count;
  EXCEPTION WHEN OTHERS THEN
    v_errors  := v_errors + 1;
    v_errmsg  := COALESCE(v_errmsg || ' | ', '') || SQLERRM;
  END;

  RETURN jsonb_build_object(
    'synced',     v_synced,
    'errors',     v_errors,
    'error_msg',  v_errmsg
  );
END;
$$;
