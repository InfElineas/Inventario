#!/bin/sh
# Inicializa la base de DESARROLLO con el mismo esquema que ELINEAS_BD.
#
# Postgres ejecuta esto una sola vez, al crear el volumen. Para repetirlo desde
# cero:  docker compose -f docker-compose.dev.yml down -v
#
# Réplica del reparto de producción: los objetos los crea `elineasadmin` (aquí
# el superusuario de la imagen) y la aplicación se conecta como
# `elineas_backend_app`, que solo tiene DML. Así un permiso que falte en
# desarrollo falla igual que fallaría en producción.
#
# catalogo_origen.sql y sync_invglobal.sql dependen de las tablas `ap_rows` /
# `sub_rows` que en ELINEAS_BD real llenan otros sistemas. Aquí las sustituye
# `origen-dev.sql` (con unos pocos productos inventados), y al final se ejecuta
# el sync para que el catálogo no arranque vacío.

set -eu

psql() { command psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"; }

psql <<SQL
CREATE ROLE elineas_backend_app LOGIN PASSWORD '${APP_DB_PASSWORD:-dev}';
CREATE SCHEMA inventario AUTHORIZATION $POSTGRES_USER;
GRANT USAGE ON SCHEMA inventario TO elineas_backend_app;
SQL

# Orden = el de aplicación en producción (ver docs/migracion-supabase.md).
aplicar() { echo ">> $1"; psql -f "$1"; }

aplicar /sql/migracion_a_elineas_bd.sql
aplicar /sql/fix_usuarios_id.sql
aplicar /sql/fix_clave_producto.sql
aplicar /sql/estado_anuncio_tkc.sql
aplicar /sql/estado_tienda_columna.sql
aplicar /dev-db/origen-dev.sql
aplicar /sql/catalogo_origen.sql
aplicar /sql/sync_invglobal.sql

psql <<SQL
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA inventario TO elineas_backend_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA inventario TO elineas_backend_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA inventario TO elineas_backend_app;
SQL

# Catálogo inicial a partir del origen de desarrollo.
psql -c "SELECT inventario.sync_productos_desde_invglobal(NULL);"
