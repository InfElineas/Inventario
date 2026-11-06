# Módulos y flujos

## Roles

| Clave | Quién es |
|---|---|
| `inv` | Inventarista. Cuenta, registra mermas, recibe mercancía |
| `fact` | Facturación. Cuadra conteos y mermas contra la factura |
| `auditor` | Auditor. Aprueba o devuelve lo que ya pasó por facturación |
| `ca` | Comercial. Decide rebajas y reactivaciones |
| `esp_anuncio` | Especialista de anuncios |
| `supervisor` | Resuelve incidencias de recepción |
| `jefe_inventario`, `jefe_facturacion`, `jefe_ca` | Jefe de **ese** departamento: siguen su trabajo y lo comentan en Supervisión. El departamento va en el nombre del rol |
| `jefe_depto` | Lo que miran el menú y los permisos: **cualquier `jefe_*` lo incluye solo**. Un `jefe_depto` suelto, de antes, conserva el departamento puesto a mano |
| `administrador`, `superadmin` | Pasan por encima de todo |

Una persona puede tener **varios**, y lo que puede hacer es la suma. En el
código se comprueba siempre con `tieneRol(user, [...])`, y en el servidor con la
lista completa (`rolesDe`), **nunca con `usuario.role`**: ese es solo el de más
autoridad, y quien es jefe y además factura quedaba como jefe y no podía montar
un ajuste.

**El perfil se mantiene al día solo.** Roles, almacenes, nombre y avatar se releen en
segundo plano al volver a la pestaña y cada dos minutos, y al guardar el perfil o
Configuración. Un cambio hecho por un administrador, o por la propia persona en otra
pestaña, se ve sin recargar. Un fallo de red en ese refresco no cierra la sesión.

**Almacenes al entrar.** Quien no es jefe de departamento (ni administrador) y no
tiene ningún almacén configurado ve un diálogo que **no se puede cerrar** hasta
elegir **su almacén** (uno solo) y pulsar *Aceptar*. Ese pasa a ser el almacén que ve
en toda la aplicación; se guarda en su perfil y se cambia después en Configuración.

**Jefes de departamento.** El departamento forma parte del rol, y se asigna en el
Identity Server (sistema `inventario`): `jefe_facturacion` es jefe de
Facturación. Quien dirige dos departamentos tiene los dos roles; quien además
cuenta o factura, tiene también `inv` o `fact` —un rol operativo no hace jefe—.
En cada login la aplicación lee esos roles y guarda los departamentos
(`usuarios.departamentos`); de ahí salen los avisos al jefe, el selector de
Supervisión y a quién se le dirige un comentario. Para el cambio:

1. Ejecutar **antes de desplegar** `supabase/jefes_departamentos.sql`.
2. Crear en el IS los roles `jefe_inventario`, `jefe_facturacion` y `jefe_ca`, y
   asignarlos. Mientras tanto, los jefes de antes siguen funcionando con su
   departamento de siempre.
3. El cambio de rol surte efecto en el siguiente inicio de sesión.

## Estados compartidos

```
en_curso ──► pend_fact ──► en_auditoria ──► completado
   ▲             │               │
   └── devuelto ─┴───────────────┘
```

`devuelto` significa que lo rechazaron y vuelve a quien lo hizo. En mermas hay
además `reconteo_solicitado`.

Las **recepciones no usan este vocabulario**: Recibiendo, Conforme, Con
incidencia.

## La forma de las pantallas de listado

Las ocho se leen igual, y no por casualidad: la cabecera sale de un
componente.

```
Título
Subtítulo, una línea
[almacén] [filtros de icono] [columnas] [acción]
[buscador                                      ]
                                   24 de 186
contenido
```

En el teléfono, el contenido son fichas; de `sm` para arriba, una tabla. Las
dos caras salen de la misma descripción de columnas.

## Mermas (`/mermas` para inventario, pestaña de `/ajustes/disminucion` para facturación)

Las mermas son ajustes de disminución. **Inventario las registra y las sigue en
`/mermas`** (grupo INVENTARIO del menú, con su contador); **facturación las ajusta
en la pestaña Mermas** de Ajuste de disminución (`?tab=mermas`), que es donde
llegan los avisos. `/facturacion/mermas` redirige ahí. La ven `inv`, `auditor`,
`jefe_depto` y administradores en `/mermas`; `fact` en su pestaña.

**Historial de mermas.** `/mermas` tiene dos pestañas: **Mermas** (la bandeja de
trabajo) e **Historial**, con todas las del almacén en cualquier estado, filtros de
estado y fechas, y búsqueda por producto.

