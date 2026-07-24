-- ============================================================
-- Migration v7: índices para escalabilidad
-- EJECUTAR en Supabase SQL Editor
-- ============================================================

-- Covering index para el query más frecuente:
-- fetchAllProductos → WHERE activo = true AND almacen_num = ? ORDER BY nombre
-- Sin este índice, Postgres hace seq scan de toda la tabla por cada almacén.
CREATE INDEX IF NOT EXISTS idx_productos_almacen_activo_nombre
  ON productos(almacen_num, activo, nombre);

-- Index en activo solo (para queries globales sin filtrar por almacén)
CREATE INDEX IF NOT EXISTS idx_productos_activo
  ON productos(activo)
  WHERE activo = true;

-- Partial index para productos con stock (Dashboard: con_stock, en_tienda)
CREATE INDEX IF NOT EXISTS idx_productos_con_ef
  ON productos(almacen_num, exist_fisica)
  WHERE activo = true AND exist_fisica > 0;

-- historial_movimientos: el query de syncFromExternal inserta en batches;
-- la consulta de auditoría filtra por producto_id + fecha desc
CREATE INDEX IF NOT EXISTS idx_historial_producto_fecha
  ON historial_movimientos(producto_id, fecha DESC)
  WHERE producto_id IS NOT NULL;

-- notificaciones: query principal es usuario_id + leida + created_date desc
-- El índice (usuario_id, leida) ya existe; añadimos created_date para evitar sort
CREATE INDEX IF NOT EXISTS idx_notif_usuario_leida_fecha
  ON notificaciones(usuario_id, leida, created_date DESC);

-- lotes: query de vencimientos filtra estado_fv IN (...) ORDER BY fecha_vencimiento
-- El índice en estado_fv existe; añadimos fecha_vencimiento para evitar sort
CREATE INDEX IF NOT EXISTS idx_lotes_estado_fecha
  ON lotes(estado_fv, fecha_vencimiento ASC)
  WHERE cantidad > 0;
