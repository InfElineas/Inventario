# Arquitectura

## Visión general

```
Navegador (React + Vite)
   │
   ├── /api/auth/*     ──► Elineas Identity Server (JWT EdDSA)
   ├── /api/datos/*    ──► PostgreSQL · ELINEAS_BD, esquema `inventario`
   ├── /api/tkc/*      ──► TKC (scraping de su DataTables)
   ├── /api/ajustes/*  ──► elineas-transferencia (ajustes, tienda, procesos)
   ├── /api/pedidos    ──► apireab (pedidos de compra)
   ├── /api/rotacion   ──► elineas-api (informe de ventas diarias)
   └── /api/lotes      ──► `lot_rows_latest`, en la misma base
```

El navegador **no habla con nada de fuera**. Todo pasa por el servidor Node,
que es quien guarda las credenciales de servicio y comprueba los permisos. Lo
contrario —que cada pestaña abriera su propia sesión contra TKC o contra la
base— es lo que había antes de la migración y lo que obligaba a repartir
secretos por el bundle.

De fuera llegan cinco sistemas distintos, y conviene no confundirlos:

| Sistema | Qué aporta |
|---|---|
| **Identity Server** | quién eres y qué roles tienes en el sistema `inventario` |
| **ELINEAS_BD** | lo que produce el sistema: conteos, mermas, recepciones, casos |
| **TKC** | la existencia en vivo y el submayor. Se lee raspando su web |
| **elineas-transferencia** | ejecuta ajustes, subidas y bajadas de tienda |
| **apireab** | los pedidos de compra que hace comercial |
| **elineas-api** | informes: rotación de venta. *No* es la de transferencias |

## Estructura del código

```
src/
├── api/base44Client.js   Fachada entidad → tabla. Todo el CRUD pasa por aquí
├── components/           Por módulo (inventario/, mermas/, recepciones/…)
│   └── shared/           Las piezas que usan todas las pantallas
├── lib/                  Reglas y utilidades sin JSX
├── pages/                Una por ruta
├── server/               El backend. Node puro, sin framework
└── services/             Cliente de cada API externa, desde el navegador

server/index.js           Sirve dist/ y monta la cadena de middlewares
supabase/*.sql            Migraciones. Se aplican a mano (ver base-de-datos.md)
```

El nombre `supabase/` es herencia: ahí ya no hay Supabase, solo los `.sql`.

### `src/lib` — piezas transversales

| Archivo | Qué resuelve |
|---|---|
| `AuthContext.jsx` | La sesión. Expone `user` con sus roles y su configuración |
| `roles.js` | `tieneRol(usuario, permitidos)`. **Varios roles, no uno** |
| `navegacion.js` | La lista de destinos, una sola vez para las dos barras |
| `ambito.js` | Si una pantalla se mira desde inventario o desde facturación |
| `constants.js` | Estados, clasificaciones de merma, motivos |
| `useAlmacen.js` | El almacén activo, que acota casi todas las pantallas |
| `useTablaPaginada.js` | Paginación contra el servidor: filtro, búsqueda y total |
| `security.js` | Saneado de entradas |

### `src/components/shared` — el vocabulario visual

Lo que hace que las ocho pantallas de listado se parezcan:

| Componente | Qué hace |
|---|---|
| `CabeceraLista` | El orden fijo: título, subtítulo, filtros, buscador, recuento |
| `ControlesLista` | El selector de almacén y los filtros de icono |
| `ListaResponsive` | Tabla en el escritorio, fichas en el teléfono, una sola fuente |
| `ColPicker` | Qué columnas se ven y en qué orden |
| `BotonAccion` | Acción con icono; el texto solo donde cabe |
| `Esqueleto` | La forma de la pantalla mientras carga |

### Capa de datos: `base44Client`

Un `Proxy` que traduce `base44.entities.Merma.filter(...)` a un POST contra
`/api/datos/Merma/filter`. El servidor valida la entidad contra su propia
lista (`TABLA`, en `datosApi.js`) y los nombres de columna contra el catálogo
de Postgres, así que ni la tabla ni las columnas salen de lo que mande el
navegador.

Las dos listas de entidades —la del cliente y la del servidor— tienen una
prueba que las compara. Separarlas sin querer deja la entidad nueva muerta en
el navegador con «Entidad no mapeada» sin llegar a pedir nada.

## Autenticación y autorización

1. **El Identity Server** autentica contra `AUTH_API_URL`, con `SYSTEM_SLUG`
   para saber en qué sistema se pide el rol. Devuelve un JWT firmado con
   EdDSA y la lista de roles de esa persona en `inventario`.
2. **La sesión** viaja en una cookie `HttpOnly`, no en `localStorage`: así no
   la lee ningún script de la página.
3. **La autorización** la decide `src/server/permisos.js`, que sustituye a las
   cuarenta policies RLS que hacía cumplir Postgres antes de la migración. Las
   reglas se declaran como datos —no repartidas en `if`— y cada bloque cita la
   policy de la que viene.

Lo que más cuesta recordar: **los permisos se suman**. Quien es inventarista y
además factura puede lo de los dos. Comprobar `user.role` en vez de
`tieneRol(user, [...])` resuelve al rol de más autoridad y le quita lo que solo
puede `inv`. Ha pasado tres veces; si escribes `role ===`, párate.

## Integración con TKC

TKC no tiene API: tiene una web con DataTables. `src/server/tkcApi.js` entra
con las credenciales del usuario, mantiene la cookie y traduce cada petición
nuestra a la suya.

### Por qué el desglose va aparte

La tabla de TKC da el total por producto, no el reparto entre almacén y
tienda. Ese desglose es otra petición por producto, así que el catálogo lo
pide solo para las filas que se están viendo.

### Consecuencia de diseño: la paginación

Como la búsqueda y el orden los resuelve TKC, la paginación del catálogo en
vista TKC **es la suya**: no se puede ordenar en memoria lo que no se ha
descargado. Por eso esa pantalla pagina contra el servidor y no en el cliente.

## Lo que se calcula en el servidor, y por qué

Tres pantallas harían números equivocados si se calcularan en el navegador:

- **Reabastecimiento** cruza el informe de rotación con las existencias de
  todo el almacén. La API de datos devuelve 2 000 filas como mucho y un
  almacén tiene veinte mil productos: pidiendo «las 2 000 con más existencia»
  se caían justo las de existencia cero, que son las urgentes.
- **Vencimientos** lee `lot_rows_latest` —la vista que mantiene el cron— y le
  superpone las correcciones de inventario, porque la fecha del envase no se
  puede escribir en el informe de origen.
- **Los recuentos del panel** se hacen en SQL en vez de descargar las filas
  para contarlas.

## Notificaciones

Se insertan como filas en `notificaciones`. Hay dos vías:

- `notifyJefeDepto(departamento, …)`, para que alguien supervise.
- `notifyRoles([...], …)`, para que alguien *use* el aviso: una recepción con
  incidencias tiene que llegarle a quien va a cuadrar la factura.

Cada aviso puede llevar `link`, y el menú de notificaciones lo abre.

## Pruebas

`bun run test -- --run`. Vitest, con `@testing-library/react` para lo visual.
Lo que se prueba, por orden de valor: las reglas de permisos contra las
policies originales, el SQL que construye la API de datos, los cálculos
(rotación, vigencia, incidencias) y los componentes compartidos.

Una prueba comprueba que todo lo que `server/index.js` importa viaja dentro de
la imagen de Docker. Ya ocurrió una vez: un `import` hacia `src/lib` compiló,
pasó los tests y mató el contenedor al arrancar.