**Cada quien ve lo suyo.** Los conteos y las mermas los filtra el **servidor**
(`restringirLectura` en `src/server/permisos.js`), no la pantalla: quien no supervisa ni
factura —inventario, comercial…— recibe solo las filas que él registró y solo de los
almacenes que tiene configurados. Ven todo cada jefe de departamento, facturación,
auditoría y la administración. Con **una excepción acotada**: «quién
contó este producto hoy». Un inventarista puede ver, de los conteos de otros, solo
producto, quién lo contó y su estado —nada más— de un día cercano a hoy y de un
almacén suyo. Así *Por contar* dice «Contado por Fulana» y el formulario avisa «Ya
contado por Fulana» en vez de dejar contar dos veces.

**Clasificaciones.** Conteos, mermas y facturación usan **una sola lista**, la de
*Clasificación Ajuste TKC* (`CLASIFICACIONES` en `src/lib/constants.js`). Se guarda
tal cual está escrita, sin corregir acentos: es el texto que se busca. Las mermas con
clasificación de consumo interno (cuenta casa, higiene, fitosanitario, creación de
anuncio, veterinario, reclasificación) no pasan por facturación y van a auditoría
(`CLASIF_MERMA_SIN_FACT`, que conserva también los nombres antiguos para las mermas ya
guardadas). Un registro con una clasificación de antes sigue mostrándola en su
desplegable.

En esa pestaña, **Por ajustar** trae, bajo los conteos con faltante, el bloque
**Mermas esperando este ajuste**: las ya bajadas de tienda (`pend_fact`) del
almacén. Se eligen, se pasan al formulario y, con el documento confirmado, el
mismo «Enviar a auditoría» las da por procesadas (se escriben en `mermas`, no en
`inventarios`).

Lo que se perdió y por qué. El inventarista la registra; cuando se **baja de
tienda** —se descuenta en TKC— pasa a facturación.

El orden importa: mientras una merma siga contada en el piso de tienda, la
existencia dice que hay algo que no hay. Por eso solo llega a `pend_fact`
después de bajarla, no antes.

Se pueden bajar varias de golpe, marcándolas. Todas tienen que ser del mismo
almacén: cada envío a TKC va a uno solo.

## Inventario (`/inventario`)

Conteos contra la existencia de TKC. El inventarista cuenta, el sistema marca
la diferencia y, si la hay, va a facturación. Tres pestañas: **Por contar** (la de
por defecto), **Conteos** e **Historial** (los conteos propios de cada quien).

**Por contar** lista los productos del almacén y suministradores elegidos por
`prioridad_tienda` (1 es lo más urgente; ver `supabase/estado_tienda_columna.sql`).
*Contar* abre el formulario con ese producto; el contado hoy sale marcado. Los
suministradores se muestran y filtran **con su nombre exacto**: «SEL PUCARA» y
«PUCARA» son suministradores distintos y los llevan personas distintas.

Elegir de quién mirar el historial es de quien supervisa: está en **Supervisión →
Historial por usuario**.

**Importar el historial** (Configuración → *Importar mi historial*, para cualquier
usuario): carga las hojas *BD Ajuste I-F* y *BD Merma* del Excel en un plazo
(desde/hasta). Las filas se guardan **a nombre de quien importa y con el almacén de
cada fila** —las listas buscan por ambos— y lo que ya estaba no se duplica.

**Productos sin ID de tienda.** Los insumos y otros productos sin `id_tienda` también
tienen existencia y movimiento en el submayor, así que **se pueden contar y se les
consulta el historial**: el submayor se busca por su **código** cuando no hay ID.
Por código solo se acepta una fila —se prefiere la que no tiene ID—; si el código
sale en varias, no se adivina cuál es y el conteo se bloquea («el submayor no lo
encuentra»). Siguen sin entrar en Reabastecimiento (la rotación de venta se cruza
por ID).

Un conteo sin enviar solo lo ve quien lo hizo. La pantalla avisa de cuántos
tienes a medias.

Cuando hay varios conteos del mismo producto, solo cuenta el último: los
anteriores quedan ocultos con un aviso.

El **buscador de productos** de los formularios (nuevo conteo, merma, recepción)
pone **primero los que tienen existencia** y detrás el resto: pide por separado
lo que tiene y todo, y los junta. Antes ordenaba solo por nombre y con quince
resultados una búsqueda como «café» se llenaba de productos en cero. Busca también
por marca, ID de tienda y código PYME, y enseña A y T como el catálogo. Los
productos sin existencia siguen saliendo, atenuados: contar uno en cero es legítimo.

### Análisis automático de la diferencia

Al registrar un conteo con diferencia, y al abrir su detalle, el sistema
recomienda qué hacer con ella y cuántas unidades. El conteo se compara con la
**existencia física** (EF = A + T), no con el almacén. **A** (almacén) es la
**reserva**: lo que no está a la venta, por si una unidad sufre algún cambio y
hay que reponerla. **T** (tienda) es lo que está a la venta.

