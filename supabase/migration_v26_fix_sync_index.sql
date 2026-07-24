-- ============================================================
-- Migration v26: recrea el índice único que exige sync_productos_bulk
--
-- migration_v3 creó productos_almacen_codigo_unique; migration_v4 lo
-- eliminó (para resolver otro problema) y ninguna migración posterior
-- lo recreó. Pero v12/v23/v24 (sync_productos_bulk, la RPC vigente)
-- dependen de "ON CONFLICT (almacen_num, codigo_producto)", que sin
-- este índice falla siempre con "no unique or exclusion constraint...".
-- Ese es el error que syncService.js intenta explicar sugiriendo
-- ejecutar migration_v12 — pero v12 solo crea una función RPC, no
-- este índice, así que el sync sigue roto hasta correr esta migración.
--
-- EJECUTAR en: BD principal (bnopapasaiyksmndxvly.supabase.co) → SQL Editor
--
-- ⚠️ IMPORTANTE — revisar antes de correr en producción:
--   1. El paso 1 solo diagnostica (RAISE NOTICE), no modifica nada.
--   2. El paso 2 BORRA filas duplicadas de "productos" (igual criterio
--      conservador que migration_v6: nunca borra una fila referenciada
--      por FK en inventarios/mermas/lotes/lotes_ic/historial_movimientos).
--      Aun así, es un DELETE en producción — considera respaldar la
--      tabla "productos" antes de ejecutar este archivo.
--   3. Si tras el paso 2 sigue habiendo duplicados con ambas filas
--      referenciadas por FK, el paso 3 fallará con
--      "could not create unique index" — resuélvelos a mano primero.
-- ============================================================

-- ── Paso 1: diagnóstico — grupos duplicados por (almacen_num, codigo_producto) ──
do $$
declare
  v_grupos int;
begin
  select count(*) into v_grupos
  from (
    select almacen_num, codigo_producto
    from productos
    where codigo_producto is not null and codigo_producto <> ''
    group by almacen_num, codigo_producto
    having count(*) > 1
  ) d;
  raise notice 'Grupos duplicados (almacen_num, codigo_producto): %', v_grupos;
end $$;

-- ── Paso 2: limpieza conservadora — mismo criterio que migration_v6 ──
-- Solo borra la fila "perdedora" de un grupo duplicado si NO tiene
-- referencias en inventarios/mermas/lotes/lotes_ic/historial_movimientos.
-- Prefiere conservar la fila con id_tienda (mismo criterio que
-- deduplicateByCodigo en src/services/syncService.js).
with ranked as (
  select id, almacen_num, codigo_producto,
    row_number() over (
      partition by almacen_num, codigo_producto
      order by (id_tienda is not null) desc, created_date asc nulls last, id asc
    ) as rn
  from productos
  where codigo_producto is not null and codigo_producto <> ''
),
to_delete as (
  select id from ranked where rn > 1
)
delete from productos
where id in (select id from to_delete)
  and id not in (select producto_id from inventarios          where producto_id is not null)
  and id not in (select producto_id from mermas               where producto_id is not null)
  and id not in (select producto_id from lotes                where producto_id is not null)
  and id not in (select producto_id from lotes_ic             where producto_id is not null)
  and id not in (select producto_id from historial_movimientos where producto_id is not null);

-- Filas con codigo_producto vacío también rompen el índice
-- (migration_v3 ya las limpiaba en su momento; por si reaparecieron).
delete from productos where codigo_producto = '';

-- ── Paso 3: recrear el índice único que sync_productos_bulk necesita ──
create unique index if not exists productos_almacen_codigo_unique
  on productos (almacen_num, codigo_producto);

-- ── Paso 4: sync_productos_bulk — mover la desactivación de id_tienda
-- DENTRO del mismo bloque BEGIN...EXCEPTION que el upsert. Antes, si el
-- upsert (paso 2 original) fallaba, la desactivación (paso 1 original)
-- ya había quedado confirmada por separado, dejando productos
-- desactivados sin sus datos nuevos. CREATE OR REPLACE es idempotente,
-- seguro de re-ejecutar.
--
-- SECURITY DEFINER: migration_v25 restringe el UPDATE directo de
-- "productos" a los roles inv/ca/supervisor/administrador. El sync (manual
-- o automático) debe poder escribir productos sin importar qué rol lo
-- disparó, así que la función corre con los privilegios de quien la creó
-- (bypassa RLS), igual que ya hacían get_user_role()/handle_new_auth_user().
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
  BEGIN
    -- Paso 1: liberar id_tienda de filas que cambiaron de código
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

    -- Paso 2: upsert por (almacen_num, codigo_producto)
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

-- Mismo motivo: deactivate_stale_sync también escribe "productos"
-- (activo = false) y debe seguir funcionando sin importar el rol de
-- quien disparó el sync.
CREATE OR REPLACE FUNCTION deactivate_stale_sync(
  p_almacen  text,
  p_codigos  jsonb
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
