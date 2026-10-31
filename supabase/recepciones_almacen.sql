--
-- A qué almacén entró la mercancía
--
-- `recepciones` era la única tabla del módulo sin almacén, y su pantalla la
-- única que no filtraba por él: se veían todas mezcladas. Pero las
-- existencias, las mermas y los lotes sí son por almacén, así que la
-- mercancía de una recepción acababa en un almacén concreto que no quedaba
-- registrado en ninguna parte. Con dos almacenes trabajando a la vez, nadie
-- podía decir dónde entró un pedido.
--
-- Las que ya existen se quedan sin almacén: no hay de dónde deducirlo y
-- ponerle uno a ojo sería inventar el dato que falta. La pantalla las muestra
-- igual, marcadas.
--
-- EJECUTAR como elineasadmin.
--

ALTER TABLE inventario.recepciones
  ADD COLUMN IF NOT EXISTS almacen_num text;

COMMENT ON COLUMN inventario.recepciones.almacen_num IS
  'Almacén donde se descargó la mercancía. Vacío en las recepciones '
  'anteriores a que existiera la columna.';

CREATE INDEX IF NOT EXISTS idx_recepciones_almacen
    ON inventario.recepciones (almacen_num)
 WHERE almacen_num IS NOT NULL;
