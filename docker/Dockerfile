# Cairn: one container, one SQLite file, at ease on a Raspberry Pi 4.
# Builds for linux/amd64 and linux/arm64. From the repository root:
#   docker build -f docker/Dockerfile -t cairn .

# ---- Build: the SPA, the bundled server, and the two native modules ----
FROM node:22-alpine AS build
# Compilers only matter when a native module has no prebuilt binary for the platform.
RUN apk add --no-cache python3 make g++
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @cairn/web build && pnpm --filter @cairn/server build
# Runtime dependencies: only what the bundle leaves outside (better-sqlite3, argon2), at the locked versions.
RUN mkdir /runtime && node -e " \
  const fs = require('node:fs'); \
  const server = require('./apps/server/package.json'); \
  const pick = ['better-sqlite3', '@node-rs/argon2']; \
  const dependencies = Object.fromEntries(pick.map((name) => [name, server.dependencies[name]])); \
  fs.writeFileSync('/runtime/package.json', JSON.stringify({ name: 'cairn', private: true, type: 'module', dependencies })); \
  " \
  && cd /runtime && npm install --omit=dev --no-audit --no-fund \
  && npm cache clean --force \
  # Keep only this platform's SQLite binary; the sources are only needed to compile.
  && cd node_modules/better-sqlite3 \
  && find prebuilds -type f ! -name "linuxmusl-$(node -p process.arch).node" -delete \
  && rm -rf deps src

# ---- Run: bare Alpine (same release as the build image) plus the Node binary, not the whole Node image ----
FROM alpine:3.24 AS run
RUN apk add --no-cache libstdc++ libgcc \
  && addgroup -g 1000 node && adduser -u 1000 -G node -s /bin/sh -D node
COPY --from=build /usr/local/bin/node /usr/local/bin/node
ENV NODE_ENV=production \
    PORT=3000 \
    CAIRN_DATA_DIR=/data \
    CAIRN_WEB_DIST=/app/web \
    CAIRN_MIGRATIONS_DIR=/app/drizzle
WORKDIR /app
COPY --from=build /runtime/package.json ./
COPY --from=build /runtime/node_modules ./node_modules
COPY --from=build /src/apps/server/dist/*.js ./
COPY --from=build /src/apps/server/drizzle ./drizzle
COPY --from=build /src/apps/web/dist ./web
COPY docker/cairn.sh /usr/local/bin/cairn
RUN chmod +x /usr/local/bin/cairn && mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health > /dev/null || exit 1
CMD ["node", "index.js"]
