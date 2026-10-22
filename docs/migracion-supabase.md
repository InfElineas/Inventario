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
| URL canónica | `inv.mercadoelineas.com`. La otra se retira en el corte |
| Quién entra | Lo decide el IS: cuenta + rol en el sistema `inventario`. **Sin restricción de dominio** |
| `usuarios.activo` | Se conserva como interruptor local |

## Estado del entorno

- Servidor: Ubuntu 26.04, contenedor `ELINEAS_BD` (PostgreSQL 17.10).
- Los contenedores llegan por la red `elineas_default`, usando el **nombre**
  `ELINEAS_BD` como host, nunca la IP.
- `inventario-prod` **todavía no está** en esa red (lo dice la guía de la BD).
- Backups: ya programados por el gestor de la base.
- `pg_cron` **disponible pero sin instalar**. Activarlo exige tocar
  `shared_preload_libraries` y reiniciar un Postgres que sirve también al
  Identity Server, transferencias y fleet. Para un `SELECT` de 3 segundos no
  compensa: el sync va por cron del host (ver fase 6).

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
5. Quitar la **restricción de dominio** de `Login.jsx` (`COMPANY_DOMAIN`): la
   pantalla rechaza en el navegador cualquier correo que no termine en
   `@mercadoelineas.com`, y quien decide el acceso pasa a ser el IS. Si no se
   quita, un usuario externo con rol asignado no podría ni intentar entrar.
   El trigger equivalente de la base (`handle_new_auth_user`) ya desapareció al
   portar el esquema.

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
2. **Retirar el despliegue antiguo de `inventario.mercadoelineas.com`** (ver
   abajo). Es lo primero, no lo último.
3. Levantar la versión nueva.
4. Comprobar: login con el IS, el rol espejado, una lectura y una escritura
   reales.
5. Desprogramar el Edge Function `sync-auto`. ✅ El catálogo lo sincroniza
   ahora un cron del host, cada hora al minuto 40:

   ```
   40 * * * * docker exec ELINEAS_BD psql -U elineasadmin -d ELINEAS_BD -c "SELECT inventario.sync_productos_desde_invglobal(NULL);" >> /home/soporte/sync-catalogo.log 2>&1
   ```

### Por qué cada hora, y por qué al minuto 40

La fuente no es una tabla sino la vista `public."invGlobal"`, que une la
**última ejecución** de dos procesos independientes:

| Tabla | Qué trae | Cuándo corre (UTC) |
|---|---|---|
| `ap_rows` / `ap_runs` | anuncios: nombre, código, precio, fotos | cada 6 h — 04:05, 10:06, 16:09, 22:05 |
| `sub_rows` / `sub_runs` | submayor: física, almacén, tienda | 11:03 y 17:04 |

Esas dos horas de `sub_runs` son las 06:00 y 12:00 locales del contenedor
`elineas-transferencia-catalog-cron-1` (el servidor va en CDT, la base en UTC).

Dos consecuencias:

- **Las existencias se congelan hasta 18 horas.** Entre las 17:04 y las 11:03
  del día siguiente, `invGlobal` sirve el stock de la tarde anterior aunque los
  anuncios se hayan refrescado dos veces. No lo arregla sincronizar más a
  menudo: la fuente es la que es. Por eso el formulario de inventario consulta
  el submayor en vivo (ver `docs/requisitos-inventario.md`).
- **Las cargas se saltan.** El 21/10/2026 faltó la de las 11:03 y alguien lanzó
  ambas a mano a las 13:30.

De ahí la frecuencia: cada hora se recupera solo de cualquier carga perdida, y
a 2,9 segundos por pasada son unos 70 segundos de CPU al día. El minuto 40
evita pisar las cargas, que arrancan entre los minutos :03 y :09.

No hay carga de datos históricos: el sistema no estaba en uso y el catálogo se
repuebla solo (ver fase 2).

### El despliegue duplicado

Hay **dos despliegues sin relación entre sí**, y solo uno es el bueno:

| URL | Dónde | Qué sirve |
|---|---|---|
| `inv.mercadoelineas.com` | Cloudflare → VPS → Caddy → `inventario-prod` | El build actual (Vite 8/rolldown). **El canónico** |
| `inventario.mercadoelineas.com` | Cloudflare, actualizado por FTP. Nada que ver con el VPS | Un build viejo (era Vite 6) |

**El viejo es un riesgo, no un residuo.** Habla directamente con Supabase desde
el navegador, así que seguiría leyendo y escribiendo en la base vieja después
de la migración. Dos sistemas vivos sobre bases distintas, y nadie se entera
hasta que los datos no cuadran. Hay que apagarlo o redirigirlo **antes** de
levantar la versión nueva.

El campo URL del sistema en el IS debe quedar en `https://inv.mercadoelineas.com`.
Es informativo: el navegador nunca habla con el IS —lo hace nuestro servidor,
de servidor a servidor—, así que `ALLOWED_ORIGIN` no condiciona esta elección.

**Rollback:** mientras no se toque Supabase, volver atrás es desplegar la imagen
anterior y reactivar el proyecto. Por eso Supabase **no se cancela** hasta pasar
unos días en producción con el sistema nuevo.

---

## Lo que sigue abierto

- Las reglas de autorización se indexan por **rol**, no por permisos: el único
  endpoint que expone el IS es `/api/user-roles/me`, que devuelve roles. La
  pestaña Permisos de su consola no tiene endpoint documentado.
- La forma exacta del payload de `/api/user-roles/me`: `resolveRole()` acepta
  hoy objetos y cadenas, y se ajusta cuando veamos una respuesta real.
- Qué hacer con la **BD externa** (`VITE_SUPABASE_EXTERNA_*`), que es el origen
  del sync de productos y es un segundo proyecto de Supabase. Esta migración no
  la cubre.
