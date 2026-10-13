--
-- usuarios.id necesita generar su propio valor
--
-- En Supabase la columna era clave foránea a auth.users(id) y el valor lo
-- traía esa tabla. Al portar el esquema se retiró la FK —auth.users no migra y
-- el vínculo con el Identity Server es el email—, pero la columna quedó
-- `uuid NOT NULL` sin valor por defecto.
--
-- Consecuencia: el primer login de cualquier usuario fallaba con 500. El
-- backend inserta su perfil local a partir de lo que dice el IS, sin indicar
-- id, y Postgres rechazaba la fila.
--
-- EJECUTAR como elineasadmin.
--

ALTER TABLE inventario.usuarios
  ALTER COLUMN id SET DEFAULT gen_random_uuid();
