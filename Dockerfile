<<<<<<< HEAD
# syntax=docker/dockerfile:1
#
# Un solo Dockerfile con dos destinos, igual que en elineas-vd:
#   target: dev   — Vite dev server con HMR (docker-compose.yml).
#   target: prod  — `dist/` servido por nginx en el 3003 (docker-compose.prod.yml).
#
# En esta rama la app es un SPA estático puro: no hay servidor propio (`server/`
# y `vite-plugin-tkc.js` viven en la rama feat-fetch-tkc), y `src/` no llama a
# ninguna ruta `/api`. Por eso la imagen de producción es nginx sobre `dist/` y
# no un runtime de Node.

ARG NODE_VERSION=24-alpine
ARG NGINX_VERSION=1.29-alpine

# ---- base: runtime de Node, compartido por las etapas de build ----
FROM node:${NODE_VERSION} AS base
WORKDIR /app

# ---- deps: instala dependencias; cacheado mientras no cambien los manifiestos ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=npm-cache,target=/root/.npm \
    npm ci

# ---- dev: deps + código, hot reload vía bind mount (ver docker-compose.yml) ----
FROM deps AS dev
ENV NODE_ENV=development
# Copia de respaldo: permite `docker run` sin mount, aunque el flujo normal sea
# el bind mount del compose.
COPY . .
EXPOSE 5173
# --host expone el servidor en 0.0.0.0; si no, Vite escucha solo en el
# localhost del contenedor y el puerto publicado no responde.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---- build: genera dist/ ----
FROM deps AS build

# Vite incrusta las VITE_* en el bundle al construir, así que hacen falta AQUÍ,
# no en runtime. Cambiar una en el `.env` obliga a reconstruir la imagen.
=======
# Imagen de PRODUCCIÓN.
#
# Dos etapas:
#   1. `build`   — instala dependencias y genera `dist/` con Vite.
#   2. `runtime` — solo Node + el build + el servidor de `server/index.js`.
#
# La etapa final no lleva `node_modules`: `server/index.js` y todo
# `src/services/tkc/*` usan únicamente módulos nativos de Node (comprobado:
# ningún import externo), así que la imagen se queda en Node + código propio.
#
# Las variables VITE_* se incrustan en el bundle al construir, por eso llegan
# como ARG. Los secretos de TKC NO: los lee el servidor en runtime desde el
# entorno del contenedor (ver docker-compose.prod.yml).

# ─────────────────────────── 1. build ───────────────────────────
FROM node:24-alpine AS build

WORKDIR /app

# Copiar solo los manifiestos primero: la capa de `npm ci` se reaprovecha
# mientras no cambien las dependencias.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

>>>>>>> 3b1c6a9 (feat(docker): add Docker support for development and production environments)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SUPABASE_EXTERNA_URL
ARG VITE_SUPABASE_EXTERNA_ANON_KEY
ARG VITE_BASE44_APP_ID
ARG VITE_BASE44_APP_BASE_URL
ARG VITE_BASE44_FUNCTIONS_VERSION

<<<<<<< HEAD
COPY . .
RUN npm run build

# ---- prod: nginx sirviendo el build estático ----
# Imagen unprivileged: nginx corre como usuario 101, sin root ni en el master.
# El 3003 es un puerto alto, así que no necesita privilegios para bindear.
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION} AS prod

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:3003/"]
=======
RUN npm run build

# ────────────────────────── 2. runtime ──────────────────────────
FROM node:24-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3003

# `type: module` vive en package.json: sin él Node no trata los .js como ESM.
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src/server ./src/server
COPY src/services/tkc ./src/services/tkc

# Usuario sin privilegios que ya trae la imagen oficial.
USER node

EXPOSE 3003

# Healthcheck contra el propio servidor; si `dist/` faltara devolvería 500.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3003)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
>>>>>>> 3b1c6a9 (feat(docker): add Docker support for development and production environments)
