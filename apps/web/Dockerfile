# Web image (Next.js standalone). Build from the repo root:
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com -t acedesoft-web .
# NEXT_PUBLIC_API_URL is inlined into the browser bundle at build time, so it
# is a build argument: changing the API URL means rebuilding the image.

FROM node:24-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ─── Build ───────────────────────────────────────────────────────────────────
FROM base AS build
RUN npm install -g pnpm@10.33.0
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter web...
COPY packages packages
COPY apps/web apps/web
ARG NEXT_PUBLIC_API_URL
# Without it the bundle would silently point at http://localhost:3001.
RUN test -n "$NEXT_PUBLIC_API_URL" \
  || (echo "Falta --build-arg NEXT_PUBLIC_API_URL=https://api.tudominio.com" && exit 1)
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web build

# ─── Runtime ─────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["tini", "--"]
CMD ["node", "apps/web/server.js"]
