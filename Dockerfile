# Imagen de PRODUCCIÓN.
#
# Dos etapas:
#   1. `build`   — instala dependencias con Bun y genera `dist/` con Vite.
#   2. `runtime` — solo Bun + el build + el servidor de `server/index.js`.
#
# La etapa final no lleva `node_modules`: `server/index.js` y todo
# `src/services/tkc/*` usan únicamente módulos nativos de Node/Bun (comprobado:
# ningún import externo), así que la imagen se queda en Bun + código propio.
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

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SUPABASE_EXTERNA_URL
ARG VITE_SUPABASE_EXTERNA_ANON_KEY
ARG VITE_BASE44_APP_ID
ARG VITE_BASE44_APP_BASE_URL
ARG VITE_BASE44_FUNCTIONS_VERSION

RUN bun run build

# ────────────────────────── 2. runtime ──────────────────────────
FROM oven/bun:1-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3003

# `type: module` vive en package.json: sin él Node/Bun no tratan los .js como ESM.
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src/server ./src/server
COPY src/services/tkc ./src/services/tkc

# Usuario sin privilegios que ya trae la imagen oficial.
USER bun

EXPOSE 3003

# Healthcheck contra el propio servidor; si `dist/` faltara devolvería 500.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3003)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "server/index.js"]
