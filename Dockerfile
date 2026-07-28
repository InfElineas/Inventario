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
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SUPABASE_EXTERNA_URL
ARG VITE_SUPABASE_EXTERNA_ANON_KEY
ARG VITE_BASE44_APP_ID
ARG VITE_BASE44_APP_BASE_URL
ARG VITE_BASE44_FUNCTIONS_VERSION

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
