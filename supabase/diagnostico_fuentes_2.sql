--
-- Diagnóstico de fuentes de datos para Facturación (F0), segunda parte
--
-- SOLO LEE. Ni un INSERT, UPDATE, DELETE ni DDL.
--
-- No muestra filas de datos: solo columnas, conteos y rangos de fechas. Las
-- tablas de ventas llevan cliente y operador, y no hace falta verlos para
-- saber qué contienen.
--
-- Qué responde: qué es cada una de las tablas que apareció en la primera parte
-- (rdp_rows, rdp_vd_rows, vd_rows, sub_rows, fleet.orden), de cuándo a cuándo
-- llegan y si alguna guarda el número de documento de TKC. Ver
-- docs/facturacion-hallazgos.md.
--

\echo '=== 1. Columnas de las tablas candidatas ==='
SELECT table_schema AS esquema, table_name AS tabla, column_name AS columna, data_type AS tipo
  FROM information_schema.columns
 WHERE (table_schema = 'public' AND table_name IN
          ('rdp_rows', 'rdp_vd_rows', 'vd_rows', 'sub_rows', 'sub_current', 'RDP', 'RDP_VD'))
    OR (table_schema = 'fleet' AND table_name IN ('orden', 'orden_tkc', 'orden_producto'))
 ORDER BY 1, 2, ordinal_position;

\echo ''
\echo '=== 2. rdp_rows: ventas diarias por producto y almacén (¿hasta cuándo, cuántos almacenes?) ==='
SELECT min(report_date) AS desde, max(report_date) AS hasta,
       count(*) AS filas, count(DISTINCT report_date) AS dias,
       count(DISTINCT almacen_key) AS almacenes, sum(cantidad) AS unidades
  FROM public.rdp_rows;

\echo ''
\echo '=== 3. rdp_vd_rows: líneas de ventas directas por factura ==='
SELECT min(sell_date) AS desde, max(sell_date) AS hasta,
       count(*) AS filas, count(DISTINCT invoice_number) AS facturas, sum(quantity) AS unidades
  FROM public.rdp_vd_rows;

\echo ''
\echo '=== 4. fleet.orden: despachos de la flota ==='
SELECT min(fecha_despacho) AS desde, max(fecha_despacho) AS hasta,
       count(*) AS ordenes, count(DISTINCT id_despacho) AS despachos
  FROM fleet.orden;

\echo ''
\echo '=== 5. ¿Alguna columna guarda un código de documento de TKC (TKCE…, TKCS…)? ==='
SELECT table_schema AS esquema, table_name AS tabla, column_name AS columna
  FROM information_schema.columns
 WHERE column_name ~* '(codigo_doc|cod_doc|num_doc|n_doc|documento|tkce|tkcs|folio)'
   AND table_schema NOT IN ('pg_catalog', 'information_schema')
 ORDER BY 1, 2, 3;

\echo ''
\echo '=== 6. Cuántas corridas del cron hay de cada informe y de cuándo a cuándo ==='
SELECT 'rdp_runs' AS informe, count(*) AS corridas, min(report_date) AS desde, max(report_date) AS hasta FROM public.rdp_runs
UNION ALL
SELECT 'rdp_vd_runs', count(*), min(sell_date), max(sell_date) FROM public.rdp_vd_runs;
