--
-- Atar la recepción al pedido de compra que la trajo
--
-- Hasta ahora quien descargaba el camión tecleaba el proveedor, el número de
-- orden y —lo que más importa— la cantidad que esperaba recibir. Esa última
-- es justo la que no puede inventarse: es contra la que se mide si llegó de
-- menos, así que escribirla a ojo convierte la comprobación en un trámite.
--
-- Los pedidos los crea comercial en la API de reabastecimiento. Guardando su
-- id aquí, la recepción queda unida a lo que de verdad se pidió y se puede
-- volver sobre ello: qué pedido era, quién lo hizo y por cuánto.
--
-- Solo se guarda el id. El resto del pedido vive en su sistema y copiarlo
-- aquí sería tener dos versiones de lo mismo envejeciendo por separado.
--
-- EJECUTAR como elineasadmin.
--

ALTER TABLE inventario.recepciones
  ADD COLUMN IF NOT EXISTS pedido_id text;

COMMENT ON COLUMN inventario.recepciones.pedido_id IS
  'Identificador del pedido de compra en la API de reabastecimiento, cuando '
  'la recepción se hizo contra uno. Vacío si la mercancía llegó sin pedido.';

CREATE INDEX IF NOT EXISTS idx_recepciones_pedido
    ON inventario.recepciones (pedido_id)
 WHERE pedido_id IS NOT NULL;
