--
-- Esquema de Inventario portado de Supabase a ELINEAS_BD
--
-- Generado a partir de `pg_dump --schema-only` del proyecto de Supabase, con
-- estas transformaciones:
--   · public.* -> inventario.*
--   · fuera las 40 policies y los 14 ENABLE ROW LEVEL SECURITY: la
--     autorización pasa al backend
--   · fuera handle_new_auth_user, get_user_role, is_admin, is_superadmin y
--     prevent_role_self_escalation (maquinaria de Supabase Auth)
--   · fuera la FK usuarios.id -> auth.users(id): esa tabla no migra, y el
--     vínculo con el Identity Server es el email
--   · fuera SECURITY DEFINER: ya no hay RLS que saltarse, y mantenerlo haría
--     que los triggers corrieran como elineasadmin
--   · fuera el guard de rol interno de sync_productos_bulk y
--     deactivate_stale_sync, que dependía de get_user_role()
--
-- EJECUTAR como elineasadmin:
--   docker exec -i ELINEAS_BD psql -U elineasadmin -d ELINEAS_BD -v ON_ERROR_STOP=1 \
--     < migracion_a_elineas_bd.sql
--
-- El esquema `inventario` debe existir ya (ver docs/migracion-supabase.md).
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;

SET search_path TO inventario;

--
-- Name: apply_inventario_stock_reconciliation(); Type: FUNCTION; Schema: inventario
--


CREATE FUNCTION inventario.apply_inventario_stock_reconciliation() RETURNS trigger
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
           updated_date = now()
    WHERE  id = NEW.producto_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: apply_inventario_stock_reconciliation_insert(); Type: FUNCTION; Schema: inventario
--


CREATE FUNCTION inventario.apply_inventario_stock_reconciliation_insert() RETURNS trigger
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
           updated_date = now()
    WHERE  id = NEW.producto_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: apply_merma_stock_deduction(); Type: FUNCTION; Schema: inventario
--


CREATE FUNCTION inventario.apply_merma_stock_deduction() RETURNS trigger
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
           updated_date = now()
    WHERE  id = NEW.producto_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: calc_estado_anuncio(text, numeric, numeric, numeric); Type: FUNCTION; Schema: inventario
--


CREATE FUNCTION inventario.calc_estado_anuncio(p_id_tienda text, p_ef numeric, p_almacen numeric, p_tienda numeric) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select case
    when (p_id_tienda is null or p_id_tienda = '') and p_ef = 0 then 'SIN ID EF=0'
    when (p_id_tienda is null or p_id_tienda = '') and p_ef > 0 then 'SIN ID EF>0'
    when p_id_tienda is not null and p_id_tienda <> '' and p_ef = 0 and p_almacen = 0 and p_tienda > 6 then 'DESACTIVADO MUERTO EF=0'
    when p_id_tienda is not null and p_id_tienda <> '' and p_tienda = 0 and p_ef > 10 then 'DESACTIVADO MUERTO EF>0'
    when p_id_tienda is not null and p_id_tienda <> '' and p_ef = 0 then 'DESACTIVADO EF=0'
    when p_id_tienda is not null and p_id_tienda <> '' and p_ef > 0 then 'ACTIVADO'
    else 'DESACTIVADO'
  end
$$;


--
-- Name: calc_estado_tienda(text, numeric, numeric, numeric); Type: FUNCTION; Schema: inventario
--


