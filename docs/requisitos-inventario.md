# Requisitos de inventario — qué hay y qué falta

Revisión del listado de requisitos de inventario contra el código, a 22 de
octubre de 2026. Las rutas enlazan al archivo concreto para no tener que
buscarlo.

Tres estados: **hecho**, **parcial** (existe algo pero no cumple el requisito)
y **falta** (no hay nada).

---

## Realizar inventario (móvil)

| Requisito | Estado | Dónde |
|---|---|---|
| Escanear códigos de barra | Hecho | `src/components/inventario/BarcodeScanner.jsx` |
| Mostrar **los** productos con ese código, con imagen | Hecho | `src/lib/buscarPorCodigo.js`, `src/components/shared/SelectorCoincidencias.jsx` |
| Las 3 cantidades del submayor | Hecho | `src/components/inventario/InventarioForm.jsx` |
| Conteo real | Hecho | Suma de las líneas de detalle |
| Reserva ideal | Falta | — |
| Fecha de vencimiento | Hecho | Una por línea de detalle |
| Estado bueno / malo / merma | Falta | Existe como flujo aparte en Mermas |
| Estado del producto según «V Datos» | Por definir | Ver preguntas abiertas |
| Vigencia «V Datos» | Parcial | `lotes.vigencia_dias` y `estado_fv` existen, no se muestran aquí |
| Varias fechas de vencimiento | Hecho | `inventarios.detalles` es un jsonb de líneas |
| Subir / bajar a tienda | Falta | — |
| Replicar en PC sin escáner | Hecho | `ProductSearch`; el escáner es un botón opcional |
| Alerta de faltante/sobrante cruzado | Falta | — |
| Todo con precio de proveedor | Parcial | `precio_costo` existe; inventario no valora el conteo |
| Clasificación INV seleccionable | Parcial | `clasif_ajuste` solo se pide **si hay diferencia** |
| Nota de inventario | Hecho | `inventarios.notas_inv` |

### El código de barras no identifica un producto

Era el punto más grave de la lista y ya está corregido.

Los tres escáneres del sistema —inventario, merma y el del encabezado— pedían
una sola fila por `codigo_producto` y se quedaban con ella. Pero ese código lo
comparten varios anuncios de TKC con distinto nombre, suministrador y
existencia: es la misma confusión que destruía 456 anuncios en el sync (ver
`supabase/fix_clave_producto.sql`). El inventarista escaneaba y el producto lo
elegía el orden de la base, en silencio.

Ahora la búsqueda devuelve la lista y, cuando hay más de uno, elige quien tiene
el producto delante. El selector muestra lo que los distingue: **ID de tienda**,
que es la identidad real, suministrador y existencia física.

**Queda el caso hermano, sin resolver:** la importación masiva indexa por código
de barras (`src/components/import/TabImportar.jsx`,
`src/components/productos/ImportarProductos.jsx`). Si dos productos lo comparten,
el segundo pisa al primero y las filas se asocian a un producto arbitrario. Ahí
no cabe un selector —es un lote, no una pantalla—, así que hay que decidir: o se
rechazan esas filas pidiendo el ID de tienda, o se importan marcadas para
revisión.

### Las 3 cantidades, y contra qué se compara el conteo

El formulario muestra física, en almacén y en tienda, consultadas al submayor
de TKC para el producto seleccionado.

Lo importante no es enseñarlas, es **de dónde sale el número con el que se
calcula la diferencia**. Antes era `productos.exist_fisica`, que es nuestra
copia de `invGlobal` y puede llevar días sin sincronizar: el inventario se
comparaba contra un número viejo. Ahora manda el submayor, que es lo que dice
TKC en ese momento.

Cuando los dos no coinciden, el formulario lo dice y explica contra cuál se
está comparando. Si el submayor no tiene el producto en ese almacén, si la
consulta falla, o si el producto no tiene ID de tienda, se usa el catálogo y
también se avisa.

Esto explica además una diferencia que se ve en pantalla: el panel de control
cuenta sobre nuestra base y la pestaña TKC del catálogo pregunta a TKC en
vivo, así que los totales no cuadran mientras el sync esté atrasado.

