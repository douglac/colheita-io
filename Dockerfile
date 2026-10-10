# Imagem de produção do Colheita Feliz (Next.js standalone).
# 3 estágios: dependências → build → runtime pequeno (só .next/standalone + estáticos), usuário sem root.
#   docker build -t colheita-feliz --build-arg APP_VERSION=$(git rev-parse --short HEAD) .
#   docker run -p 3000:3000 -e DATABASE_URL=postgres://... colheita-feliz
#   sem Postgres (PGlite num volume): docker run -p 3000:3000 -v cf-data:/data -e PGLITE_DIR=/data/pglite colheita-feliz
ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --prefer-offline --no-audit --no-fund

FROM node:${NODE_VERSION} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Nome público e velocidade do crescimento entram no bundle do navegador: são fixados no build.
ARG NEXT_PUBLIC_GAME_NAME
ARG NEXT_PUBLIC_COMMUNITY_URL
ARG GROWTH_SPEED=1
# APP_ENV=staging mostra a faixa "versão de teste" (servidor de teste fechado).
ARG APP_ENV
ENV NEXT_PUBLIC_GAME_NAME=${NEXT_PUBLIC_GAME_NAME} NEXT_PUBLIC_COMMUNITY_URL=${NEXT_PUBLIC_COMMUNITY_URL} GROWTH_SPEED=${GROWTH_SPEED} \
    APP_ENV=${APP_ENV}
RUN npm run build

FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ARG APP_VERSION=dev
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 APP_VERSION=${APP_VERSION}
RUN apk add --no-cache tini su-exec && mkdir -p /app/.data && chown node:node /app/.data
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Sobe como root só para acertar o dono do volume do PGlite; o app roda como `node` (scripts/docker/entrypoint.sh).
COPY --chmod=755 scripts/docker/entrypoint.sh /usr/local/bin/cf-entrypoint
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--", "cf-entrypoint"]
CMD ["node", "server.js"]
