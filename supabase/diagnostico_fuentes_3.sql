--
-- Diagnóstico de fuentes de datos para Facturación (F0), tercera parte
--
-- SOLO LEE. Ni un INSERT, UPDATE, DELETE ni DDL.
--
-- Sin clientes, operadores, direcciones ni teléfonos: solo conteos, rangos de
-- fechas, nombres de columnas y los nombres de los almacenes. Lo que la parte 2
-- dejó sin responder: hasta dónde llega el histórico de ventas directas
-- (RDP_VD), cuánto submayor hay guardado y a qué se parecen los códigos de
-- producto de la flota. Ver docs/facturacion-hallazgos.md.
--

\echo '=== 1. RDP_VD (la tabla grande de ventas directas): rango y volumen ==='
SELECT min(sell_date) AS desde, max(sell_date) AS hasta,
       count(*) AS filas, count(DISTINCT invoice_number) AS facturas, sum(quantity) AS unidades
  FROM public."RDP_VD";

\echo ''
\echo '=== 2. Las corridas del submayor guardadas (¿hay historial de existencias?) ==='
SELECT * FROM public.sub_runs ORDER BY 1 LIMIT 30;

\echo ''
\echo '=== 3. Columnas de sub_changelog y de ap_changelog (cambios de existencia) ==='
SELECT table_name AS tabla, column_name AS columna, data_type AS tipo
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name IN ('sub_changelog', 'ap_changelog')
 ORDER BY 1, ordinal_position;

\echo ''
\echo '=== 4. Fechas que cubre sub_changelog ==='
-- Asume una columna `changed_at`. Si falla, la consulta 3 dice cómo se llama de verdad.
SELECT min(changed_at) AS desde, max(changed_at) AS hasta, count(*) AS filas FROM public.sub_changelog;

\echo ''
\echo '=== 5. Los 25 almacenes de rdp_rows y cuántas filas tiene cada uno ==='
SELECT almacen_key, almacen_nombre, count(*) AS filas, sum(cantidad) AS unidades
  FROM public.rdp_rows GROUP BY 1, 2 ORDER BY 1;

\echo ''
\echo '=== 6. Despachos de la flota: unidades y cómo es el código de producto ==='
SELECT count(*) AS lineas, sum(op.cantidad) AS unidades,
       count(DISTINCT o.id_despacho) AS despachos
  FROM fleet.orden o JOIN fleet.orden_producto op USING (id_orden)
 WHERE o.fecha_despacho IS NOT NULL;

SELECT op.producto AS ejemplo_de_producto
  FROM fleet.orden_producto op ORDER BY op.creado_en DESC LIMIT 5;
