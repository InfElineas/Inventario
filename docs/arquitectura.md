# Arquitectura

## Visión general

```
Navegador (SPA React)
   │
   ├── @supabase/supabase-js ──────────────► Supabase (Postgres + Auth + RLS)
   │                                          Los datos del negocio. La
   │                                          autorización vive en las policies
   │                                          RLS, no en el cliente.
   │
   └── fetch /api/tkc/* ──► Pasarela ──────► TKC (sistema externo)
                            Express          Hace login con credenciales de
                            o plugin Vite    servidor y consulta su DataTables.
```

Hay dos orígenes de datos y conviene no confundirlos:

- **Supabase** guarda todo lo que el sistema produce: mermas, conteos,
  recepciones, casos de anuncios, lotes, usuarios y notificaciones.
- **TKC** es la fuente de verdad del catálogo y las existencias de la empresa.
  Se consulta en vivo (pestaña BD TKC, detección de anuncios) y además se
  sincroniza hacia la tabla `productos` de Supabase.

## Estructura del código

```
src/
├── api/              Clientes de datos
│   ├── supabaseClient.js    Cliente principal
│   ├── externalSupabase.js  Cliente de la BD externa (origen del sync)
│   └── base44Client.js      Fachada entidad → tabla + auth.me()
├── components/
│   ├── ui/           Primitivas (Radix + Tailwind), estilo shadcn
│   ├── shared/       Reutilizables: ProductSearch, AlertBanner, Timeline…
│   ├── layout/       Sidebar, AppHeader, NotifDropdown
│   └── anuncios|inventario|mermas|productos|reportes|dashboard|import/
├── lib/              Lógica transversal y hooks
├── pages/            Una por ruta
├── server/tkcApi.js  Handlers de /api/tkc/* (compartidos dev/prod)
└── services/
    ├── syncService.js   Sync BD externa → productos
    ├── tkcService.js    Única puerta del navegador hacia TKC
    └── tkc/             Cliente de TKC: auth, paginación, normalización
server/
├── index.js          Servidor Express de producción
└── env.js            Carga del .env sin dependencias
supabase/             Schema y migraciones SQL (se aplican a mano)
```

### `src/lib` — piezas transversales

| Archivo | Responsabilidad |
|---|---|
| `AuthContext.jsx` | Sesión de Supabase + perfil de `usuarios`. Expone `user` con rol y configuración personal |
| `security.js` | Mapa de permisos por rol (`hasPermission`) y `sanitizeError` |
| `constants.js` | Roles, clasificaciones de merma, destinos, departamentos, etiquetas |
| `anuncioEstado.js` | Clasificación del estado de anuncio de un producto (fuente única) |
| `workflowService.js` | Registra transiciones en `workflow_eventos` y notifica a quien toca |
| `notificationService.js` | Notificaciones "inteligentes" periódicas, con deduplicación diaria |
| `useAlmacen.js` | Almacén activo y filtrado según la config del usuario |
| `useAutoSync.js` | Sync automático según los horarios configurados |
| `useSortable.js`, `useConfirm.jsx`, `useTheme.js` | Hooks de UI |
| `validation.js`, `supabaseUtils.js`, `utils.js` | Utilidades |

### Capa de datos: `base44Client`

El nombre es herencia de la plantilla original; hoy es una fachada delgada sobre
Supabase. Mapea entidades a tablas:

| Entidad | Tabla |
|---|---|
| `Producto` | `productos` |
| `AnuncioDesact` | `anuncios_desact` |
| `Merma` | `mermas` |
| `Lote` | `lotes_vigencia` *(vista, no la tabla)* |
| `LoteIC` | `lotes_ic` |
| `Inventario` | `inventarios` |
| `Recepcion` | `recepciones` |
| `Notificacion` | `notificaciones` |
| `HistorialMovimiento` | `historial_movimientos` |

`Lote` apunta a la **vista** `lotes_vigencia`, que recalcula `estado_fv` y
`vigencia_dias` contra la fecha actual en cada lectura (ver migración v29).
Nada en el cliente escribe lotes, así que apuntar la entidad a la vista es
seguro.

El `orderBy` pasa por una whitelist de columnas (`ALLOWED_ORDER_COLUMNS`): una
columna desconocida cae al orden por defecto en vez de lanzar, para que un
parámetro mal formado no se convierta en inyección ni en pantalla rota.

## Autenticación y autorización

1. **Supabase Auth** autentica (email + contraseña). El registro está
   restringido al dominio `@mercadoelineas.com` por el trigger
   `handle_new_auth_user()` (migraciones v30/v31).
2. **`AuthContext`** carga la fila de `usuarios` del correo autenticado. Si no
   existe o `activo = false`, la sesión queda en estado "pendiente de
   aprobación": un administrador debe activarla desde Usuarios.
