# Revisión del módulo de inventario

31 de octubre de 2026. Repasadas las pantallas de Inventario, Mermas,
Vencimientos, Recepciones, Reabastecimiento, Catálogo y Anuncios, más la
navegación y los componentes que comparten.

Está ordenado por lo que cuesta arreglarlo contra lo que duele. Lo de arriba
son fallos; lo de abajo, decisiones a tomar.

---

## 1. Fallos en el móvil

La web se usa sobre todo desde el teléfono, y ahí es donde están los peores.

### 1.1 El menú de abajo deja fuera a superadmin y a jefe de departamento

`src/components/layout/BottomNav.jsx` filtra así:

```js
const items = NAV.filter(item => item.roles.includes(role))
```

Dos problemas en una línea. `role` es **un solo rol**, el de más autoridad, así
que quien es inventarista y además factura pierde la mitad del menú. Y ningún
elemento de la lista incluye `superadmin` ni `jefe_depto`: **esos dos roles ven
la barra vacía en el móvil**. En el ordenador no pasa porque el menú lateral usa
`tieneRol`, que entiende varios roles y deja pasar a superadmin por encima de
todo.

Es el fallo más grave de la revisión: un superadmin con el teléfono no puede
navegar.

### 1.2 Reabastecimiento no existe en el móvil

Está en el menú lateral y no en el de abajo. Nadie lo encuentra desde el
teléfono.

### 1.3 Los dos menús no dicen lo mismo

| Pantalla | Menú lateral | Menú móvil |
|---|---|---|
| Recepciones | inv, fact, jefe_depto, admin, superadmin | inv, admin |
| Vencimientos | inv, ca, auditor, jefe_depto, admin, superadmin | inv, ca, auditor, admin |
| Reabastecimiento | inv, ca, jefe_depto, supervisor, admin, superadmin | — |

Son dos listas escritas a mano que ya se separaron. Deberían salir de una sola.

### 1.4 Las filas de filtros no envuelven

En Inventario, Mermas, Anuncios y Vencimientos la fila de filtros es un
`flex gap-3` sin `flex-wrap`, con selectores de ancho fijo:

- Inventario: buscador + almacén (`w-52`, 208 px) + estado (`w-44`, 176 px)
- Mermas: buscador + almacén (`w-52`) + estado (`w-48`)
- Anuncios: buscador + tipo (`w-40`) + estado (`w-40`)

En una pantalla de 375 px eso suma más de lo que hay, así que el buscador se
aplasta hasta quedar inservible. Reabastecimiento sí usa `flex-wrap` y se ve
bien; es el patrón a copiar.

### 1.5 Diálogos sin alto máximo

Estos abren sin `max-h` ni scroll propio:

- `Lotes.jsx` — revisar el lote, mandar a merma
- `Recepciones.jsx` — recepción sin pedido, visor de foto
- `CamaraFoto.jsx`
- `ProfileModal.jsx`, `TkcCredencialesDialog.jsx`

En el teléfono, con el teclado abierto, el contenido pasa de la pantalla y los
botones de guardar quedan fuera de alcance. Se arregla de una vez poniendo
`max-h-[90vh] overflow-y-auto` en el `DialogContent` base
(`src/components/ui/dialog.jsx`): `cn` usa `tailwind-merge`, así que los
diálogos que ya traen el suyo lo siguen pisando.

### 1.6 Las tablas en el teléfono

Todas tienen `overflow-x-auto`, así que no se rompe nada, pero una tabla de
siete columnas en 375 px se lee desplazando a izquierda y derecha y perdiendo
de vista el nombre del producto. Dos salidas, por orden de esfuerzo:

1. Dejar la columna de producto fija (`sticky left-0`) al desplazar.
2. Que por debajo de `sm` la tabla se pinte como tarjetas, una por fila.

La segunda es la buena si de verdad se trabaja desde el móvil, pero es trabajo
de verdad: hay seis tablas.

---

## 2. Inconsistencias entre pantallas

### 2.1 `role` suelto donde ya se usa `tieneRol`

Inventario, Mermas y Anuncios siguen calculando `const role = user?.role || 'inv'`
y pasándolo como prop a su componente de detalle, aunque dentro ya nadie lo
mira: todo pasa por `tieneRol(user, …)`. Es una trampa puesta: el próximo que
añada una comprobación usará la prop que tiene a mano y volverá a dejar fuera a
superadmin y a los multi-rol. Ese fallo ya se arregló dos veces.

### 2.2 Selector de columnas: en todas menos Reabastecimiento

Quedó pendiente de la tanda anterior.

### 2.3 Paginación: en todas menos Recepciones

Recepciones pinta las cien últimas sin paginar ni filtrar por estado. Hoy hay
una; cuando haya trescientas, la pantalla será una lista infinita.

### 2.4 Volver a la página 1: tres implementaciones

- Inventario, Mermas y Reabastecimiento usan una «firma» de los filtros en un
  `useEffect`, y la firma **incluye el almacén**.