CREATE FUNCTION inventario.calc_estado_tienda(p_id_tienda text, p_ef numeric, p_almacen numeric, p_tienda numeric) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    AS $$
  select case
    when (p_id_tienda is null or p_id_tienda = '') and p_ef = 0
         then '{"estado":"SIN ID","prioridad":10}'::jsonb
    when (p_id_tienda is not null and p_id_tienda <> '') and p_ef = 0
         then '{"estado":"AGOTADO","prioridad":11}'::jsonb
    when p_almacen = 0 and p_tienda > 6
         then '{"estado":"SIN RESERVA","prioridad":1}'::jsonb
    when p_tienda = 0 and p_ef > 10
         then '{"estado":"NO TIENDA","prioridad":2}'::jsonb
    when p_tienda = 0 and p_ef <= 10
         then '{"estado":"NO TIENDA","prioridad":3}'::jsonb
    when p_tienda > 1 and p_tienda < p_almacen and p_almacen <= 10
         then '{"estado":"ULTIMAS PIEZAS","prioridad":4}'::jsonb
    when p_tienda <= 10
         then '{"estado":"PROXIMO","prioridad":5}'::jsonb
    when p_almacen >= 0 and p_almacen < p_tienda and p_tienda <= 10
         then '{"estado":"ULTIMAS PIEZAS","prioridad":6}'::jsonb
    when p_tienda <= p_almacen
         then '{"estado":"DISPONIBLE","prioridad":7}'::jsonb
    when p_almacen < p_tienda
         then '{"estado":"DISPONIBLE","prioridad":8}'::jsonb
    else '{"estado":"SIN DATOS","prioridad":99}'::jsonb
  end
$$;


--
-- Name: check_merma_cantidad(); Type: FUNCTION; Schema: inventario
--


CREATE FUNCTION inventario.check_merma_cantidad() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: deactivate_stale_sync(text, jsonb); Type: FUNCTION; Schema: inventario
--


CREATE FUNCTION inventario.deactivate_stale_sync(p_almacen text, p_codigos jsonb) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'inventario'
    AS $$
DECLARE v_count int;
BEGIN
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


--
-- Name: prevent_producto_id_change(); Type: FUNCTION; Schema: inventario
--


CREATE FUNCTION inventario.prevent_producto_id_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.producto_id IS DISTINCT FROM OLD.producto_id THEN
    RAISE EXCEPTION 'No se puede cambiar el producto de un registro ya creado';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_updated_date(); Type: FUNCTION; Schema: inventario
--


CREATE FUNCTION inventario.set_updated_date() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_date = now();
  return new;
end;
$$;


--
-- Name: sync_producto(text, text, text, text, text, text, numeric, numeric, numeric, numeric, jsonb, text); Type: FUNCTION; Schema: inventario
--


CREATE FUNCTION inventario.sync_producto(p_almacen_num text, p_id_tienda text, p_codigo_producto text, p_nombre text, p_suministrador text, p_unidad_medida text, p_exist_fisica numeric, p_almacen numeric, p_tienda numeric, p_precio_costo numeric, p_fotos jsonb, p_categoria_elineas text) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sync_productos_bulk(jsonb, text); Type: FUNCTION; Schema: inventario
--


CREATE FUNCTION inventario.sync_productos_bulk(p_rows jsonb, p_almacen text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'inventario'
    AS $$
DECLARE
  v_synced  int  := 0;
  v_errors  int  := 0;
  v_errmsg  text;
  v_count   int  := 0;
BEGIN
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_audit_log; Type: TABLE; Schema: inventario
--


CREATE TABLE inventario.admin_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_email text NOT NULL,
    accion text NOT NULL,
    target_email text NOT NULL,
    detalle jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: anuncios_desact; Type: TABLE; Schema: inventario
--


CREATE TABLE inventario.anuncios_desact (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    producto_id uuid,
    producto_nombre text,
    producto_codigo text,
    suministrador text,
    tipo_caso text,
    estado_tarea text DEFAULT 'pendiente'::text,
    estado_anuncio_tkc text,
    ef_al_detectar numeric,
    fecha_deteccion date,
    motivo_tkc text,
    motivo_elineas text,
    accion_inv text,
    nota_inv text,
    especialista_inv_id text,
    especialista_inv_nombre text,
    fecha_inv date,
    accion_ca text,
    precio_nuevo numeric,
    nota_ca text,
    especialista_ca_id text,
    especialista_ca_nombre text,
    fecha_ca date,
    nota_auditor text,
    auditor_id text,
    auditor_nombre text,
    fecha_auditoria date,
    fecha_resolucion date,
    created_date timestamp with time zone DEFAULT now()
);


--
-- Name: productos; Type: TABLE; Schema: inventario
--


CREATE TABLE inventario.productos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    codigo_producto text,
    suministrador text,
    categoria_elineas text,
    estado_anuncio text DEFAULT 'DESACTIVADO'::text,
    exist_fisica numeric DEFAULT 0,
    almacen numeric DEFAULT 0,
    tienda numeric DEFAULT 0,
    precio numeric DEFAULT 0,
    precio_costo numeric DEFAULT 0,
    id_tienda text,
    stock_minimo integer DEFAULT 0,
    activo boolean DEFAULT true,
    created_date timestamp with time zone DEFAULT now(),
    updated_date timestamp with time zone DEFAULT now(),
    unidad_medida text DEFAULT 'u'::text,
    categoria_id integer,
    indice_calculo text DEFAULT 'AVG'::text,
    dias_horizonte integer DEFAULT 30,
    stock_max integer DEFAULT 0,
    resultado_tkc_real text,
    clasificacion_ajuste text,
    motivo_desact_tkc text,
    motivo_desact_elineas text,
    estado_tarea_producto text DEFAULT 'Pendiente'::text,
    especialista_fact text,
    auditor_producto text,
    estado_fact text,
    almacen_num text DEFAULT ''::text,
    fotos jsonb DEFAULT '[]'::jsonb
);


