# API image. Build from the repo root (the pnpm workspace):
#   docker build -f apps/api/Dockerfile -t acedesoft-api .
# On start it applies pending migrations, then boots the API.

FROM node:24-bookworm-slim AS base
# openssl: Prisma query engine. tini: forwards SIGTERM so shutdown is clean.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.33.0
WORKDIR /app

# Manifests only, so the dependency layers are cached until they change.
FROM base AS manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY apps/api/package.json apps/api/

# ─── Build: all deps, generate the client, compile ───────────────────────────
FROM manifests AS build
RUN pnpm install --frozen-lockfile --filter api...
COPY packages/config packages/config
COPY apps/api apps/api
RUN pnpm --filter api exec prisma generate && pnpm --filter api build

# ─── Production deps only (prisma CLI included, for migrate deploy) ──────────
FROM manifests AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter api
COPY apps/api/prisma apps/api/prisma
RUN pnpm --filter api exec prisma generate

# ─── Runtime ─────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps --chown=node:node /app /app
COPY --from=build --chown=node:node /app/apps/api/dist /app/apps/api/dist
WORKDIR /app/apps/api
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||process.env.API_PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["tini", "--"]
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/main"]
