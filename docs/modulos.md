# Módulos y flujos

## Roles

Definidos en `src/lib/constants.js` (etiquetas) y `src/lib/security.js`
(permisos). `usuarios.role` es texto libre en la BD: el rol se agrega al mapa
`ROLES` y el selector de Usuarios lo recoge solo.

| Clave | Etiqueta | Qué hace |
|---|---|---|
| `inv` | Inventarista | Crea mermas, conteos y recepciones. Primer paso de casi todo |
| `fact` | Facturación | Procesa mermas e inventarios: factura o nota de ajuste |
| `auditor` | Auditor | Valida y cierra. Accede a Reportes y Auditoría |
| `ca` | Comercial | Resuelve el paso CA de anuncios y crea intervenciones de lotes |
| `esp_anuncio` | Esp. Anuncios | Detecta productos con problemas en TKC y los escala |
| `ic` | Intervención | Rol declarado en `ROLES`; sin permisos propios en el mapa |
| `supervisor` | Supervisor | Resuelve diferencias de recepción |
| `jefe_depto` | Jefe de Depto. | Lectura y comentarios sobre su departamento. Panel de Supervisión |
| `administrador` | Administrador | Acceso total. Aprueba usuarios y asigna roles |
| `superadmin` | Super Admin | Dominio total, incluidos borrados y el panel de control |

`administrador` no aparece en el mapa de permisos: `hasPermission` le concede
todo por defecto.

## Estados compartidos

Mermas, inventarios y anuncios comparten vocabulario de `estado_tarea`:

| Estado | Significado |
|---|---|
| `en_curso` | Creado por INV, aún sin enviar |
| `pend_fact` | Esperando a Facturación |
| `pend_ca` | Esperando a Comercial (solo anuncios) |
| `en_auditoria` | Esperando al Auditor |
| `completado` | Cerrado |
| `devuelto` | Rechazado, vuelve a INV para corrección |
| `reconteo_solicitado` | FACT pide recontar físicamente (solo mermas) |

---

## Mermas (`/mermas`)

Registro de pérdida de mercancía.

```
INV ──► FACT ──► Auditor ──► Completado
 │        │         │
 │        │         └── Devuelto ──► INV
 │        └── Reconteo solicitado ──► INV
 │
 └── Clasificaciones "sin factura": INV ──► Auditor (se salta FACT)
```

La clasificación elegida decide la ruta: las de `CLASIF_MERMA_SIN_FACT` van
directo a auditoría. El formulario lo anuncia antes de registrar.

**Reglas de negocio**

- La cantidad no puede superar la existencia física del producto. Se valida en
  el cliente (`validateMerma`) **y** en la BD con un trigger que además suma las
  mermas pendientes del mismo producto, para que varias mermas parciales no
  superen el stock entre todas.
- Cantidad entera, positiva y hasta 100.000.
- Al llegar a `completado`, un trigger descuenta `productos.exist_fisica`.
- El auditor no puede aprobar hasta que los **destinos** asignados sumen
  exactamente la cantidad de la merma y la rebaja esté confirmada.

## Inventario (`/inventario`)

Conteos físicos contra la existencia de TKC.

```
INV cuenta ──► ¿diferencia?
                  │
                  ├── No ──► Completado directo
                  └── Sí ──► FACT ──► Auditor ──► Completado
```

El conteo se captura en **líneas de detalle** (fecha de vencimiento, lote,
cantidad), cuya suma es el conteo real. Si hay diferencia, el formulario exige
clasificarla y muestra una pantalla de confirmación explicando el flujo antes de
enviar.

Al completarse, un trigger ajusta `productos.exist_fisica` **sumando la
diferencia** (no sobrescribiendo el valor): un conteo auditado no debe pisar
movimientos ocurridos después.

## Vencimientos (`/lotes`)

Semáforo de caducidad por lote, leído de la vista `lotes_vigencia`:

| Estado | Días hasta vencer |
|---|---|
| `vencido` | ≤ 0 |
| `critico` | 1 a 15 |
| `por_vencer` | 16 a 30 |
| `vigente` | > 30 |
| `sin_fecha` | sin fecha de vencimiento |

Para lotes `critico` o `por_vencer`, INV o administrador pueden abrir el panel
de **Intervención Comercial** y proponer un precio rebajado, lo que crea una
fila en `lotes_ic`. El panel calcula el descuento, la recaudación estimada y la
pérdida si el lote terminara en merma.

