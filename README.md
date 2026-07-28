# Inventario ELíneas

Sistema de gestión de inventario para los almacenes de ELíneas. Sincroniza productos desde TKC (sistema externo), permite realizar conteos físicos, registrar mermas, gestionar lotes con vencimientos y generar reportes.

---

## Módulos

| Módulo | Descripción |
|---|---|
| **Dashboard** | Resumen de KPIs: stock, mermas, movimientos recientes |
| **Productos** | Catálogo de productos por almacén, sincronizados desde TKC |
| **Inventario** | Conteos físicos, historial de movimientos |
| **Mermas** | Registro y seguimiento de pérdidas por almacén |
| **Lotes** | Control de lotes con fechas de vencimiento |
| **Recepciones** | Registro de entrada de mercancía |
| **Reportes** | Exportación PDF de inventarios y movimientos |
| **Supervisión** | Vista consolidada multi-almacén para jefes |
| **BD TKC** | Visualización directa de la base externa de TKC |
| **Notificaciones** | Alertas de vencimientos, stock bajo, workflows |
| **Admin Usuarios** | Gestión de cuentas y roles |
| **Configuración** | Almacenes activos, sync automático, parámetros |
| **Auditoría** | Log de acciones de usuarios |
| **Super Admin** | Herramientas de diagnóstico y control total |

---

## Stack

- **Frontend**: React 18, Vite, Tailwind CSS, shadcn/ui (Radix UI)
- **Estado**: TanStack React Query
- **Auth / DB**: Supabase (PostgreSQL + RLS)
- **Sync externo**: Supabase TKC (segundo proyecto — solo lectura)
- **PDF**: jsPDF + html2canvas
- **Escaneo**: ZXing (código de barras por cámara)
- **Tests**: Vitest + Testing Library

---

## Roles

| Rol | Acceso |
|---|---|
| `superadmin` | Acceso completo + herramientas de diagnóstico |
| `administrador` | Gestión de almacén, usuarios, reportes |
| `inv` | Conteos de inventario y mermas |
| `jefe_depto` | Supervisión multi-almacén (solo lectura) |

---

## Variables de entorno

Crear un archivo `.env.local` en la raíz:

```env
# Base de datos principal (app)
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>

# Base de datos externa TKC (solo lectura — fuente de productos)
VITE_SUPABASE_EXTERNA_URL=https://<tkc-project-ref>.supabase.co
VITE_SUPABASE_EXTERNA_ANON_KEY=<tkc-anon-key>
```

---

<<<<<<< HEAD
## Instalación y desarrollo
=======
## Docker

Un solo `Dockerfile` con dos destinos. Antes de construir, el `.env` del
directorio debe tener las `VITE_*`: docker compose las interpola como build args
y Vite las incrusta en el bundle.

**Desarrollo** — Vite dev server con HMR, `http://localhost:5173`:

```bash
docker compose up --build
```

El código se monta desde el host, así que los cambios recargan en caliente sin
reconstruir.

**Producción** — `dist/` servido por nginx en el puerto **3003**:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

La app en esta rama es un SPA estático sin servidor propio, así que la imagen
final es nginx (unprivileged, corre como uid 101) sobre `dist/`: fallback SPA a
`index.html`, gzip, y caché inmutable solo para `/assets/` —que llevan hash en el
nombre— con `no-cache` en `index.html`. El Caddy externo del servidor le hace
proxy al 3003.

Tras cambiar una `VITE_*` hay que **reconstruir** (`--build`), no basta
reiniciar: el valor viaja dentro del bundle, no en el entorno del contenedor.

Cada compose usa su propio nombre de proyecto (`inventario-dev` /
`inventario-prod`), así que ambos pueden correr a la vez sin pisarse.

## Docker

Copia `.env.example` a `.env` y rellena las variables antes de construir: las
`VITE_*` se incrustan en el bundle al construir la imagen de producción, y las
`TKC_*` las lee el servidor en runtime.

**Desarrollo** — Vite dev server con HMR, `http://localhost:5173`:

```bash
docker compose -f docker-compose.dev.yml up --build
```

El código se monta desde el host, así que los cambios recargan en caliente sin
reconstruir. La API de TKC (`/api/tkc/*`) la sirve `vite-plugin-tkc.js` dentro
del propio proceso de Vite.

**Producción** — build estático + `server/index.js` en el puerto **3003**:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Imagen en dos etapas: Vite construye `dist/`, y la etapa final solo lleva Node,
el build y el servidor (sin `node_modules`: ese código usa únicamente módulos
nativos de Node). Tras cambiar una `VITE_*` en el `.env` hay que **reconstruir**
—no basta reiniciar—, porque su valor viaja dentro del bundle.

Cada compose usa su propio nombre de proyecto (`inventario-dev` /
`inventario-prod`), así que ambos pueden correr a la vez sin pisarse.

**Publish your changes**
>>>>>>> 98a41de (Initial commit: add Docker support for development and production environments)

```bash
# Instalar dependencias
npm install

# Servidor de desarrollo
npm run dev

# Build de producción
npm run build

# Tests
npm test
```

---

## Sincronización de productos (TKC → App)

Los productos se sincronizan desde TKC por almacén usando la RPC `sync_productos_bulk`. El proceso:

1. Descarga todos los productos del almacén desde TKC (paginado, 1000 filas/request)
2. Deduplica por `codigo_producto` dentro del batch
3. Ejecuta upsert masivo por `(almacen_num, codigo_producto)` — nunca hace DELETE para preservar el historial de movimientos
4. Al finalizar cada almacén, llama a `deactivate_stale_sync` para marcar como inactivos los productos que ya no existen en TKC

Las migraciones SQL están en [`supabase/`](supabase/). La migración activa del sync es `migration_v24_sync_por_codigo.sql`.

---

## Estructura del proyecto

```
src/
├── api/          # Clientes Supabase (app + TKC externo)
├── components/   # Componentes reutilizables y UI (shadcn)
├── lib/          # Hooks, contextos, utilidades
├── pages/        # Páginas por módulo
├── services/     # syncService (lógica de sync TKC)
supabase/
├── migration_v*.sql   # Migraciones en orden
├── functions/         # Edge Functions (sync automático)
├── schema.sql         # Esquema completo
```
