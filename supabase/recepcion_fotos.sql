--
-- La foto de la presentación que hace quien recibe
--
-- Al descargar un camión, inventario confirma los datos del producto contra
-- lo que tiene delante: gramaje, vencimiento, unidades por caja. Esos caben
-- en el propio detalle de la recepción; la foto no.
--
-- Va en su propia tabla y no dentro de `recepciones.detalles` por una razón
-- concreta: ese jsonb se lee entero cada vez que se abre la recepción y la
-- pantalla de la lista trae cien filas de golpe. Una recepción de cien
-- líneas con su foto cada una son varios megas que se descargarían para
-- pintar una tabla de cinco columnas. Aquí la foto solo viaja cuando alguien
-- la pide.
--
-- Se guarda como data URL en una columna de texto, no como bytea: el cliente
-- ya la reduce a un JPEG de 1280 px antes de subirla, y así se sirve por la
-- misma API de datos que todo lo demás, sin una ruta nueva que exponga
-- binarios.
--
-- EJECUTAR como elineasadmin.
--

CREATE TABLE IF NOT EXISTS inventario.recepcion_fotos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recepcion_id    uuid NOT NULL,
  producto_codigo text NOT NULL,
  datos           text NOT NULL,
  creado_por      text,
  created_date    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE inventario.recepcion_fotos IS
  'Fotos de la presentación del producto tomadas al recibir. Una por línea '
  'de recepción; el detalle guarda su id en `foto_id`.';

COMMENT ON COLUMN inventario.recepcion_fotos.datos IS
  'La imagen como data URL (data:image/jpeg;base64,...), ya reducida por el '
  'cliente. No se indexa ni se busca por ella.';

-- Se consulta siempre por recepción: qué líneas tienen foto al abrirla.
CREATE INDEX IF NOT EXISTS idx_recepcion_fotos_recepcion
    ON inventario.recepcion_fotos (recepcion_id);

-- La aplicación entra como elineas_backend_app y solo hace DML.
GRANT SELECT, INSERT, DELETE ON inventario.recepcion_fotos TO elineas_backend_app;
