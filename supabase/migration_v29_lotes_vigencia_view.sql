-- ============================================================
-- Migration v29: recalcula el semáforo de vencimiento de lotes
-- (estado_fv / vigencia_dias) en tiempo real contra la fecha actual.
--
-- Antes, estos dos campos se guardaban una sola vez (import/manual) y
-- nunca se recalculaban: nada en el repo los recomputa, así que un
-- lote podía quedar marcado "vigente" indefinidamente aunque ya
-- hubiera vencido.
--
-- Umbrales (decisión del equipo, no había ninguno definido en el
-- código): mismas categorías que ya usa Reportes › Vencimientos,
-- colapsadas a los 4 estados de estado_fv:
--   vencido     → fecha_vencimiento - hoy <= 0
--   critico     → 1 a 15 días
--   por_vencer  → 16 a 30 días
--   vigente     → más de 30 días
--   sin_fecha   → fecha_vencimiento nula
--
-- Mecanismo elegido: vista SQL (no cron) — siempre exacta, no
-- depende de que un job haya corrido. El frontend debe leer
-- "lotes_vigencia" en vez de "lotes" (ver cambios en
-- src/api/base44Client.js y src/pages/Dashboard.jsx).
--
-- EJECUTAR en: BD principal (bnopapasaiyksmndxvly.supabase.co) → SQL Editor
-- ============================================================

create or replace view lotes_vigencia as
select
  l.id,
  l.producto_id,
  l.producto_nombre,
  l.producto_codigo,
  l.no_lote,
  l.fecha_vencimiento,
  l.cantidad,
  l.temperatura,
  case
    when l.fecha_vencimiento is null                    then 'sin_fecha'
    when (l.fecha_vencimiento - current_date) <= 0       then 'vencido'
    when (l.fecha_vencimiento - current_date) <= 15      then 'critico'
    when (l.fecha_vencimiento - current_date) <= 30      then 'por_vencer'
    else 'vigente'
  end as estado_fv,
  case
    when l.fecha_vencimiento is null then null
    else (l.fecha_vencimiento - current_date)::int
  end as vigencia_dias,
  l.precio_costo,
  l.created_date,
  l.updated_date
from lotes l;

grant select on lotes_vigencia to authenticated;
grant select on lotes_vigencia to anon;
