# Base de datos

Postgres gestionado por Supabase. El esquema y las migraciones viven en
`supabase/` como archivos `.sql` sueltos.

## Cómo se aplican las migraciones

**A mano, en el SQL Editor de Supabase**, en orden de versión. No hay carpeta
`supabase/migrations/` ni `config.toml`, así que `supabase db push` no aplica
aquí: el proyecto está *linkeado* al CLI pero no usa su flujo de migraciones.

Cada archivo lleva en su cabecera qué arregla y por qué. Para un entorno nuevo:

1. `schema.sql` — tablas base
2. `usuarios.sql` — tabla de usuarios y control de acceso
3. `security.sql` — reemplaza las policies permisivas iniciales
4. `migration_v2.sql` … `migration_v37_esp_anuncio.sql`, en orden

`qa_test_rows_anuncios_lotes.sql` **no es una migración**: son filas de prueba
para QA, con su limpieza incluida y comentada.

> Las cabeceras de las migraciones v13 a v19 mencionan un proyecto
> `fiftxvdgwrbjudjtfhhi` como "BD LOCAL". Es una referencia histórica: el
> proyecto en uso es `bnopapasaiyksmndxvly` (Inventario_db), el mismo que
> aparece en el resto de las migraciones.

## Tablas

### Catálogo y existencias

| Tabla | Contenido |
|---|---|
| `productos` | Catálogo sincronizado desde TKC: código, existencia física, almacén, tienda, precios, `id_tienda`, `estado_anuncio`, fotos |
| `lotes` | Lotes con fecha de vencimiento y cantidad. Los escribe el sync |
| `lotes_vigencia` | **Vista** sobre `lotes` que recalcula `estado_fv` y `vigencia_dias` contra `current_date` |
| `lotes_ic` | Intervenciones comerciales sobre lotes por vencer |

### Flujos de trabajo

| Tabla | Contenido |
|---|---|
| `mermas` | Pérdidas: cantidad, clasificación, destinos, reconteos y los tramos INV/FACT/Auditor |
| `inventarios` | Conteos: existencia TKC, conteo real, diferencia y líneas de detalle (`detalles` jsonb) |
| `recepciones` | Recepciones de proveedor, con `detalles` y `diferencias` en jsonb |
| `anuncios_desact` | Casos de anuncios con problema y su paso por INV/CA/Auditor |

### Soporte

| Tabla | Contenido |
|---|---|
| `usuarios` | Acceso y rol. Guarda además la configuración personal en jsonb |
| `notificaciones` | Bandeja por usuario |
| `workflow_eventos` | Rastro de auditoría: cada transición de estado |
| `historial_movimientos` | Cambios sobre productos (stock, precio, estado) |
| `sync_auto_log` | Última sincronización por usuario y almacén |

## Un detalle que ha causado bugs: fechas opcionales

Las columnas `date` de Postgres **no aceptan cadena vacía**. Un campo de fecha
opcional que el usuario deja en blanco llega como `''` y PostgREST responde
`22007 invalid input syntax for type date`.

Esto rompió el registro de mermas: `fecha_vencimiento_lote` y
`fecha_rebaja_tienda` son columnas `date` de primer nivel y el formulario
enviaba `''`. El insert fallaba con 400 y el registro nunca se creaba.

**Regla**: un campo de fecha opcional se envía como `null`, nunca como `''`.

No afecta a las fechas que viven **dentro de un `jsonb`** (las líneas de
`inventarios.detalles` o `recepciones.detalles`), porque ahí Postgres no valida
el tipo.

## Seguridad (RLS)

Todas las tablas tienen Row Level Security. Las policies por rol están en
`migration_v25_role_rls.sql` y sus correcciones posteriores.

### Funciones auxiliares

| Función | Qué devuelve |
|---|---|
| `get_user_role()` | El rol del usuario autenticado, o `sin_rol` si no tiene fila activa |
| `is_admin()` | `true` para `administrador` y `superadmin` |

El fallback a `sin_rol` es deliberado: antes devolvía `inv`, lo que dejaba a un
usuario desactivado o pendiente con privilegios de inventarista (corregido en
v32).

### Criterios de las policies

- **Lectura**: en general, cualquier usuario autenticado.
- **Escritura**: acotada por rol **y por estado**. Un `inv` solo modifica lo
  suyo mientras esté en su tramo; un `fact` solo lo que esté en `pend_fact`;
  un `auditor` solo lo que esté en `en_auditoria`.
