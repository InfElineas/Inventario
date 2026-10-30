--
-- Lo que inventario corrige de un lote
--
-- Los lotes vienen del informe central y ahí no se puede escribir. Pero una
-- parte importante llega sin fecha de vencimiento, y un lote sin fecha no se
-- puede gestionar: ni avisa cuando se acerca, ni entra en una intervención
-- comercial, ni se sabe si ya venció. La fecha está en el envase; lo único
-- que falta es dónde anotarla.
--
-- Esta tabla es ese dónde. No sustituye al informe: se superpone. Al leer los
-- lotes, la revisión más reciente de cada uno pisa la fecha que trajo el
-- informe —o la pone, si no traía— y el estado de vigencia se recalcula con
-- ella.
--
-- No hay clave única a propósito: cada corrección queda como una fila nueva,
-- así que se ve quién cambió qué y cuándo. Gana la última.
--
-- EJECUTAR como elineasadmin.
--

CREATE TABLE IF NOT EXISTS inventario.lote_revisiones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_num      text NOT NULL,
  producto_codigo  text NOT NULL,
  no_lote          text NOT NULL DEFAULT '',
  fecha_vencimiento date,
  nota             text,
  revisado_por     text,
  created_date     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE inventario.lote_revisiones IS
  'Correcciones de inventario sobre los lotes del informe central. La más '
  'reciente de cada (almacén, código, lote) es la que vale.';

COMMENT ON COLUMN inventario.lote_revisiones.fecha_vencimiento IS
  'La fecha que dice el envase. Vacía si solo se dejó una nota.';

-- Se consulta por almacén al pintar la pantalla, y se busca la última de cada
-- lote: el orden descendente de fecha evita ordenar en memoria.
CREATE INDEX IF NOT EXISTS idx_lote_revisiones_lote
    ON inventario.lote_revisiones (almacen_num, producto_codigo, no_lote, created_date DESC);

GRANT SELECT, INSERT, DELETE ON inventario.lote_revisiones TO elineas_backend_app;
