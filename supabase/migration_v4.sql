-- ============================================================
-- Migration v4: columna fotos (solo esto, el upsert no necesita constraint extra)
-- El sync usa la PK (id UUID) como clave de upsert: pre-fetch → asigna UUID → upsert por id
-- Ejecutar en Supabase SQL Editor (bnopapasaiyksmndxvly)
-- ============================================================

-- Limpiar índices de intentos anteriores que no funcionaron
drop index if exists productos_almacen_codigo_unique;
drop index if exists productos_almacen_idtienda_unique;

-- Columna para imágenes del producto (array de URLs desde TKC)
alter table productos
  add column if not exists fotos jsonb default '[]';

-- Índices útiles para búsqueda (no únicos)
create index if not exists idx_productos_almacen_num  on productos (almacen_num);
create index if not exists idx_productos_id_tienda    on productos (id_tienda);
create index if not exists idx_productos_codigo       on productos (codigo_producto);
