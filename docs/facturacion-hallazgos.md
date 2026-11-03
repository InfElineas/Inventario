# Facturación: lo que ya sabemos

Resultado de los pasos 0, 2, 3 y 4 de [facturacion-pasos.md](facturacion-pasos.md),
contestados desde el servidor y desde TKC. Reemplaza las suposiciones de
[facturacion-fuentes.md](facturacion-fuentes.md).

Lo pegado en esa guía (cuatro mil líneas de respuestas de TKC) **no está
resumido aquí**: sale de TKC, con importes y referencias de la empresa, y no
hace falta guardarlo entero en el repositorio. Abajo van las conclusiones.

## 1. Qué hay desplegado

El servidor tiene el código de **Casos de IC** (`157afe7`) y estaba tres
commits atrás de `f074755`: esos tres solo son documentación. No dice si la
imagen se **reconstruyó** con ese código; eso se ve en el menú: *Inventario →
Casos de IC*.

## 2. TKC: dos listados con el mismo formato

Lo que se pegó no es la API de Inventario sino **el listado de TKC mismo**
(DataTables: `draw`, `recordsTotal`, `data`). Es la fuente más cercana a lo que
Facturación ve y compara.

| | **Entradas** | **Salidas** |
|---|---|---|
| Ruta de cada documento | `…/almacen/entradas/info/{id}` | `…/almacen/salidas/info/{id}` |
| Prefijo del código | **`TKCE`** | **`TKCS`** |
| Tipos vistos | Compras, Compra Terceros, Ajuste Aumento, Ajuste Aumento Devolución | **Ajuste Disminución**, **Venta Directa** |
| Observación | **No viene en el listado** | **Viene siempre** (`observacion`) |
| Otros campos | `fecha`, `fecha_contable`, `proveedor`, `cliente`, `estado`, `monto`, `referencia`, `nofactura`, `tipoPago`, `devolucion` | `fecha`, `fecha_cont`, `cliente`, `estado`, `monto`, `referencia` |
| Estados | confirmada, editada | confirmada |

Lo que se sigue de ahí:

- **Venta directa es una salida**, igual que un ajuste de disminución, con otro
  `tipo`. Lo confirma el equipo de las APIs. Un solo camino cubre las dos, así
  que **el reporte de VD (F5) y las observaciones de disminuciones son el mismo
  trabajo**.
- **Las observaciones de las salidas ya vienen**: «RETIRO POR MERMA»,
  «FACT. 5939», «VD facturas 5922, 5923…». Las de las entradas **no**: están
  dentro de cada documento (`/info/{id}`).
- **El número de documento (`TKCE…`/`TKCS…`) identifica un movimiento sin
  duda.** Es la clave para no contar dos veces (F6).
- En una VD, la observación suele nombrar **los números de factura**, que
  existen también en `rdp_vd_rows` (ver abajo): se pueden cruzar.

## 3. Nuestra base ya tiene mucho más de lo esperado

`ELINEAS_BD` tiene, en el esquema `public`, el histórico que cargan el cron y
n8n:

| Tabla o vista | Filas | Qué parece ser |
|---|---|---|
| `rdp_rows` | 1,5 M | Ventas diarias por producto y almacén: cantidad, órdenes, importe, costo |
| `rdp_vd_rows` | 176 (estimado; ver nota) | **Líneas de ventas directas** con fecha, código, cantidad, precio, número de factura y línea |
| `RDP_VD` | 18 594 | Parece el histórico de lo mismo, con mayúsculas |
| `vd_rows` | 552 646 | Parece venta por producto con precio y costo (así la usa la vista `bdReabRDPGlobal`) |
| `sub_rows`, `sub_current`, `sub_changelog` | 970 k, 58 k, 35 k | **El submayor**: existencia por producto, con su historial de cambios |
| `lot_rows` | 482 k | Lotes (la vista que ya usa Vencimientos) |
| `fleet.orden`, `orden_tkc` | 64 k, 36 k | **Despachos de la flota** (`id_despacho`, `fecha_despacho`, distribuidor, observaciones) |
| `v_ventas_producto` | — | Una vista que **ya une** las ventas directas con las de plataforma |

