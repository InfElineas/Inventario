--
-- Los lotes dejan de ser una tabla nuestra
--
-- `inventario.lotes` no la llenaba nadie: la pantalla de Vencimientos llevaba
-- vacía desde el primer día. Los lotes los publica ahora la API central en
-- `GET /api/reports/lot-latest` —la vista `lot_rows_latest` que mantiene su
-- cron—, así que la aplicación los lee de ahí y no se copia nada.
--
-- Lo único que queda aquí es la intervención comercial, que sí es nuestra: un
-- caso que abre inventario sobre un lote que está por vencer. Ese caso tiene
-- que seguir apuntando a su lote, y el lote ya no tiene un id uuid: en el
-- informe lo identifican almacén, código de producto y número de lote.
--
-- `producto_id` se queda como está pero deja de rellenarse: el informe no
-- trae el id de nuestro catálogo, solo el código, que es con lo que se cruza.
--
-- La tabla `lotes` y la vista `lotes_vigencia` NO se tocan: hay código que
-- todavía las nombra y borrarlas sería romperlo sin necesidad. Quedan vacías,
-- que es como estaban.
--
-- EJECUTAR como elineasadmin.
--

-- La foránea a `lotes` sale primero: apunta a una tabla que ya no se llena,
-- y mientras exista, `lote_id` no puede dejar de ser uuid. Lo que identifica
-- al lote pasa a estar en el informe, donde no hay nada a lo que referenciar.
ALTER TABLE inventario.lotes_ic
  DROP CONSTRAINT IF EXISTS lotes_ic_lote_id_fkey;

ALTER TABLE inventario.lotes_ic
  ALTER COLUMN lote_id TYPE text USING lote_id::text;

COMMENT ON COLUMN inventario.lotes_ic.lote_id IS
  'Identificador del lote en el informe central: almacén|código|no. de lote. '
  'Antes era el uuid de inventario.lotes, que ya no se usa.';

ALTER TABLE inventario.lotes_ic
  ADD COLUMN IF NOT EXISTS no_lote text,
  ADD COLUMN IF NOT EXISTS almacen_num text;

COMMENT ON COLUMN inventario.lotes_ic.almacen_num IS
  'Almacén del lote. Sin esto, dos lotes del mismo producto en almacenes '
  'distintos no se distinguen en los listados.';

CREATE INDEX IF NOT EXISTS idx_lotes_ic_almacen
    ON inventario.lotes_ic (almacen_num)
 WHERE almacen_num IS NOT NULL;
