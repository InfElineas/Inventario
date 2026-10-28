--
-- Origen del catálogo: las vistas del monorepo, no las nuestras
--
-- Esta vista nació duplicando `public."invGlobal"` para exponer las columnas
-- que esa dejaba fuera (proveedor, marca, vencimiento…). Era innecesario: el
-- monorepo publica `ap_rows_latest` y `sub_rows_latest` EN ESTA MISMA BASE, con
-- todas las columnas y con su propia lógica de «última corrida».
--
-- Lo que se gana al leer las suyas no es brevedad, es dejar de tener dos
-- definiciones de «la última corrida». La nuestra era una copia, y el día que
-- ellos cambiaran la suya la nuestra se habría quedado atrás sin que nada
-- avisara: el catálogo mostrando una foto vieja y nadie mirando.
--
-- No se consulta su API por HTTP para esto. Sus vistas están aquí al lado, así
-- que es un SELECT local: sin red, sin cuenta de servicio y sin 115 peticiones
-- por sincronización. La API queda para lo que de verdad no está en esta base.
--
-- EL ESTADO DEL ANUNCIO YA NO SE DEDUCE
--
-- Aquí había una copia literal del CASE de `public."apGlobalV2"`, que sacaba
-- el estado de `is_dead` y `status_provider`. Deducía mal: `is_dead` vale 1
-- para TODO lo que no está activado, así que un desactivado normal salía como
-- muerto y el filtro de «desactivado» no devolvía nunca nada.
--
-- No era un fallo del CASE, era que el dato que distingue las dos cosas no
-- existía en `ap_rows`. Ahora sí: `update-ap` publica la columna
-- `estado_anuncio`, ya calculada y con este mismo vocabulario de siete
-- valores. Se lee tal cual. Deducir un dato que el origen ya da es inventar
-- una segunda verdad.
--
-- OJO CON LA CANTIDAD: ellos calculan el estado con `ap_rows.cantidad` —la del
-- listado— y NO con la existencia del submayor, que es lo que guardamos en
-- `exist_fisica`. Son dos fuentes distintas y pueden discrepar. Se respeta su
-- criterio para que los estados cuadren con sus reportes.
--
-- EJECUTAR como elineasadmin.
--

CREATE OR REPLACE VIEW inventario.catalogo_origen
  WITH (security_invoker = true) AS
SELECT
    a.warehouse_key                        AS almacen_num,
    a.codigo                               AS codigo_producto,
    a.id_online                            AS id_tienda,
    a.nombre,
    a.suministrador,
    a.proveedor,
    a.marca,
    a.categoria_online                     AS categoria_elineas,
    a.clasificacion,
    a.codigo_pyme,
    a.categoria_almacen,
    a.unidad_compra,
    a.unidad_medida,
    a.locaciones,
    a.canal,
    a.peso,
    a.volumen,
    a.cantidad_um,
    a.tasa,
    a.gtin,
    a.catalogo_nombre,
    a.fecha_vencimiento,
    a.precio                               AS precio_costo,
    a.imagenes                             AS fotos,

    -- Suyo, ya calculado. Ver la nota de arriba.
    a.estado_anuncio                       AS estado_anuncio_tkc,

    -- Existencias del submayor. Unidas por almacén Y por id_tkc: `invGlobal`
    -- une solo por id_tkc con un DISTINCT ON, lo que cruzaría almacenes si ese
    -- id se repitiera entre ellos. Añadir el almacén no puede dar un resultado
    -- peor y sí evita esa posibilidad.
    COALESCE(s.existencia_fisica, 0)       AS exist_fisica,
    COALESCE(s.almacen, 0)                 AS almacen,
    COALESCE(s.tienda, 0)                  AS tienda
  FROM ap_rows_latest a
  LEFT JOIN sub_rows_latest s
         ON s.id_tkc = a.id_tkc
        AND s.warehouse_key = a.warehouse_key;

COMMENT ON VIEW inventario.catalogo_origen IS
  'Origen del sync de productos. Lee ap_rows_latest y sub_rows_latest, las '
  'vistas del monorepo, para no duplicar su lógica de última corrida. El '
  'estado del anuncio se lee de ap_rows.estado_anuncio, que ya viene '
  'calculado: antes se deducía de is_dead y salía mal.';


-- ── Columnas nuevas en productos ────────────────────────────────────────
--
-- Son las que el catálogo muestra y antes no se guardaban, porque la pantalla
-- las leía de TKC en vivo. Idempotente: ya están aplicadas en producción.

ALTER TABLE inventario.productos
  ADD COLUMN IF NOT EXISTS proveedor         text,
  ADD COLUMN IF NOT EXISTS marca             text,
  ADD COLUMN IF NOT EXISTS clasificacion     text,
  ADD COLUMN IF NOT EXISTS codigo_pyme       text,
  ADD COLUMN IF NOT EXISTS categoria_almacen text,
  ADD COLUMN IF NOT EXISTS unidad_compra     text,
  ADD COLUMN IF NOT EXISTS locaciones        text,
  ADD COLUMN IF NOT EXISTS canal             text,
  ADD COLUMN IF NOT EXISTS peso              numeric,
  ADD COLUMN IF NOT EXISTS volumen           numeric,
  ADD COLUMN IF NOT EXISTS cantidad_um       numeric,
  ADD COLUMN IF NOT EXISTS tasa              numeric,
  ADD COLUMN IF NOT EXISTS gtin              text,
  ADD COLUMN IF NOT EXISTS catalogo_nombre   text,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento_tkc date;

COMMENT ON COLUMN inventario.productos.fecha_vencimiento_tkc IS
  'Vencimiento que publica TKC para el producto en este almacén. No confundir '
  'con lotes.fecha_vencimiento, que es por lote y la registra inventario.';

COMMENT ON COLUMN inventario.productos.estado_anuncio_tkc IS
  'Estado del anuncio con el vocabulario de public."apGlobalV2": ACTIVADO, '
  'DESACTIVADO EF=0/EF>0, DESACTIVADO MUERTO EF=0/EF>0, SIN ID EF=0/EF>0. '
  'Lo calcula con ap_rows.cantidad, no con la existencia del submayor.';
