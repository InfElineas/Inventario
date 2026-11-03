--
-- Diagnóstico de fuentes de datos para Facturación (F0)
--
-- SOLO LEE. Ni un INSERT, UPDATE, DELETE ni DDL: son consultas contra el
-- catálogo de Postgres y contra `pg_class`. Se puede ejecutar como
-- elineasadmin sin riesgo y las veces que haga falta.
--
-- Qué responde: si ELINEAS_BD ya tiene tablas o vistas de movimientos,
-- ventas, transferencias o despachos. Ver docs/facturacion-pasos.md.
--
-- No lleva ON_ERROR_STOP a propósito: la consulta 5 falla si no hay pg_cron
-- y eso es una respuesta válida, no un problema.
--

\echo '=== 1. Tablas y vistas (sin las del sistema), con filas aproximadas ==='
SELECT n.nspname              AS esquema,
       c.relname              AS nombre,
       CASE c.relkind WHEN 'r' THEN 'tabla' WHEN 'v' THEN 'vista'
                      WHEN 'm' THEN 'vista materializada' ELSE c.relkind::text END AS tipo,
       c.reltuples::bigint    AS filas_aprox
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind IN ('r', 'v', 'm')
   AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
 ORDER BY 1, 2;

\echo ''
\echo '=== 2. Columnas cuyo nombre sugiere movimientos, documentos, notas o ventas ==='
SELECT table_schema AS esquema, table_name AS tabla, column_name AS columna, data_type AS tipo
  FROM information_schema.columns
 WHERE column_name ~* '(observ|nota|documento|doc_|transfer|despach|venta|salida|entrada|movim)'
   AND table_schema NOT IN ('pg_catalog', 'information_schema')
 ORDER BY 1, 2, 3;

\echo ''
\echo '=== 3. Definición de las vistas que parecen de informes (primeros 900 caracteres) ==='
SELECT schemaname AS esquema, viewname AS vista, left(definition, 900) AS definicion
  FROM pg_views
 WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
   AND viewname ~* '(rdp|mov|venta|transfer|despach|lot_rows|report|informe)'
 ORDER BY 1, 2;

\echo ''
\echo '=== 4. Las 15 tablas más grandes: donde suele estar el histórico ==='
SELECT n.nspname AS esquema, c.relname AS nombre,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS tamano,
       c.reltuples::bigint AS filas_aprox
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind = 'r'
   AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
 ORDER BY pg_total_relation_size(c.oid) DESC
 LIMIT 15;

\echo ''
\echo '=== 5. Tareas programadas en la base (si hay pg_cron) ==='
SELECT jobid, schedule, left(command, 300) AS comando FROM cron.job ORDER BY jobid;