--
-- Name: bd_tkc; Type: VIEW; Schema: inventario
--


CREATE VIEW inventario.bd_tkc AS
 SELECT id,
    almacen_num,
    id_tienda,
    codigo_producto,
    nombre,
    suministrador,
    unidad_medida,
    categoria_elineas,
    categoria_id,
    exist_fisica AS ef,
    almacen AS a,
    tienda AS t,
    precio,
    precio_costo,
    inventario.calc_estado_anuncio(id_tienda, exist_fisica, almacen, tienda) AS estado_anuncio_calc,
    (inventario.calc_estado_tienda(id_tienda, exist_fisica, almacen, tienda) ->> 'estado'::text) AS estado_tienda,
    ((inventario.calc_estado_tienda(id_tienda, exist_fisica, almacen, tienda) ->> 'prioridad'::text))::integer AS prioridad_tienda,
    resultado_tkc_real,
    clasificacion_ajuste,
    motivo_desact_tkc,
    motivo_desact_elineas,
    estado_tarea_producto,
    especialista_fact,
    auditor_producto,
    estado_fact,
    indice_calculo,
    dias_horizonte,
    stock_max,
    stock_minimo,
    activo,
    created_date,
    updated_date
   FROM inventario.productos p;


--
-- Name: comentarios_supervision; Type: TABLE; Schema: inventario
--


CREATE TABLE inventario.comentarios_supervision (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tabla text NOT NULL,
    registro_id uuid NOT NULL,
    autor_id text NOT NULL,
    autor_nombre text,
    comentario text NOT NULL,
    created_date timestamp with time zone DEFAULT now()
);


--
-- Name: historial_movimientos; Type: TABLE; Schema: inventario
--


CREATE TABLE inventario.historial_movimientos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    producto_id uuid,
    producto_nombre text,
    producto_codigo text,
    usuario_id text,
    usuario_nombre text,
    tipo_cambio text,
    campo text,
    valor_anterior text,
    valor_nuevo text,
    fecha timestamp with time zone DEFAULT now(),
    origen text DEFAULT 'manual'::text
);


--
-- Name: inventarios; Type: TABLE; Schema: inventario
--


CREATE TABLE inventario.inventarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    producto_id uuid,
    producto_nombre text,
    producto_codigo text,
    suministrador text,
    exist_fisica_tkc numeric DEFAULT 0,
    conteo_real numeric DEFAULT 0,
    diferencia numeric DEFAULT 0,
    resultado text,
    clasif_ajuste text,
    notas_inv text,
    estado_tarea text DEFAULT 'en_curso'::text,
    fecha_inv date,
    especialista_id text,
    especialista_nombre text,
    fact_no_factura text,
    fact_clasif text,
    fact_notas text,
    fact_especialista_id text,
    fact_especialista_nombre text,
    nota_auditor text,
    auditor_id text,
    auditor_nombre text,
    detalles jsonb DEFAULT '[]'::jsonb,
    created_date timestamp with time zone DEFAULT now(),
    fact_estado text,
    fact_fecha text,
    auditoria_fecha text,
    fact_valor_total numeric,
    almacen_num text
);


