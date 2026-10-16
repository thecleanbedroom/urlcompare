# web — Next.js frontend (standalone output).
# Build context must be the REPO ROOT (workspace deps).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-logic/package.json ./packages/shared-logic/
COPY packages/mcp-server/package.json ./packages/mcp-server/
COPY packages/api-server/package.json ./packages/api-server/
RUN npm ci

FROM deps AS build
# Rewrites are serialized into the standalone output at build time,
# so the API upstream must be a build arg, not a runtime env.
ARG API_URL=http://api:3001
ENV API_URL=$API_URL
COPY tsconfig.json ./
COPY packages/shared-types ./packages/shared-types
COPY packages/shared-logic ./packages/shared-logic
COPY apps/web ./apps/web
RUN npm run build --workspace=web

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# Next standalone mirrors the workspace layout.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
