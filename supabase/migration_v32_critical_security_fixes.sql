-- ============================================================
-- Migration v32: cierra 3 huecos críticos introducidos por la propia
-- ronda de fixes anterior (v25-v28). Confirmados por auditoría
-- independiente. EJECUTAR DE INMEDIATO.
--
-- 1. sync_productos_bulk / deactivate_stale_sync quedaron
--    SECURITY DEFINER sin ningún guard de rol interno. Como se
--    invocan vía supabase.rpc(...) con la sesión normal del usuario
--    (src/services/syncService.js), CUALQUIER rol autenticado podía
--    llamarlas directo (consola del navegador) y escribir/desactivar
--    productos de cualquier almacén, saltándose por completo la
--    restricción de rol que productos_update (v25) impone.
--
-- 2. get_user_role() devolvía 'inv' por defecto cuando no encontraba
--    una fila activa=true para el email actual — es decir, un
--    usuario DESACTIVADO o AÚN NO APROBADO conservaba privilegios de
--    'inv' en todas las políticas de v25 mientras su JWT siguiera
--    vigente. Reabría exactamente lo que v25 pretendía cerrar.
--
-- 3. inventarios_update permitía a 'inv' fijar estado_tarea a
--    'completado' en una sola UPDATE (saltándose FACT/Auditor), y el
--    trigger de v28 sobrescribe exist_fisica sin validar rango —
--    combinado, 'inv' podía autoaprobarse y fijar el stock de
--    cualquier producto a cualquier valor. De paso, se corrige v28
--    para aplicar la diferencia auditada como DELTA (no un overwrite
--    absoluto), evitando resucitar stock si algo más lo cambió
--    mientras el conteo esperaba aprobación.
--
-- EJECUTAR en: BD principal (bnopapasaiyksmndxvly.supabase.co) → SQL Editor
-- ============================================================

-- ============================================================
-- 1. get_user_role() — fallback seguro (sin privilegios) en vez de 'inv'
-- ============================================================
create or replace function public.get_user_role()
returns text language plpgsql security definer as $$
declare
  v_role text;
begin
  select role into v_role
  from public.usuarios
  where email = auth.email()
    and activo = true
  limit 1;
  -- 'sin_rol' no aparece en ninguna política — un usuario sin fila
  -- activa (pendiente, desactivado, o borrado) no obtiene ningún
  -- permiso por defecto.
  return coalesce(v_role, 'sin_rol');
end;
$$;