--
-- Name: lotes; Type: TABLE; Schema: inventario
--


CREATE TABLE inventario.lotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    producto_id uuid,
    producto_nombre text,
    producto_codigo text,
    no_lote text,
    fecha_vencimiento date,
    cantidad numeric DEFAULT 0,
    temperatura text DEFAULT 'ambient'::text,
    estado_fv text DEFAULT 'sin_fecha'::text,
    vigencia_dias integer,
    precio_costo numeric DEFAULT 0,
    created_date timestamp with time zone DEFAULT now(),
    updated_date timestamp with time zone DEFAULT now()
);


--
-- Name: lotes_ic; Type: TABLE; Schema: inventario
--


CREATE TABLE inventario.lotes_ic (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lote_id uuid,
    producto_id uuid,
    producto_nombre text,
    producto_codigo text,
    fecha_deteccion date,
    especialista_inv_id text,
    especialista_inv_nombre text,
    cant_x_vencer numeric,
    precio_costo numeric DEFAULT 0,
    precio_actual numeric DEFAULT 0,
    fecha_vencimiento date,
    clasif_inv text,
    nota_inv text,
    propuesta_precio_ic numeric,
    precio_restaurar numeric,
    notas_ic text,
    estado_tarea text DEFAULT 'pendiente'::text,
    created_date timestamp with time zone DEFAULT now()
);


--
-- Name: lotes_vigencia; Type: VIEW; Schema: inventario
--


CREATE VIEW inventario.lotes_vigencia AS
 SELECT id,
    producto_id,
    producto_nombre,
    producto_codigo,
    no_lote,
    fecha_vencimiento,
    cantidad,
    temperatura,
        CASE
            WHEN (fecha_vencimiento IS NULL) THEN 'sin_fecha'::text
            WHEN ((fecha_vencimiento - CURRENT_DATE) <= 0) THEN 'vencido'::text
            WHEN ((fecha_vencimiento - CURRENT_DATE) <= 15) THEN 'critico'::text
            WHEN ((fecha_vencimiento - CURRENT_DATE) <= 30) THEN 'por_vencer'::text
            ELSE 'vigente'::text
        END AS estado_fv,
        CASE
            WHEN (fecha_vencimiento IS NULL) THEN NULL::integer
            ELSE (fecha_vencimiento - CURRENT_DATE)
        END AS vigencia_dias,
    precio_costo,
    created_date,
    updated_date
   FROM inventario.lotes l;


--
-- Name: mermas; Type: TABLE; Schema: inventario
--


CREATE TABLE inventario.mermas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    producto_id uuid,
    producto_nombre text,
    producto_codigo text,
    suministrador text,
    cantidad numeric,
    clasif_merma text,
    requiere_fact boolean DEFAULT true,
    destino_final text,
    rebaja_confirmada boolean DEFAULT false,
    fecha_rebaja_tienda date,
    notas text,
    precio_unitario numeric DEFAULT 0,
    total_perdida numeric DEFAULT 0,
    estado_tarea text DEFAULT 'en_curso'::text,
    fecha_inv date,
    fecha_vencimiento_lote date,
    especialista_id text,
    especialista_nombre text,
    fact_no_factura text,
    fact_clasif text,
    fact_notas text,
    fact_especialista_id text,
    fact_especialista_nombre text,
    nota_auditor text,
    auditor_id text,
    auditor_nombre text,
    version_reconteo integer DEFAULT 1,
    destinos jsonb DEFAULT '[]'::jsonb,
    reconteos jsonb DEFAULT '[]'::jsonb,
    created_date timestamp with time zone DEFAULT now(),
    almacen_num text,
    fact_estado text,
    fact_fecha text,
    auditoria_fecha text,
    fact_valor_total numeric
);


--
-- Name: notificaciones; Type: TABLE; Schema: inventario
--


