-- ============================================================
-- Migration v12: sync de productos sin id_tienda
-- Usa (almacen_num, codigo_producto) como clave de conflicto
-- cuando id_tienda es NULL
-- EJECUTAR en Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION sync_producto(
  p_almacen_num       text,
  p_id_tienda         text,
  p_codigo_producto   text,
  p_nombre            text,
  p_suministrador     text,
  p_unidad_medida     text,
  p_exist_fisica      numeric,
  p_almacen           numeric,
  p_tienda            numeric,
  p_precio_costo      numeric,
  p_fotos             jsonb,
  p_categoria_elineas text
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_id_tienda IS NOT NULL THEN
    -- Producto con ID de tienda: usa la constraint parcial
    INSERT INTO productos (
      almacen_num, id_tienda, codigo_producto, nombre, suministrador,
      unidad_medida, exist_fisica, almacen, tienda, precio_costo,
      fotos, categoria_elineas, activo
    )
    VALUES (
      p_almacen_num, p_id_tienda, p_codigo_producto, p_nombre, p_suministrador,
      p_unidad_medida, p_exist_fisica, p_almacen, p_tienda, p_precio_costo,
      p_fotos, p_categoria_elineas, true
    )
    ON CONFLICT (almacen_num, id_tienda) WHERE id_tienda IS NOT NULL
    DO UPDATE SET
      codigo_producto   = EXCLUDED.codigo_producto,
      nombre            = EXCLUDED.nombre,
      suministrador     = EXCLUDED.suministrador,
      unidad_medida     = EXCLUDED.unidad_medida,
      exist_fisica      = EXCLUDED.exist_fisica,
      almacen           = EXCLUDED.almacen,
      tienda            = EXCLUDED.tienda,
      precio_costo      = EXCLUDED.precio_costo,
      fotos             = EXCLUDED.fotos,
      categoria_elineas = EXCLUDED.categoria_elineas,
      activo            = true,
      updated_date      = now()
    RETURNING id INTO v_id;
  ELSE
    -- Producto sin ID de tienda: usa (almacen_num, codigo_producto)
    INSERT INTO productos (
      almacen_num, id_tienda, codigo_producto, nombre, suministrador,
      unidad_medida, exist_fisica, almacen, tienda, precio_costo,
      fotos, categoria_elineas, activo
    )
    VALUES (
      p_almacen_num, NULL, p_codigo_producto, p_nombre, p_suministrador,
      p_unidad_medida, p_exist_fisica, p_almacen, p_tienda, p_precio_costo,
      p_fotos, p_categoria_elineas, true
    )
    ON CONFLICT (almacen_num, codigo_producto)
    DO UPDATE SET
      nombre            = EXCLUDED.nombre,
      suministrador     = EXCLUDED.suministrador,
      unidad_medida     = EXCLUDED.unidad_medida,
      exist_fisica      = EXCLUDED.exist_fisica,
      almacen           = EXCLUDED.almacen,
      tienda            = EXCLUDED.tienda,
      precio_costo      = EXCLUDED.precio_costo,
      fotos             = EXCLUDED.fotos,
      categoria_elineas = EXCLUDED.categoria_elineas,
      activo            = true,
      updated_date      = now()
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;
