# Importar el histórico de inventario

Propuesta, para revisar antes de implementar. 1 de noviembre de 2026.

Cada almacén tiene sus conteos en Excel. La idea es traerlos al sistema para
que, al contar un producto, se pueda ver qué pasó con él las veces
anteriores.

---

## Antes de nada: un peligro

`inventarios` tiene un **trigger de inserción**
(`apply_inventario_stock_reconciliation_insert`). Cuando se inserta una fila
con `estado_tarea = 'completado'`, el trigger hace:

```sql
UPDATE productos SET exist_fisica = NEW.conteo_real WHERE id = NEW.producto_id;
```

Es decir: **importar el histórico dentro de `inventarios` sobrescribiría la
existencia actual de cada producto con lo que diga el Excel viejo.** El día
que estrenamos con datos reales, el catálogo entero quedaría con las
cantidades de hace meses.

Y si en vez de `completado` se importaran como `en_curso` o `pend_fact`, el
lunes facturación amanece con miles de tareas pendientes que nadie pidió.

Por eso lo que sigue no mete nada en `inventarios`.

---

## Lo que propongo

### 1. Una tabla propia

```sql
CREATE TABLE inventario.inventario_historico (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_num      text NOT NULL,
  producto_codigo  text NOT NULL,
  producto_nombre  text,
  fecha_inv        date NOT NULL,
  conteo_real      numeric,
  exist_sistema    numeric,
  diferencia       numeric,
  clasificacion    text,
  notas            text,
  especialista     text,
  -- De dónde salió, para poder deshacer una importación entera.
  importacion_id   uuid NOT NULL,
  importado_por    text,
  created_date     timestamptz NOT NULL DEFAULT now()
);
```

Por qué aparte y no en `inventarios`:

- **No hay triggers**, así que no toca la existencia de nadie.
- **No es una tarea.** `inventarios` es una máquina de estados con flujo,
  badges de pendientes y filtros por estado. Una fila histórica no se aprueba
  ni se devuelve; meterla ahí obliga a que cada pantalla aprenda a excluirla.
- **No tiene la misma forma.** El Excel no trae la existencia que decía TKC en
  aquel momento, ni un especialista que exista en el Identity Server, ni una
  clasificación de nuestra lista de 53. Forzarlo sería inventar datos.
- **Se puede deshacer.** `importacion_id` permite borrar una importación
  entera si salió mal, que en la primera va a pasar.

### 2. Dónde se importa

En **Configuración**, una sección nueva: «Histórico de inventario».

La importación es **por almacén, no por persona**. Si dos inventaristas del
mismo almacén suben el mismo Excel, se duplica todo. Entonces:

- Si el almacén ya tiene histórico, la sección lo dice —cuántas filas, quién
  las subió y cuándo— y el botón pasa a «Volver a importar», con aviso.
- Si no, invita a subirlo.

Quién puede: `inv` y los administradores. Facturación y auditoría lo ven pero
no lo tocan.

### 3. Los pasos

```
1. Elegir archivo        .xlsx / .csv
2. Elegir hoja           si tiene varias
3. Emparejar columnas    lo que trae el Excel → lo que guardamos
4. Vista previa          las primeras 20 filas ya normalizadas, y los avisos
5. Importar              por lotes, con barra de progreso
6. Resumen               cuántas entraron, cuántas se descartaron y por qué
```

El paso 3 es el que hace que esto funcione con los Excel de todos los
almacenes sin tocar código: nadie los hizo con las mismas cabeceras. Se
intenta adivinar el emparejamiento por el nombre de la columna y la persona
corrige lo que haga falta.

### 4. Qué se normaliza

| Qué | Regla |
|---|---|
| Código | Se limpian espacios. Sin código, la fila no entra: no hay con qué cruzarla |
| Fecha | Se aceptan `dd/mm/aaaa`, `aaaa-mm-dd` y el número de serie de Excel. Sin fecha no entra |
| Cantidades | Coma o punto decimal. Lo que no sea número se descarta |
| Diferencia | Si no viene, se calcula: contado − existencia. Si viene, se respeta |
| Clasificación | Se deja el texto del Excel tal cual, en `clasificacion` |
| Producto | Se busca por código en `productos` para quedarse con el nombre bueno |

Las filas descartadas **se enseñan**, con el número de fila del Excel y el
motivo. Importar en silencio lo que se pudo y callar el resto es como se
pierden datos sin que nadie se entere.

### 5. Dónde se ve

En el diálogo que ya existe: **Catálogo → menú de un producto → «Conteos de
inventario»**. Hoy lee `inventarios`; pasaría a enseñar las dos cosas, los
conteos del sistema y los importados, en una sola línea de tiempo y con los
importados marcados.

No hace falta pantalla nueva.

---

## Lo que necesito saber antes de escribir nada

**1. Una muestra del Excel.** Uno real, de cualquier almacén. Sin ver las
cabeceras y un par de filas no puedo escribir el emparejamiento ni decidir
qué se puede normalizar y qué no.

**2. ¿Qué hay dentro: conteos con su fecha, o la existencia de hoy?** Cambia
todo. Si son conteos pasados, lo de arriba vale. Si es una foto del stock
actual, no es un histórico: es otra cosa y se resuelve de otra manera.

**3. ¿Cuántas filas tiene un almacén?** Cien, diez mil o cien mil cambia si va
en una petición o por lotes, y si hace falta hacerlo en segundo plano.

**4. ¿Un Excel por almacén o uno con todos?** Y si es uno solo, ¿lleva columna
de almacén?

---

## Lo que yo recomendaría

Si mañana hay prueba con datos reales, el riesgo no es que falte el histórico:
es que una importación mal hecha deje el catálogo con existencias de hace
meses. Por eso:

1. Desplegar sin la importación y que la gente trabaje.
2. Importar el histórico después, con calma, almacén por almacén y mirando el
   resumen de cada uno.

El histórico sirve para decidir mejor, no para poder trabajar. Puede esperar
una semana; una existencia sobrescrita, no.