CREATE TABLE inventario.notificaciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id text NOT NULL,
    tipo text,
    titulo text,
    mensaje text,
    leida boolean DEFAULT false,
    created_date timestamp with time zone DEFAULT now(),
    link text,
    es_error boolean DEFAULT false
);


--
-- Name: recepciones; Type: TABLE; Schema: inventario
--


CREATE TABLE inventario.recepciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    no_recepcion text,
    proveedor text,
    no_orden text,
    fecha date,
    especialista_id text,
    especialista_nombre text,
    estado text DEFAULT 'en_curso'::text,
    detalles jsonb DEFAULT '[]'::jsonb,
    diferencias jsonb DEFAULT '[]'::jsonb,
    total_items integer DEFAULT 0,
    items_confirmados integer DEFAULT 0,
    created_date timestamp with time zone DEFAULT now()
);


--
-- Name: sync_auto_log; Type: TABLE; Schema: inventario
--


CREATE TABLE inventario.sync_auto_log (
    user_email text NOT NULL,
    almacen text NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL,
    synced integer,
    errors integer
);


--
-- Name: usuarios; Type: TABLE; Schema: inventario
--


CREATE TABLE inventario.usuarios (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    role text DEFAULT 'inv'::text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_date timestamp with time zone DEFAULT now(),
    almacen_num text DEFAULT ''::text,
    nickname text,
    avatar_url text,
    almacenes_config text[] DEFAULT '{}'::text[],
    sync_config jsonb DEFAULT '{}'::jsonb,
    departamento text,
    anuncio_config jsonb DEFAULT '{}'::jsonb
);


--
-- Name: workflow_eventos; Type: TABLE; Schema: inventario
--


CREATE TABLE inventario.workflow_eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tabla text NOT NULL,
    registro_id uuid NOT NULL,
    estado_antes text,
    estado_nuevo text NOT NULL,
    actor_id text NOT NULL,
    actor_nombre text,
    actor_rol text,
    datos jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: admin_audit_log admin_audit_log_pkey; Type: CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.admin_audit_log
    ADD CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id);


--
-- Name: anuncios_desact anuncios_desact_pkey; Type: CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.anuncios_desact
    ADD CONSTRAINT anuncios_desact_pkey PRIMARY KEY (id);


--
-- Name: comentarios_supervision comentarios_supervision_pkey; Type: CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.comentarios_supervision
    ADD CONSTRAINT comentarios_supervision_pkey PRIMARY KEY (id);


--
-- Name: historial_movimientos historial_movimientos_pkey; Type: CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.historial_movimientos
    ADD CONSTRAINT historial_movimientos_pkey PRIMARY KEY (id);


--
-- Name: inventarios inventarios_pkey; Type: CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.inventarios
    ADD CONSTRAINT inventarios_pkey PRIMARY KEY (id);


--
-- Name: lotes_ic lotes_ic_pkey; Type: CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.lotes_ic
    ADD CONSTRAINT lotes_ic_pkey PRIMARY KEY (id);


--
-- Name: lotes lotes_pkey; Type: CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.lotes
    ADD CONSTRAINT lotes_pkey PRIMARY KEY (id);


--
-- Name: mermas mermas_pkey; Type: CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.mermas
    ADD CONSTRAINT mermas_pkey PRIMARY KEY (id);


--
-- Name: notificaciones notificaciones_pkey; Type: CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.notificaciones
    ADD CONSTRAINT notificaciones_pkey PRIMARY KEY (id);


--
-- Name: productos productos_pkey; Type: CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.productos
    ADD CONSTRAINT productos_pkey PRIMARY KEY (id);


--
-- Name: recepciones recepciones_no_recepcion_key; Type: CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.recepciones
    ADD CONSTRAINT recepciones_no_recepcion_key UNIQUE (no_recepcion);


--
-- Name: recepciones recepciones_pkey; Type: CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.recepciones
    ADD CONSTRAINT recepciones_pkey PRIMARY KEY (id);