---

## Ajuste de inventario

| Requisito | Estado |
|---|---|
| Comparar conteo real contra existencia física | Hecho — `diferencia = conteo_real − exist_fisica` |
| Decir faltante o sobrante | Hecho — `inventarios.resultado` |
| Ajuste de aumento / disminución | Hecho — `src/lib/ajusteFact.js` |
| Procesamiento de intercambios similares | Hecho, como nota de texto |

### Cardista es facturación

No son dos puestos: el cardista usa el usuario de facturación. No hace falta
crear ningún rol.

El flujo es: diferencia → `pend_fact` → factura o nota de ajuste → auditoría.

### El ajuste se propone a partir del conteo

`ESTADO_FACT` ya tenía «Ajuste de aumento» y «Procesamiento». Faltaba **«Ajuste
de disminución»**: un sobrante tenía cómo resolverse y un faltante no, así que
acababa en estados del retiro, que describen otra cosa.

Ahora el formulario abre con el ajuste que corresponde al conteo —sobrante
hacia arriba, faltante hacia abajo— y avisa si se elige el contrario. Es un
aviso, no un bloqueo: «Procesamiento» vale para ambos casos y los estados del
retiro son legítimos.

### El intercambio no se puede validar

Con qué producto se intercambió y a qué precio va **en las notas de FACT**: el
registro de inventario guarda un solo producto. Por eso no hay comprobación
automática de «precio similar» — no hay con qué comparar. El formulario lo
recuerda cuando se elige «Procesamiento».

Si algún día hace falta esa validación, antes hay que registrar el producto
contrario: un campo en el mismo conteo, o enlazar los dos conteos entre sí.

---

## Estado de inventario

| Requisito | Estado |
|---|---|
| Listado de productos con estado | Hecho — `src/pages/Inventario.jsx` |
| Filtros | Parcial — solo estado y búsqueda de texto |
| Subir a tienda con reserva automática | Falta |

Los filtros que hay hoy son `estado_tarea` y una caja de búsqueda. No se puede
filtrar por clasificación, almacén, fecha ni resultado (faltante/sobrante).

---

## Preguntas abiertas

Sin estas respuestas no se puede estimar ni empezar lo que falta.

**La fórmula de reserva ideal.** La regla se entiende:

- cantidad ≤ 5 → 0
- cantidad ≤ 50 → 3 % redondeado hacia arriba
- cantidad > 50 → 10 % redondeado hacia arriba

Lo que no se sabe es **qué columnas son J, S, F y T** en la hoja. Por la forma
de la fórmula, J parece la cantidad base, T algo que se suma cuando F está
vacío, y S una condición para no calcular nada.

**Qué es «V Datos».** Se menciona para los estados y para la vigencia. Si es una
hoja del Excel con la tabla maestra de estados, hace falta verla. En la base hay
`estado_fv` y `vigencia_dias` en `lotes`, pero no está claro que sea lo mismo.

**Qué es «AP (lester)».** Se entiende que ahí viven varias fechas de vencimiento
por producto, pero no si es otra hoja, otro sistema o una persona.

**Subir / bajar a tienda: ¿qué significa?** ¿Mover existencia entre almacén y
tienda dentro de ELíneas, o una operación que hay que reflejar en TKC? Lo
primero es una columna nuestra; lo segundo es escribir en un sistema ajeno, con
todo lo que eso arrastra.

**Importación masiva con códigos ambiguos:** ¿rechazar las filas o marcarlas
para revisión?

---

## Orden sugerido

1. **Clasificación INV siempre, no solo con diferencia**, y los filtros del
   listado. Cambios pequeños y acotados.
2. **Reserva ideal**, en cuanto se sepan las columnas.
3. **Subir / bajar a tienda**, en cuanto se sepa si toca TKC.
4. **Alerta de faltante/sobrante cruzado** e **intercambios de similares**. Son
   los dos más complejos: cruzan registros entre sí y necesitan una definición
   de «precio similar» que todavía no existe.
