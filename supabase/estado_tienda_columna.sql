--
-- El estado de tienda deja de ser una fórmula repetida y pasa a ser columna
--
-- La misma regla vivía en tres sitios: `calcEstadoTienda` en Productos.jsx,
-- `calcEst` en Dashboard.jsx (ya retirada) y el CASE de la acción `resumen` en
-- src/server/datosApi.js. Tres copias que podían divergir sin que nada lo
-- notara.
--
-- Como columna generada, la regla vive una sola vez, se puede indexar y, sobre
-- todo, se puede FILTRAR en el servidor. Eso último es lo que hacía falta: el
-- catálogo pagina en servidor, y filtrar por un estado calculado en el
-- navegador solo filtraría la página visible.
--
-- Depende solo de columnas almacenadas (id_tienda, exist_fisica, almacen,
-- tienda) y de funciones inmutables, que es lo que Postgres exige para una
-- columna generada.
--
-- Nótese que un producto SIN id de tienda pero CON existencia no es 'SIN ID':
-- cae por las ramas de almacén/tienda igual que los demás. Es lo que hace el
-- original, y es fácil equivocarse al portarlo.
--
-- EJECUTAR como elineasadmin.
--

ALTER TABLE inventario.productos
  DROP COLUMN IF EXISTS estado_tienda;

ALTER TABLE inventario.productos
  ADD COLUMN estado_tienda text GENERATED ALWAYS AS (
    CASE
      WHEN (id_tienda IS NULL OR btrim(id_tienda) = '')
       AND COALESCE(exist_fisica, 0) = 0                              THEN 'SIN ID'
      WHEN id_tienda IS NOT NULL AND btrim(id_tienda) <> ''
       AND COALESCE(exist_fisica, 0) = 0                              THEN 'AGOTADO'
      WHEN COALESCE(almacen, 0) = 0 AND COALESCE(tienda, 0) > 6       THEN 'SIN RESERVA'
      WHEN COALESCE(tienda, 0) = 0                                    THEN 'NO TIENDA'
      WHEN COALESCE(tienda, 0) > 1
       AND COALESCE(tienda, 0) < COALESCE(almacen, 0)
       AND COALESCE(almacen, 0) <= 10                                 THEN 'ULTIMAS PIEZAS'
      WHEN COALESCE(almacen, 0) >= 0
       AND COALESCE(almacen, 0) < COALESCE(tienda, 0)
       AND COALESCE(tienda, 0) <= 10                                  THEN 'ULTIMAS PIEZAS'
      WHEN COALESCE(tienda, 0) <= 10                                  THEN 'PROXIMO'
      ELSE 'DISPONIBLE'
    END
  ) STORED;

COMMENT ON COLUMN inventario.productos.estado_tienda IS
  'Estado calculado a partir de id_tienda/exist_fisica/almacen/tienda. '
  'Réplica exacta de calcEstadoTienda (src/pages/Productos.jsx): si cambia una, '
  'hay que cambiar la otra.';

-- El catálogo filtra por estado dentro de un almacén.
CREATE INDEX IF NOT EXISTS idx_productos_estado_tienda
    ON inventario.productos (almacen_num, estado_tienda)
 WHERE activo;