3. **El rol** vive en `usuarios.role` y se usa en tres niveles:
   - *Navegación*: `Sidebar.jsx` filtra los enlaces visibles.
   - *Rutas*: `RoleGuard` en `App.jsx`.
   - *Datos*: las **policies RLS** de Postgres, que son la única barrera real.
     Los dos niveles anteriores son usabilidad; saltárselos no da acceso.

La función `get_user_role()` en Postgres lee el rol desde `usuarios` y devuelve
`sin_rol` cuando el usuario no tiene fila activa, de modo que un usuario
desactivado pierde privilegios de inmediato.

> La autorización de verdad está en `supabase/migration_v25_role_rls.sql` y sus
> correcciones posteriores. Ver [base-de-datos.md](base-de-datos.md).

## Integración con TKC

TKC se consulta **solo desde el servidor**: las credenciales nunca llegan al
navegador.

```
tkcService.js ──POST /api/tkc/*──► tkcApi.js ──► services/tkc/* ──► TKC
  (navegador)   Authorization:      (servidor)
                Bearer <token
                de Supabase>
```

La pasarela existe en dos montajes que comparten los mismos handlers:

- **Desarrollo**: `vite-plugin-tkc.js` como middleware dentro del proceso de Vite.
- **Producción**: `server/index.js` (Express, puerto 3003), que además sirve `dist/`.

### Endpoints

| Endpoint | Para qué |
|---|---|
| `POST /api/tkc/inventario` | Una página del catálogo. Búsqueda, orden y paginación las resuelve TKC |
| `POST /api/tkc/existencias` | Desglose EF/A/T de varios productos a la vez |
| `POST /api/tkc/existencia` | Desglose de un solo producto (para el hover) |

### Por qué el desglose va aparte

El listado de TKC solo trae la cantidad total. El reparto entre existencia
física, almacén y tienda (**EF / A / T**) únicamente lo publica el *submayor*, y
producto por producto. Sin ese reparto no se puede clasificar el estado de un
anuncio.

La solución está en `services/tkc/existencias.js`: el servidor construye en
segundo plano un mapa del almacén completo y lo cachea. La primera consulta de
cada almacén espera a la primera página; las demás salen del caché. Mientras el
mapa se completa, la respuesta trae `progreso.listo = false` y faltan ids — el
cliente debe volver a preguntar, y por eso las pantallas reintentan cada 2 s y
muestran `…` en las columnas pendientes.

### Consecuencia de diseño: la paginación

TKC pagina **del lado del servidor**. Eso significa que cualquier filtro que no
sepa resolver TKC (por ejemplo "muéstrame los anuncios muertos") solo puede
aplicarse sobre la página que ya se trajo, no sobre el catálogo entero. La
pestaña de detección de anuncios trabaja así y lo dice explícitamente en la UI.
Un barrido completo exigiría recorrer todas las páginas y acumular.

## Sincronización TKC → Supabase

Aparte de la consulta en vivo, los productos se copian a la tabla `productos`:

- **Manual**, desde Configuración o el catálogo (`syncService.js`).
- **Automática**, con la Edge Function `supabase/functions/sync-auto` (Deno),
  que corre por cron y respeta los horarios y la zona horaria que cada usuario
  configuró en `usuarios.sync_config`.

Ambas rutas terminan en la función `sync_productos_bulk`, que hace el upsert
masivo. Para que el cron y un sync manual no escriban el mismo almacén a la vez,
la función toma un *advisory lock* por almacén (migración v35).

## Notificaciones

Dos mecanismos distintos:

- **De flujo** (`workflowService.js`): cada transición de estado escribe en
  `workflow_eventos` y crea una notificación dirigida a quien le toca actuar.
- **Inteligentes** (`notificationService.js`): un barrido periódico que avisa de
  situaciones acumuladas — lotes vencidos, críticos o próximos, stock bajo,
  pendientes de facturación o de CA, devueltos, reconteos, diferencias de
  recepción y usuarios por aprobar.

Las inteligentes se deduplican con una clave `categoria_fecha`, de modo que cada
categoría avisa **una vez al día**. La clave no incluye el contador a propósito:
cuando lo incluía, cualquier cambio en la cuenta generaba una notificación nueva
y la bandeja se llenaba de duplicados.

## Pruebas

```
src/__tests__/
├── lib/        anuncioEstado, security, notificationService, hooks
├── components/ MermaForm, InventarioForm, ReporteVencimientos
├── services/   tkc, tkcExistencias, syncService
├── server/     tkcApi
└── layout/     AppHeader, NotifDropdown
```

El criterio ha sido extraer la lógica pura de los formularios (por ejemplo
`validateMerma`, `validateInventario`, `calcEstadoAnuncio`) para poder probarla
sin renderizar el componente.