Mover entre A y T no cambia EF, así que no arregla una diferencia: la arregla un
**ajuste** (disminución si falta, aumento si sobra), y el ajuste opera sobre la
reserva. De ahí sale cuándo conviene mover, con la A y la T de TKC ahora mismo:

| Contó | Recomienda |
|---|---|
| **Menos** que EF, y A cubre lo que falta | Nada que mover: ajuste de disminución, que sale de la reserva |
| **Menos** que EF, y A no alcanza | **Bajar** de tienda lo que falta por cubrir (sin pasar de T) y luego ajustar |
| **Más** que EF | Ajuste de aumento, que entra en la reserva. Si T está en cero, **subir** a tienda como *posibilidad*, si debe venderse |
| **Igual** | Nada |

El diálogo de subir o bajar de tienda abre con esa cantidad. El código está en
`src/lib/analisisConteo.js`.

### Cerrar despachos de TKC

Botón **Cerrar despachos** en la cabecera (inventario, jefe de inventario,
administrador). Sustituye al flujo n8n «10 – CIERRE DESPACHOS TKC», pero con las
credenciales de TKC **de quien lo pulsa** y el almacén que elija.

1. Se elige el almacén y **Revisar pendientes** lee de TKC qué se cerraría (no toca nada).
2. Solo entonces aparecen *Cerrar solo el más antiguo* y *Cerrar los N pendientes*,
   con confirmación que dice cuántos y de qué almacén. Cambiar de almacén invalida la revisión.
3. El cierre corre en el servidor (`src/server/cierreDespachos.js`) y la ventana
   muestra el avance; se puede parar entre un despacho y el siguiente.

Barreras: solo despachos activos hasta **ayer**; en cola del más antiguo al más
nuevo, de uno en uno (TKC solo da el formulario al primero); los incompletos
(«Productos a despachar x/y») se omiten y se dice por qué; un despacho fallido no
se reintenta en la pasada; 3 fallos seguidos o un cambio en la página de TKC
detienen el cierre; un cierre a la vez por almacén; máximo 200. Cada cierre
queda en `historial_movimientos` (`cierre_despachos`).

**Proveedor:** sale del almacén elegido en el filtro de la página: su id interno de
TKC (789 → 351), sin configurar nada. Solo si un almacén tiene otro proveedor, se
corrige en `DESPACHOS_PROVEEDORES={"789":"1508"}` del `.env`. El diálogo no trae
selector: trabaja con el almacén del filtro.

**Sin verificar:** el HTML de TKC se dedujo de las expresiones del workflow n8n (no
hay capturas reales) y no se sabe si las cuentas personales ven
`/admin/shop-provider-dispatch/` (si no, el servidor responde `tkc_sin_acceso`).
La primera vez, usar «solo el más antiguo». n8n puede seguir como red de seguridad nocturna.

## Vencimientos (`/lotes`)

Los lotes salen del informe central (`lot_rows`), no de una tabla nuestra. De
cada almacén se lee **la corrida más reciente que lo trae**, no la última a
secas: un día la última corrida del cron salió con 15 000 filas en vez de 47 000
y sin el almacén 789, y la pantalla se quedó en cero. Si el informe de hoy no
trae un almacén, se enseña el anterior y **un aviso dice de qué día es**. **Solo los que tienen existencia**: un lote en cero no es una tarea.

| Estado | Cuándo |
|---|---|
| Vencido | ya pasó la fecha |
| Crítico | vence en 15 días o menos |
| Por vencer | entre 16 y 30 |
| Vigente | más de 30 |
| Sin fecha | el informe no la trae |

> Los cortes de 15 y 30 días vienen heredados de la vista anterior y **nadie
> del negocio los ha validado**.

Cada fila lleva el menú ⋯ de siempre (el mismo de inventario y mermas): bajar de
tienda, las acciones propias del estado, historial del submayor y conteos.

Qué se puede hacer con cada uno:

- **Crítico o vencido** → **bajarlo de tienda**, la primera opción del menú:
  abre el diálogo de bajar con la cantidad del lote, sin pasar de lo que hay
  en tienda. Es de quien puede mover mercancía (`ROLES_TIENDA`).
- **Vencido con existencia** → mandarlo a merma, con su clasificación.
- **Crítico o por vencer** → intervención comercial: proponer una rebaja.
- **Cualquiera** → poner o corregir la fecha del envase. Esa fecha no se puede
  escribir en el informe, así que se guarda en `lote_revisiones` y se
  superpone al leer. También se rellena al registrar un conteo con fecha de
  vencimiento.

