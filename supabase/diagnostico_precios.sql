--
-- Diagnóstico de precios de un producto
--
-- SOLO LEE. Ni un INSERT, UPDATE, DELETE ni DDL.
--
-- Qué responde: dónde está el «precio proveedor». La pantalla de catálogo
-- enseña un solo precio (el que TKC guarda como precio, que aquí se llama
-- `precio_costo`) y la base tiene más tablas con precios. Esto lista todas las
-- columnas que parecen un precio y enseña, para un producto concreto, lo que
-- cada tabla guarda de él, para poder ver cuál es cuál.
--
-- Solo productos y precios: sin clientes, operadores ni contactos.
--
-- El producto de muestra es el de la captura del catálogo: «Aceite de oliva
-- extra virgen aromatizado al peperoncino Dante (250 ml)», código
-- 8033576194042, almacén 789. Se puede cambiar en las dos líneas de abajo.
--
-- No lleva ON_ERROR_STOP a propósito: algunas consultas asumen un nombre de
-- columna que quizá no exista, y que falle también es una respuesta.
--

\set almacen '789'
\set codigo   '8033576194042'

\echo '=== 1. Columnas que parecen un precio, en toda la base ==='
SELECT table_schema AS esquema, table_name AS tabla, column_name AS columna, data_type AS tipo
  FROM information_schema.columns
 WHERE column_name ~* '(prec|cost|valor|price|tarifa|oferta|importe|margen)'
   AND table_schema NOT IN ('pg_catalog', 'information_schema')
   AND table_name !~* '^(fleet|whatsapp)'
 ORDER BY 1, 2, 3;

\echo ''
\echo '=== 2. Todo lo que ap_rows_latest guarda del producto (sin las imágenes) ==='
SELECT jsonb_pretty(to_jsonb(a) - 'imagenes') AS fila
  FROM public.ap_rows_latest a
 WHERE a.warehouse_key = :'almacen' AND a.codigo = :'codigo';

\echo ''
\echo '=== 3. Todo lo que vd_rows_latest guarda del producto ==='
SELECT jsonb_pretty(to_jsonb(v)) AS fila
  FROM public.vd_rows_latest v
 WHERE v.warehouse_key = :'almacen' AND v.codigo = :'codigo';

\echo ''
\echo '=== 4. Cómo son las tablas de precios y costos (dos filas de muestra de cada una) ==='
\echo '--- public."preciosXItem"'
SELECT jsonb_pretty(to_jsonb(t)) AS fila FROM (SELECT * FROM public."preciosXItem" LIMIT 2) t;
\echo '--- public."costosXItem"'
SELECT jsonb_pretty(to_jsonb(t)) AS fila FROM (SELECT * FROM public."costosXItem" LIMIT 2) t;
\echo '--- public.rdp_prices_rows'
SELECT jsonb_pretty(to_jsonb(t)) AS fila FROM (SELECT * FROM public.rdp_prices_rows LIMIT 2) t;
\echo '--- public.rdp_costs_rows'
SELECT jsonb_pretty(to_jsonb(t)) AS fila FROM (SELECT * FROM public.rdp_costs_rows LIMIT 2) t;

\echo ''
\echo '=== 5. Compras y ofertas de proveedores (el precio proveedor suele estar aquí) ==='
\echo '--- reabastecimiento.purchase_order_items'
SELECT jsonb_pretty(to_jsonb(t)) AS fila FROM (SELECT * FROM reabastecimiento.purchase_order_items LIMIT 2) t;
\echo '--- reabastecimiento.supplier_offer_items'
SELECT jsonb_pretty(to_jsonb(t)) AS fila FROM (SELECT * FROM reabastecimiento.supplier_offer_items LIMIT 2) t;
\echo '--- reabastecimiento.product_purchasing_mv'
SELECT jsonb_pretty(to_jsonb(t)) AS fila FROM (SELECT * FROM reabastecimiento.product_purchasing_mv LIMIT 2) t;
\echo '--- reabastecimiento.offer_item_price_history'
SELECT jsonb_pretty(to_jsonb(t)) AS fila FROM (SELECT * FROM reabastecimiento.offer_item_price_history LIMIT 2) t;
