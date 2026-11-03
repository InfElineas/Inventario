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
| `jefe_depto` | Sigue el trabajo de su departamento |
| `administrador`, `superadmin` | Pasan por encima de todo |

Una persona puede tener **varios**, y lo que puede hacer es la suma. En el
código se comprueba siempre con `tieneRol(user, [...])`.

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

## Mermas (`/mermas`)

Lo que se perdió y por qué. El inventarista la registra; cuando se **baja de
tienda** —se descuenta en TKC— pasa a facturación.

El orden importa: mientras una merma siga contada en el piso de tienda, la
existencia dice que hay algo que no hay. Por eso solo llega a `pend_fact`
después de bajarla, no antes.

Se pueden bajar varias de golpe, marcándolas. Todas tienen que ser del mismo
almacén: cada envío a TKC va a uno solo.

## Inventario (`/inventario`)

Conteos contra la existencia de TKC. El inventarista cuenta, el sistema marca
la diferencia y, si la hay, va a facturación.

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
existencia, o con existencia y sin ID de tienda. Inventario los detecta,
comercial decide y auditoría cierra.

## Catálogo y BD TKC (`/productos`, `/bd-tkc`)

Dos vistas del mismo catálogo. La de TKC lee su existencia en vivo; la de
ELíneas, nuestra tabla `productos`. La búsqueda cubre todos los campos,
incluido el id de tienda.

Desde aquí se sube y se baja de tienda, se mira el historial del submayor y
los conteos que ha tenido el producto.

## Panel (`/`)

Lo primero es **qué te está esperando**: casos devueltos, lotes por vencer,
conteos sin enviar, lo que espera a facturación. Cada uno con su enlace. Lo
que está en cero no se pinta.

Debajo, las cifras del almacén y qué hay que comprar hoy.

## Las demás

| Pantalla | Para qué |
|---|---|
| `/supervision` | El jefe sigue el trabajo de su departamento |
| `/auditoria` | Historial de cambios en productos, con filtros y rango de fechas |
| `/reportes` | Resúmenes del periodo, con PDF |
| `/notificaciones` | Todos los avisos |
| `/superadmin` | Operabilidad, diagnóstico, sincronización, mantenimiento |
| `/configuracion` | Preferencias y almacenes visibles |
| `/admin/usuarios` | Altas y permisos |

## Facturación

Las mermas por facturar son la pantalla de Mermas con su filtro puesto
(`/facturacion/mermas`). Separarlas fue a petición: con todo junto, el
administrador no distinguía lo suyo de lo del otro departamento.

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

### Resumen de ventas (`/facturacion/ventas`)

Lo que vendió la plataforma en un almacén entre dos fechas, por producto y por
día, con unidades, órdenes, importe, costo y margen, y exportación a CSV. Es
lo primero que pidió Facturación para conciliar. Lo ven `fact`, `auditor`,
`jefe_depto` y los administradores.

- Sale del informe RDP de la base (`public.rdp_rows_latest`), **la vista de la
  última corrida de cada día**: la tabla guarda todas las corridas y sumarla
  cuenta cada día varias veces.
- Por defecto, los últimos 30 días **hasta ayer**: el informe se calcula una vez
  al día y hoy no está. El máximo es un año.
- Si el período tiene días sin datos, **lo avisa** antes de que alguien compare
  el total con otra cifra.
- **No son despachos de la flota ni ventas directas.** Eso queda pendiente de
  que Facturación diga qué cuenta como despacho. Ver
  [facturacion-hallazgos.md](facturacion-hallazgos.md).

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

