--
-- La sincronización no desactiva un almacén cuyo origen viene vacío o cortado
--
-- `sync_productos_desde_invglobal` desactiva lo que no está en `catalogo_origen`.
-- Si el origen falla para un almacén —vacío, o cortado—, desactiva el almacén
-- entero: pasó con el 1005, el 1053 y el 1476 (0 activos) y con el 1201 (2.000 de
-- 4.329), y quien trabaja en ellos dejó de ver productos.
--
-- Ahora, si el origen trae menos de la MITAD de lo que hay activo en un almacén, no
-- se desactiva nada de él y se lista en `protegidos` del resultado. Lo demás de la
-- función no cambia.
--
-- EJECUTAR como elineasadmin. Idempotente (CREATE OR REPLACE).
--

CREATE OR REPLACE FUNCTION inventario.sync_productos_desde_invglobal(
  p_almacen text DEFAULT NULL   -- NULL = todos los almacenes
) RETURNS jsonb
LANGUAGE plpgsql
-- `sub_rows_latest` y `sub_runs` viven fuera de `inventario`.
SET search_path TO inventario, public
AS $$
DECLARE
  v_sincronizados int := 0;
  v_desactivados  int := 0;
  v_corrida       timestamptz;
  v_protegidos    jsonb := '[]'::jsonb;
BEGIN
  -- De cuándo es la foto que estamos a punto de copiar.
  SELECT max(started_at) INTO v_corrida FROM sub_runs;
  v_corrida := COALESCE(v_corrida, now());

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
      activo, updated_date, existencias_en
    )
    SELECT
      almacen_num, codigo_producto, id_tienda, nombre, suministrador,
      categoria_elineas, unidad_medida, exist_fisica, almacen, tienda,
      precio_costo, fotos, estado_anuncio_tkc,
      proveedor, marca, clasificacion, codigo_pyme, categoria_almacen,
      locaciones, canal, gtin, catalogo_nombre, peso, volumen, cantidad_um,
      tasa, fecha_vencimiento_tkc, unidad_compra,
      true, now(), v_corrida
    FROM origen
    ON CONFLICT (almacen_num, clave_sync) DO UPDATE SET
      id_tienda         = EXCLUDED.id_tienda,
      codigo_producto   = EXCLUDED.codigo_producto,
      nombre            = EXCLUDED.nombre,
      suministrador     = EXCLUDED.suministrador,
      categoria_elineas = EXCLUDED.categoria_elineas,
      unidad_medida     = EXCLUDED.unidad_medida,
      -- Las tres existencias solo se reemplazan si la foto es posterior a lo
      -- que ya sabíamos. Un movimiento hecho desde el inventario, o una lectura
      -- del submayor en vivo, escriben `existencias_en = now()`, y la foto de
      -- la mañana no puede deshacerlas.
      exist_fisica = CASE
        WHEN productos.existencias_en IS NULL OR productos.existencias_en <= v_corrida
        THEN EXCLUDED.exist_fisica ELSE productos.exist_fisica END,
      almacen = CASE
        WHEN productos.existencias_en IS NULL OR productos.existencias_en <= v_corrida
        THEN EXCLUDED.almacen ELSE productos.almacen END,
      tienda = CASE
        WHEN productos.existencias_en IS NULL OR productos.existencias_en <= v_corrida
        THEN EXCLUDED.tienda ELSE productos.tienda END,
      existencias_en = GREATEST(COALESCE(productos.existencias_en, v_corrida), v_corrida),
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

  -- Lo que ya no está en el origen se desactiva, no se borra: hay mermas,
  -- conteos y lotes que apuntan a esas filas.
  --
  -- PERO no si el origen parece roto. Un día el origen devolvió el 1005, el 1053 y
  -- el 1476 vacíos y el 1201 cortado en 2.000 filas, y esta sentencia dio por
  -- desaparecidos 6.800 productos: el inventarista del 1005 se quedó sin
  -- catálogo. Un almacén cuyo origen trae menos de la mitad de lo que hay activo no
  -- se toca: se avisa en `protegidos` y se queda como estaba hasta que el origen
  -- vuelva a traerlo entero. Si de verdad se dio de baja más de la mitad, se
  -- desactiva a mano.
  -- Los almacenes cuyo origen trae menos de la mitad de lo que hay activo.
  WITH cuentas AS (
    SELECT a.almacen_num, a.n AS activos, COALESCE(o.n, 0) AS origen
      FROM (
        SELECT almacen_num, count(*)::int AS n
          FROM inventario.productos
         WHERE activo AND (p_almacen IS NULL OR almacen_num = p_almacen)
         GROUP BY almacen_num
      ) a
      LEFT JOIN (
        SELECT btrim(COALESCE(g.almacen_num, '')) AS almacen_num,
               count(DISTINCT COALESCE(NULLIF(btrim(COALESCE(g.id_tienda, '')), ''),
                                       'cod:' || btrim(COALESCE(g.codigo_producto, ''))))::int AS n
          FROM inventario.catalogo_origen g
         GROUP BY 1
      ) o USING (almacen_num)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('almacen', almacen_num, 'activos', activos, 'origen', origen)), '[]'::jsonb)
    INTO v_protegidos
    FROM cuentas
   WHERE origen < activos * 0.5;

  WITH cuentas AS (
    SELECT a.almacen_num, a.n AS activos, COALESCE(o.n, 0) AS origen
      FROM (
        SELECT almacen_num, count(*)::int AS n
          FROM inventario.productos
         WHERE activo AND (p_almacen IS NULL OR almacen_num = p_almacen)
         GROUP BY almacen_num
      ) a
      LEFT JOIN (
        SELECT btrim(COALESCE(g.almacen_num, '')) AS almacen_num,
               count(DISTINCT COALESCE(NULLIF(btrim(COALESCE(g.id_tienda, '')), ''),
                                       'cod:' || btrim(COALESCE(g.codigo_producto, ''))))::int AS n
          FROM inventario.catalogo_origen g
         GROUP BY 1
      ) o USING (almacen_num)
  )
  UPDATE inventario.productos p
     SET activo = false,
         updated_date = now()
   WHERE p.activo
     AND (p_almacen IS NULL OR p.almacen_num = p_almacen)
     AND p.almacen_num IN (SELECT almacen_num FROM cuentas WHERE origen >= activos * 0.5)
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
    'momento',       now(),
    -- De cuándo era la foto del submayor que se copió. Si esto no avanza, no
    -- es que la sincronización falle: es que ellos no la han vuelto a sacar.
    'corrida',       v_corrida,
    -- Almacenes cuyo origen venía vacío o cortado: no se desactivó nada de ellos.
    'protegidos',    v_protegidos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION inventario.sync_productos_desde_invglobal(text)
  TO elineas_backend_app;
