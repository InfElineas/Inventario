-- ============================================================
-- Schema para Inventario ELíneas 789 — Supabase
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- EXTENSIONES
-- ────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────
-- HELPER: actualiza updated_date automáticamente
-- ────────────────────────────────────────────────────────────
create or replace function set_updated_date()
returns trigger language plpgsql as $$
begin
  new.updated_date = now();
  return new;
end;
$$;

-- ============================================================
-- TABLA: productos
-- ============================================================
create table productos (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  codigo_producto text,
  suministrador   text,
  categoria_elineas text,
  estado_anuncio  text default 'DESACTIVADO',   -- 'ACTIVADO' | 'DESACTIVADO'
  exist_fisica    numeric default 0,
  almacen         numeric default 0,
  tienda          numeric default 0,
  precio          numeric default 0,
  precio_costo    numeric default 0,
  id_tienda       text,
  stock_minimo    integer default 0,
  activo          boolean default true,
  created_date    timestamptz default now(),
  updated_date    timestamptz default now()
);

create index on productos (estado_anuncio);
create index on productos (codigo_producto);

create trigger productos_updated_date
  before update on productos
  for each row execute procedure set_updated_date();

-- ============================================================
-- TABLA: anuncios_desact
-- ============================================================
create table anuncios_desact (
  id                     uuid primary key default gen_random_uuid(),
  producto_id            uuid references productos(id),
  producto_nombre        text,
  producto_codigo        text,
  suministrador          text,
  tipo_caso              text,   -- 'desact_ef_positivo' | 'sin_id' | 'activo_ef_cero'
  estado_tarea           text default 'pendiente',  -- 'pendiente' | 'pend_ca' | 'en_auditoria' | 'completado'
  estado_anuncio_tkc     text,
  ef_al_detectar         numeric,
  fecha_deteccion        date,
  -- INV
  motivo_tkc             text,
  motivo_elineas         text,
  accion_inv             text,
  nota_inv               text,
  especialista_inv_id    text,
  especialista_inv_nombre text,
  fecha_inv              date,
  -- CA
  accion_ca              text,
  precio_nuevo           numeric,
  nota_ca                text,
  especialista_ca_id     text,
  especialista_ca_nombre text,
  fecha_ca               date,
  -- Auditor
  nota_auditor           text,
  auditor_id             text,
  auditor_nombre         text,
  fecha_auditoria        date,
  fecha_resolucion       date,
  created_date           timestamptz default now()
);

create index on anuncios_desact (estado_tarea);
create index on anuncios_desact (tipo_caso);
create index on anuncios_desact (producto_id);

-- ============================================================
-- TABLA: mermas
-- ============================================================
create table mermas (
  id                   uuid primary key default gen_random_uuid(),
  producto_id          uuid references productos(id),
  producto_nombre      text,
  producto_codigo      text,
  suministrador        text,
  cantidad             numeric,
  clasif_merma         text,
  requiere_fact        boolean default true,
  destino_final        text,
  rebaja_confirmada    boolean default false,
  fecha_rebaja_tienda  date,
  notas                text,
  precio_unitario      numeric default 0,
  total_perdida        numeric default 0,
  estado_tarea         text default 'en_curso',
    -- 'en_curso' | 'reconteo_solicitado' | 'pend_fact' | 'en_auditoria' | 'completado' | 'devuelto'
  fecha_inv            date,
  fecha_vencimiento_lote date,
  especialista_id      text,
  especialista_nombre  text,
  -- FACT
  fact_no_factura      text,
  fact_clasif          text,
  fact_notas           text,
  fact_especialista_id   text,
  fact_especialista_nombre text,
  -- Auditor
  nota_auditor         text,
  auditor_id           text,
  auditor_nombre       text,
  -- Reconteo
  version_reconteo     integer default 1,
  destinos             jsonb default '[]',
  reconteos            jsonb default '[]',
  created_date         timestamptz default now()
);

create index on mermas (estado_tarea);
create index on mermas (producto_id);
create index on mermas (fecha_inv);

-- ============================================================
-- TABLA: lotes
-- ============================================================
create table lotes (
  id               uuid primary key default gen_random_uuid(),
  producto_id      uuid references productos(id),
  producto_nombre  text,
  producto_codigo  text,
  no_lote          text,
  fecha_vencimiento date,
  cantidad         numeric default 0,
  temperatura      text default 'ambient',   -- 'ambient' | 'chilled'
  estado_fv        text default 'sin_fecha', -- 'vencido' | 'critico' | 'por_vencer' | 'vigente' | 'sin_fecha'
  vigencia_dias    integer,
  precio_costo     numeric default 0,
  created_date     timestamptz default now(),
  updated_date     timestamptz default now()
);

create index on lotes (estado_fv);
create index on lotes (producto_id);
create index on lotes (fecha_vencimiento);

create trigger lotes_updated_date
  before update on lotes
  for each row execute procedure set_updated_date();