**Por vencer** tiene alerta y reporte: un aviso en la pantalla con cuántos
lotes, unidades y valor a costo, y cuándo vence el primero; y una notificación
diaria (`runSmartNotifications`). El botón *Exportar* baja a CSV los lotes que
se están viendo —en la pestaña *Por vencer*, ese es el reporte—, con costo y
valor en riesgo.

## Casos de IC (`/ic`)

Lo que inventario manda desde Vencimientos con *Enviar a intervención comercial*
llega aquí: un lote por vencer, la cantidad y una propuesta de rebaja. Se
guarda en `lotes_ic` y comercial (`ca`, y los administradores) lo responde:

| Estado | Qué significa |
|---|---|
| Pendiente | Esperando a comercial |
| Rebaja aprobada | Comercial aprobó la rebaja (con nota opcional) |
| No procede | Comercial lo rechazó; la nota es obligatoria |

- El inventarista ve **solo lo que mandó**; comercial, jefe de departamento,
  auditor y administradores ven todo.
- Al mandar, se avisa a comercial; al responder, a quien lo mandó. Comercial ve
  en el menú cuántos hay pendientes.
- Quien lo mandó puede retirarlo mientras esté pendiente; el superadministrador,
  siempre.
- *Exportar* baja a CSV los casos que cumplen los filtros, con la respuesta.
- Un caso respondido ya no se vuelve a mover.

Antes el caso se guardaba y solo lo veía un jefe en Supervisión, que sigue
mostrándolo en su pestaña *Lotes IC*.

## Recepciones (`/recepciones`)

Dos pestañas. Se abre en **Pedidos de compra**, porque descargar un camión
empieza por saber de qué pedido viene.

Al pulsar *Recibir*, la recepción nace con las líneas del pedido ya puestas y
las cantidades en blanco. **No se ve lo que se pidió**: con el número delante,
contar deja de ser contar y pasa a ser comprobar que cuadra, y lo que queda
registrado es el pedido y no la caja.

De cada línea se confirma lo que se tiene en la mano: cantidad, gramaje,
unidades por caja, vencimiento, merma de origen y una **foto de la
presentación**, que se toma con la cámara y no se elige del carrete. Si el
producto no está en el catálogo se marca «Nuevo · sin anuncio en TKC» y el
código completo pasa a ser obligatorio.

Al cerrar con problemas se genera el **reporte de incidencia** —faltantes,
sobrantes, merma de origen, calidad, productos nuevos— y se avisa al jefe de
inventario, al de facturación y al rol `fact`, con enlace directo.

Resolver una incidencia incluye decidir qué se factura de verdad de cada
línea, dejar nota —obligatoria— y, si lo que falla es el conteo, **mandar a
recontar**: las líneas vuelven al muelle sin contar y lo contado antes se
borra a propósito.

## Reabastecimiento (`/reabastecimiento`)

Qué comprar, por los días que aguanta cada producto al ritmo al que se vende.

El índice es `promMayor0`: ventas diarias contando **solo los días en que hubo
venta**. Un día sin existencia vende cero, y meterlo en el promedio hace
parecer que el producto se pide menos de lo que se pide. Lo que lleve más de
noventa días sin venderse no entra.

Tiene un sesgo conocido: un día en que el producto estaba disponible y nadie
lo compró también queda fuera, así que el ritmo sale algo alto y el mínimo,
algo generoso. Es el lado correcto por el que equivocarse.

## Anuncios (`/anuncios`)

Productos con problema de anuncio en TKC: muertos o desactivados con
existencia, o con existencia y sin ID de tienda. Está en el grupo
**Facturación**, porque la revisión es de **facturación**: revisa el caso y decide
—reactivarlo, darlo de baja, mantenerlo— o lo **envía a Anuncios** (comercial,
`ca`), que actúa después; auditoría cierra. El flujo es FACT → CA (si se envía) →
Auditor → Completado. Inventario ya no interviene.

Los campos guardados conservan sus nombres de antes (`accion_inv`, `nota_inv`,
`especialista_inv_*`): solo cambió quién los escribe y cómo se llaman en
pantalla. Facturación recibe además un aviso diario con los anuncios que esperan
su revisión, y su jefe los ve en la pestaña Anuncios de Supervisión.

## Catálogo y BD TKC (`/productos`, `/bd-tkc`)

Dos vistas del mismo catálogo. La de TKC lee su existencia en vivo; la de
ELíneas, nuestra tabla `productos`. La búsqueda cubre todos los campos,
incluido el id de tienda.

Desde aquí se sube y se baja de tienda, se mira el historial del submayor y
los conteos que ha tenido el producto.

