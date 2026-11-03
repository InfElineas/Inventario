# Mejoras del módulo de Facturación

Sale de la reunión con Janet, jefa de Facturación. Objetivo: consultar,
analizar y conciliar los movimientos de inventario desde la misma plataforma.

Este documento convierte el reporte en tareas ordenadas. **Nada está
implementado**; es el plan para evaluar y priorizar, que era el siguiente paso
que pedía el reporte.

## Lo que ya hay y lo que no

| Necesidad | Qué existe hoy |
|---|---|
| Ajustes de aumento y disminución | `/ajustes/aumento` y `/ajustes/disminucion`: listado, líneas del documento, montar y confirmar. Hablan con elineas-transferencia (`/api/ajustes/*`) |
| Movimiento por producto | «Historial del submayor»: entradas y salidas con documento, saldo y usuario. Sale de TKC, **por producto y de uno en uno**, leyendo HTML |
| Salidas por merma | Nuestra tabla `mermas` |
| Subir y bajar de tienda | `/api/tienda/*` de elineas-transferencia |
| Informes agregados | `elineas-api` (`/api/reports/*`): hoy solo se usa la rotación de venta; los lotes salen de su vista en nuestra base |
| Transferencias entre almacenes, ventas directas (VD), despachos, observaciones de los documentos TKC | **Nada.** No hay pantalla, ni servicio, ni consulta |

Lo que decide casi todo: **de dónde salen esos datos.** No sabemos todavía si
elineas-transferencia, elineas-api o TKC los exponen, ni con qué campos. De
eso depende el tamaño de cada tarea, así que va primero.

## Tareas

Cada una: qué, de qué depende y cuándo está hecha.

### Fase 0 — Descubrir (bloquea el resto)

**F0. Mapa de fuentes de datos.** Para cada necesidad del reporte, averiguar
dónde está el dato, con qué campos y con qué límite de peticiones.

- Transferencias: ¿listado y detalle en elineas-transferencia, en
  elineas-api o solo en TKC?
- Observaciones de los documentos A/D y VD: ¿vienen en la respuesta de
  `/api/v1/adjustments` y `/decreases`, o hay que leerlas del documento en TKC?
- VD y despachos: ¿informe de elineas-api, listado de TKC, o salen del
  submayor?
- Hecho cuando hay una tabla fuente → endpoint → campos para cada punto, y se
  sabe cuáles obligan a leer HTML de TKC (frágil, lento, una petición por
  documento).
- Depende de: acceso a la documentación o a un ejemplo de respuesta de cada API.
- **Estado: a medias.** Lo que se puede saber leyendo el código está en
  [facturacion-fuentes.md](facturacion-fuentes.md), junto con cuatro preguntas
  que solo se contestan mirando el servidor (con el comando para cada una).
  Falta que se ejecuten.

### Fase 1 — Sobre lo que ya existe

**F1. Observaciones TKC en los ajustes A/D** *(punto 2)*. Enseñar la nota y la
justificación de cada documento de aumento o disminución en el listado y en el
detalle de líneas.

- Hecho cuando cada documento muestra su observación y se puede buscar por
  ella.
- Depende de: F0 (¿viene en la API?).

**F2. Trazabilidad de un ajuste** *(punto 3)*. Desde un ajuste, ver lo que lo
rodea: transferencias y procesos relacionados, el movimiento del submayor, y
nuestras notas e investigaciones del conteo que lo originó.

- Hecho cuando, abriendo un ajuste, se llega al conteo o la merma de origen y
  a los documentos vinculados, sin salir de la pantalla.
- Depende de: F0, F4 (transferencias).
- Ojo: «notas, investigaciones y resultados del análisis» ya están en nuestros
  conteos (`notas_inv`, `fact_notas`, clasificación). Falta **enlazarlos** con
  el documento TKC del ajuste: hoy no hay un campo que los una.

### Fase 2 — Pantallas nuevas

**F3. Resumen de despachos por período** *(punto 4)*. Cantidades despachadas o
vendidas entre dos fechas, por almacén, con desglose por producto.

- Hecho cuando se elige un rango y un almacén, sale el total y el detalle, y
  se exporta a CSV.
- Depende de: F0.

**F4. Transferencias** *(punto 1)*. Listado de movimientos entre almacenes y
establecimientos, con filtros por fecha, almacén de origen y destino, y detalle
de líneas.

- Hecho cuando se consulta una transferencia y sus productos y cantidades.
- Depende de: F0.

**F5. Reporte de ventas directas (VD)** *(punto 5)*. Listado y análisis de las
VD, con su observación.

- Hecho cuando hay listado por período y almacén, con observación y
  exportación.
- Depende de: F0, y de F1 para reutilizar el componente de observaciones.

### Fase 3 — Conciliación

**F6. Botón ANÁLISIS** *(punto 6)*. Sumar las salidas por concepto —VD,
mermas, transferencias y despachos— en un período, compararlas con entradas y
existencias, y marcar las diferencias.

- Hecho cuando, para un producto o un almacén y un período, sale:
  existencia inicial + entradas − salidas por concepto = existencia esperada,
  contra la real, con la diferencia y de dónde viene.
- Depende de: F3, F4, F5. No se puede hacer antes: suma lo que esas tareas
  traen.
- **Decisión previa: cómo se evitan las duplicidades.** El reporte lo pide y
  hay un riesgo real: una merma bajada de tienda, un ajuste que la regulariza y
  el movimiento que ambos dejan en el submayor son **el mismo hecho** visto
  tres veces. Propuesta a validar con Janet: todo movimiento se identifica por
  su número de documento TKC, y cada documento cuenta una sola vez en un solo
  concepto.

## Orden propuesto

1. **F0**, que desbloquea el resto y puede cambiar las estimaciones.
2. **F1** y **F3**: aprovechan lo que ya hay y dan valor pronto.
3. **F4** y **F5**.
4. **F2** y **F6**, que necesitan todo lo anterior.

## Preguntas para Janet

1. **¿Qué es un despacho?** ¿Salida por venta, por transferencia, o ambas? Si
   la venta y el despacho cuentan lo mismo, F3 y F6 los suman dos veces.
2. **¿Qué almacenes?** ¿Cada análisis es por almacén, o necesita ver varios
   juntos?
3. **¿Quién usa cada cosa?** Hoy las pantallas de facturación son de `fact`,
   `administrador` y `superadmin`. ¿Auditoría y jefes de departamento también?
4. **¿Qué período?** ¿Fechas libres, o mes natural y corte semanal?
5. **¿Qué hace con la diferencia que detecta ANÁLISIS?** ¿Solo la ve, o debe
   poder abrir un ajuste desde ahí? Lo segundo es otra tarea.
6. **¿Hace falta exportar?** Si sí, ¿a Excel o a CSV? Las exportaciones del
   sistema son CSV.

## Riesgos

- **Leer HTML de TKC** (como hace el historial del submayor) no escala a
  «todas las transferencias de un mes»: una petición por producto o documento.
  Si F0 muestra que es la única vía, F3, F4, F5 y F6 necesitan que alguien
  exponga un listado agregado, o una copia propia sincronizada.
- **TKC limita las peticiones por cuenta.** Un análisis que recorra cientos de
  productos puede bloquear la cuenta de quien lo lanza.
- **F6 es una herramienta de decisión sobre cifras de tres fuentes.** Si dos
  discrepan, tiene que decir cuál manda, o sus diferencias serán ruido.
