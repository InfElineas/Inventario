--
-- Con qué producto se intercambió
--
-- «Intercambio de Producto» es cuando se vendió uno por otro: dos productos
-- que se parecen, uno sale faltante y el otro sobrante por la misma
-- cantidad. Son un solo hecho contado dos veces.
--
-- Hasta ahora el par vivía en las notas de facturación, escrito a mano. Eso
-- tiene dos problemas: nadie puede comprobar que los números cuadren, y al
-- abrir uno de los dos conteos no hay forma de llegar al otro. Las notas no
-- se pueden consultar.
--
-- Se guarda el id del conteo con el que se intercambió, en los DOS: abrir
-- cualquiera de ellos lleva al otro. Sin clave foránea a propósito —un
-- conteo puede borrarse y no queremos que eso bloquee el borrado del par—;
-- si el otro ya no está, la pantalla lo dice.
--
-- EJECUTAR como elineasadmin.
--

ALTER TABLE inventario.inventarios
  ADD COLUMN IF NOT EXISTS intercambio_id uuid;

COMMENT ON COLUMN inventario.inventarios.intercambio_id IS
  'Conteo con el que se intercambió este producto, cuando la clasificación '
  'es «Intercambio de Producto». Se escribe en los dos conteos del par.';

CREATE INDEX IF NOT EXISTS idx_inventarios_intercambio
    ON inventario.inventarios (intercambio_id)
 WHERE intercambio_id IS NOT NULL;
