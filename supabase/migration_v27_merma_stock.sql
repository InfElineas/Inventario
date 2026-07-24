-- ============================================================
-- Migration v27: descuenta exist_fisica al completar una merma +
-- valida cantidad en TODAS las correcciones (antes se saltaba
-- la validación en devuelto/reconteo_solicitado, sin tope superior).
--
-- EJECUTAR en: BD principal (bnopapasaiyksmndxvly.supabase.co) → SQL Editor
--
-- NOTA IMPORTANTE (arquitectura, no solo bug de código):
-- exist_fisica lo sobreescribe por completo el sync de TKC en cada
-- corrida (cada ~15 min). Este trigger resta el stock localmente en
-- cuanto una merma se aprueba, para cerrar la ventana en la que dos
-- mermas seguidas se aprueban contra el mismo exist_fisica sin
-- refrescar. Para mermas CON factura (requiere_fact = true), esa resta
-- local queda "confirmada" por el siguiente sync cuando TKC ya
-- refleja la factura. Para mermas SIN factura (CLASIF_MERMA_SIN_FACT),
-- TKC nunca se entera de esta merma por sí solo — el siguiente sync
-- puede volver a poner exist_fisica al valor de TKC y deshacer la
-- resta local. Esa brecha es un tema de proceso (¿quién ajusta TKC
-- para mermas sin factura?), no algo que un trigger pueda resolver solo.
-- ============================================================

-- ── 1. Validar SIEMPRE la cantidad (elimina el bypass de v17) ──
CREATE OR REPLACE FUNCTION check_merma_cantidad()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_exist_fisica numeric;
  v_pendientes   numeric;
BEGIN
  IF NEW.producto_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.cantidad, 0) <= 0 THEN
    RAISE EXCEPTION 'Cantidad de merma inválida (%): debe ser mayor a 0.', NEW.cantidad
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(exist_fisica, 0)
    INTO v_exist_fisica
    FROM productos
   WHERE id = NEW.producto_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Suma de mermas activas del mismo producto (excluye completadas, devueltas y esta fila)
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

-- ── 2. Descontar exist_fisica cuando una merma llega a 'completado' ──
-- SECURITY DEFINER: quien completa la merma normalmente es 'auditor', que
-- desde la migration_v25 ya NO tiene permiso de UPDATE directo sobre
-- productos. El trigger debe poder ajustar el stock igual, sin depender
-- del rol de quien disparó el UPDATE en mermas.
CREATE OR REPLACE FUNCTION apply_merma_stock_deduction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado_tarea = 'completado'
     AND OLD.estado_tarea IS DISTINCT FROM 'completado'
     AND NEW.producto_id IS NOT NULL
     AND COALESCE(NEW.cantidad, 0) > 0
  THEN
    UPDATE productos
    SET    exist_fisica = GREATEST(COALESCE(exist_fisica, 0) - NEW.cantidad, 0),
           updated_date = now()
    WHERE  id = NEW.producto_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_merma_stock_deduction ON mermas;
CREATE TRIGGER trg_merma_stock_deduction
  AFTER UPDATE OF estado_tarea ON mermas
  FOR EACH ROW EXECUTE FUNCTION apply_merma_stock_deduction();
