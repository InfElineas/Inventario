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
-- Un producto sin id de tienda es 'SIN ID', tenga existencia o no. La primera
-- versión de esta columna solo lo marcaba así con existencia cero —copiando un
-- `calcEstadoTienda` que ya estaba mal—, y los 207 que tienen stock acababan
-- como 'NO TIENDA'. En las hojas de inventario salen como SIN ID.
--
-- EJECUTAR como elineasadmin.
--

ALTER TABLE inventario.productos
  DROP COLUMN IF EXISTS estado_tienda;

ALTER TABLE inventario.productos
  ADD COLUMN estado_tienda text GENERATED ALWAYS AS (
    CASE
      WHEN id_tienda IS NULL OR btrim(id_tienda) = ''                 THEN 'SIN ID'
      WHEN COALESCE(exist_fisica, 0) = 0                              THEN 'AGOTADO'
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


-- ── La prioridad ────────────────────────────────────────────────────────
--
-- Las hojas de inventario ordenan el trabajo por este número, y el mismo
-- estado puede tener dos: NO TIENDA es 2 si la existencia pasa de 10 y 3 si
-- no; ULTIMAS PIEZAS es 4 o 6 según qué lado del almacén esté corto. La
-- etiqueta sola pierde esa distinción, que es justo la que dice por dónde
-- empezar.
--
-- Réplica exacta de `calcEstadoTienda` (src/pages/Productos.jsx), rama por
-- rama y en el mismo orden: las ramas no son excluyentes entre sí y cambiar el
-- orden cambia el resultado.

ALTER TABLE inventario.productos
  DROP COLUMN IF EXISTS prioridad_tienda;

ALTER TABLE inventario.productos
  ADD COLUMN prioridad_tienda smallint GENERATED ALWAYS AS (
    CASE
      WHEN id_tienda IS NULL OR btrim(id_tienda) = ''
        THEN CASE WHEN COALESCE(exist_fisica, 0) = 0 THEN 10 ELSE 9 END
      WHEN COALESCE(exist_fisica, 0) = 0                              THEN 11
      WHEN COALESCE(almacen, 0) = 0 AND COALESCE(tienda, 0) > 6       THEN 1
      WHEN COALESCE(tienda, 0) = 0 AND COALESCE(exist_fisica, 0) > 10 THEN 2
      WHEN COALESCE(tienda, 0) = 0                                    THEN 3
      WHEN COALESCE(tienda, 0) > 1
       AND COALESCE(tienda, 0) < COALESCE(almacen, 0)
       AND COALESCE(almacen, 0) <= 10                                 THEN 4
      WHEN COALESCE(almacen, 0) >= 0
       AND COALESCE(almacen, 0) < COALESCE(tienda, 0)
       AND COALESCE(tienda, 0) <= 10                                  THEN 6
      WHEN COALESCE(tienda, 0) <= 10                                  THEN 5
      WHEN COALESCE(tienda, 0) <= COALESCE(almacen, 0)                THEN 7
      ELSE 8
    END
  ) STORED;

COMMENT ON COLUMN inventario.productos.prioridad_tienda IS
  'Orden de trabajo de las hojas de inventario: 1 es lo más urgente, 11 lo '
  'menos. Un mismo estado_tienda puede tener dos prioridades distintas.';

CREATE INDEX IF NOT EXISTS idx_productos_prioridad
    ON inventario.productos (almacen_num, prioridad_tienda)
 WHERE activo;
