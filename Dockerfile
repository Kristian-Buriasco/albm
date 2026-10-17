# syntax=docker/dockerfile:1

# ---- build stage ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Toolchain for compiling better-sqlite3 when no prebuilt binary is available.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
# Version shown by the app (update badge). CI passes the release tag.
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    PORT=3200 \
    DATA_DIR=/data \
    HOSTNAME=0.0.0.0 \
    APP_VERSION=${APP_VERSION}

# Run as a non-root user; /data is the mounted volume for the DB + photos.
RUN useradd --system --uid 1001 --user-group gallery \
  && mkdir -p /data \
  && chown -R gallery:gallery /data

# The standalone output bundles the traced node_modules (incl. the native
# sharp/better-sqlite3 built for this image's platform) and the drizzle
# migrations. Copy static assets and the hash-password helper alongside.
COPY --from=build --chown=gallery:gallery /app/.next/standalone ./
COPY --from=build --chown=gallery:gallery /app/.next/static ./.next/static
COPY --from=build --chown=gallery:gallery /app/public ./public
COPY --from=build --chown=gallery:gallery /app/scripts ./scripts
# scripts/migrate-derivatives and backup-db-to-r2 import it; standalone tracing only keeps what the app bundles
COPY --from=build --chown=gallery:gallery /app/node_modules/aws4fetch ./node_modules/aws4fetch

USER gallery
EXPOSE 3200
VOLUME ["/data"]

# Basic healthcheck: DB reachable via /api/health once migrations applied.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3200)+'/api/health').then(r=>r.json().then(j=>process.exit(j.ok?0:1))).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