Se puede llegar con el filtro puesto: `/productos?estadoTienda=SIN RESERVA` (los
siete estados) y `?existencia=todos|existencia|no-existencia`. Con un estado, la
existencia se pone en «todos»: AGOTADO y SIN ID no tienen existencia y el filtro
por defecto (con existencia) los dejaba vacíos. El panel enlaza así.

## Panel (`/`)

Saluda por la hora y por el nombre, y con un almacén elegido se lee de arriba
abajo:

1. **Cuatro cifras urgentes**: sin reserva y no en tienda llevan **al catálogo con
   ese estado filtrado**; *por facturar* abre un **diálogo con una tabla por caso**
   (aumento, disminución, procesamientos, mermas, auditoría) y de ahí se va a cada
   pantalla; lotes críticos va a Vencimientos. Cada fila de **Estado de Tienda**
   lleva también al catálogo con su estado.
2. **Ventas por mes** (barras, los últimos doce, con el mes en curso resaltado)
   junto al estado de la tienda. Sale de `/api/ventas/mensual`, que suma
   `rdp_rows_latest` por mes: la misma vista y la misma salvedad que el resumen de
   ventas (el día en curso no está, y el mes en curso va a medias). Si un rol
   no tuviera permiso de ver ventas, no vería la tarjeta, y el estado de la tienda ocupa todo el ancho.
3. **Tres tarjetas de tareas**: vencimientos, lo que **espera a facturación**
   (repartido por la pantalla que lo resuelve: aumento, disminución,
   procesamientos, mermas, auditoría) y **lo que te devolvieron**, con su motivo.
   Lo que está en cero no se pinta.
4. El resto del catálogo, **Se acaban primero** y lo último de inventarios y
   mermas. *Se acaban primero* no lista agotados (ya se acabaron): primero las
   **últimas piezas** y luego lo de menos cobertura, con anuncio activado. Se dice
   en palabras («Se acaba hoy», «Alcanza para 4 días», «se vende unas 3 por
   semana»), no en décimas de día.

Sin almacén elegido se ve la vista global de siempre. Falta el gráfico de
existencia por almacén, que necesita la fotografía diaria (`existencia_diaria`) y
solo cubre desde que se activó.

## Novedades y aviso de versión nueva

Tres piezas, todas alimentadas por **`src/data/releases.js`**:

- **Aviso de versión nueva.** Cada compilación lleva un identificador (`__BUILD_ID__`)
  y publica `/version.json` con él y con la última novedad. Una pestaña abierta lo
  consulta al volver a ella y cada cinco minutos; si el servidor tiene otra
  compilación, sale un diálogo con lo que cambia y un botón **Actualizar ahora**.
  *Más tarde* lo cierra sin recargar (a mitad de un conteo se perdería lo escrito) y no
  insiste con la misma versión. En desarrollo no avisa. El servidor sirve `version.json`
  sin caché.
- **Diálogo de novedades.** La primera vez que alguien abre la web con una entrada que
  no ha visto, sale una vez («Entendido»); se recuerda en ese navegador.
- **Sección Novedades** (`/novedades`, en Configuración): todo el histórico, lo último
  arriba.

**Cómo publicar una novedad.** Con cada cambio que afecte a lo que la gente hace o ve
(función nueva, flujo distinto, pantalla cambiada, arreglo que se nota), añadir una
entrada **arriba** de `RELEASES`: `version` única, `fecha`, `titulo` y `cambios`
(`nuevo`, `mejora` o `arreglo`), escritos para quien usa la web. Refactors, pruebas y
documentación no llevan entrada. Una prueba comprueba el formato y el orden.

## Las demás

| Pantalla | Para qué |
|---|---|
| `/supervision` | El jefe sigue el trabajo de su departamento y comenta los registros (ver abajo) |
| `/auditoria` | Historial de cambios en productos, con filtros y rango de fechas |
| `/reportes` | Resúmenes del periodo, con PDF |
| `/notificaciones` | Todos los avisos |
| `/superadmin` | Operabilidad, diagnóstico, sincronización, mantenimiento |
| `/configuracion` | Preferencias y almacenes visibles |
| `/admin/usuarios` | Altas y permisos |

### Supervisión: comentarios con destinatario

Un jefe o un administrador abre un registro —conteo, merma, recepción, anuncio,
caso de IC— y lo comenta **para un departamento**: Inventario, Facturación,
Creación de Anuncio o Auditoría. El selector **Para** es obligatorio: sin
destinatario no se envía, porque un comentario que no es para nadie no le llega a
nadie.

- **Aviso.** Al enviarlo, los roles del departamento y su jefe reciben una
  notificación («Fulana comentó un conteo para Facturación», con el producto y el
  texto) que lleva a la pantalla del registro. No se avisa al autor. Que falle el
  aviso no deshace el comentario.
