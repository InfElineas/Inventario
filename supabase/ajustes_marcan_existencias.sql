--
-- Un ajuste aplicado también es un dato nuevo: que la sincronización no lo pise
--
-- Cuando un conteo o una merma se completan, un disparador suma o resta la
-- diferencia a `productos.exist_fisica`. Ese número es más reciente que la foto
-- del submayor —que el cron de elineas-transferencia saca dos veces al día—,
-- pero no lo decía: `existencias_en` se quedaba con la fecha de la foto y la
-- sincronización de la hora siguiente lo reemplazaba por el valor viejo.
--
-- O sea, el ajuste desaparecía de la pantalla aunque estuviera hecho, igual
-- que pasaba con subir y bajar de tienda antes de `existencias_en.sql`. Aquí
-- se arregla el mismo descuido en los tres disparadores que tocan existencias.
--
-- `almacen` y `tienda` NO se tocan: el conteo mide la existencia física y no
-- dice de qué lado está la mercancía. Inventarlo sería peor que dejarlo.
--
-- EJECUTAR como elineasadmin.
--

CREATE OR REPLACE FUNCTION inventario.apply_inventario_stock_reconciliation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'inventario'
    AS $$
BEGIN
  IF NEW.estado_tarea = 'completado'
     AND OLD.estado_tarea IS DISTINCT FROM 'completado'
     AND NEW.producto_id IS NOT NULL
     AND NEW.diferencia IS NOT NULL
     AND NEW.diferencia <> 0
  THEN
    UPDATE productos
    SET    exist_fisica = GREATEST(COALESCE(exist_fisica, 0) + NEW.diferencia, 0),
           existencias_en = now(),
           updated_date = now()
    WHERE  id = NEW.producto_id;
  END IF;
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION inventario.apply_inventario_stock_reconciliation_insert() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'inventario'
    AS $$
BEGIN
  IF NEW.estado_tarea = 'completado'
     AND NEW.producto_id IS NOT NULL
     AND NEW.diferencia IS NOT NULL
     AND NEW.diferencia <> 0
  THEN
    UPDATE productos
    SET    exist_fisica = GREATEST(COALESCE(exist_fisica, 0) + NEW.diferencia, 0),
           existencias_en = now(),
           updated_date = now()
    WHERE  id = NEW.producto_id;
  END IF;
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION inventario.apply_merma_stock_deduction() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'inventario'
    AS $$
BEGIN
  IF NEW.estado_tarea = 'completado'
     AND OLD.estado_tarea IS DISTINCT FROM 'completado'
     AND NEW.producto_id IS NOT NULL
     AND COALESCE(NEW.cantidad, 0) > 0
  THEN
    UPDATE productos
    SET    exist_fisica = GREATEST(COALESCE(exist_fisica, 0) - NEW.cantidad, 0),
           existencias_en = now(),
           updated_date = now()
    WHERE  id = NEW.producto_id;
  END IF;
  RETURN NEW;
END;
$$;
