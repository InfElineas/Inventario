--
-- El estado de anuncio que publica TKC
--
-- `productos.estado_anuncio` NO sirve para esto: la editan los usuarios a mano
-- en la ficha del producto y el sync la respeta a propósito. Escribir ahí el
-- dato de TKC borraría su trabajo en cada sincronización.
--
-- La pantalla deducía «Muerto» del stock —almacén=0 y tienda>6, o tienda=0 y
-- EF>10—, que no tiene nada que ver con lo que TKC considera muerto: un campo
-- suyo, `ap_rows.is_dead`, que la vista `public."invGlobal"` expone ya resuelto
-- en la columna "Estado Anuncio" junto con `status_provider`.
--
-- Valores: 'Activado', 'Desactivado', 'Muerto', 'Sin Id'.
--
-- EJECUTAR como elineasadmin, y después volver a cargar sync_invglobal.sql.
--

ALTER TABLE inventario.productos
  ADD COLUMN IF NOT EXISTS estado_anuncio_tkc text;

COMMENT ON COLUMN inventario.productos.estado_anuncio_tkc IS
  'Estado publicado por TKC (invGlobal."Estado Anuncio"). Lo escribe el sync; '
  'no confundir con estado_anuncio, que la editan los usuarios.';

-- Las pantallas filtran por este campo dentro de un almacén.
CREATE INDEX IF NOT EXISTS idx_productos_estado_anuncio_tkc
    ON inventario.productos (almacen_num, estado_anuncio_tkc)
 WHERE activo;