- **Dentro del registro.** El detalle del conteo, la merma, la recepción, el
  anuncio o el caso de IC enseña un bloque **Comentarios de supervisión** con lo
  que se le dijo a quien lo abre: lo dirigido a su departamento y lo que escribió.
  Quien supervisa (jefes, administradores) los ve todos. Si no hay nada para esa
  persona, no sale el bloque.
- Los comentarios anteriores a esto no tienen destinatario (`para_depto` vacío):
  los ven solo quienes supervisan, y salen marcados como «sin destinatario».
- Requiere la migración `supabase/comentarios_para.sql` (columna `para_depto`).

**Historial por usuario** es una pestaña de Supervisión (departamento de Inventario):
quien supervisa elige de quién ver los conteos hechos, con almacén, estado y fechas.
Sigue el orden de la web: tarjetas, pestañas, filtros, lista.

El grupo **ANÁLISIS** del menú es de auditoría (Reportes y Auditoría) y de los
administradores. Supervisión, que es de los jefes de departamento, sale de él y
está junto a Catálogo y Resumen de ventas.

## Poka-yoke: el sistema no deja pasar el error

Como la tarjeta SIM con la esquina cortada, que solo entra de una manera: en vez
de confiar en que nadie se equivoque, el proceso está hecho para que el error no
pase. El análisis de subir y bajar de tienda fue el primero; estas son las demás
barreras, todas **bloquean** (no avisan) y todas dicen por qué:

| Dónde | Qué impide | Cómo |
|---|---|---|
| **Conteo** | Un dedazo en la cifra (1500 contra 107: un cero de más) | Si la cifra es cinco veces más (o la quinta parte) que la existencia de TKC y la diferencia pasa de 20 unidades, **no se puede confirmar** hasta repetirla a mano. Sin existencia en TKC, desde 50 unidades. Contar cero no se frena: es un faltante legítimo |
| **Ajuste de disminución** | Restar más de lo que hay | Antes de montar se comprueba cada línea contra A, T y EF de TKC. Si pide más que la reserva (A), dice **cuánto bajar de tienda antes**; si pide más que lo que hay en total, no alcanza. **Montar se queda apagado** hasta una comprobación limpia, y cambiar una línea la invalida |
| **Transferencia** | Mandar lo que el origen no tiene | La misma comprobación contra la existencia total del origen |
| **Conteos por facturar** | Resolver un sobrante con una disminución, o un faltante con un aumento | Un aumento solo da por procesados sobrantes y una disminución (o transferencia) solo faltantes. En el servicio también, que es lo último antes de escribir. El detalle antiguo de facturación ya no deja enviar con el estado contrario |

Las líneas que no se pueden comprobar —TKC no responde, el producto no tiene
anuncio— **no bloquean**: la API de transferencias las rechazará si no valen, y
que falle una consulta no es motivo para impedir un ajuste. Se comprueban hasta
100 líneas (cada una es una consulta a TKC, de cuatro en cuatro).

## Facturación

Las mermas por facturar están en la pestaña **Mermas** de Ajuste de disminución.

Los ajustes de aumento y disminución, los procesamientos y las transferencias
viven en `/ajustes/*`, `/procesamientos` y `/transferencias`, y hablan con
elineas-transferencia.

**«Conteos por facturar» ya no existe** (`/facturacion/inventario` redirige a
Ajuste de disminución): todo lo que hacía se hace en esas pantallas, como sigue.

### Conteos con diferencia: se resuelven en las pantallas de ajustes

«Conteos por facturar» daba buena información pero no era operativa: facturación
hacía el ajuste en TKC en otra pantalla y volvía a teclear el número del
documento en cada conteo. Ahora cada conteo con diferencia se resuelve donde se
hace el trabajo:

| El conteo es… | Se resuelve en | Con |
|---|---|---|
| Un **sobrante** | Ajuste de aumento | Un ajuste de aumento por la cantidad medida |
| Un **faltante** | Ajuste de disminución | Un ajuste de disminución |
| Un **intercambio** (un producto vendido por otro: uno falta y el otro sobra) | Procesamientos | Un procesamiento `ORIGEN>DESTINO`: el origen es el que **falta**, el destino el que **sobra** |
| Un **faltante clasificado como transferencia** («Transferencia a Latino no registrada»…): salió hacia otro almacén sin documento | Transferencias | Una transferencia desde el almacén del conteo hacia el destino que se elija |

En cada pantalla, la pestaña *Por ajustar* / *Por procesar* / *Por transferir* enseña los conteos
con lo que hace falta para decidir (existencia al contar, clasificación, nota de
quien contó, existencia ahora), se eligen cuáles y se pasan al formulario. Lo que
no procede se **devuelve a inventario con su motivo** (los dos conteos de un
intercambio, juntos). Cuando el documento se confirma —o el procesamiento sale
bien—, un botón **da por procesados los conteos**: cada uno guarda el documento
que lo resolvió, cómo, quién y cuándo, y pasa a auditoría.

