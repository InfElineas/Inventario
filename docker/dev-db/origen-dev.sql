-- Sustitutos de DESARROLLO de las tablas de TKC que en ELINEAS_BD real llenan
-- otros sistemas (ap_rows/ap_runs: anuncios; sub_rows/sub_runs: submayor).
--
-- Solo llevan las columnas que lee `inventario.catalogo_origen`
-- (supabase/catalogo_origen.sql). Con ellas, la vista y la función de sync
-- funcionan igual que en producción. Los tipos son los que esa vista y
-- `sync_productos_desde_invglobal` esperan; si en la base real difieren en
-- algo, esta es la parte a ajustar.
--
-- Los datos de abajo son inventados: sirven para ver el catálogo y probar el
-- flujo, no se parecen a nada real. Hay 6 productos en CADA almacén de
-- src/services/tkc/warehouses.js: el selector solo ofrece esos, y un almacén
-- sin filas se vería como un catálogo vacío.

CREATE TABLE public.ap_runs  (id bigserial PRIMARY KEY, seq bigint NOT NULL);
CREATE TABLE public.sub_runs (id bigserial PRIMARY KEY, seq bigint NOT NULL);

CREATE TABLE public.ap_rows (
  id                bigserial PRIMARY KEY,
  run_id            bigint NOT NULL REFERENCES public.ap_runs(id),
  id_tkc            text,
  warehouse_key     text,
  codigo            text,
  id_online         text,
  nombre            text,
  suministrador     text,
  proveedor         text,
  marca             text,
  categoria_online  text,
  clasificacion     text,
  codigo_pyme       text,
  categoria_almacen text,
  unidad_compra     text,
  unidad_medida     text,
  locaciones        text,
  canal             text,
  peso              numeric,
  volumen           numeric,
  cantidad_um       numeric,
  tasa              numeric,
  gtin              text,
  catalogo_nombre   text,
  fecha_vencimiento date,
  precio            numeric,
  imagenes          jsonb,
  is_dead           integer,
  status_provider   integer,
  -- La publica `update-ap` ya calculada. Antes el estado se deducía de
  -- `is_dead`, que vale 1 para todo lo no activado: un desactivado normal
  -- salía como muerto.
  estado_anuncio    text
);

CREATE TABLE public.sub_rows (
  id                bigserial PRIMARY KEY,
  run_id            bigint NOT NULL REFERENCES public.sub_runs(id),
  id_tkc            text,
  existencia_fisica numeric,
  almacen           numeric,
  tienda            numeric
);

INSERT INTO public.ap_runs (seq)  VALUES (1);
INSERT INTO public.sub_runs (seq) VALUES (1);

INSERT INTO public.ap_rows
  (run_id, id_tkc, warehouse_key, codigo, id_online, nombre, suministrador, proveedor, marca,
   categoria_online, clasificacion, codigo_pyme, categoria_almacen, unidad_compra, unidad_medida,
   precio, imagenes, is_dead, status_provider, estado_anuncio)
SELECT 1, 'dev-' || w.n || '-' || p.n, w.n, '7500000' || lpad(p.n::text, 6, '0'),
       CASE WHEN p.n = 5 THEN NULL ELSE 'T' || w.n || p.n END,
       p.nombre, 'Suministrador Demo', 'Proveedor Demo', p.marca,
       p.categoria, 'A', 'PY' || p.n, p.categoria, 'Caja', 'u',
       p.precio, '[]'::jsonb,
       CASE WHEN p.n = 4 THEN 1 ELSE 0 END,
       CASE WHEN p.n = 3 THEN 0 ELSE 1 END,
       -- Seis de los siete estados, uno por producto, para poder probar los
       -- filtros del catálogo. Falta 'SIN ID EF>0': el único sin id de tienda
       -- es el 5 y aquí no tiene existencia.
       CASE p.n
         WHEN 1 THEN 'ACTIVADO'
         WHEN 2 THEN 'DESACTIVADO EF>0'
         WHEN 3 THEN 'DESACTIVADO EF=0'
         WHEN 4 THEN 'DESACTIVADO MUERTO EF>0'
         WHEN 5 THEN 'SIN ID EF=0'
         ELSE        'DESACTIVADO MUERTO EF=0'
       END
FROM (VALUES ('615'),('676'),('480'),('581'),('607'),('610'),('600'),('734'),('789'),('926'),('1000'),('1003'),('1005'),('1053'),('Latino'),('1201'),('1330'),('Insumo'),('593'),('1476'),('1652'),('1882'),('1883'),('1964'),('1965'),('1966'),('1967'),('1968'),('1969'),('1970')) AS w(n),
     (VALUES (1, 'Arroz blanco 1 kg',     'Marca Uno',  'Abarrotes', 18.50),
             (2, 'Aceite vegetal 900 ml', 'Marca Dos',  'Abarrotes', 42.00),
             (3, 'Detergente 2 kg',       'Marca Tres', 'Limpieza',  65.90),
             (4, 'Galletas surtidas',     'Marca Uno',  'Botanas',   12.75),
             (5, 'Jabón de tocador x3',   'Marca Dos',  'Limpieza',  27.30),
             (6, 'Atún en agua 140 g',    'Marca Tres', 'Abarrotes', 19.90)
     ) AS p(n, nombre, marca, categoria, precio);

INSERT INTO public.sub_rows (run_id, id_tkc, existencia_fisica, almacen, tienda)
SELECT 1, id_tkc,
       (row_number() OVER (ORDER BY id)) * 7 % 40,
       (row_number() OVER (ORDER BY id)) * 3 % 25,
       (row_number() OVER (ORDER BY id)) * 5 % 15
FROM public.ap_rows;

-- La vista es security_invoker: quien la consulta (la app) necesita leer el
-- origen. En ELINEAS_BD real elineas_backend_app ya tiene ese SELECT.
GRANT SELECT ON public.ap_runs, public.ap_rows, public.sub_runs, public.sub_rows
  TO elineas_backend_app;