Lo que **no** hay: ninguna columna con el número de documento de TKC
(`TKCE…`/`TKCS…`). La base guarda **ventas y existencias**, no los
documentos de entrada y salida. Eso solo está en TKC.

Nota sobre los conteos: son **estimados** de Postgres (`reltuples`); los de `rdp_vd_rows` y `RDP_VD` difieren mucho y pueden estar desactualizados. La segunda consulta (punto 6) da los reales.

No hay `pg_cron` en la base: el cron que la alimenta es externo (los documentos de contexto de TKC hablan de n8n).

### Resultado de la segunda consulta

| Tabla | Qué es | Cubre | Volumen |
|---|---|---|---|
| `rdp_rows` | Ventas de la plataforma por día, producto y almacén | 2025-01-02 a 2026-11-02 (649 días) | 1,5 M filas, **25 almacenes**, 19,3 M unidades |
| `rdp_vd_rows` | Líneas de ventas directas por factura | **Solo 2026-09-25 a 2026-11-02** (33 corridas) | 208 líneas, 96 facturas, 50 719 unidades |
| `RDP_VD` | Probable histórico anterior de lo mismo | **No se sabe** (la consulta no la miró) | 18 594 filas (estimado) |
| `fleet.orden` | Pedidos que reparte la flota, con su despacho | 2026-05-19 a 2026-10-31 | 64 758 órdenes, **4 039 despachos** |
| `sub_rows` | Existencia por producto y almacén en cada corrida del submayor | 18 corridas | Ver más abajo |

Y confirmado: **ninguna columna de la base guarda el número de documento de
TKC** (`TKCE…`/`TKCS…`).

Lo que se sigue de ahí:

- **«Despacho» tiene dos significados en la base.** `rdp_rows` cuenta **ventas
  por día de la plataforma**; `fleet.orden` cuenta **entregas** con su
  `fecha_despacho` (y solo desde mayo). No son el mismo número. De cuál habla
  Facturación es **la pregunta 1 de Janet**, y ahora se ve por qué importa.
- **Las ventas directas en la base son recientes** (desde el 25 de septiembre).
  Para períodos anteriores hay que mirar `RDP_VD`, o leer los documentos
  `TKCS` de tipo *Venta Directa* de TKC.
- **El submayor guardado son 18 fotografías**, no un diario: sirve de punto de
  partida o de llegada de una conciliación, pero no para reconstruir la
  existencia de cualquier día. Para eso hay que partir de documentos
  (entradas y salidas) y de ventas.

### Resultado de la tercera consulta

| Hallazgo | Detalle |
|---|---|
| **Las ventas directas tienen un hueco de dos meses** | `RDP_VD` cubre 2025-01-02 a **2026-07-20** (18 594 líneas, 5 772 facturas). `rdp_vd_rows` cubre desde **2026-09-25**. **Del 21 de julio al 24 de septiembre no hay nada** en la base |
| **Las ventas directas no dicen de qué almacén son** | Ni `RDP_VD` ni `rdp_vd_rows` tienen columna de almacén. Los documentos `TKCS` de TKC sí (`almacen`, `locacion`) |
| **El submayor guardado es de una semana** | 18 corridas, del 2026-10-27 al 2026-11-03, dos o tres al día. `sub_changelog` cubre lo mismo (38 218 cambios). **No se puede saber la existencia de hace un mes** con lo que hay |
| **Los despachos de la flota no traen código de producto** | `fleet.orden_producto.producto` es el **nombre** («Gas licuado GLP (10 kg / 22 lb)»), no el código. Cruzarlos con el catálogo es por nombre: frágil |
| **Un despacho sin fecha** | 4 039 despachos distintos entre todas las órdenes, pero solo **1 317** tienen `fecha_despacho` (199 010 líneas, 429 502 unidades). 2 722 despachos no tienen fecha: ¿pendientes, o dato que falta? |
| **Los almacenes** | 25 en las ventas. El 789 (*ELíneas Electrocuba*) lleva 15,6 de los 19,3 millones de unidades. `sub_*` tiene 30 |

