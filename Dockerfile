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

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SUPABASE_EXTERNA_URL
ARG VITE_SUPABASE_EXTERNA_ANON_KEY
ARG VITE_BASE44_APP_ID
ARG VITE_BASE44_APP_BASE_URL
ARG VITE_BASE44_FUNCTIONS_VERSION

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
