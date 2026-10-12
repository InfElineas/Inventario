--
-- Corrige la identidad del producto: IdTienda, no el código de barras
--
-- Hallazgo: en invGlobal, `Cód. Prod.` es el código de barras y TKC permite
-- varios anuncios distintos sobre el mismo código. La identidad real del
-- producto en tienda es `IdTienda`. Ejemplo medido: el código 7501032931414
-- en el almacén 593 aparece 7 veces — tres IdTienda distintos y cuatro filas
-- sin IdTienda.
--
-- El índice productos_almacen_codigo_unique asumía lo contrario. Al
-- sincronizar colapsaba 828 filas a 370, perdiendo anuncios reales y, lo
-- grave, 516 unidades de existencia repartidas en 45 filas: justo el dato
-- contra el que check_merma_cantidad valida las mermas.
--
-- Solución: una clave de sincronización derivada, que usa IdTienda cuando
-- existe y cae al código solo para las filas que no lo tienen.
--
-- EJECUTAR como elineasadmin, ANTES de poblar productos.
--

-- 1. Clave de sincronización ---------------------------------------------
-- Generada y almacenada: se recalcula sola y puede indexarse. El prefijo
-- 'cod:' evita que un IdTienda numérico choque con un código de barras.
ALTER TABLE inventario.productos
  ADD COLUMN IF NOT EXISTS clave_sync text
  GENERATED ALWAYS AS (
    COALESCE(NULLIF(btrim(id_tienda), ''), 'cod:' || COALESCE(codigo_producto, ''))
  ) STORED;

-- 2. Índices --------------------------------------------------------------
-- Fuera el que asumía código único por almacén: es incompatible con el dato.
DROP INDEX IF EXISTS inventario.productos_almacen_codigo_unique;

CREATE UNIQUE INDEX IF NOT EXISTS productos_almacen_clave_unique
  ON inventario.productos (almacen_num, clave_sync);

-- El código deja de ser único, pero se sigue buscando por él (ProductSearch,
-- escaneo de código de barras), así que conserva índice no único.
CREATE INDEX IF NOT EXISTS productos_almacen_codigo_idx
  ON inventario.productos (almacen_num, codigo_producto);

-- 3. Funciones obsoletas --------------------------------------------------
-- sync_productos_bulk hacía ON CONFLICT contra el índice que acabamos de
-- retirar, y ambas pertenecen a la cadena vieja (REST contra el segundo
-- Supabase). Las reemplaza sync_productos_desde_invglobal.
DROP FUNCTION IF EXISTS inventario.sync_productos_bulk(jsonb, text);
DROP FUNCTION IF EXISTS inventario.deactivate_stale_sync(text, jsonb);
DROP FUNCTION IF EXISTS inventario.sync_producto(jsonb);
