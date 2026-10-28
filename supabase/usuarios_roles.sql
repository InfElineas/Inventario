--
-- Todos los roles de un usuario, no solo el de más autoridad
--
-- El Identity Server da una LISTA de roles por sistema, y aquí se guardaba uno
-- solo: el de mayor precedencia. Quien es inventarista y además factura
-- resolvía a `fact` y perdía lo que solo puede `inv` —Recepciones,
-- Vencimientos, registrar un conteo—, aunque tuviera ese rol asignado.
--
-- Lo que puede hacer alguien es la suma de lo que permiten sus roles.
--
-- `role` se queda: lo usa todo lo que tiene que elegir UNO —el filtro por
-- defecto de una pantalla, una insignia— y es el primero de `roles`.
--
-- EJECUTAR como elineasadmin.
--

ALTER TABLE inventario.usuarios
  ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN inventario.usuarios.roles IS
  'Todos los roles del usuario en este sistema según el Identity Server, de '
  'más a menos autoridad. Los permisos son la suma de lo que permite cada '
  'uno. `role` es el primero de esta lista.';

-- Los que ya existen tienen uno: el suyo. Se rellena para que nadie pierda
-- acceso entre esta migración y su próximo inicio de sesión, que es cuando el
-- login vuelve a preguntarle al IS y escribe la lista completa.
UPDATE inventario.usuarios
   SET roles = ARRAY[role]
 WHERE cardinality(roles) = 0 AND role IS NOT NULL AND role <> '';
