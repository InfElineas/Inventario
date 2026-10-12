# Migración de Supabase a ELINEAS_BD + Identity Server

Plan por fases para dejar de usar Supabase: los datos pasan al PostgreSQL
propio (`ELINEAS_BD`) y la autenticación al Identity Server de Elineas.

Cada fase termina en una **comprobación**. Si no pasa, no se avanza.

## Decisiones ya tomadas

| Tema | Decisión |
|---|---|
| Esquema en ELINEAS_BD | `inventario` (norma: cada app en su esquema) |
| Usuario de la app | `elineas_backend_app` — solo DML, nunca `elineasadmin` |
| Creación de objetos | Siempre como `elineasadmin`, con OWNER `elineasadmin` |
| Autorización | Pasa de las 58 policies RLS al backend |
| Rol del usuario | El IS manda; `usuarios.role` lo espeja en cada login |
| Varios roles en el IS | Gana el de mayor precedencia (`src/lib/roles.js`) |
| Vínculo IS ↔ app | El **email**. `auth.users` no se migra |
| API de datos | `/api/*` del mismo origen que la SPA — sin CORS ni certificado nuevo |
| `usuarios.activo` | Se conserva como interruptor local |

## Estado del entorno

- Servidor: Ubuntu 26.04, contenedor `ELINEAS_BD` (PostgreSQL 17.10).
- Los contenedores llegan por la red `elineas_default`, usando el **nombre**
  `ELINEAS_BD` como host, nunca la IP.
- `inventario-prod` **todavía no está** en esa red (lo dice la guía de la BD).
- Backups: ya programados por el gestor de la base.
- `pg_cron` disponible — destino natural del Edge Function `sync-auto`.

---

## Fase 0 — Preparación

**Tú, con el especialista de base de datos:**

```sql
-- Como elineasadmin
CREATE SCHEMA inventario AUTHORIZATION elineasadmin;
GRANT USAGE ON SCHEMA inventario TO elineas_backend_app, pgadmin_readonly;
```

- Pedir la contraseña de `elineas_backend_app`. No me la pases: va en el `.env`
  del servidor.

**Tú, en el Identity Server:**

- Dar de alta los usuarios actuales de la aplicación. Las contraseñas **no se
  migran**: las credenciales ahora son las del IS.
- Asignar a cada uno su rol en el sistema `inventario`. Sin rol, su login
  devuelve 403.
- Añadir `https://inventario.mercadoelineas.com` a `ALLOWED_ORIGIN`.
- Confirmar si la pestaña **Permisos** entra en juego o si la autorización se
  decide solo por rol.

> Para no quedarte sin acceso durante la transición, mantén las cuentas de
> Supabase activas hasta terminar la fase 6.

**Comprobación:** `\dn` muestra el esquema `inventario`, y un usuario de prueba
puede autenticarse contra el IS y recibe su rol.

---

## Fase 1 — Esquema

**Tú:** sacar el esquema real de Supabase. La URI está en Project Settings →
Database → Connection string (URI, conexión directa, no el pooler).

```bash
docker exec ELINEAS_BD pg_dump \
  "postgresql://postgres:<PASS>@db.bnopapasaiyksmndxvly.supabase.co:5432/postgres" \
  --schema-only --no-owner --no-privileges --schema=public \
  > ~/inventario_schema.sql
```

Pásame el archivo (es texto, sin secretos).

Parto del dump y no de los 37 archivos de migración porque aquí las migraciones
se aplican a mano en el SQL Editor: es muy posible que la base viva tenga
cambios que nunca volvieron al repositorio.

**Yo:** genero `supabase/migracion_a_elineas_bd.sql`, que:

- mueve todo al esquema `inventario`;
- elimina las 58 policies, los `ENABLE ROW LEVEL SECURITY` y las 52
  referencias a `auth.email()` / `auth.role()`;
- elimina `handle_new_auth_user()` y su trigger (la tabla `auth.users` no viaja);
- elimina las concesiones a `anon`, `authenticated` y `service_role`;
- conserva las 11 tablas, los índices, la vista `lotes_vigencia` y los triggers
  de negocio (validación de merma, descuento de stock, reconciliación de
  inventario, `prevent_producto_id_change`, `set_updated_date`);
- deja `sync_productos_bulk` y `deactivate_stale_sync` sin `SECURITY DEFINER`:
  ya no hay RLS que saltarse y quien las invoca es el backend.

**Tú:** aplicarlo como `elineasadmin`.

```bash
docker exec -i ELINEAS_BD psql -U elineasadmin -d ELINEAS_BD < migracion_a_elineas_bd.sql
```

**Comprobación:** ningún objeto con OWNER distinto de `elineasadmin`.

```sql
SELECT c.relname, pg_get_userbyid(c.relowner) AS owner
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'inventario'
  AND pg_get_userbyid(c.relowner) <> 'elineasadmin';
```

---

## Fase 2 — Datos ✅ resuelta

No hay migración de datos históricos: el sistema no está en uso, así que
mermas, conteos, recepciones y anuncios arrancan vacíos.

Y el catálogo **no hay que migrarlo**: `public."invGlobal"` ya vive en
ELINEAS_BD, es la misma tabla de la que el sistema sincronizaba en el segundo
Supabase, y trae las 13 columnas con los mismos nombres. La cadena real era
**TKC → invGlobal → productos**, con Supabase de intermediario innecesario.