--
-- Name: sync_auto_log sync_auto_log_pkey; Type: CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.sync_auto_log
    ADD CONSTRAINT sync_auto_log_pkey PRIMARY KEY (user_email, almacen);


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: workflow_eventos workflow_eventos_pkey; Type: CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.workflow_eventos
    ADD CONSTRAINT workflow_eventos_pkey PRIMARY KEY (id);


--
-- Name: anuncios_desact_estado_tarea_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX anuncios_desact_estado_tarea_idx ON inventario.anuncios_desact USING btree (estado_tarea);


--
-- Name: anuncios_desact_producto_id_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX anuncios_desact_producto_id_idx ON inventario.anuncios_desact USING btree (producto_id);


--
-- Name: anuncios_desact_tipo_caso_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX anuncios_desact_tipo_caso_idx ON inventario.anuncios_desact USING btree (tipo_caso);


--
-- Name: historial_movimientos_fecha_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX historial_movimientos_fecha_idx ON inventario.historial_movimientos USING btree (fecha DESC);


--
-- Name: historial_movimientos_producto_id_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX historial_movimientos_producto_id_idx ON inventario.historial_movimientos USING btree (producto_id);


--
-- Name: historial_movimientos_tipo_cambio_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX historial_movimientos_tipo_cambio_idx ON inventario.historial_movimientos USING btree (tipo_cambio);


--
-- Name: historial_movimientos_usuario_id_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX historial_movimientos_usuario_id_idx ON inventario.historial_movimientos USING btree (usuario_id);


--
-- Name: idx_comentarios_autor; Type: INDEX; Schema: inventario
--


CREATE INDEX idx_comentarios_autor ON inventario.comentarios_supervision USING btree (autor_id);


--
-- Name: idx_comentarios_tabla_registro; Type: INDEX; Schema: inventario
--


CREATE INDEX idx_comentarios_tabla_registro ON inventario.comentarios_supervision USING btree (tabla, registro_id);


--
-- Name: idx_historial_producto_fecha; Type: INDEX; Schema: inventario
--


CREATE INDEX idx_historial_producto_fecha ON inventario.historial_movimientos USING btree (producto_id, fecha DESC) WHERE (producto_id IS NOT NULL);


--
-- Name: idx_inventarios_almacen_num; Type: INDEX; Schema: inventario
--


CREATE INDEX idx_inventarios_almacen_num ON inventario.inventarios USING btree (almacen_num);


--
-- Name: idx_lotes_estado_fecha; Type: INDEX; Schema: inventario
--


CREATE INDEX idx_lotes_estado_fecha ON inventario.lotes USING btree (estado_fv, fecha_vencimiento) WHERE (cantidad > (0)::numeric);


--
-- Name: idx_notif_usuario_leida_fecha; Type: INDEX; Schema: inventario
--


CREATE INDEX idx_notif_usuario_leida_fecha ON inventario.notificaciones USING btree (usuario_id, leida, created_date DESC);


--
-- Name: idx_productos_activo; Type: INDEX; Schema: inventario
--


CREATE INDEX idx_productos_activo ON inventario.productos USING btree (activo) WHERE (activo = true);


--
-- Name: idx_productos_almacen_activo_nombre; Type: INDEX; Schema: inventario
--


CREATE INDEX idx_productos_almacen_activo_nombre ON inventario.productos USING btree (almacen_num, activo, nombre);


--
-- Name: idx_productos_almacen_num; Type: INDEX; Schema: inventario
--


CREATE INDEX idx_productos_almacen_num ON inventario.productos USING btree (almacen_num);


--
-- Name: idx_productos_categoria_id; Type: INDEX; Schema: inventario
--


CREATE INDEX idx_productos_categoria_id ON inventario.productos USING btree (categoria_id);


--
-- Name: idx_productos_codigo; Type: INDEX; Schema: inventario
--


CREATE INDEX idx_productos_codigo ON inventario.productos USING btree (codigo_producto);


--
-- Name: idx_productos_con_ef; Type: INDEX; Schema: inventario
--


CREATE INDEX idx_productos_con_ef ON inventario.productos USING btree (almacen_num, exist_fisica) WHERE ((activo = true) AND (exist_fisica > (0)::numeric));


