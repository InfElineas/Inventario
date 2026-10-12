# Inventario ELíneas

Sistema de gestión de inventario para **ELíneas** (mercadoelineas.com): conteos,
mermas, vencimientos, recepciones y anuncios de tienda online, con flujos de
aprobación por rol (inventarista → facturación → auditor) y sincronización
contra **TKC**, el sistema externo de inventario de la empresa.

SPA de React servida por Vite, con **Supabase** (Postgres + Auth + RLS) como
backend de datos y un pequeño servidor **Express** que hace de pasarela hacia
TKC.

## Documentación

| Documento | Contenido |
|---|---|
| [docs/arquitectura.md](docs/arquitectura.md) | Estructura del código, capas, autenticación, integración con TKC |
| [docs/modulos.md](docs/modulos.md) | Cada módulo funcional, roles y máquinas de estado |
| [docs/base-de-datos.md](docs/base-de-datos.md) | Tablas, RLS, triggers y el historial de migraciones |
| [docs/despliegue.md](docs/despliegue.md) | Variables de entorno, Docker, despliegue y sus requisitos |

## Stack

- **React 18** + **Vite 6** + **React Router 6**
- **TanStack React Query** para el estado del servidor
- **Supabase JS** (Postgres, Auth, RLS)
- **Radix UI** + **Tailwind CSS**
- **Vitest** + Testing Library
- **Express** (`server/index.js`) solo para la pasarela de TKC

## Arranque rápido

```bash
npm install
```

Crea un `.env` en la raíz:

```
VITE_SUPABASE_URL=https://<proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_SUPABASE_EXTERNA_URL=https://<proyecto-externo>.supabase.co
VITE_SUPABASE_EXTERNA_ANON_KEY=<anon key externa>
TKC_BASE=<url de TKC>
TKC_USER=<usuario>
TKC_PASS=<password>
```

Las `VITE_*` se incrustan en el bundle al construir; las `TKC_*` las lee el
servidor en runtime y nunca llegan al navegador. Detalle completo en
[docs/despliegue.md](docs/despliegue.md).

```bash
npm run dev     # http://localhost:5173
```

La base de datos necesita las migraciones aplicadas. Ver
[docs/base-de-datos.md](docs/base-de-datos.md).

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo de Vite con HMR |
| `npm run build` | Build de producción en `dist/` |
| `npm run preview` | Sirve el build localmente |
| `npm start` | Levanta `server/index.js` (sirve `dist/` + `/api/tkc/*`) |
| `npm test` | Suite de Vitest |
| `npm run test:watch` | Vitest en modo watch |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc` sobre `jsconfig.json` |

## Estado de las pruebas

15 archivos de test, 233 tests. Cubren la clasificación de anuncios, las
validaciones de mermas e inventario, el servicio de notificaciones, la
sanitización de errores y permisos, los hooks compartidos y la integración con
TKC.

```bash
npm test
```