Lo que cambia:

- **F5 (ventas directas) no puede salir solo de la base**: tiene un hueco y no
  sabe el almacén. **La fuente buena son los documentos `TKCS` de TKC**, que
  tienen fecha, almacén y observación con el número de factura. La base sirve
  para completar cada factura con sus líneas, precios y cliente, donde exista.
- **F6 (ANÁLISIS) no puede reconstruir la existencia pasada desde la base.**
  Con documentos de entrada y salida y un punto de partida sí se puede, pero ese
  punto hay que sacarlo de TKC (el historial del submayor trae saldo inicial y
  final por movimiento). Alternativa: **guardar una fotografía diaria propia**
  de la existencia desde hoy, y que el ANÁLISIS sea fiable hacia adelante.
- **F3 (despachos) con la flota no cuadra por producto** (sin código), y solo
  cubre desde mayo con 2 722 despachos sin fecha. Para «cantidades por
  período y producto», `rdp_rows` es mucho más sólido, si «despacho» es venta.

## 4. Qué cambia en el plan

| Tarea | Antes | Ahora |
|---|---|---|
| **F1** Observaciones de A/D | Depende de la API | **Salidas: resuelto** (vienen en el listado de TKC). **Entradas: hay que leer `/info/{id}`** |
| **F5** Reporte de VD | Sin fuente | **Documentos `TKCS` de tipo Venta Directa, de TKC** (con almacén y fecha). La base solo completa con líneas por factura, y tiene un hueco del 21-jul al 24-sep |
| **F3** Resumen de despachos | Sin fuente | Candidatos: `rdp_rows` (plataforma) y `fleet.orden` (flota). **Falta definir cuál es «despacho»** |
| **F4** Transferencias | Sin fuente | El equipo dice que **existe** el listado, **sin dar la ruta**. No están entre los tipos de entrada |
| **F6** ANÁLISIS | Muy incierto | **Viable, con una condición:** la existencia pasada no está en la base (solo una semana). Hace falta partir del saldo del submayor de TKC o empezar a guardar una fotografía diaria propia |
| **F2** Trazabilidad | Dependía de F4 | Igual |

## 5. Lo que falta, con su razón

Cada punto dice **qué es, de dónde sale y por qué lo necesito**. Sin duplicar
nada de lo ya contestado.

### A. De TKC (con tu sesión, en el navegador)

1. **Cómo se pide cada listado.** En *Entradas* y en *Salidas*: F12 → *Red* →
   la petición que devuelve el JSON → pestaña **Carga útil** (*Payload*). Copia
   **la URL y los parámetros** (`draw`, `start`, `length`, los filtros de
   fecha y tipo). **No** copies cookies ni cabeceras ni uses «Copiar como cURL»
   (lleva tu sesión). *Por qué:* es lo que me deja pedir «los de octubre, solo
   Venta Directa» en vez de leer 100 filas.
2. **Los tipos de salida.** Una captura del desplegable **«Tipos de salida»**,
   igual que la que mandaste de entradas. *Por qué:* ahí se ve si una
   **transferencia** es un tipo de salida. Hoy no sé si lo es.
3. **Dónde están las transferencias.** El nombre del menú en TKC donde se
   ven (¿«Transferencias»?) y una captura de su listado, con el mismo F12
   para ver su JSON. *Por qué:* el equipo dice que existe, pero no está en
   Entradas.
4. **Un documento de entrada por dentro.** Abre uno con observaciones
   (cualquier `Ajuste Aumento`), F12 → *Red*, y copia el **cuerpo de la
   respuesta** de su `/info/{id}`. *Por qué:* es donde viven las observaciones
   de las entradas.
