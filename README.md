# Inventario · Almacenes ELíneas

SPA de React (Vite) servida por un servidor Node propio (`server/index.js`) que
hace de API: datos sobre **ELINEAS_BD** (PostgreSQL), catálogo y existencias de
**TKC**, y autenticación contra el **Identity Server (IS)** de Elineas.

El navegador no habla con ninguna base ni con el IS: llama a `/api/*` del mismo
origen y la sesión viaja en cookies httpOnly.

## Autenticación

Quién entra lo decide el IS: cuenta + al menos un rol en el sistema `inventario`
(sin rol, el login responde 403). Las cuentas y contraseñas se gestionan en la
consola del IS; aquí no hay registro ni restablecimiento.

- `POST /api/auth/login` → `sign-in` del IS. Guarda el `session` token (larga
  duración) y el `jwt` (~15 min) en cookies httpOnly, y reenvía la IP real del
  cliente al IS (que limita intentos por IP y por cuenta).
- Cada petición verifica el JWT contra el JWKS del IS y lo renueva con el
  `session` token cuando caduca.
- El rol se consulta en `/api/user-roles/me` y se copia a `usuarios.role` **en
  cada login**: un cambio de rol en el IS surte efecto en el siguiente login
  (o revocando la sesión desde el IS).
- La autorización vive en `src/server/permisos.js`.
- Login con Google (opcional): flujo por redirect con PKCE a través del IS. El
  usuario debe existir ya en el IS con ese correo.

## Documentación

| | |
|---|---|
| [`docs/arquitectura.md`](docs/arquitectura.md) | Qué habla con qué y por qué el navegador no sale solo |
| [`docs/modulos.md`](docs/modulos.md) | Qué hace cada pantalla y cómo van los flujos |
| [`docs/base-de-datos.md`](docs/base-de-datos.md) | Tablas, permisos y cómo se aplican las migraciones |
| [`docs/despliegue.md`](docs/despliegue.md) | Variables, el comando de despliegue y sus trampas |
| [`docs/revision-inventario.md`](docs/revision-inventario.md) | Repaso del módulo: qué se arregló y qué queda |
| [`docs/importar-historico.md`](docs/importar-historico.md) | Propuesta para traer los conteos de los Excel |
| [`docs/migracion-supabase.md`](docs/migracion-supabase.md) | El salto desde Supabase, decisión a decisión |

## Variables de entorno

Copia `.env.example` a `.env` y rellénalo. Todo lo lee el servidor en runtime;
el bundle del navegador no incrusta ninguna variable.

| Variable | Para qué |
|---|---|
| `AUTH_API_URL` | URL base del IS, alcanzable desde el servidor |
| `SYSTEM_SLUG` | Slug del sistema en el IS (`inventario`) |
| `AUTH_PUBLIC_URL` | URL del IS vista desde el navegador (login con Google); por defecto `AUTH_API_URL` |
| `APP_URL` | Origen público de esta app; debe estar en `GOOGLE_REDIRECT_ORIGINS` del IS |
| `DATABASE_URL` | ELINEAS_BD como `elineas_backend_app` (solo DML) |
| `TKC_BASE`, `TKC_USER`, `TKC_PASS` | Credenciales de servicio de TKC |
| `TRANSFERENCIAS_API_URL` | Base de la API de elineas-transferencia (ajustes de aumento y disminución) |
| `TKC_SECRET_KEY` | Sella la cookie `tkc` con las credenciales de TKC de cada persona (`openssl rand -base64 32`) |
| `TKC_HANDOFF_KEY` | Clave compartida con elineas-transferencia para mandarle esas credenciales; distinta de `TKC_SECRET_KEY` |

## Desarrollo

```bash
bun install
bun run dev        # http://localhost:5173
bun run test
```

`vite-plugin-tkc.js` monta las APIs (`/api/auth`, `/api/datos`, `/api/sync`,
`/api/tkc`) dentro del propio proceso de Vite.

Con Docker:

```bash
docker compose -f docker-compose.dev.yml up --build
```

El código se monta desde el host, así que los cambios recargan en caliente sin
reconstruir.

## Producción

Build estático + `server/index.js` en el puerto **3003**:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Imagen en tres etapas con Bun: Vite construye `dist/`, y la etapa final lleva el
build, el servidor y un `node_modules` mínimo (`pg` y `jose`). El contenedor
entra a la red externa `elineas_default` para llegar a `ELINEAS_BD` por nombre.

Cada compose usa su propio nombre de proyecto (`inventario-dev` /
`inventario-prod`), así que ambos pueden correr a la vez sin pisarse.