- Vencimientos lo hace a mano en cada `onChange`, y **no incluye el almacén**:
  si estás en la página 40 de un almacén y cambias a otro, apareces en la 40
  del nuevo.

Debería ser un solo helper.

### 2.5 La misma pantalla con tres nombres

«Vencimientos LOT» en el título, «Vencimientos» en el menú lateral, «Vencim.»
abajo. Y el panel es «PC General» en los dos menús, que no dice nada a quien
entra por primera vez.

### 2.6 Búsquedas que no buscan por código

- Vencimientos busca por nombre y número de lote, **no por código de producto**,
  que es justo lo que se tiene a mano con el escáner.
- Recepciones busca por proveedor y número de recepción, no por producto.

El catálogo ya busca por todos los campos; conviene el mismo criterio.

---

## 3. Errores de concepto

### 3.1 Recepciones usa el vocabulario de estados de otra cosa

```js
const estadoMap = { en_curso: 'en_curso', cerrada: 'completado', con_diferencias: 'devuelto' }
```

En el resto del sistema **«devuelto» significa que auditoría o facturación
rechazaron una tarea y la mandaron de vuelta**. Aquí se usa para pintar una
recepción con incidencias, que es otra cosa: nadie la devolvió. Quien lea la
lista entiende lo que no es. Hace falta un estado propio con su color.

### 3.2 Una recepción no dice a qué almacén entró la mercancía

`inventario.recepciones` no tiene `almacen_num`, y la pantalla es la única del
módulo que no filtra por almacén: se ven todas mezcladas. Pero las existencias,
las mermas y los lotes sí son por almacén, así que la mercancía de una recepción
acaba en un almacén concreto que no queda registrado. Hay que añadir la columna
y arrastrarla desde el pedido.

### 3.3 Más de la mitad de los lotes están vencidos

4590 vencidos de 8257. O el informe arrastra lotes históricos que ya no tienen
existencia, o nadie los está dando de baja. Conviene mirarlo antes de decidir
nada:

```sql
SELECT count(*) FILTER (WHERE cantidad > 0)  AS con_existencia,
       count(*) FILTER (WHERE cantidad <= 0) AS en_cero
  FROM lot_rows_latest
 WHERE fecha_venc < now();
```

Si la mayoría está en cero, la pantalla debería esconderlos por defecto: un
lote vencido sin existencia no es una tarea, es ruido que tapa los 127 críticos.

### 3.4 «Crítico» y «Por vencer» no se explicaban solos

Ya corregido: ahora llevan el rango de días. Queda confirmar que los cortes
—15 y 30 días— son los que usa el negocio; vienen heredados de la vista vieja y
nadie los ha validado.

### 3.5 Claves de React repetidas

El fallo de Vencimientos (el mismo lote varias veces, misma clave, el filtro
parecía no hacer nada) tiene un hermano en Recepciones: las líneas se pintan con
`key={i}` y la lista admite borrar una del medio. Al borrar la segunda de cinco,
React reaprovecha nodos equivocados y lo escrito en los campos salta de fila.

### 3.6 Tres sitios que recalculan lo mismo

`items_confirmados` y `total_items` se recalculan en `contarLinea`,
`confirmItem`, al quitar un ítem y al crear la recepción. Cuatro, en realidad.
Una función y se acabó.

---

## 4. Mejoras que valen la pena

1. **Vencimientos**: esconder por defecto los vencidos sin existencia (ver 3.3).
2. **Vencimientos**: exportar a CSV, como Reabastecimiento. Las listas de
   vencidos se mandan por correo.
3. **Recepciones**: filtro por estado y paginación (ver 2.3).
4. **Reabastecimiento**: selector de columnas (ver 2.2).
5. **`title=` no existe en una pantalla táctil.** Se usa para explicar el botón
   de recargar y los rangos de las pestañas. Lo que importe tiene que estar
   escrito.
6. **Catálogo**: 1362 líneas en un archivo. Es la pantalla que más cuesta tocar
   del módulo.

---

## 5. Lo que queda abierto de antes

- `feature/merma-origen`: cuatro commits sin fusionar.
- Supabase sigue contratado y ya no se usa.
- Las mermas de prueba están por crear, así que el flujo de merma desde un lote
  vencido no se ha probado con datos reales.

---

## Por dónde empezar

Si hay que elegir, este orden:

1. **1.1, 1.2 y 1.3** — una sola lista de navegación con `tieneRol`. Es media
   hora y desbloquea a superadmin y a los jefes en el móvil.
2. **1.5** — una línea en `dialog.jsx`.
3. **1.4** — `flex-wrap` en cuatro filas de filtros.
4. **3.2** — el almacén en las recepciones, antes de que haya historial que
   migrar.
5. **3.1 y 3.5** — el estado propio de recepciones y las claves.
6. **1.6** — las tablas en el móvil, que es lo caro y lo que más se nota.
