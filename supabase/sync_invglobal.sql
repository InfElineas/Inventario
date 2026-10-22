--
-- Sincronización de productos: inventario.catalogo_origen -> inventario.productos
--
-- El origen era public."invGlobal", que expone trece de las treinta y siete
-- columnas de ap_rows. Desde que el catálogo se sirve de nuestra base y no de
-- TKC en vivo, hacen falta las demás: Proveedor, Marca y Vence se ven por
-- defecto en la pantalla y ninguna estaba en esa vista. Ver catalogo_origen.sql.
--
-- El nombre de la función se queda como está: lo usan el cron del host y
-- src/server/syncApi.js.
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
      btrim(g.almacen_num),
      COALESCE(NULLIF(btrim(COALESCE(g.id_tienda, '')), ''), 'cod:' || btrim(g.codigo_producto))
    )
      btrim(g.almacen_num)                                     AS almacen_num,
      btrim(g.codigo_producto)                                 AS codigo_producto,
      NULLIF(btrim(COALESCE(g.id_tienda, '')), '')             AS id_tienda,
      btrim(COALESCE(g.nombre, ''))                            AS nombre,
      btrim(COALESCE(g.suministrador, ''))                     AS suministrador,
      g.proveedor, g.marca, g.clasificacion, g.codigo_pyme,
      g.categoria_almacen, g.locaciones, g.canal, g.gtin, g.catalogo_nombre,
      g.peso, g.volumen, g.cantidad_um, g.tasa,
      g.fecha_vencimiento::date                                AS fecha_vencimiento_tkc,
      g.categoria_elineas,
      COALESCE(NULLIF(btrim(COALESCE(g.unidad_compra, '')), ''), 'u') AS unidad_compra,
      COALESCE(NULLIF(btrim(COALESCE(g.unidad_medida, '')), ''), 'u') AS unidad_medida,
      COALESCE(g.exist_fisica, 0)                              AS exist_fisica,
      COALESCE(g.almacen, 0)                                   AS almacen,
      COALESCE(g.tienda, 0)                                    AS tienda,
      COALESCE(g.precio_costo, 0)                              AS precio_costo,
      COALESCE(g.fotos, '[]'::jsonb)                           AS fotos,
      g.estado_anuncio_tkc
    FROM inventario.catalogo_origen g
    WHERE btrim(COALESCE(g.codigo_producto, '')) <> ''
      AND btrim(COALESCE(g.almacen_num, '')) <> ''
      AND (p_almacen IS NULL OR btrim(g.almacen_num) = p_almacen)
    ORDER BY
      btrim(g.almacen_num),
      COALESCE(NULLIF(btrim(COALESCE(g.id_tienda, '')), ''), 'cod:' || btrim(g.codigo_producto)),
      -- Desempate determinista entre filas que comparten clave: gana la de
      -- mayor existencia. Sin este orden, cuál gana sería arbitrario y el
      -- stock podría cambiar entre ejecuciones sin que nadie tocara nada.
      COALESCE(g.exist_fisica, 0) DESC
  ),
  upsert AS (
    INSERT INTO inventario.productos (
      almacen_num, codigo_producto, id_tienda, nombre, suministrador,
      categoria_elineas, unidad_medida, exist_fisica, almacen, tienda,
      precio_costo, fotos, estado_anuncio_tkc,
      proveedor, marca, clasificacion, codigo_pyme, categoria_almacen,
      locaciones, canal, gtin, catalogo_nombre, peso, volumen, cantidad_um,
      tasa, fecha_vencimiento_tkc, unidad_compra,
      activo, updated_date
    )
    SELECT
      almacen_num, codigo_producto, id_tienda, nombre, suministrador,
      categoria_elineas, unidad_medida, exist_fisica, almacen, tienda,
      precio_costo, fotos, estado_anuncio_tkc,
      proveedor, marca, clasificacion, codigo_pyme, categoria_almacen,
      locaciones, canal, gtin, catalogo_nombre, peso, volumen, cantidad_um,
      tasa, fecha_vencimiento_tkc, unidad_compra,
      true, now()
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
      estado_anuncio_tkc = EXCLUDED.estado_anuncio_tkc,
      proveedor         = EXCLUDED.proveedor,
      marca             = EXCLUDED.marca,
      clasificacion     = EXCLUDED.clasificacion,
      codigo_pyme       = EXCLUDED.codigo_pyme,
      categoria_almacen = EXCLUDED.categoria_almacen,
      locaciones        = EXCLUDED.locaciones,
      canal             = EXCLUDED.canal,
      gtin              = EXCLUDED.gtin,
      catalogo_nombre   = EXCLUDED.catalogo_nombre,
      peso              = EXCLUDED.peso,
      volumen           = EXCLUDED.volumen,
      cantidad_um       = EXCLUDED.cantidad_um,
      tasa              = EXCLUDED.tasa,
      fecha_vencimiento_tkc = EXCLUDED.fecha_vencimiento_tkc,
      unidad_compra     = EXCLUDED.unidad_compra,
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
       FROM inventario.catalogo_origen g
       WHERE btrim(COALESCE(g.almacen_num, '')) = p.almacen_num
         AND COALESCE(
               NULLIF(btrim(COALESCE(g.id_tienda, '')), ''),
               'cod:' || btrim(COALESCE(g.codigo_producto, ''))
             ) = p.clave_sync
     );
  GET DIAGNOSTICS v_desactivados = ROW_COUNT;

  -- Deja constancia de la ejecución, un registro por almacén. Antes solo lo
  -- escribía /api/sync/productos bajo el email de quien pulsaba el botón, de
  -- modo que un sync programado —que no tiene usuario— no aparecía en ninguna
  -- parte y la pantalla seguía diciendo «sin sync registrado».
  INSERT INTO inventario.sync_auto_log (user_email, almacen, synced_at, synced, errors)
  SELECT 'sistema', p.almacen_num, now(), count(*)::int, 0
    FROM inventario.productos p
   WHERE p.activo
     AND p.almacen_num <> ''
     AND (p_almacen IS NULL OR p.almacen_num = p_almacen)
   GROUP BY p.almacen_num
      ON CONFLICT (user_email, almacen) DO UPDATE
         SET synced_at = excluded.synced_at,
             synced    = excluded.synced,
             errors    = 0;

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