--
-- Name: idx_productos_estado_tarea; Type: INDEX; Schema: inventario
--


CREATE INDEX idx_productos_estado_tarea ON inventario.productos USING btree (estado_tarea_producto);


--
-- Name: idx_productos_id_tienda; Type: INDEX; Schema: inventario
--


CREATE INDEX idx_productos_id_tienda ON inventario.productos USING btree (id_tienda);


--
-- Name: idx_usuarios_almacenes_config; Type: INDEX; Schema: inventario
--


CREATE INDEX idx_usuarios_almacenes_config ON inventario.usuarios USING gin (almacenes_config);


--
-- Name: idx_workflow_eventos_actor; Type: INDEX; Schema: inventario
--


CREATE INDEX idx_workflow_eventos_actor ON inventario.workflow_eventos USING btree (actor_id);


--
-- Name: idx_workflow_eventos_fecha; Type: INDEX; Schema: inventario
--


CREATE INDEX idx_workflow_eventos_fecha ON inventario.workflow_eventos USING btree (created_at DESC);


--
-- Name: idx_workflow_eventos_registro; Type: INDEX; Schema: inventario
--


CREATE INDEX idx_workflow_eventos_registro ON inventario.workflow_eventos USING btree (tabla, registro_id);


--
-- Name: inventarios_estado_tarea_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX inventarios_estado_tarea_idx ON inventario.inventarios USING btree (estado_tarea);


--
-- Name: inventarios_fecha_inv_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX inventarios_fecha_inv_idx ON inventario.inventarios USING btree (fecha_inv);


--
-- Name: inventarios_producto_id_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX inventarios_producto_id_idx ON inventario.inventarios USING btree (producto_id);


--
-- Name: lotes_estado_fv_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX lotes_estado_fv_idx ON inventario.lotes USING btree (estado_fv);


--
-- Name: lotes_fecha_vencimiento_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX lotes_fecha_vencimiento_idx ON inventario.lotes USING btree (fecha_vencimiento);


--
-- Name: lotes_ic_estado_tarea_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX lotes_ic_estado_tarea_idx ON inventario.lotes_ic USING btree (estado_tarea);


--
-- Name: lotes_ic_lote_id_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX lotes_ic_lote_id_idx ON inventario.lotes_ic USING btree (lote_id);


--
-- Name: lotes_producto_id_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX lotes_producto_id_idx ON inventario.lotes USING btree (producto_id);


--
-- Name: mermas_estado_tarea_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX mermas_estado_tarea_idx ON inventario.mermas USING btree (estado_tarea);


--
-- Name: mermas_fecha_inv_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX mermas_fecha_inv_idx ON inventario.mermas USING btree (fecha_inv);


--
-- Name: mermas_producto_id_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX mermas_producto_id_idx ON inventario.mermas USING btree (producto_id);


--
-- Name: notificaciones_created_date_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX notificaciones_created_date_idx ON inventario.notificaciones USING btree (created_date DESC);


--
-- Name: notificaciones_usuario_id_leida_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX notificaciones_usuario_id_leida_idx ON inventario.notificaciones USING btree (usuario_id, leida);


--
-- Name: productos_almacen_codigo_unique; Type: INDEX; Schema: inventario
--


CREATE UNIQUE INDEX productos_almacen_codigo_unique ON inventario.productos USING btree (almacen_num, codigo_producto);


--
-- Name: productos_almacen_idtienda_unique; Type: INDEX; Schema: inventario
--


CREATE UNIQUE INDEX productos_almacen_idtienda_unique ON inventario.productos USING btree (almacen_num, id_tienda) WHERE (id_tienda IS NOT NULL);


--
-- Name: productos_codigo_producto_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX productos_codigo_producto_idx ON inventario.productos USING btree (codigo_producto);


--
-- Name: productos_estado_anuncio_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX productos_estado_anuncio_idx ON inventario.productos USING btree (estado_anuncio);


--
-- Name: recepciones_estado_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX recepciones_estado_idx ON inventario.recepciones USING btree (estado);


--
-- Name: recepciones_fecha_idx; Type: INDEX; Schema: inventario
--


