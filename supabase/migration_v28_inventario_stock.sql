-- ============================================================
-- Migration v28: al completar un conteo de inventario, el stock del
-- sistema (productos.exist_fisica) se ajusta al conteo real auditado.
-- Antes, InventarioForm/Inventario.jsx solo guardaban la diferencia
-- como dato de auditoría; exist_fisica seguía desactualizado hasta el
-- siguiente sync de TKC (que además podría no conocer este ajuste si
-- no pasó por factura).
--
-- EJECUTAR en: BD principal (bnopapasaiyksmndxvly.supabase.co) → SQL Editor
-- ============================================================

-- SECURITY DEFINER: quien completa el conteo suele ser 'auditor', que
-- desde migration_v25 ya no tiene permiso de UPDATE directo sobre
-- productos. El trigger debe poder ajustar el stock sin depender del
-- rol de quien disparó el UPDATE en inventarios.
CREATE OR REPLACE FUNCTION apply_inventario_stock_reconciliation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado_tarea = 'completado'
     AND OLD.estado_tarea IS DISTINCT FROM 'completado'
     AND NEW.producto_id IS NOT NULL
     AND NEW.conteo_real IS NOT NULL
  THEN
    UPDATE productos
    SET    exist_fisica = NEW.conteo_real,
           updated_date = now()
    WHERE  id = NEW.producto_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventario_stock_reconciliation ON inventarios;
CREATE TRIGGER trg_inventario_stock_reconciliation
  AFTER UPDATE OF estado_tarea ON inventarios
  FOR EACH ROW EXECUTE FUNCTION apply_inventario_stock_reconciliation();

-- También cubre el caso de conteo SIN diferencia, que se crea ya con
-- estado_tarea = 'completado' desde el INSERT (no dispara el trigger
-- de UPDATE anterior porque nunca hay una transición OLD→NEW).
CREATE OR REPLACE FUNCTION apply_inventario_stock_reconciliation_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado_tarea = 'completado'
     AND NEW.producto_id IS NOT NULL
     AND NEW.conteo_real IS NOT NULL
  THEN
    UPDATE productos
    SET    exist_fisica = NEW.conteo_real,
           updated_date = now()
    WHERE  id = NEW.producto_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventario_stock_reconciliation_insert ON inventarios;
CREATE TRIGGER trg_inventario_stock_reconciliation_insert
  AFTER INSERT ON inventarios
  FOR EACH ROW EXECUTE FUNCTION apply_inventario_stock_reconciliation_insert();
