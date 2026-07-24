-- ============================================================
-- Migration v17: fix trigger check_merma_cantidad
-- Las correcciones de mermas devueltas o en reconteo ya fueron
-- validadas en su creación — no hay que volver a bloquearlas.
-- EJECUTAR en: BD LOCAL (bnopapasaiyksmndxvly.supabase.co)
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

  -- Correcciones de mermas devueltas o en reconteo: la cantidad ya fue
  -- validada al crear la merma original. Solo verificar que sea positiva.
  IF TG_OP = 'UPDATE' AND OLD.estado_tarea IN ('devuelto', 'reconteo_solicitado') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(exist_fisica, 0)
    INTO v_exist_fisica
    FROM productos
   WHERE id = NEW.producto_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Suma de mermas activas del mismo producto (excluye completadas, devueltas y la propia fila)
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
