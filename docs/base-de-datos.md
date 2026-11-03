# Base de datos

PostgreSQL 17 en el contenedor `ELINEAS_BD`, esquema `inventario`. Dos
usuarios, y la diferencia importa:

| Usuario | Para qué |
|---|---|
| `elineasadmin` | DDL. Crea tablas, índices y funciones. **Las migraciones van con este** |
| `elineas_backend_app` | solo DML. Es el que lleva la aplicación en `DATABASE_URL` |

El `search_path` es `inventario, public`, así que las consultas no llevan
esquema delante.

## Cómo se aplican las migraciones

A mano, una a una, leyendo antes lo que hacen. No hay herramienta de
migraciones ni registro de cuáles se aplicaron: el `.sql` lleva en la cabecera
qué arregla y por qué, y eso es la documentación.

```bash
docker exec -i ELINEAS_BD psql -U elineasadmin -d ELINEAS_BD \
  -v ON_ERROR_STOP=1 < supabase/<archivo>.sql
```

`ON_ERROR_STOP=1` no es opcional: sin él, psql sigue tras el primer error y
deja la migración a medias.

Los archivos `migration_v*.sql` son del sistema anterior y están aplicados;
los de nombre hablado son los posteriores a la migración.

## Tablas

### Catálogo y existencias

| Tabla | Qué guarda |
|---|---|
| `productos` | El catálogo, una fila por producto y almacén. Lo llena el sync |
| `lotes_ic` | Intervención comercial sobre un lote que está por vencer |
| `lote_revisiones` | La fecha del envase que anota inventario cuando el informe no la trae |

`productos` tiene columnas **generadas**: `estado_tienda` y `prioridad_tienda`
se calculan solas a partir de la existencia. No se escriben.

Los **lotes ya no son una tabla nuestra**. Los carga el cron central en esta
misma base, en `lot_rows`, una corrida tras otra. Se lee de la última corrida
**que trae cada almacén**, no de la vista `lot_rows_latest`: esta toma la última
corrida sin más, y si sale a medias deja a los almacenes que le faltan en cero.
`inventario.lotes` y `lotes_vigencia` siguen existiendo, vacías, porque hay
código que todavía las nombra.

### Flujos de trabajo

| Tabla | Estado | Recorrido |
|---|---|---|
| `inventarios` | `estado_tarea` | en_curso → pend_fact → en_auditoria → completado |
| `mermas` | `estado_tarea` | igual, más `reconteo_solicitado` |
| `anuncios_desact` | `estado_tarea` | pendiente → pend_ca → en_auditoria → completado |
| `recepciones` | `estado` | en_curso → cerrada / con_diferencias |

Cualquiera de ellos puede volver a `devuelto`, que significa que auditoría o
facturación lo rechazaron. **Una recepción nunca está «devuelta»**: tiene su
propio vocabulario —Recibiendo, Conforme, Con incidencia— porque ahí nadie
devolvió nada, llegó mercancía que no cuadra.

| Tabla | Qué guarda |
|---|---|
| `recepcion_fotos` | La foto de la presentación, aparte para que no engorde la recepción |

### Soporte

`usuarios` (espejo del Identity Server), `notificaciones`,
`historial_movimientos`, `workflow_eventos`, `comentarios_supervision`,
`admin_audit_log`, `sync_auto_log`.

## Un detalle que ha causado errores: las fechas vacías

Una fecha opcional que llega como cadena vacía revienta el `INSERT`: Postgres
no convierte `''` a `date`. Hay que mandar `null`. Lo mismo con los jsonb:
node-pg convierte un array de JavaScript a literal de array de Postgres
(`{}`), que no es JSON válido, así que la API de datos serializa a propósito
los valores que van a columnas `json`/`jsonb`.

## Seguridad

Las cuarenta policies RLS que había en Supabase ya no existen. La autorización
vive en `src/server/permisos.js`, y el modelo tiene dos mitades que conviene
no mezclar:

- **DESDE** (el `USING` de la policy): en qué estado puede estar la fila para
  que este rol la toque.
- **HACIA** (el `WITH CHECK`): en qué estado puede dejarla.

Esa separación es lo que impide saltarse pasos: un inventarista puede tocar
una merma `en_curso`, pero no dejarla en `completado`.

Cada comprobación se escribe para **un** rol y se aplica a **todos** los de la
persona. Lo que alguien puede hacer es la suma de lo que permiten sus roles.

`administrador` y `superadmin` pasan por encima de todo, que es lo que hacía
`is_admin()` en SQL.

### Lo que el cliente no escribe

`productos_lectura`, `lotes`, `lotes_vigencia` y `bd_tkc` son de solo lectura:
las llena el sync con `elineasadmin`, nunca la aplicación.

### Triggers y funciones

Siguen en Postgres porque son reglas de la base, no de la aplicación:

- Una merma o un conteo completados **descuentan la existencia** del producto.
- Un ajuste marca el producto en `existencias_en` para que el catálogo sepa
  que su existencia cambió sin esperar al sync.
- `sync_productos_desde_invglobal(almacen)` vuelca el catálogo externo.
- `detectar_casos_anuncio(almacen)` busca los productos con problema de
  anuncio en TKC.

## Migraciones posteriores a ELINEAS_BD

| Archivo | Qué hace |
|---|---|
| `migracion_a_elineas_bd.sql` | El salto: esquema, tablas y datos desde Supabase |
| `usuarios.sql`, `usuarios_roles.sql` | Usuarios espejo del IS y su lista de roles |
| `estado_tienda_columna.sql` | `estado_tienda` y `prioridad_tienda` como generadas |
| `estado_anuncio_tkc.sql`, `catalogo_origen.sql` | El estado de anuncio tal como lo dice TKC |
| `existencias_en.sql`, `ajustes_marcan_existencias.sql` | Que un ajuste se note sin esperar al sync |
| `deteccion_casos_anuncio.sql` | La función que busca casos de anuncio |
| `recepciones_pedido.sql` | Atar la recepción al pedido de compra |
| `recepciones_almacen.sql` | A qué almacén entró la mercancía |
| `recepcion_fotos.sql` | Las fotos de la presentación |
| `lotes_del_informe.sql` | El caso de IC apunta al lote del informe, no a un uuid |
| `lote_revisiones.sql` | La fecha que inventario lee del envase |
| `casos_ic.sql` | Quién respondió un caso de IC y cuándo, y el índice por estado |
| `existencia_diaria.sql` | Una fotografía diaria de la existencia, y el permiso sobre el informe de ventas |
