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

## 4. Qué cambia en el plan

| Tarea | Antes | Ahora |
|---|---|---|
| **F1** Observaciones de A/D | Depende de la API | **Salidas: resuelto** (vienen en el listado de TKC). **Entradas: hay que leer `/info/{id}`** |
| **F5** Reporte de VD | Sin fuente | **Fuente doble:** documentos `TKCS` de tipo Venta Directa (de TKC) + líneas por factura en `rdp_vd_rows` (nuestra base) |
| **F3** Resumen de despachos | Sin fuente | Candidatos: `rdp_rows` (plataforma) y `fleet.orden` (flota). **Falta definir cuál es «despacho»** |
| **F4** Transferencias | Sin fuente | El equipo dice que **existe** el listado, **sin dar la ruta**. No están entre los tipos de entrada |
| **F6** ANÁLISIS | Muy incierto | **Viable:** existencias de `sub_*`, ventas de `rdp_*`, entradas y salidas de TKC. Cada movimiento, identificado por su `TKCE`/`TKCS` |
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

6. **Qué es cada tabla.** Ejecuta la segunda consulta, que **no muestra
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