Los lotes los escribe el sync; desde la aplicación son de solo lectura.

## Recepciones (`/recepciones`)

Entrada de mercancía de proveedor.

```
en_curso ──► ¿diferencias entre esperado y recibido?
                │
                ├── No ──► cerrada
                └── Sí ──► con_diferencias ──► Supervisor/Admin resuelve
```

Por cada ítem se registra cantidad esperada, recibida, lote, fecha de
vencimiento, **unidades con merma de origen** y calidad. Si la merma de origen
supera el **15 %** de lo recibido, la pantalla avisa y recomienda devolver el
ítem al proveedor; el ítem queda marcado con esa recomendación.

Las diferencias se clasifican al resolverlas: aceptada, reclamada al proveedor o
rechazo parcial.

## Anuncios (`/anuncios`)

Dos pestañas.

### Casos

El flujo de trabajo sobre `anuncios_desact`:

```
pendiente ──► INV decide
                │
                ├── reactivar / escalar a CA ──► pend_ca ──► CA ──► en_auditoria
                └── dar de baja / mantener ────────────────────────► en_auditoria
                                                                        │
                                                                        └──► completado
```

Cada tipo de caso explica en pantalla por qué el producto está ahí y qué se
espera de INV.

### Detección TKC

Para el rol **Especialista de Anuncios** (es su pestaña por defecto). Consulta
TKC en vivo y marca tres problemas:

| Problema | Criterio |
|---|---|
| **Muerto** | Tiene ID de tienda pero el reparto EF/A/T lo deja sin poder venderse |
| **Desactivado** | Desactivado en TKC |
| **Código marcado** | El código contiene alguno de los fragmentos que el especialista configuró |

La clasificación vive en `src/lib/anuncioEstado.js` y es la misma que usan
Catálogo y BD TKC, para que "MUERTO" signifique lo mismo en todas las pantallas.

Los fragmentos de código se definen en **Configuración → Códigos a marcar en
Anuncios** y se guardan en `usuarios.anuncio_config` (por usuario). La
comparación ignora mayúsculas y los fragmentos vacíos se descartan — sin ese
filtro marcarían todos los códigos.

Desde la lista, **Escalar** crea el caso en `anuncios_desact` en estado
`pendiente`, de donde lo recoge el flujo de arriba.

> La detección por estado clasifica **la página en pantalla**, no el almacén
> completo, porque TKC pagina del lado del servidor. Hay que recorrer las
> páginas para barrer todo.

## Catálogo y BD TKC (`/productos`, `/bd-tkc`)

La misma pantalla con distinto origen: la tabla `productos` sincronizada o TKC
en vivo. Incluye columnas configurables, búsqueda, importación masiva desde
archivo, escaneo de código de barras e historial de movimientos.

## Dashboard (`/`)

Panel general con indicadores de los módulos y alertas de vencimientos y stock.

## Supervisión (`/supervision`)

Para `jefe_depto` y administración: vista transversal de mermas, inventarios,
anuncios, recepciones y lotes IC, con comentarios por registro.

## Auditoría (`/auditoria`)

Consulta del rastro de `workflow_eventos`: quién movió qué y cuándo, con filtro
por fechas.

## Reportes (`/reportes`)

Informes por periodo con exportación a PDF (`GeneradorPDF`, cargado de forma
diferida) y a hoja de cálculo.

## Notificaciones (`/notificaciones`)

Bandeja completa del usuario, con el mismo contenido que el desplegable de la
cabecera. Cada notificación puede llevar un enlace directo al recurso que la
originó.

## Panel de control (`/superadmin`)

Exclusivo de `superadmin`. Herramientas de administración global por encima de
la pantalla de Usuarios.

## Configuración (`/configuracion`)

Preferencias de la cuenta:

- **Almacenes de trabajo**: limita lo que el usuario ve. Sin selección, ve todos.
- **Sincronización automática**: horarios y almacenes del sync, con su historial.
- **Códigos a marcar en Anuncios**: solo para `esp_anuncio` y administración.

Todo se guarda en la propia fila de `usuarios` (`almacenes_config`,
`sync_config`, `anuncio_config`).

## Usuarios (`/admin/usuarios`)

Aprobación de cuentas nuevas y asignación de rol y departamento. Un usuario
registrado no entra hasta que un administrador lo activa.

Un trigger impide la auto-escalación: nadie que no sea administrador puede
cambiar su propio rol o su estado activo, y solo un `superadmin` puede conceder
el rol `superadmin`.
