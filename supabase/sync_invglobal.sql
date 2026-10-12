--
-- Sincronización de productos: public."invGlobal" -> inventario.productos
--
-- Reemplaza la cadena anterior (REST contra el segundo Supabase + RPC
-- sync_productos_bulk con jsonb paginado + Edge Function sync-auto). Ahora el
-- origen vive en esta misma base, así que es una sentencia SQL local.
--
-- `productos` sigue siendo tabla y no vista por dos razones: es el destino de
-- las claves foráneas de mermas, inventarios, lotes y anuncios, y guarda
-- columnas propias de la aplicación que no existen en TKC.
--
-- COLUMNAS QUE SE ACTUALIZAN (vienen de TKC):
--   nombre, suministrador, categoria_elineas, unidad_medida, id_tienda,
--   exist_fisica, almacen, tienda, precio_costo, fotos
--
-- COLUMNAS QUE NO SE TOCAN NUNCA (las escribe la aplicación o el usuario):
--   stock_minimo, stock_max, categoria_id, indice_calculo, dias_horizonte,
--   precio, resultado_tkc_real, clasificacion_ajuste, motivo_desact_tkc,
--   motivo_desact_elineas, estado_tarea_producto, especialista_fact,
--   auditor_producto, estado_fact, created_date
--   y estado_anuncio, que el usuario edita a mano en la ficha del producto.
--
-- EJECUTAR como elineasadmin.
--

CREATE OR REPLACE FUNCTION inventario.sync_productos_desde_invglobal(
  p_almacen text DEFAULT NULL   -- NULL = todos los almacenes
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_sincronizados int := 0;
  v_desactivados  int := 0;
BEGIN
  -- La identidad del producto es IdTienda, no el código de barras: TKC
  -- permite varios anuncios sobre el mismo código (ver fix_clave_producto.sql).
  -- El DISTINCT ON usa esa misma clave; sin él, ON CONFLICT fallaría con
  -- "cannot affect row a second time" ante filas repetidas del origen.
  WITH origen AS (
    SELECT DISTINCT ON (
      btrim(g."No. Almacén"),
      COALESCE(NULLIF(btrim(COALESCE(g."IdTienda", '')), ''), 'cod:' || btrim(g."Cód. Prod."))
    )
      btrim(g."No. Almacén")                                   AS almacen_num,
      btrim(g."Cód. Prod.")                                    AS codigo_producto,
      NULLIF(btrim(COALESCE(g."IdTienda", '')), '')            AS id_tienda,
      btrim(COALESCE(g."Nombre", ''))                          AS nombre,
      btrim(COALESCE(g."Suministrador", ''))                   AS suministrador,
      g."Categoría Online"                                     AS categoria_elineas,
      COALESCE(NULLIF(btrim(COALESCE(g."Unid/Alt.", '')), ''), 'u') AS unidad_medida,
      COALESCE(g."Exist. física", 0)                           AS exist_fisica,
      COALESCE(g."Reserva", 0)                                 AS almacen,
      COALESCE(g."Tienda", 0)                                  AS tienda,
      COALESCE(g."Precio", 0)                                  AS precio_costo,
      COALESCE(g."Fotos", '[]'::jsonb)                         AS fotos
    FROM public."invGlobal" g
    WHERE btrim(COALESCE(g."Cód. Prod.", '')) <> ''
      AND btrim(COALESCE(g."No. Almacén", '')) <> ''
      AND (p_almacen IS NULL OR btrim(g."No. Almacén") = p_almacen)
    ORDER BY
      btrim(g."No. Almacén"),
      COALESCE(NULLIF(btrim(COALESCE(g."IdTienda", '')), ''), 'cod:' || btrim(g."Cód. Prod.")),
      -- Desempate determinista entre filas que comparten clave: gana la de
      -- mayor existencia. Sin este orden, cuál gana sería arbitrario y el
      -- stock podría cambiar entre ejecuciones sin que nadie tocara nada.
      COALESCE(g."Exist. física", 0) DESC
  ),
  upsert AS (
    INSERT INTO inventario.productos (
      almacen_num, codigo_producto, id_tienda, nombre, suministrador,
      categoria_elineas, unidad_medida, exist_fisica, almacen, tienda,
      precio_costo, fotos, activo, updated_date
    )
    SELECT
      almacen_num, codigo_producto, id_tienda, nombre, suministrador,
      categoria_elineas, unidad_medida, exist_fisica, almacen, tienda,
      precio_costo, fotos, true, now()
    FROM origen
    ON CONFLICT (almacen_num, clave_sync) DO UPDATE SET
      id_tienda         = EXCLUDED.id_tienda,
      codigo_producto   = EXCLUDED.codigo_producto,
      nombre            = EXCLUDED.nombre,
      suministrador     = EXCLUDED.suministrador,
      categoria_elineas = EXCLUDED.categoria_elineas,
      unidad_medida     = EXCLUDED.unidad_medida,
      exist_fisica      = EXCLUDED.exist_fisica,
      almacen           = EXCLUDED.almacen,
      tienda            = EXCLUDED.tienda,
      precio_costo      = EXCLUDED.precio_costo,
      fotos             = EXCLUDED.fotos,
      -- Si el producto había desaparecido del origen y vuelve, se reactiva.
      activo            = true,
      updated_date      = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_sincronizados FROM upsert;

  -- Baja lógica de lo que ya no está en el origen. No se borra la fila: hay
  -- mermas, conteos y lotes que la referencian por clave foránea.
  UPDATE inventario.productos p
     SET activo = false,
         updated_date = now()
   WHERE p.activo
     AND (p_almacen IS NULL OR p.almacen_num = p_almacen)
     AND NOT EXISTS (
       SELECT 1
       FROM public."invGlobal" g
       WHERE btrim(COALESCE(g."No. Almacén", '')) = p.almacen_num
         AND COALESCE(
               NULLIF(btrim(COALESCE(g."IdTienda", '')), ''),
               'cod:' || btrim(COALESCE(g."Cód. Prod.", ''))
             ) = p.clave_sync
     );
  GET DIAGNOSTICS v_desactivados = ROW_COUNT;

  RETURN jsonb_build_object(
    'almacen',       COALESCE(p_almacen, 'todos'),
    'sincronizados', v_sincronizados,
    'desactivados',  v_desactivados,
    'momento',       now()
  );
END;
$$;

-- El backend la invoca para el sync manual desde Configuración/Catálogo.
GRANT EXECUTE ON FUNCTION inventario.sync_productos_desde_invglobal(text)
  TO elineas_backend_app;
