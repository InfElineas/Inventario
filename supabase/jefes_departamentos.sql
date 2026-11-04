--
-- Los departamentos que dirige un jefe, desde el Identity Server
--
-- El departamento de un jefe se escribía a mano en la aplicación
-- (`usuarios.departamento`), aparte de su rol. Ahora es parte del rol: en el
-- Identity Server hay un rol por departamento —`jefe_inventario`,
-- `jefe_facturacion`, `jefe_ca`— y quien dirige dos tiene los dos. En cada login
-- la aplicación los lee y guarda los departamentos aquí.
--
-- `departamento` se queda: es el primero de la lista, y lo siguen leyendo los
-- jefes de antes, que tienen `jefe_depto` y el departamento puesto a mano.
--
-- ¡EJECUTAR ANTES de desplegar el código nuevo! El login escribe esta columna, y
-- sin ella nadie podría entrar.
--
--   docker exec -i ELINEAS_BD psql -U elineasadmin -d ELINEAS_BD < supabase/jefes_departamentos.sql
--

ALTER TABLE inventario.usuarios
  ADD COLUMN IF NOT EXISTS departamentos text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN inventario.usuarios.departamentos IS
  'Departamentos que dirige, según sus roles de jefe en el Identity Server '
  '(jefe_inventario, jefe_facturacion, jefe_ca). `departamento` es el primero.';

-- Los jefes que ya tienen su departamento puesto: se parte de él, para que no
-- pierdan el departamento entre esta migración y su próximo inicio de sesión.
UPDATE inventario.usuarios
   SET departamentos = ARRAY[departamento]
 WHERE cardinality(departamentos) = 0
   AND departamento IS NOT NULL AND departamento <> '';
