# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/demo-game/package.json apps/demo-game/package.json
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build --workspace @ble-bridge/web
RUN npm prune --omit=dev --workspaces

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    WEB_DIST_DIR=/app/apps/web/dist
WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/apps/web/dist ./apps/web/dist

EXPOSE 8787
USER node
CMD ["node", "apps/server/src/server.js"]
