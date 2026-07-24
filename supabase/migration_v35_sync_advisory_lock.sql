-- ============================================================
-- Migration v35: evita que el cron (sync-auto) y un sync manual
-- escriban productos del MISMO almacén al mismo tiempo.
--
-- Antes, si el cron corría para el almacén 5 justo cuando alguien
-- disparaba un sync manual del almacén 5 desde BdTkc.jsx, ambos
-- procesos hacían upsert + deactivate_stale_sync con snapshots
-- potencialmente distintos y desfasados — uno podía desactivar
-- productos que el otro estaba a punto de reactivar/escribir.
--
-- pg_try_advisory_xact_lock toma el lock solo por la duración de la
-- transacción actual (cada llamada RPC es su propia transacción) y
-- nunca bloquea esperando — si el almacén ya está siendo sincronizado,
-- la segunda llamada falla de inmediato con un mensaje claro en vez
-- de correr en paralelo silenciosamente.
--
-- EJECUTAR en: BD principal (bnopapasaiyksmndxvly.supabase.co) → SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION sync_productos_bulk(
  p_rows    jsonb,
  p_almacen text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_synced  int  := 0;
  v_errors  int  := 0;
  v_errmsg  text;
  v_count   int  := 0;
BEGIN
  IF current_user <> 'service_role'
     AND public.get_user_role() NOT IN ('inv', 'administrador', 'superadmin')
  THEN
    RAISE EXCEPTION 'No autorizado para ejecutar sync_productos_bulk';
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext('sync_productos_bulk'), hashtext(p_almacen)) THEN
    RAISE EXCEPTION 'Ya hay una sincronización en curso para el almacén %. Intenta de nuevo en unos segundos.', p_almacen;
  END IF;

  BEGIN
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

-- Mismo lock (misma clave de almacén) para deactivate_stale_sync, para
-- que tampoco se solape con un upsert en curso del mismo almacén.
CREATE OR REPLACE FUNCTION deactivate_stale_sync(
  p_almacen  text,
  p_codigos  jsonb
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  IF current_user <> 'service_role'
     AND public.get_user_role() NOT IN ('inv', 'administrador', 'superadmin')
  THEN
    RAISE EXCEPTION 'No autorizado para ejecutar deactivate_stale_sync';
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext('sync_productos_bulk'), hashtext(p_almacen)) THEN
    RAISE EXCEPTION 'Ya hay una sincronización en curso para el almacén %. Intenta de nuevo en unos segundos.', p_almacen;
  END IF;

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
