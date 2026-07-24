-- ============================================================
-- Migration v14: trigger que impide mermas > existencia física
-- EJECUTAR en: BD LOCAL (fiftxvdgwrbjudjtfhhi.supabase.co)
--              Dashboard → SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION check_merma_cantidad()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_exist_fisica numeric;
BEGIN
  -- Solo validar cuando hay producto vinculado y cantidad > 0
  IF NEW.producto_id IS NULL OR COALESCE(NEW.cantidad, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(exist_fisica, 0)
    INTO v_exist_fisica
    FROM productos
   WHERE id = NEW.producto_id;

  IF NOT FOUND THEN
    RETURN NEW; -- producto no existe aún (raro), deja pasar
  END IF;

  IF NEW.cantidad > v_exist_fisica THEN
    RAISE EXCEPTION
      'Cantidad de merma (%) supera la existencia física del producto (%). Operación rechazada.',
      NEW.cantidad, v_exist_fisica
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Aplica en INSERT y en UPDATE de cantidad
DROP TRIGGER IF EXISTS trg_merma_stock_check ON mermas;
CREATE TRIGGER trg_merma_stock_check
  BEFORE INSERT OR UPDATE OF cantidad ON mermas
  FOR EACH ROW EXECUTE FUNCTION check_merma_cantidad();