-- ============================================================
-- 2. sync_productos_bulk / deactivate_stale_sync — guard de rol
-- current_user = 'service_role' permite el paso del cron
-- (supabase/functions/sync-auto usa la service role key, no una
-- sesión de usuario, y ya bypassea RLS por diseño). Para llamadas
-- con sesión de usuario normal, solo inv/administrador/superadmin
-- (los mismos roles que ya pueden disparar sync desde BdTkc.jsx).
-- ============================================================
CREATE OR REPLACE FUNCTION sync_productos_bulk(
  p_rows    jsonb,
  p_almacen text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_synced  int  := 0;
  v_errors  int  := 0;
  v_errmsg  text;
  v_count   int  := 0;
BEGIN
  IF current_user <> 'service_role'
     AND public.get_user_role() NOT IN ('inv', 'administrador', 'superadmin')
  THEN
    RAISE EXCEPTION 'No autorizado para ejecutar sync_productos_bulk';
  END IF;

  BEGIN
    UPDATE productos p
    SET    id_tienda = NULL,
           activo    = false
    FROM (
      SELECT DISTINCT r->>'id_tienda'       AS id_tienda,
                      r->>'codigo_producto' AS codigo_producto
      FROM   jsonb_array_elements(p_rows) r
      WHERE  r->>'id_tienda'       IS NOT NULL
        AND  r->>'codigo_producto' IS NOT NULL
        AND  r->>'codigo_producto' <> ''
    ) src
    WHERE  p.almacen_num       = p_almacen
      AND  p.id_tienda         = src.id_tienda
      AND  p.codigo_producto  IS DISTINCT FROM src.codigo_producto;

    WITH src AS (
      SELECT DISTINCT ON (r->>'codigo_producto')
        p_almacen                                    AS almacen_num,
        r->>'id_tienda'                              AS id_tienda,
        r->>'codigo_producto'                        AS codigo_producto,
        r->>'nombre'                                 AS nombre,
        r->>'suministrador'                          AS suministrador,
        COALESCE(r->>'unidad_medida', 'u')           AS unidad_medida,
        COALESCE((r->>'exist_fisica')::numeric,  0)  AS exist_fisica,
        COALESCE((r->>'almacen')::numeric,       0)  AS almacen,
        COALESCE((r->>'tienda')::numeric,        0)  AS tienda,
        COALESCE((r->>'precio_costo')::numeric,  0)  AS precio_costo,
        COALESCE(r->'fotos', '[]'::jsonb)            AS fotos,
        r->>'categoria_elineas'                      AS categoria_elineas
      FROM jsonb_array_elements(p_rows) AS r
      WHERE r->>'codigo_producto' IS NOT NULL
        AND r->>'codigo_producto' <> ''
    )
    INSERT INTO productos (
      almacen_num, id_tienda, codigo_producto, nombre, suministrador,
      unidad_medida, exist_fisica, almacen, tienda, precio_costo,
      fotos, categoria_elineas, activo
    )
    SELECT
      almacen_num, id_tienda, codigo_producto, nombre, suministrador,
      unidad_medida, exist_fisica, almacen, tienda, precio_costo,
      fotos, categoria_elineas, true
    FROM src
    ON CONFLICT (almacen_num, codigo_producto)
    DO UPDATE SET
      id_tienda         = EXCLUDED.id_tienda,
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
      updated_date      = now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_synced := v_count;
  EXCEPTION WHEN OTHERS THEN
    v_errors := 1;
    v_errmsg := SQLERRM;
  END;

  RETURN jsonb_build_object(
    'synced',    v_synced,
    'errors',    v_errors,
    'error_msg', v_errmsg
  );
END;
$$;

CREATE OR REPLACE FUNCTION deactivate_stale_sync(
  p_almacen  text,
  p_codigos  jsonb
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  IF current_user <> 'service_role'
     AND public.get_user_role() NOT IN ('inv', 'administrador', 'superadmin')
  THEN
    RAISE EXCEPTION 'No autorizado para ejecutar deactivate_stale_sync';
  END IF;

  UPDATE productos
  SET    activo = false
  WHERE  almacen_num    = p_almacen
    AND  activo         = true
    AND  codigo_producto IS NOT NULL
    AND  codigo_producto NOT IN (
           SELECT jsonb_array_elements_text(p_codigos)
         );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================
-- 3a. inventarios_update — 'inv' ya no puede saltar directo a
-- 'completado' (solo fact/auditor/admin pueden llegar ahí). El caso
-- legítimo de "sin diferencia → completado" sigue funcionando porque
-- ocurre en el INSERT (inventarios_insert no restringe estado_tarea),
-- no en este UPDATE.
-- ============================================================
drop policy if exists "inventarios_update" on inventarios;

create policy "inventarios_update" on inventarios
  for update
  using (
    public.is_admin()
    or (public.get_user_role() = 'inv'     and estado_tarea in ('en_curso', 'devuelto'))
    or (public.get_user_role() = 'fact'    and estado_tarea = 'pend_fact')
    or (public.get_user_role() = 'auditor' and estado_tarea = 'en_auditoria')
  )
  with check (
    public.is_admin()
    or (public.get_user_role() = 'inv'     and estado_tarea in ('en_curso', 'devuelto', 'pend_fact', 'en_auditoria'))
    or (public.get_user_role() = 'fact'    and estado_tarea in ('pend_fact', 'en_auditoria', 'devuelto'))
    or (public.get_user_role() = 'auditor' and estado_tarea in ('en_auditoria', 'completado', 'devuelto'))
  );

-- ============================================================
-- 3b. Reconciliación de stock por DELTA, no por overwrite absoluto.
-- Antes: exist_fisica = NEW.conteo_real (podía resucitar stock si una
-- merma o un sync ya lo habían cambiado mientras el conteo esperaba
-- aprobación). Ahora: exist_fisica = exist_fisica + NEW.diferencia,
-- que es el ajuste descubierto por el conteo (conteo_real - EF al
-- momento del conteo), aplicado sobre el valor ACTUAL de la BD.
-- ============================================================
CREATE OR REPLACE FUNCTION apply_inventario_stock_reconciliation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado_tarea = 'completado'
     AND OLD.estado_tarea IS DISTINCT FROM 'completado'
     AND NEW.producto_id IS NOT NULL
     AND NEW.diferencia IS NOT NULL
     AND NEW.diferencia <> 0
  THEN
    UPDATE productos
    SET    exist_fisica = GREATEST(COALESCE(exist_fisica, 0) + NEW.diferencia, 0),
           updated_date = now()
    WHERE  id = NEW.producto_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION apply_inventario_stock_reconciliation_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado_tarea = 'completado'
     AND NEW.producto_id IS NOT NULL
     AND NEW.diferencia IS NOT NULL
     AND NEW.diferencia <> 0
  THEN
    UPDATE productos
    SET    exist_fisica = GREATEST(COALESCE(exist_fisica, 0) + NEW.diferencia, 0),
           updated_date = now()
    WHERE  id = NEW.producto_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 3c. Blindaje adicional: producto_id no debe cambiar una vez creada
-- la merma o el inventario. Sin esto, un rol con permiso de UPDATE en
-- una etapa del flujo (fact/auditor) podría re-apuntar el registro a
-- otro producto antes de aprobarlo, y el trigger de stock (v27/v32)
-- descontaría/ajustaría el producto equivocado — aunque ese rol nunca
-- tuvo permiso directo de UPDATE en productos.
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_producto_id_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.producto_id IS DISTINCT FROM OLD.producto_id THEN
    RAISE EXCEPTION 'No se puede cambiar el producto de un registro ya creado';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mermas_lock_producto_id ON mermas;
CREATE TRIGGER trg_mermas_lock_producto_id
  BEFORE UPDATE ON mermas
  FOR EACH ROW EXECUTE FUNCTION prevent_producto_id_change();

DROP TRIGGER IF EXISTS trg_inventarios_lock_producto_id ON inventarios;
CREATE TRIGGER trg_inventarios_lock_producto_id
  BEFORE UPDATE ON inventarios
  FOR EACH ROW EXECUTE FUNCTION prevent_producto_id_change();

-- ============================================================
-- 4. recepciones — falta la policy de DELETE para "administrador"
-- La UI (Recepciones.jsx: canEdit = inv/administrador + en_curso)
-- muestra el botón de eliminar a administrador, pero solo existía
-- "inv_delete_recepciones"-equivalente... en realidad ni eso: v25
-- solo agregó recepciones_delete para 'inv', dejando a administrador
-- sin ninguna policy de DELETE salvo superadmin (v19). Un admin que
-- pulse "Eliminar" recibe un rechazo RLS silencioso.
-- ============================================================
create policy "administrador_delete_recepciones" on recepciones
  for delete
  using (public.get_user_role() = 'administrador' and estado = 'en_curso');