-- ============================================================
-- TABLA: lotes_ic  (intervenciones comerciales)
-- ============================================================
create table lotes_ic (
  id                      uuid primary key default gen_random_uuid(),
  lote_id                 uuid references lotes(id),
  producto_id             uuid references productos(id),
  producto_nombre         text,
  producto_codigo         text,
  fecha_deteccion         date,
  especialista_inv_id     text,
  especialista_inv_nombre text,
  cant_x_vencer           numeric,
  precio_costo            numeric default 0,
  precio_actual           numeric default 0,
  fecha_vencimiento       date,
  clasif_inv              text,
  nota_inv                text,
  propuesta_precio_ic     numeric,
  precio_restaurar        numeric,
  notas_ic                text,
  estado_tarea            text default 'pendiente',
  created_date            timestamptz default now()
);

create index on lotes_ic (lote_id);
create index on lotes_ic (estado_tarea);

-- ============================================================
-- TABLA: inventarios  (conteos de inventario)
-- ============================================================
create table inventarios (
  id                      uuid primary key default gen_random_uuid(),
  producto_id             uuid references productos(id),
  producto_nombre         text,
  producto_codigo         text,
  suministrador           text,
  exist_fisica_tkc        numeric default 0,
  conteo_real             numeric default 0,
  diferencia              numeric default 0,
  resultado               text,    -- 'ok' | 'sobrante' | 'faltante'
  clasif_ajuste           text,
  notas_inv               text,
  estado_tarea            text default 'en_curso',
    -- 'en_curso' | 'pend_fact' | 'en_auditoria' | 'completado' | 'devuelto'
  fecha_inv               date,
  especialista_id         text,
  especialista_nombre     text,
  -- FACT
  fact_no_factura         text,
  fact_clasif             text,
  fact_notas              text,
  fact_especialista_id    text,
  fact_especialista_nombre text,
  -- Auditor
  nota_auditor            text,
  auditor_id              text,
  auditor_nombre          text,
  -- Detalle de líneas (FV/lote por línea)
  detalles                jsonb default '[]',
  created_date            timestamptz default now()
);

create index on inventarios (estado_tarea);
create index on inventarios (producto_id);
create index on inventarios (fecha_inv);

-- ============================================================
-- TABLA: recepciones
-- ============================================================
create table recepciones (
  id                uuid primary key default gen_random_uuid(),
  no_recepcion      text unique,
  proveedor         text,
  no_orden          text,
  fecha             date,
  especialista_id   text,
  especialista_nombre text,
  estado            text default 'en_curso',  -- 'en_curso' | 'cerrada' | 'con_diferencias'
  detalles          jsonb default '[]',
  diferencias       jsonb default '[]',
  total_items       integer default 0,
  items_confirmados integer default 0,
  created_date      timestamptz default now()
);

create index on recepciones (estado);
create index on recepciones (fecha);

-- ============================================================
-- TABLA: notificaciones
-- ============================================================
create table notificaciones (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   text not null,   -- email del usuario
  tipo         text,            -- 'merma' | 'lote' | 'recepcion' | 'reconteo' | 'devuelto'
  titulo       text,
  mensaje      text,
  leida        boolean default false,
  created_date timestamptz default now()
);

create index on notificaciones (usuario_id, leida);
create index on notificaciones (created_date desc);

-- ============================================================
-- TABLA: historial_movimientos
-- ============================================================
create table historial_movimientos (
  id               uuid primary key default gen_random_uuid(),
  producto_id      uuid references productos(id),
  producto_nombre  text,
  producto_codigo  text,
  usuario_id       text,
  usuario_nombre   text,
  tipo_cambio      text,  -- 'stock' | 'precio' | 'estado_anuncio' | 'importacion'
  campo            text,
  valor_anterior   text,
  valor_nuevo      text,
  fecha            timestamptz default now(),
  origen           text default 'manual'  -- 'manual' | 'importacion'
);

create index on historial_movimientos (producto_id);
create index on historial_movimientos (usuario_id);
create index on historial_movimientos (fecha desc);
create index on historial_movimientos (tipo_cambio);

-- ============================================================
-- ROW LEVEL SECURITY
-- Habilitado en todas las tablas.
-- Por ahora: acceso total para service_role (usado desde el backend).
-- Añadir políticas granulares por rol cuando integres Supabase Auth.
-- ============================================================
alter table productos            enable row level security;
alter table anuncios_desact      enable row level security;
alter table mermas               enable row level security;
alter table lotes                enable row level security;
alter table lotes_ic             enable row level security;
alter table inventarios          enable row level security;
alter table recepciones          enable row level security;
alter table notificaciones       enable row level security;
alter table historial_movimientos enable row level security;

-- Política temporal: permitir todo (quitar cuando uses auth real)
create policy "allow_all_productos"            on productos            for all using (true) with check (true);
create policy "allow_all_anuncios_desact"      on anuncios_desact      for all using (true) with check (true);
create policy "allow_all_mermas"               on mermas               for all using (true) with check (true);
create policy "allow_all_lotes"                on lotes                for all using (true) with check (true);
create policy "allow_all_lotes_ic"             on lotes_ic             for all using (true) with check (true);
create policy "allow_all_inventarios"          on inventarios          for all using (true) with check (true);
create policy "allow_all_recepciones"          on recepciones          for all using (true) with check (true);
create policy "allow_all_notificaciones"       on notificaciones       for all using (true) with check (true);
create policy "allow_all_historial"            on historial_movimientos for all using (true) with check (true);