CREATE INDEX recepciones_fecha_idx ON inventario.recepciones USING btree (fecha);


--
-- Name: lotes lotes_updated_date; Type: TRIGGER; Schema: inventario
--


CREATE TRIGGER lotes_updated_date BEFORE UPDATE ON inventario.lotes FOR EACH ROW EXECUTE FUNCTION inventario.set_updated_date();


--
-- Name: productos productos_updated_date; Type: TRIGGER; Schema: inventario
--


CREATE TRIGGER productos_updated_date BEFORE UPDATE ON inventario.productos FOR EACH ROW EXECUTE FUNCTION inventario.set_updated_date();


--
-- Name: inventarios trg_inventario_stock_reconciliation; Type: TRIGGER; Schema: inventario
--


CREATE TRIGGER trg_inventario_stock_reconciliation AFTER UPDATE OF estado_tarea ON inventario.inventarios FOR EACH ROW EXECUTE FUNCTION inventario.apply_inventario_stock_reconciliation();


--
-- Name: inventarios trg_inventario_stock_reconciliation_insert; Type: TRIGGER; Schema: inventario
--


CREATE TRIGGER trg_inventario_stock_reconciliation_insert AFTER INSERT ON inventario.inventarios FOR EACH ROW EXECUTE FUNCTION inventario.apply_inventario_stock_reconciliation_insert();


--
-- Name: inventarios trg_inventarios_lock_producto_id; Type: TRIGGER; Schema: inventario
--


CREATE TRIGGER trg_inventarios_lock_producto_id BEFORE UPDATE ON inventario.inventarios FOR EACH ROW EXECUTE FUNCTION inventario.prevent_producto_id_change();


--
-- Name: mermas trg_merma_stock_check; Type: TRIGGER; Schema: inventario
--


CREATE TRIGGER trg_merma_stock_check BEFORE INSERT OR UPDATE OF cantidad ON inventario.mermas FOR EACH ROW EXECUTE FUNCTION inventario.check_merma_cantidad();


--
-- Name: mermas trg_merma_stock_deduction; Type: TRIGGER; Schema: inventario
--


CREATE TRIGGER trg_merma_stock_deduction AFTER UPDATE OF estado_tarea ON inventario.mermas FOR EACH ROW EXECUTE FUNCTION inventario.apply_merma_stock_deduction();


--
-- Name: mermas trg_mermas_lock_producto_id; Type: TRIGGER; Schema: inventario
--


CREATE TRIGGER trg_mermas_lock_producto_id BEFORE UPDATE ON inventario.mermas FOR EACH ROW EXECUTE FUNCTION inventario.prevent_producto_id_change();


--
-- Name: anuncios_desact anuncios_desact_producto_id_fkey; Type: FK CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.anuncios_desact
    ADD CONSTRAINT anuncios_desact_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES inventario.productos(id);


--
-- Name: historial_movimientos historial_movimientos_producto_id_fkey; Type: FK CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.historial_movimientos
    ADD CONSTRAINT historial_movimientos_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES inventario.productos(id);


--
-- Name: inventarios inventarios_producto_id_fkey; Type: FK CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.inventarios
    ADD CONSTRAINT inventarios_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES inventario.productos(id);


--
-- Name: lotes_ic lotes_ic_lote_id_fkey; Type: FK CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.lotes_ic
    ADD CONSTRAINT lotes_ic_lote_id_fkey FOREIGN KEY (lote_id) REFERENCES inventario.lotes(id);


--
-- Name: lotes_ic lotes_ic_producto_id_fkey; Type: FK CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.lotes_ic
    ADD CONSTRAINT lotes_ic_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES inventario.productos(id);


--
-- Name: lotes lotes_producto_id_fkey; Type: FK CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.lotes
    ADD CONSTRAINT lotes_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES inventario.productos(id);


--
-- Name: mermas mermas_producto_id_fkey; Type: FK CONSTRAINT; Schema: inventario
--


ALTER TABLE ONLY inventario.mermas
    ADD CONSTRAINT mermas_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES inventario.productos(id);


