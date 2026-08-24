-- ============================================================
-- NO ES UNA MIGRACIÓN. Datos de prueba temporales para QA.
--
-- Objetivo: verificar en vivo que el bug de "fecha vacía → columna
-- date" (corregido en MermaForm) tampoco ocurre en los flujos de
-- Anuncios (AnuncioDetail) ni de Lotes (panel Intervención Comercial).
--
-- Estas dos tablas las llena solo el sync externo con service_role:
-- las políticas RLS de migration_v25_role_rls.sql no tienen policy de
-- INSERT para ningún rol de cliente, así que la app no puede crear
-- filas de prueba por sí sola.
--
-- Ambas filas quedan marcadas con 'QA-TEST-DELETE-ME' para poder
-- borrarlas sin ambigüedad (ver PASO 3).
--
-- EJECUTAR en: BD principal (bnopapasaiyksmndxvly.supabase.co) → SQL Editor
-- ============================================================

-- ── PASO 1: fila de prueba en anuncios_desact ───────────────
-- estado_tarea 'pendiente' => la acción de INV queda disponible,
-- que es la que escribe fecha_inv (columna date).
insert into anuncios_desact
  (producto_id, producto_nombre, producto_codigo, suministrador,
   tipo_caso, estado_tarea, estado_anuncio_tkc, ef_al_detectar, fecha_deteccion)
values
  ('565e2dbb-2ac6-477c-83cd-c782a639fbe6',
   'Anillo abierto de plata S925 estilo Pandora pulido con pavé (16.5 mm)',
   '70386',
   'QA-TEST-DELETE-ME',
   'desact_ef_positivo',
   'pendiente',
   'DESACTIVADO',
   3,
   current_date);

-- ── PASO 2: fila de prueba en lotes ─────────────────────────
-- FV a 10 días => la vista lotes_vigencia (migration_v29) la clasifica
-- como 'critico', que es la condición para que aparezca el panel IC.
insert into lotes
  (producto_id, producto_nombre, producto_codigo, no_lote,
   fecha_vencimiento, cantidad, temperatura, precio_costo)
values
  ('565e2dbb-2ac6-477c-83cd-c782a639fbe6',
   'Anillo abierto de plata S925 estilo Pandora pulido con pavé (16.5 mm)',
   '70386',
   'QA-TEST-DELETE-ME',
   current_date + 10,
   3,
   'ambient',
   20.74);

-- ── PASO 3: limpieza (correr al terminar de probar) ─────────
-- lotes_ic primero: si la prueba del panel IC llegó a enviar una
-- intervención, esa fila referencia lotes.id por FK.
-- delete from anuncios_desact where suministrador = 'QA-TEST-DELETE-ME';
-- delete from lotes_ic where lote_id in (select id from lotes where no_lote = 'QA-TEST-DELETE-ME');
-- delete from lotes where no_lote = 'QA-TEST-DELETE-ME';