5. **Dónde ven los despachos.** El nombre del menú o informe en TKC. *Por qué:*
   el equipo dice que existe, y puede no ser la flota ni `rdp_rows`.

### B. Del servidor (una consulta de solo lectura)

6. ~~**Qué es cada tabla.**~~ **Contestado** (resultados arriba, partes 2 y 3). Lo que sigue pendiente se resume en la sección 7.

   Original: **Qué es cada tabla.** Ejecuta la segunda consulta, que **no muestra
   datos**, solo columnas, conteos y rangos de fechas:

   ```bash
   cd /home/soporte/servidor/proyectos/Inventario-migracion && git pull && docker exec -i ELINEAS_BD psql -U elineasadmin -d ELINEAS_BD < supabase/diagnostico_fuentes_2.sql > /tmp/diagnostico_fuentes_2.txt 2>&1 && cat /tmp/diagnostico_fuentes_2.txt
   ```

   *Por qué:* dice hasta qué fecha llegan `rdp_rows` y `rdp_vd_rows`, qué
   columnas tiene cada una y si algo guarda un número de documento.

### C. De Janet

7. **Las siete preguntas del paso 5** de [facturacion-pasos.md](facturacion-pasos.md).
   Siguen sin contestar. **La primera es la que más pesa:** qué es un
   *despacho*. De la respuesta depende qué fuente usa F3 y qué suma F6.

### D. Del equipo de las APIs

8. **La ruta y los campos** de los listados de **transferencias** y de
   **despachos/ventas por período**, que dijeron que existen. Y la
   documentación (pregunta 4 del paso 4), que no contestaron.

   *Por qué:* puede que ya traigan, resuelto y paginado, lo que si no habría
   que leer de TKC en bruto.

### E. Una cosa que no me contestaste

9. **El paso 3 original:** lo que respondió **nuestra** pantalla `/ajustes/aumento`,
   no TKC. Lo pegado es el listado de TKC, que también sirve, pero no dice
   qué campos devuelve la API de Inventario, y esa es la que usamos. Solo hace
   falta si se decide **no** leer TKC directamente.

## 6. Mi propuesta, sin esperar al resto

Con lo que ya hay, F1 y F5 (que son el mismo camino por TKC) se pueden empezar
en cuanto llegue el punto 1 de arriba. Lo demás espera a Janet (punto 7), que
es quien decide qué suma ANÁLISIS.

**Orden:** punto 1 y 2 de A → empiezo F1/F5. Punto 6 y 7 → dimensiono F3 y F6.

## 7. Pendiente, con el estado de hoy

| # | Qué | De quién | Bloquea |
|---|---|---|---|
| A1 | La **URL y parámetros** de los listados de entradas y de salidas de TKC (F12 → Red → Carga útil; sin cookies) | Tú, en TKC | **F1 y F5.** Sin esto no puedo pedir «las VD de octubre» |
| A2 | Captura del desplegable **Tipos de salida** | Tú, en TKC | F4: ver si una transferencia es un tipo de salida |
| A3 | **Dónde están** las transferencias y los despachos en TKC (menú y captura) | Tú, en TKC | F3 y F4 |
| A4 | Un documento de entrada **por dentro** (`/info/{id}`) | Tú, en TKC | Observaciones de las entradas |
| C7 | Las **siete preguntas de Janet**, sobre todo la primera (qué es un despacho) | Janet | F3 y F6 |
| D8 | La **ruta** de los listados de transferencias y despachos, y la documentación | Equipo de las APIs | F4 y F3 |
| — | ~~Tablas de la base~~ | — | **Hecho** |

Una decisión que no es de nadie más que de quien lleva el proyecto: ¿se
empieza a **guardar una fotografía diaria de la existencia** desde ya? Sin ella,
el ANÁLISIS de un mes entero depende de reconstruir el saldo desde TKC, producto
por producto. Con ella, cada día que pasa mejora el ANÁLISIS.