- Solo entran los conteos que TKC **aceptó** en el documento; los rechazados se
  quedan pendientes y se dice.
- De cada producto solo cuenta el conteo **más reciente**; los anteriores se
  cierran sin ajuste.
- Un reintento no vuelve a procesar los conteos que ya se hicieron.
- El contador del menú de cada ajuste son los conteos que esperan en él.
- **Los procesamientos de intercambio no se han probado contra la API real.**
  Se envía `ORIGEN>DESTINO*CANTIDAD` como documenta su colección; conviene
  empezar con un solo par y comprobar el resultado en TKC.

El **historial de TKC** de los ajustes tiene fechas, estado, búsqueda, páginas y
exportación a CSV. En disminuciones se puede ver el tipo de salida: ajustes,
**ventas directas** (con su cliente, solo lectura) o todas.

### Transferencias (`/transferencias`)

Mover productos de un almacén a otro, con la API de elineas-transferencia
(`/api/v1/transfers`). El almacén de arriba es el **origen**; el destino se elige
al montar. Dos pasos separados, como los ajustes: **Montar** crea el documento en
TKC como borrador («editada») y no mueve nada; **Confirmar** —con su propio
diálogo— lo pasa a «en tránsito»; un borrador también se puede **cancelar**. Las
líneas son `CODIGO*CANTIDAD`.

El **historial de TKC** muestra las transferencias que salen del almacén o las
que le llegan, con fechas, estado, búsqueda, páginas, exportación a CSV y los
productos de cada documento. Cada escritura sale con la cuenta de TKC de quien la
hace y con clave de idempotencia; si se corta, se dice que no se sabe si llegó y
se bloquea reintentar hasta revisarlo en TKC.

- **Sin probar contra la API real.** La respuesta del listado no está documentada
  campo a campo: la pantalla muestra `code`, `date`, `status` y el origen y destino
  con los nombres habituales (`originName`/`origin`, `destinationName`/`destination`).
  Si TKC los llama de otra manera, salen vacíos y hay que ajustar
  `origenDe`/`destinoDe` en `src/lib/transferencias.js`.
- Queda fuera «Transferir códigos» (`/code-transfer`), que da de alta códigos en
  otro almacén sin mover existencia, y el lote de hasta 20 transferencias
  (`/transfers/batch`).

### Procesamientos: por procesar e historial

Las dos listas usan lo que la API ya hace por ellas, en vez de traerlo todo y
filtrar aquí:

- **Por procesar** (`GET /process/candidates`): los `NoMT…` con existencia del
  almacén y, de cada uno, el producto al que pasarían, con su precio y su
  existencia. Se filtra por estado en la API —*Procesables*, *Sin destino*,
  *Varios destinos posibles*, *Precio distinto*, *Destino inactivo*, *Unidad
  distinta*—, se busca por código o nombre y va por páginas de 50 con el total.
  «Pasar los procesables al formulario» los pide con `status=ready`, así que
  entran todos y no solo los de la página que se ve (hasta 500).
- **Historial** (`GET /process/documents`): los 100 más recientes del almacén
  (`recent=100`), con filtro por estado (*Procesada*, *A medias*, *Cancelada*),
  búsqueda y páginas. **Antes no cargaba**: sin `recent`, TKC devuelve *todos* los
  documentos de un almacén —hasta unos mil— y la lectura pasaba del minuto. El
  servidor ahora pone `recent=100` si el cliente no lo pide, y un fallo se ve en
  pantalla en vez de dejar la lista vacía.

La API recuerda los candidatos 10 minutos y los documentos 2; el botón de
actualizar se salta esa memoria.

### Columna de acciones en facturación

Las listas por producto de facturación tienen el mismo menú **⋯** que Inventario:
los conteos de *Por ajustar* (aumento, disminución) y *Por transferir*, los
intercambios y los candidatos de Procesamientos, las mermas por facturar y los
productos del Resumen de ventas. Trae, además del historial del submayor y los conteos de inventario:

- **Ver detalle del conteo**: el conteo y la existencia de ahora, y desde ahí
  **montar el ajuste, la transferencia o el procesamiento con ese producto** o
  **devolverlo a inventario**.
- **Analizar diferencia**: de dónde viene un faltante o un sobrante.

El menú es corto a propósito: facturación solo retira, así que no ofrece subir ni
bajar de tienda ni los precios.

**Analizar diferencia** lee el submayor de TKC, que guarda cada movimiento del
producto con su documento (`Salida - Despacho - …`, `Entrada - Ajuste Aumento - …`,
`Salida - Transferencia Salida - …`) y su usuario, y lo ordena en cuatro pestañas:

