# Despliegue

## Variables de entorno

Van todas en un `.env` en la raíz. Se dividen en dos grupos con ciclos de vida
distintos:

| Variable | Grupo | Para qué |
|---|---|---|
| `VITE_SUPABASE_URL` | bundle | Proyecto Supabase principal |
| `VITE_SUPABASE_ANON_KEY` | bundle | Clave anónima del principal |
| `VITE_SUPABASE_EXTERNA_URL` | bundle | BD externa, origen del sync |
| `VITE_SUPABASE_EXTERNA_ANON_KEY` | bundle | Clave anónima de la externa |
| `TKC_BASE` | runtime | URL base de TKC |
| `TKC_USER` | runtime | Usuario de TKC |
| `TKC_PASS` | runtime | Contraseña de TKC |

**Las `VITE_*` se incrustan en el bundle al construir.** Cambiarlas obliga a
**reconstruir**; reiniciar el proceso no basta. Y son públicas por definición:
cualquiera que abra la aplicación puede leerlas. Eso es correcto para una clave
`anon` de Supabase, cuya seguridad descansa en las policies RLS — nunca pongas
ahí una `service_role`.

**Las `TKC_*` las lee el servidor en runtime** y no viajan al navegador. Por eso
TKC se consulta a través de la pasarela y no directamente desde el cliente.

> El `README` anterior mencionaba copiar un `.env.example`, pero ese archivo no
> existe en el repo. Usa la tabla de arriba.

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:5173
```

La API de TKC la sirve `vite-plugin-tkc.js` dentro del propio proceso de Vite,
así que `/api/tkc/*` funciona sin levantar nada más.

Con Docker:

```bash
docker compose -f docker-compose.dev.yml up --build
```

El código se monta desde el host, así que hay recarga en caliente sin
reconstruir.

## Producción

El build genera `dist/`, pero **`dist/` por sí solo no es la aplicación
completa**.

```bash
npm run build        # genera dist/
npm start            # sirve dist/ + /api/tkc/* en el puerto 3003
```

Con Docker:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Imagen en dos etapas: Vite construye `dist/` y la etapa final solo lleva Node,
el build y el servidor. No incluye `node_modules` porque `server/` usa
únicamente módulos nativos de Node.

Cada compose usa su propio nombre de proyecto (`inventario-dev` /
`inventario-prod`), así que pueden convivir.

## Requisitos del hosting

Tres cosas que un hosting estático simple (FTP + Apache/Nginx sin Node) no
cubre:

### 1. Hace falta un proceso Node

El bundle llama a `/api/tkc/*` en runtime. Si solo se publica `dist/` en un
hosting estático, **todo lo que depende de TKC deja de funcionar**: la pantalla
BD TKC, las columnas EF/A/T y la pestaña de detección de anuncios. El resto de
la aplicación (lo que va contra Supabase) sí funciona.

Opciones: desplegar con `docker-compose.prod.yml`, o publicar `dist/` como
estático y levantar `server/index.js` aparte con un proxy que mande `/api` al
puerto 3003.

### 2. Reescritura para la SPA

React Router usa rutas del lado del cliente. Sin una regla de reescritura,
entrar directo a `/anuncios` o recargar ahí devuelve 404, porque el servidor
busca un archivo que no existe. Todo lo que no sea un archivo real debe servir
`index.html`.

En Apache, un `.htaccess` en la raíz del sitio:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

El repo no incluye ninguno.

### 3. Falta el favicon

`index.html` referencia `/favicon.ico`, pero no existe `dist/favicon.ico` ni una
carpeta `public/`. En producción eso es un 404 en cada carga. Es cosmético, pero
conviene añadir el archivo en `public/` para que Vite lo copie al build.

## Base de datos

Las migraciones **no se aplican solas** en el despliegue: hay que correrlas a
mano en el SQL Editor de Supabase. Un entorno nuevo, o uno que se quede atrás,
falla de formas poco obvias — por ejemplo, si falta la v37, la pantalla de
Configuración no puede guardar y el login se rompe, porque `AuthContext` pide la
columna `anuncio_config` en su `select`.

Ver [base-de-datos.md](base-de-datos.md).

## Sincronización automática

La Edge Function `supabase/functions/sync-auto` corre en Deno sobre Supabase y
se despliega aparte, con el CLI de Supabase. Necesita sus propios secretos:

| Secreto | Para qué |
|---|---|
| `SUPABASE_URL` | Proyecto destino |
| `SUPABASE_SERVICE_ROLE_KEY` | Escribir saltándose RLS |
| `EXTERNA_URL` | BD externa, origen de los datos |
| `EXTERNA_KEY` | Clave de la externa |

Se programa por cron. Cada ejecución respeta los horarios y la zona horaria que
cada usuario guardó en `usuarios.sync_config`.

## Lista de verificación

Antes de dar por desplegada una versión:

- [ ] Migraciones nuevas aplicadas en el SQL Editor
- [ ] `.env` con las siete variables; `VITE_*` correctas **antes** de construir
- [ ] `npm run build` sin errores
- [ ] `npm test` en verde
- [ ] Proceso Node sirviendo `/api/tkc/*`
- [ ] Regla de reescritura para la SPA
- [ ] Comprobar en el navegador: login, una pantalla de Supabase y una de TKC
