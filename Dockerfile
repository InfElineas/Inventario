# Imagen de PRODUCCIÓN.
#
# Dos etapas:
#   1. `build`   — instala dependencias con Bun y genera `dist/` con Vite.
#   2. `runtime` — solo Bun + el build + el servidor de `server/index.js`.
#
# La etapa final lleva un `node_modules` mínimo: desde la migración a
# PostgreSQL propio + Identity Server, el servidor necesita `pg` (cliente de
# base de datos) y `jose` (verificación del JWT contra el JWKS). El resto del
# código propio sigue usando solo módulos nativos, y las dependencias del
# frontend ya viajan compiladas dentro de `dist/`.
#
# Las variables VITE_* se incrustan en el bundle al construir, por eso llegan
# como ARG. Los secretos de TKC NO: los lee el servidor en runtime desde el
# entorno del contenedor (ver docker-compose.prod.yml).

# ─────────────────────────── 1. build ───────────────────────────
FROM oven/bun:1-alpine AS build

WORKDIR /app

# Copiar solo los manifiestos primero: la capa de `bun install` se reaprovecha
# mientras no cambien las dependencias.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .


RUN bun run build

# ──────────────────── 2. dependencias del servidor ────────────────────
# Manifiesto propio y mínimo: así la imagen final no arrastra las dependencias
# del frontend, que ya están compiladas en dist/.
FROM oven/bun:1-alpine AS serverdeps

WORKDIR /app
COPY docker/server-deps.package.json ./package.json
RUN bun install --production

# ────────────────────────── 3. runtime ──────────────────────────
FROM oven/bun:1-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3003

# `type: module` vive en package.json: sin él Node/Bun no tratan los .js como ESM.
COPY package.json ./
COPY --from=serverdeps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src/server ./src/server
COPY src/services/tkc ./src/services/tkc
# session.js importa ../lib/roles.js para resolver el rol que devuelve el IS.
# Es el único archivo de src/lib que necesita el servidor; sin él el contenedor
# muere al arrancar buscando el módulo.
COPY src/lib/roles.js ./src/lib/roles.js

# Usuario sin privilegios que ya trae la imagen oficial.
USER bun

EXPOSE 3003

# Healthcheck contra el propio servidor; si `dist/` faltara devolvería 500.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3003)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "server/index.js"]
