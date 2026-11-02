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

## Vencimientos (`/lotes`)

Los lotes salen del informe central (`lot_rows_latest`), no de una tabla
nuestra. **Solo los que tienen existencia**: un lote en cero no es una tarea.

| Estado | Cuándo |
|---|---|
| Vencido | ya pasó la fecha |
| Crítico | vence en 15 días o menos |
| Por vencer | entre 16 y 30 |
| Vigente | más de 30 |
| Sin fecha | el informe no la trae |

> Los cortes de 15 y 30 días vienen heredados de la vista anterior y **nadie
> del negocio los ha validado**.

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

Las mismas pantallas de Inventario y Mermas, abiertas con su filtro puesto:
`/facturacion/inventario` y `/facturacion/mermas`. Separarlas fue a petición:
con todo junto, el administrador no distinguía lo suyo de lo del otro
departamento.

Los ajustes de aumento y disminución y los procesamientos viven en
`/ajustes/*` y `/procesamientos`, y hablan con elineas-transferencia.
