-- ============================================================
-- Migration v2: campos BD TKC completos + estado_tienda
-- Ejecutar en Supabase SQL Editor (bnopapasaiyksmndxvly)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- PRODUCTOS: columnas faltantes del sistema TKC/Excel
-- ────────────────────────────────────────────────────────────
alter table productos
  add column if not exists unidad_medida    text    default 'u',
  add column if not exists categoria_id     integer,
  -- Reabastecimiento IC
  add column if not exists indice_calculo   text    default 'AVG',  -- MAX | AVG | MIN
  add column if not exists dias_horizonte   integer default 30,     -- 7|15|30|45|60|90|120
  add column if not exists stock_max        integer default 0,
  -- Ajuste TKC
  add column if not exists resultado_tkc_real    text,
  add column if not exists clasificacion_ajuste  text,
  -- Desactivación
  add column if not exists motivo_desact_tkc     text,
  add column if not exists motivo_desact_elineas text,
  -- Tarea
  add column if not exists estado_tarea_producto text default 'Pendiente',
  add column if not exists especialista_fact      text,
  add column if not exists auditor_producto       text,
  add column if not exists estado_fact            text;

create index if not exists idx_productos_categoria_id on productos (categoria_id);
create index if not exists idx_productos_estado_tarea on productos (estado_tarea_producto);

-- ────────────────────────────────────────────────────────────
-- FUNCIÓN: estado_anuncio calculado
-- Basado en id_tienda (vacío = sin ID), exist_fisica, almacen, tienda
-- ────────────────────────────────────────────────────────────
create or replace function calc_estado_anuncio(
  p_id_tienda   text,
  p_ef          numeric,
  p_almacen     numeric,
  p_tienda      numeric
) returns text language sql immutable as $$
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

-- ────────────────────────────────────────────────────────────
-- FUNCIÓN: estado_tienda calculado con prioridad
-- ────────────────────────────────────────────────────────────
create or replace function calc_estado_tienda(
  p_id_tienda   text,
  p_ef          numeric,
  p_almacen     numeric,
  p_tienda      numeric
) returns jsonb language sql immutable as $$
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

-- ────────────────────────────────────────────────────────────
-- VISTA: bd_tkc — producto con todos los estados calculados
-- ────────────────────────────────────────────────────────────
create or replace view bd_tkc as
select
  p.id,
  p.id_tienda,
  p.codigo_producto,
  p.nombre,
  p.suministrador,
  p.unidad_medida,
  p.categoria_elineas,
  p.categoria_id,
  p.exist_fisica                                                       as ef,
  p.almacen                                                            as a,
  p.tienda                                                             as t,
  p.precio,
  p.precio_costo,
  calc_estado_anuncio(p.id_tienda, p.exist_fisica, p.almacen, p.tienda)     as estado_anuncio_calc,
  calc_estado_tienda(p.id_tienda, p.exist_fisica, p.almacen, p.tienda)      as estado_tienda_info,
  (calc_estado_tienda(p.id_tienda, p.exist_fisica, p.almacen, p.tienda) ->> 'estado')::text    as estado_tienda,
  (calc_estado_tienda(p.id_tienda, p.exist_fisica, p.almacen, p.tienda) ->> 'prioridad')::int  as prioridad_tienda,
  p.resultado_tkc_real,
  p.clasificacion_ajuste,
  p.motivo_desact_tkc,
  p.motivo_desact_elineas,
  p.estado_tarea_producto,
  p.especialista_fact,
  p.auditor_producto,
  p.estado_fact,
  p.indice_calculo,
  p.dias_horizonte,
  p.stock_max,
  p.stock_minimo,
  p.activo,
  p.created_date,
  p.updated_date
from productos p;

-- Otorgar acceso a la vista para usuarios autenticados
grant select on bd_tkc to authenticated;
grant select on bd_tkc to anon;