| Pestaña | Qué dice |
|---|---|
| Desde el conteo | Los movimientos posteriores al conteo, y si la existencia ya cambió desde entonces: la diferencia sería de aquel día |
| Origen | Entradas y salidas del período por tipo de documento y por usuario |
| Ventas directas y ajustes | Solo esos documentos |
| Ventas vs despachos | Lo que vendió la plataforma (`rdp_rows`) contra las salidas «Despacho» del submayor |

El tipo se saca **del texto del documento** (`src/lib/movimientosSubmayor.js`). Lo
que no se reconoce sale como «Otros» con su texto a la vista, y subir o bajar de
tienda se muestra aparte: solo reparte la existencia entre almacén y tienda, así
que no explica ninguna diferencia. «Despacho» es venta. El período es el último
mes (o desde una semana antes del conteo, si es más viejo) y se puede cambiar.

- Cada apertura hace una petición al submayor de TKC y otra a nuestras ventas.
- Los textos de documento que aún no se han visto (ajuste de disminución, venta
  directa, procesamiento, recepción) se reconocen por palabras clave y **no se han
  comprobado contra TKC**: si alguno sale en «Otros», hay que añadir su regla.

### Resumen de ventas (`/ventas`)

Lo que vendió la plataforma en un almacén entre dos fechas, por producto y por
día, con unidades, órdenes, importe, costo y margen, y exportación a CSV. Es
lo primero que pidió Facturación para conciliar, y ahora es de **acceso general**:
está en el menú junto a PC General y Catálogo y lo ven todos los roles. El enlace
viejo `/facturacion/ventas` redirige aquí.

- Sale del informe RDP de la base (`public.rdp_rows_latest`), **la vista de la
  última corrida de cada día**: la tabla guarda todas las corridas y sumarla
  cuenta cada día varias veces.
- Por defecto, los últimos 30 días **hasta ayer**: el informe se calcula una vez
  al día y hoy no está. El máximo es un año.
- Si el período tiene días sin datos, **lo avisa** antes de que alguien compare
  el total con otra cifra.
- Dos pestañas que no se mezclan: **Plataforma** (de un almacén) y **Ventas
  directas** (de todos). «Despacho» es venta: la flota queda fuera.

**Por día.** Cada día se abre y enseña **los productos que lo componen**, pedidos
solo al abrirlo (`/api/ventas/dia`): «el día 5 se vendieron 6.500 unidades» no
dice nada hasta saber de qué. Un selector de producto —con buscador por código o
nombre, entre los que vendieron en el período— deja solo **los días en que se
vendió ese producto**, con sus totales; pulsar un producto dentro de un día hace
lo mismo.

**Ventas directas** (`public.rdp_vd_rows_latest`, también la última corrida de cada
día). Hay cosas que esa tabla no tiene, y la pantalla lo dice:

- **No dice de qué almacén es cada venta**, así que se cuentan todas y el selector
  de almacén no aplica.
- **No trae costo**: no hay margen, y el importe es cantidad por precio final.
  Una «orden» es una factura.
- **Tiene un hueco** del 21 de julio al 24 de septiembre de 2026 (la tabla
  histórica `RDP_VD`, anterior, no se lee todavía).

Los nombres de producto salen de una subconsulta agrupada por código: unir el
catálogo directamente repetía la fila de cada producto con más de un anuncio y
las sumas salían infladas.

### Ver todos los precios de un producto

El menú de acciones de la fila —en catálogo, inventario, mermas y
vencimientos— tiene **Ver todos los precios**. El catálogo enseña un solo
precio, el que TKC guarda como precio (`precio_costo`); un producto tiene más,
cada uno en una tabla distinta. El diálogo los junta, uno por fuente, cada una
con su nota de dónde sale:

- **Catálogo:** `precio_costo`, y el precio propio de la aplicación si lo tiene.
- **Lista de precios (VD):** `costo`, `venta`, `directa` y `precio_tienda` de
  `vd_rows_latest`. Los nombres son los de las columnas: no se ha confirmado
  con Facturación qué significa cada una.

Cada fuente falla por separado. **Falta el precio de proveedor**: no se sabe
en qué tabla está; la consulta `supabase/diagnostico_precios.sql` lo busca.

### Fotografía diaria de la existencia

La base solo guarda una semana del submayor, y sin la existencia de hace un mes
no se puede conciliar un período largo. `inventario.existencia_diaria` guarda
**una fotografía por día** (la primera del día), solo de lo que no está a cero.
La toma el servidor tras cada sincronización del catálogo; no recupera el
pasado, solo cubre desde que se ejecuta.

