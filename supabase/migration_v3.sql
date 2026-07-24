-- ============================================================
-- Migration v3: multi-almacén + UNIQUE constraint para upsert
-- Ejecutar en Supabase SQL Editor (bnopapasaiyksmndxvly)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Agregar almacen_num a productos
-- ────────────────────────────────────────────────────────────
alter table productos
  add column if not exists almacen_num text default '';

-- ────────────────────────────────────────────────────────────
-- 2. Limpiar datos huérfanos del intento fallido anterior
--    (registros sin almacen_num que bloquearian la constraint)
-- ────────────────────────────────────────────────────────────
delete from productos
where almacen_num = '' or almacen_num is null or codigo_producto is null or codigo_producto = '';

-- ────────────────────────────────────────────────────────────
-- 3. UNIQUE constraint compuesta — clave de upsert
-- ────────────────────────────────────────────────────────────
create unique index if not exists productos_almacen_codigo_unique
  on productos(almacen_num, codigo_producto);

-- ────────────────────────────────────────────────────────────
-- 4. Agregar almacen_num al perfil de usuario
--    (qué almacén trabaja cada usuario)
-- ────────────────────────────────────────────────────────────
alter table usuarios
  add column if not exists almacen_num text default '';

-- ────────────────────────────────────────────────────────────
-- 5. Actualizar índices de productos
-- ────────────────────────────────────────────────────────────
create index if not exists idx_productos_almacen_num on productos (almacen_num);

-- ────────────────────────────────────────────────────────────
-- 6. Actualizar vista bd_tkc para incluir almacen_num
--    (DROP + CREATE porque no se puede cambiar orden de columnas)
-- ────────────────────────────────────────────────────────────
drop view if exists bd_tkc;
create view bd_tkc as
select
  p.id,
  p.almacen_num,
  p.id_tienda,
  p.codigo_producto,
  p.nombre,
  p.suministrador,
  p.unidad_medida,
  p.categoria_elineas,
  p.categoria_id,
  p.exist_fisica                                                        as ef,
  p.almacen                                                             as a,
  p.tienda                                                              as t,
  p.precio,
  p.precio_costo,
  calc_estado_anuncio(p.id_tienda, p.exist_fisica, p.almacen, p.tienda) as estado_anuncio_calc,
  (calc_estado_tienda(p.id_tienda, p.exist_fisica, p.almacen, p.tienda) ->> 'estado')::text   as estado_tienda,
  (calc_estado_tienda(p.id_tienda, p.exist_fisica, p.almacen, p.tienda) ->> 'prioridad')::int as prioridad_tienda,
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

grant select on bd_tkc to authenticated;
grant select on bd_tkc to anon;
