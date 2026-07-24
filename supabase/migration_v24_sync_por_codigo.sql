-- ============================================================
-- Migration v24: sync masivo robusto — upsert por codigo_producto
--
-- Reemplaza la lógica de dos grupos (Grupo 1 por id_tienda,
-- Grupo 2 por codigo_producto) con un enfoque de dos pasos:
--
--   Paso 1: liberar id_tienda de filas cuyo código cambió en TKC.
--           Se hace UPDATE (no DELETE) para no violar la FK
--           historial_movimientos_producto_id_fkey.
--
--   Paso 2: upsert de todos los productos por (almacen_num, codigo_producto).
--           Cumple el requisito: "reemplazar solo cuando mismo almacén
--           Y mismo código". El id_tienda se actualiza como campo normal.
--
-- EJECUTAR en Supabase SQL Editor
-- ============================================================

-- ── RPC auxiliar: desactivar productos que ya no existen en TKC ─────────────
-- Se llama UNA VEZ por almacén, después de que todos los batches terminaron.
-- Recibe el array de codigos que SÍ existen en TKC y desactiva el resto.
CREATE OR REPLACE FUNCTION deactivate_stale_sync(
  p_almacen  text,
  p_codigos  jsonb   -- array de strings: todos los codigo_producto del almacén en TKC
)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE v_count int;
BEGIN
  UPDATE productos
  SET    activo = false
  WHERE  almacen_num    = p_almacen
    AND  activo         = true
    AND  codigo_producto IS NOT NULL
    AND  codigo_producto NOT IN (
           SELECT jsonb_array_elements_text(p_codigos)
         );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── RPC principal de sync ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_productos_bulk(
  p_rows    jsonb,
  p_almacen text
)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_synced  int  := 0;
  v_errors  int  := 0;
  v_errmsg  text;
  v_count   int  := 0;
BEGIN

  -- ── Paso 1: liberar id_tienda de filas que cambiaron de código ──────────
  -- Si en TKC un producto con id_tienda=T ahora tiene codigo=X pero en la BD
  -- esa misma fila tiene un código distinto, hay que soltar el id_tienda para
  -- que el INSERT del paso 2 no choque contra el índice parcial
  -- UNIQUE(almacen_num, id_tienda) WHERE id_tienda IS NOT NULL.
  UPDATE productos p
  SET    id_tienda = NULL,
         activo    = false
  FROM (
    SELECT DISTINCT r->>'id_tienda'       AS id_tienda,
                    r->>'codigo_producto' AS codigo_producto
    FROM   jsonb_array_elements(p_rows) r
    WHERE  r->>'id_tienda'       IS NOT NULL
      AND  r->>'codigo_producto' IS NOT NULL
      AND  r->>'codigo_producto' <> ''
  ) src
  WHERE  p.almacen_num       = p_almacen
    AND  p.id_tienda         = src.id_tienda
    AND  p.codigo_producto  IS DISTINCT FROM src.codigo_producto;

  -- ── Paso 2: upsert por (almacen_num, codigo_producto) ───────────────────
  BEGIN
    WITH src AS (
      SELECT DISTINCT ON (r->>'codigo_producto')
        p_almacen                                    AS almacen_num,
        r->>'id_tienda'                              AS id_tienda,
        r->>'codigo_producto'                        AS codigo_producto,
        r->>'nombre'                                 AS nombre,
        r->>'suministrador'                          AS suministrador,
        COALESCE(r->>'unidad_medida', 'u')           AS unidad_medida,
        COALESCE((r->>'exist_fisica')::numeric,  0)  AS exist_fisica,
        COALESCE((r->>'almacen')::numeric,       0)  AS almacen,
        COALESCE((r->>'tienda')::numeric,        0)  AS tienda,
        COALESCE((r->>'precio_costo')::numeric,  0)  AS precio_costo,
        COALESCE(r->'fotos', '[]'::jsonb)            AS fotos,
        r->>'categoria_elineas'                      AS categoria_elineas
      FROM jsonb_array_elements(p_rows) AS r
      WHERE r->>'codigo_producto' IS NOT NULL
        AND r->>'codigo_producto' <> ''
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
    ON CONFLICT (almacen_num, codigo_producto)
    DO UPDATE SET
      id_tienda         = EXCLUDED.id_tienda,
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
    v_synced := v_count;
  EXCEPTION WHEN OTHERS THEN
    v_errors := 1;
    v_errmsg := SQLERRM;
  END;

  RETURN jsonb_build_object(
    'synced',    v_synced,
    'errors',    v_errors,
    'error_msg', v_errmsg
  );
END;
$$;