- **Transiciones**: la cláusula `with check` limita a qué estado puede mover
  cada rol, de modo que nadie salte pasos. Un `inv` no puede llevar un conteo
  directo a `completado`.
- **Borrado**: muy restringido. `superadmin` en general; `administrador` para
  algunos casos no cerrados; `inv` solo sus registros aún sin tocar por FACT ni
  por el auditor.

### Tablas que el cliente no escribe

`productos`, `lotes` y `lotes_ic` los escribe el sync con `service_role`, que no
pasa por RLS. Por eso solo tienen policy de `SELECT`.

> Esa suposición ya falló dos veces: `lotes_ic` sí lo escribe el usuario desde
> el panel de Intervención Comercial (arreglado en v36) y `anuncios_desact`
> también, al escalar desde la detección de anuncios (v37). Si una pantalla
> ofrece un botón que inserta, la tabla necesita policy de INSERT.

### Triggers

| Trigger | Qué garantiza |
|---|---|
| `handle_new_auth_user()` | Solo se registran correos `@mercadoelineas.com` |
| `prevent_role_self_escalation()` | Nadie cambia su propio rol ni su estado activo; solo `superadmin` concede `superadmin` |
| `check_merma_cantidad()` | La merma no supera la existencia física, sumando las pendientes del mismo producto |
| `apply_merma_stock_deduction()` | Descuenta `exist_fisica` al completar una merma |
| `apply_inventario_stock_reconciliation()` | Ajusta `exist_fisica` con la **diferencia** del conteo auditado |
| `prevent_producto_id_change()` | El producto de una merma o conteo no se puede cambiar después |

### Funciones de sincronización

`sync_productos_bulk` y `deactivate_stale_sync` son `SECURITY DEFINER`, así que
se saltan RLS por diseño. Llevan **guardas de rol internas** para que solo las
pueda invocar el `service_role` o un rol autorizado: sin esa guarda, cualquier
usuario autenticado podría escribir el catálogo entero (corregido en v32).

`sync_productos_bulk` toma además un *advisory lock* por almacén (v35), para que
el cron y un sync manual no escriban el mismo almacén a la vez.

## Historial de migraciones

| Versión | Qué introduce |
|---|---|
| v2–v5 | Campos de TKC, multi-almacén, fotos, perfil de usuario |
| v6–v7 | Deduplicación, constraint único e índices |
| v8–v9 | Configuración de almacenes y de sync por usuario |
| v10 | Rol jefe de departamento |
| v11–v12 | Sync automático server-side; sync de productos sin `id_tienda` |
| v13 | `almacen_num` en mermas |
| v14–v15 | Trigger de merma contra existencia, sumando pendientes |
| v16 | `workflow_eventos` (auditoría completa) |
| v17–v18 | Ajuste del trigger de mermas; permisos de borrado para INV |
| v19 | Rol superadmin |
| v20–v22 | Link en notificaciones, `fact_estado`, fechas de transición |
| v23–v24 | Sync masivo, luego upsert por `codigo_producto` |
| v25 | **RLS por rol**, en reemplazo de las policies `auth_*` indiscriminadas |
| v26 | Recrea el índice único que exige el sync |
| v27–v28 | Ajuste de stock al completar mermas y conteos |
| v29 | Vista `lotes_vigencia` (semáforo en tiempo real) |
| v30–v31 | Restricción de dominio en el registro |
| v32 | **3 fallos críticos** abiertos por la propia ronda v25–v28 |
| v33 | `almacen_num` en inventarios |
| v34 | Corrige una policy de borrado que exigía un estado inalcanzable |
| v35 | Advisory lock en el sync |
| v36 | INSERT en `lotes_ic` ("Enviar a IC") |
| v37 | Rol `esp_anuncio`: `anuncio_config` e INSERT en `anuncios_desact` |

### Sobre la v32

Merece una nota porque documenta un patrón de riesgo: una ronda de
endurecimiento de seguridad (v25–v28) abrió tres fallos nuevos.

1. Las funciones `SECURITY DEFINER` del sync quedaron sin guarda de rol, lo que
   reabría la escalada de privilegios que v25 venía a cerrar.
2. `get_user_role()` devolvía `inv` por defecto, de modo que un usuario
   desactivado conservaba privilegios.
3. La policy de inventarios permitía a `inv` saltar a `completado`, y el trigger
   de stock de v28 sobrescribía la existencia en vez de aplicar la diferencia.

La lección: después de cambiar policies, revisar también lo que las rodea
—funciones `SECURITY DEFINER`, valores por defecto y triggers—, no solo las
policies en sí.
