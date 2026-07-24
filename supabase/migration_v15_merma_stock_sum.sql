-- ============================================================
-- Migration v15: mejora del trigger de mermas
-- Suma todas las mermas pendientes del mismo producto
-- para garantizar que nunca se supere la existencia física
-- EJECUTAR en: BD LOCAL (fiftxvdgwrbjudjtfhhi.supabase.co)
--              Dashboard → SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION check_merma_cantidad()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_exist_fisica numeric;
  v_pendientes   numeric;
BEGIN
  IF NEW.producto_id IS NULL OR COALESCE(NEW.cantidad, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(exist_fisica, 0)
    INTO v_exist_fisica
    FROM productos
   WHERE id = NEW.producto_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Suma de mermas activas del mismo producto (excluye la propia fila en UPDATE)
  SELECT COALESCE(SUM(cantidad), 0)
    INTO v_pendientes
    FROM mermas
   WHERE producto_id    = NEW.producto_id
     AND estado_tarea NOT IN ('completado', 'devuelto')
     AND id IS DISTINCT FROM NEW.id;

  IF NEW.cantidad + v_pendientes > v_exist_fisica THEN
    RAISE EXCEPTION
      'Cantidad de merma (%) + mermas pendientes del producto (%) supera la existencia física (%). Operación rechazada.',
      NEW.cantidad, v_pendientes, v_exist_fisica
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
