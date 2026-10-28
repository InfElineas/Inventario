--
-- Que la sincronización no pise con una foto vieja lo que ya sabemos
--
-- `almacen` y `tienda` no vienen de TKC en vivo: vienen de `sub_rows_latest`,
-- la foto del submayor que refresca el cron de elineas-transferencia DOS VECES
-- AL DÍA (11:03 y 17:04 UTC, ver `sub_runs`). Nuestra sincronización horaria
-- copia esa foto, así que copiar más a menudo no la hace más fresca.
--
-- Cuando alguien sube o baja de tienda desde el inventario, el servidor escribe
-- el movimiento en `productos` para que se vea al momento
-- (src/server/transferenciasApi.js). Sin lo de aquí, la sincronización de la
-- hora siguiente volvía a poner los números de la foto de la mañana: el
-- movimiento desaparecía de la pantalla aunque estuviera hecho en TKC.
--
-- La regla es la obvia: gana el dato más reciente. `existencias_en` dice de
-- cuándo son los números que hay guardados, y la sincronización solo los
-- reemplaza si su foto es posterior.
--
-- No cubre `exist_fisica` a propósito: subir y bajar de tienda no cambia la
-- existencia física —la mercancía sigue en el mismo almacén, solo cambia de
-- lado—, así que ahí no hay nada que proteger.
--
-- EJECUTAR como elineasadmin.
--

ALTER TABLE inventario.productos
  ADD COLUMN IF NOT EXISTS existencias_en timestamptz;

COMMENT ON COLUMN inventario.productos.existencias_en IS
  'De cuándo son `almacen` y `tienda`: la corrida del submayor que los trajo, '
  'o el momento en que un movimiento hecho desde el inventario los escribió. '
  'La sincronización solo los reemplaza si su foto es posterior.';

-- Lo ya guardado viene de la última foto: ponerle esa fecha evita que la
-- primera sincronización tras este cambio se salte todas las filas.
UPDATE inventario.productos
   SET existencias_en = (SELECT max(started_at) FROM sub_runs)
 WHERE existencias_en IS NULL;


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
      exist_fisica      = EXCLUDED.exist_fisica,
      -- Solo si la foto es posterior a lo que ya sabíamos. Un movimiento hecho
      -- desde el inventario escribe `existencias_en = now()`, y la foto de la
      -- mañana no puede deshacerlo.
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
    'corrida',       v_corrida
  );
END;
$$;

-- El backend la invoca para el sync manual desde Configuración/Catálogo.
GRANT EXECUTE ON FUNCTION inventario.sync_productos_desde_invglobal(text)
  TO elineas_backend_app;
