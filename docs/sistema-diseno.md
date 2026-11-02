# Sistema de diseño

Panel interno, denso y sobrio. Se trabaja sobre todo desde el teléfono, en un
almacén, con prisa; y desde un portátil cuando toca procesar. Las dos cosas
piden lo mismo: que quepa la mayor cantidad de datos legibles por pantalla y
que nada decore sin decir algo.

Todo vive en [`src/index.css`](../src/index.css). Si hay que cambiar un color
o un redondeo, se cambia ahí y no en los componentes.

---

## Color

Dos familias y ninguna más.

**Las del tema** —`background`, `card`, `border`, `primary`, `muted`…— son
tripletes HSL que cambian con el tema claro/oscuro, y se usan por sus clases
de Tailwind: `bg-card`, `text-muted-foreground`, `border-border`.

**Las de estado** son los nueve colores con los que se lee una lista de un
vistazo. Estaban escritos a mano unas 700 veces por todo el código; ahora se
declaran una vez y se usan como `text-[var(--c-bad)]` o
`bg-[var(--c-warn)]/8`.

| Variable | Oscuro | Claro | Para qué |
|---|---|---|---|
| `--c-ok` | `#4ade80` | `#15803d` | Acción, activo, correcto |
| `--c-ok-dim` | `#1d9e75` | `#0f766e` | Cerrado, ya no hay nada que hacer |
| `--c-bad` | `#e24b4a` | `#b91c1c` | Faltante, devuelto, error |
| `--c-warn` | `#ba7517` | `#8a5410` | Sobrante, pendiente de otro |
| `--c-info` | `#378add` | `#1d4ed8` | En curso |
| `--c-info-2` | `#60a5fa` | `#1d4ed8` | Informativo sin estado |
| `--c-purple` | `#a78bfa` | `#6d28d9` | Auditoría, importación |
| `--c-orange` | `#fb923c` | `#c2410c` | Por vencer |
| `--c-yellow` | `#facc15` | `#a16207` | Aviso menor |
| `--c-gray` | `#888780` | `#5b5a55` | Sin estado, sin ID |

El nombre dice para qué sirve, no de qué color es. El día que el rojo del
faltante tenga que cambiar, se cambia en un sitio.

Los valores del tema claro no son los mismos a propósito: los del oscuro
están pensados para fondo negro y sobre blanco se quedan muy por debajo de
4.5:1 —el verde da 1.8:1, que es texto invisible—. Mientras estuvieron
escritos a mano en cada componente, esto no se podía arreglar.

**El verde es el único acento.** Un botón primario, un filtro puesto, una
fila activa. Si algo no es acción ni estado, no lleva color.

### Lo que queda fuera a propósito

- **La rampa de vencimientos** (`ReporteVencimientos.jsx`): rojo → naranja →
  amarillo → verde → turquesa. Es una escala de urgencia, no una lista de
  estados, y el salto de color *es* la información.
- **Los colores de rol y las series de los gráficos**: paletas categóricas.
  Lo que importa ahí es que se distingan entre sí, no que signifiquen algo.

## Redondeo

Tres medidas y una sola perilla. Antes había 4, 6, 8, 10 y 12 px repartidos
por 390 sitios sin criterio, así que ningún par de pantallas coincidía.

| Variable | Valor | Para qué |
|---|---|---|
| `--r-chip` | 3 px | Lo que rodea a una palabra |
| `--r-ctl` | 4 px | Botón, campo, filtro, fila de mandos |
| `--r-card` | 8 px | Lo que contiene a los demás |

`--radius` (el de Tailwind, el de `rounded-lg`) vale 4 px y acompaña a
`--r-ctl`.

## Densidad

La fila de tabla mide **32 px**: `px-2.5 py-1.5` en cada celda, y lo mismo en
la cabecera. En un portátil eso son seis filas más por pantalla que antes.

La densidad es cosa del escritorio. **En el teléfono manda el dedo**: la lista
no es una tabla sino fichas con su espacio, y los controles no bajan de la
altura que ya tenían. Encoger un botón para ganar píxeles en una pantalla que
se usa de pie en un pasillo es ganar lo que no se necesita y perder lo que sí.

La escala entera baja a 14 px de raíz por debajo de 640 px. Como las clases de
Tailwind van en `rem`, el texto y el espaciado encogen juntos y en la misma
proporción.

## Estados

Punto de color y palabra, sin pastilla. El fondo de color no añadía nada que
el punto no dijera ya y cobraba caro: cinco píldoras en una fila son cinco
manchas compitiendo con el dato. Lo pinta
[`StatusBadge`](../src/components/shared/StatusBadge.jsx) a partir de
`ESTADO_TAREA` / `ESTADO_RECEPCION`, que es donde se define el vocabulario.

## Cifras

Todo lo numérico va en `font-mono`, que lleva `tabular-nums`: las cifras miden
igual y las columnas cuadran. Con ancho variable, el 1 ocupa menos que el 8,
la coma se desalinea y hay que leer número a número.

## Tipografía

**Inter** para el texto y **JetBrains Mono** para códigos, cantidades y
fechas. Dos fuentes, dos pesos de uso: 400 y 500; 600 para títulos.

El catálogo de estilos sugería Fira Sans / Fira Code para paneles de datos.
Se descartó: hace el mismo trabajo que lo que ya hay y costaría dos
peticiones más en cada carga.

## La estructura de una pantalla de listado

Fijada en [`CabeceraLista`](../src/components/shared/CabeceraLista.jsx), en
este orden y sin excepciones:

```
TÍTULO
subtítulo, en una línea
[ almacén ] [ filtro ] [ filtro ] [ columnas ]   ← fila de mandos
[ buscador                                   ]
                                 12 resultados   ← a la derecha
contenido
```

Los filtros van **al lado** del selector de almacén, nunca debajo. En
pantalla estrecha son cuadrados con su icono; a partir de `lg` llevan escrito
el valor elegido, porque en un monitor sobra el sitio y obligar a abrir un
desplegable para saber por qué está filtrada la lista es peor interfaz.

## Antes de dar algo por hecho

- Contraste de 4.5:1 en texto, en los dos temas.
- El foco se ve con el teclado.
- Nada depende solo del color: el estado lleva punto **y** palabra.
- Ningún emoji haciendo de icono — SVG de lucide.
- A 375, 768, 1024 y 1440 px, y sin desplazamiento horizontal en el teléfono.
