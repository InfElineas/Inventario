# Despliegue

## Dónde vive

| | |
|---|---|
| Servidor | `soporte@soporte-H510M-H-V2` |
| Repositorio | `/home/soporte/servidor/proyectos/Inventario-migracion` |
| Compose | `docker-compose.prod.yml` (el `docker-compose.yml` es el de desarrollo) |
| Servicio | **`inventario`** |
| Contenedor e imagen | `inventario-prod` |
| Puerto | 3003 del host, a donde enruta cloudflared `inv.mercadoelineas.com` |

El servicio **no puede llamarse `app`**. El nombre de un servicio es alias DNS
en cada red a la que se une, y nos unimos a `elineas-transferencia_default`
para alcanzar su API: con `app`, su proxy empezaba a descubrirnos como una de
sus réplicas y aparecían 502 intermitentes en su lado.

El Caddy del servidor tiene una regla para este dominio pero está puenteado:
el tráfico entra por el túnel y no pasa por él.

## Variables de entorno

Todas las lee el **servidor** en runtime, desde el `.env` del proyecto. El
navegador no recibe ninguna.

| Variable | Para qué |
|---|---|
| `AUTH_API_URL`, `SYSTEM_SLUG` | Identity Server y el sistema donde se piden los roles |
| `APP_URL` | Origen público de esta app, para el login con Google |
| `DATABASE_URL` | ELINEAS_BD como `elineas_backend_app`, por nombre de contenedor |
| `TKC_BASE`, `TKC_USER`, `TKC_PASS` | La cuenta de servicio de TKC |
| `TKC_SECRET_KEY`, `TKC_HANDOFF_KEY` | Cifrado de las credenciales de TKC por sesión |
| `TRANSFERENCIAS_API_URL` | elineas-transferencia: ajustes, tienda, procesos |
| `REAB_API_URL`, `REAB_USER`, `REAB_PASS` | apireab: pedidos de compra |
| `REPORTES_API_URL` | elineas-api. **Otra aplicación**, otro contenedor |

El error más fácil de cometer: apuntar `REPORTES_API_URL` a la de
transferencias. La ruta no existe allí y responde un 406 que desde fuera
parece un problema de permisos.

## Desarrollo

```bash
bun install
bun run dev        # Vite en 5173, con la API montada como middleware
bun run lint
bun run test -- --run
bun run build
```

El entorno local **no alcanza la base ni el Identity Server**: el login
responde 503. Sirve para compilar, para las pruebas y para mirar maquetación,
no para probar pantallas con datos.

## Producción

```bash
cd /home/soporte/servidor/proyectos/Inventario-migracion && git pull && \
  docker compose -f docker-compose.prod.yml up -d --build inventario
```

Si el cambio trae migración, va **antes** del `up`:

```bash
docker exec -i ELINEAS_BD psql -U elineasadmin -d ELINEAS_BD \
  -v ON_ERROR_STOP=1 < supabase/<archivo>.sql
```

`up --build` sustituye el sistema en vivo y pisa la imagen vieja. Para poder
volver atrás, antes:

```bash
docker tag inventario-prod inventario-prod:respaldo
```

## Por qué hace falta un proceso Node

No se puede servir como sitio estático. `server/index.js` sirve el build de
`dist/` **y** monta la misma cadena de API que usa Vite en desarrollo:

```
auth → datos → sync → transferencias → tkc → estáticos de dist/
```

Sin ese proceso, `/api/*` responde 404 y no funciona nada: ni el login, ni el
catálogo, ni los ajustes. Cualquier ruta que no sea un archivo real cae en
`index.html`, que es lo que necesita una SPA.

El contenedor corre **de solo lectura**, sin root ni capacidades, con `/tmp`
en memoria y límites de 512 MB y 1 CPU. No se puede escribir en disco: lo que
haya que guardar va a la base.

## Redes

```
inventario ── elineas_default                 → ELINEAS_BD, por nombre
           └─ elineas-transferencia_default   → su API, por nombre
```

Entrar en la red de otro tiene un precio: el nombre del servicio pasa a ser un
alias DNS ahí dentro. Cuidado al añadir más redes ajenas.

## Lista de verificación

1. `bun run lint`, `bun run test -- --run` y `bun run build`, los tres limpios.
2. Commit y push.
3. ¿Hay `.sql` nuevo en `supabase/`? Aplicarlo primero.
4. `git pull` y `up -d --build inventario`.
5. Abrir la web y mirar la consola del navegador.
6. Si algo falla: `docker logs --tail 50 inventario-prod`.
