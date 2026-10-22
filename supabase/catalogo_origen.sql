--
-- Origen del catálogo: todo lo que el listado de TKC muestra
--
-- Hasta ahora el sync leía `public."invGlobal"`, que expone trece columnas de
-- las treinta y siete que tiene `ap_rows`. Con esas trece no se puede servir el
-- catálogo desde nuestra base sin perder columnas que hoy se ven: Proveedor,
-- Marca y Vence salen por defecto, y ninguna está en la vista.
--
-- `invGlobal` la comparten otros sistemas, así que no se toca. Esta es
-- equivalente —misma selección de la última ejecución de `ap_runs` y
-- `sub_runs`— pero expone el resto de campos y usa nombres en snake_case en
-- lugar de las cabeceras entrecomilladas del Excel.
--
-- Consecuencia a tener presente: la lógica de «última ejecución» queda
-- duplicada entre las dos vistas. Si quien mantiene `invGlobal` la cambia,
-- esta hay que cambiarla igual.
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
    -- Mismo criterio que invGlobal."Estado Anuncio".
    CASE
        WHEN a.id_online IS NULL   THEN 'Sin Id'
        WHEN a.is_dead = 1         THEN 'Muerto'
        WHEN a.status_provider = 1 THEN 'Activado'
        ELSE 'Desactivado'
    END                                    AS estado_anuncio_tkc,
    COALESCE(s.existencia_fisica, 0)       AS exist_fisica,
    COALESCE(s.almacen, 0)                 AS almacen,
    COALESCE(s.tienda, 0)                  AS tienda
  FROM ap_rows a
  LEFT JOIN (
    SELECT DISTINCT ON (sr.id_tkc)
           sr.id_tkc, sr.existencia_fisica, sr.almacen, sr.tienda
      FROM sub_rows sr
     WHERE sr.run_id = (SELECT id FROM sub_runs ORDER BY seq DESC LIMIT 1)
     ORDER BY sr.id_tkc, sr.id
  ) s ON s.id_tkc = a.id_tkc
 WHERE a.run_id = (SELECT id FROM ap_runs ORDER BY seq DESC LIMIT 1);

COMMENT ON VIEW inventario.catalogo_origen IS
  'Origen del sync de productos. Equivale a public."invGlobal" pero expone '
  'todas las columnas del listado de TKC. La lógica de última ejecución está '
  'duplicada entre ambas: si cambia una, cambiar la otra.';


-- ── Columnas nuevas en productos ────────────────────────────────────────
--
-- Son las que el catálogo muestra y hasta ahora no se guardaban, porque la
-- pantalla las leía de TKC en vivo.

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

COMMENT ON COLUMN inventario.productos.unidad_compra IS
  'Unidad de compra ("Unid/Alt." en invGlobal). Hasta ahora este valor se '
  'guardaba en unidad_medida por un arrastre de la vista; desde el sync nuevo, '
  'unidad_medida guarda la unidad de medida real y esta la de compra.';