`inventario.productos` sigue siendo tabla, no vista: es el destino de las
claves foráneas de mermas, inventarios, lotes y anuncios, y guarda 15 columnas
propias de la aplicación. Lo que cambia es cómo se llena —
`inventario.sync_productos_desde_invglobal()`, una sentencia SQL local en vez
de REST + RPC paginado.

Eso elimina `syncService.js`, `sync_productos_bulk`, `deactivate_stale_sync`,
el Edge Function `sync-auto`, `externalSupabase.js` y las variables
`VITE_SUPABASE_EXTERNA_*`.

### La identidad del producto no es el código de barras

Al sincronizar apareció que `Cód. Prod.` es el código de barras y TKC admite
varios anuncios sobre el mismo código: el 7501032931414 del almacén 593 tiene
siete filas, tres con `IdTienda` distintos. El índice
`productos_almacen_codigo_unique` asumía lo contrario y colapsaba 828 filas a
370, perdiendo anuncios reales y **516 unidades de existencia en 45 filas** —
el dato contra el que se validan las mermas.

Corregido en `fix_clave_producto.sql`: la identidad pasa a ser `IdTienda`, con
caída al código solo para las filas que no lo tienen. Efecto visible: el
buscador muestra varias entradas por código de barras, una por anuncio.

**Resultado medido:** 55.819 productos (446 más que con la clave vieja),
556.885 unidades, en 2 segundos. Segunda pasada idéntica — es idempotente.

---

## Fase 3 — Backend

Aquí está el grueso del trabajo. Hoy `server/index.js` es `node:http` puro y
solo hace de pasarela a TKC; tiene que convertirse en la API de datos.

**Yo**, en este orden, cada pieza con sus pruebas:

1. **Conexión a Postgres** con `elineas_backend_app`, por nombre de contenedor.
2. **Autenticación con el IS**: `sign-in`, cookies httpOnly (`session` y `jwt`),
   verificación del JWT contra el JWKS, refresco con `/api/auth/token`,
   `sign-out`. El IS firma con **EdDSA/Ed25519**, que `jose` verifica sin
   problema.
3. **Resolución de rol**: tras el login, `/api/user-roles/me?systemSlug=inventario`
   → `resolveRole()` → se espeja en `usuarios.role`.
4. **Autorización**: traducir las 58 policies a reglas del backend. Es la parte
   delicada: hasta ahora la cumplía Postgres y pasa a depender de que el código
   no se deje un caso. Cada regla, con su prueba.
5. **Endpoints por entidad**, manteniendo la interfaz de `base44Client` para no
   reescribir las páginas.

**Comprobación:** la suite de pruebas cubre cada regla de autorización, incluido
el caso negativo — que un rol que no debe, no pueda.

---

## Fase 4 — Frontend

**Yo:**

1. Cambiar la implementación de `base44Client` de `supabase-js` a `fetch`
   contra la API. Las páginas que pasan por la fachada no se tocan.
2. Reescribir las **57 llamadas sueltas** a `supabase.from()` repartidas en 16
   archivos.
3. Sustituir las 13 llamadas a `supabase.auth.*`: `AuthContext`, `Login`,
   `ActualizarPassword` (el restablecimiento de contraseña pasa al IS),
   `SuperAdmin` y `AdminUsuarios` (el alta deja de ser autoservicio; el selector
   de rol queda de solo lectura con enlace al IS).
4. `tkcService` pasa a autenticarse con la sesión del IS en vez del token de
   Supabase.

**Comprobación:** recorrer en el navegador los flujos completos — merma de punta
a punta, conteo con diferencia, recepción con cierre, escalado de anuncio.

---

## Fase 5 — Despliegue

**Yo:** en `docker-compose.prod.yml`, añadir la red externa y las variables.

```yaml
services:
  app:
    networks: [elineas_default]
networks:
  elineas_default:
    external: true
```

Variables nuevas: `DATABASE_URL` (con `elineas_backend_app` y host
`ELINEAS_BD`), `AUTH_API_URL=https://apiauth.mercadoelineas.com`,
`SYSTEM_SLUG=inventario`. Desaparecen las `VITE_SUPABASE_*`.

**Tú:** poner la contraseña real en el `.env` del servidor y levantar.

**Comprobación:** el contenedor resuelve `ELINEAS_BD` por nombre y responde el
healthcheck.

---

## Fase 6 — Corte

1. Avisar a los usuarios y **congelar escrituras** (apagar `inventario-prod`).
2. Dump final de datos desde Supabase.
3. Cargar en `inventario`, ya con el esquema de la fase 1 aplicado.
4. Levantar la versión nueva.
5. Comprobar: login con el IS, el rol espejado, una lectura y una escritura
   reales.
6. Desprogramar el Edge Function `sync-auto` y pasarlo a `pg_cron` o a un
   contenedor con cron.

**Rollback:** mientras no se toque Supabase, volver atrás es desplegar la imagen
anterior y reactivar el proyecto. Por eso Supabase **no se cancela** hasta pasar
unos días en producción con el sistema nuevo.

---

## Lo que sigue abierto

- Si los **Permisos** del IS entran en juego o basta el rol.
- La forma exacta del payload de `/api/user-roles/me`: `resolveRole()` acepta
  hoy objetos y cadenas, y se ajusta cuando veamos una respuesta real.
- Qué hacer con la **BD externa** (`VITE_SUPABASE_EXTERNA_*`), que es el origen
  del sync de productos y es un segundo proyecto de Supabase. Esta migración no
  la cubre.
