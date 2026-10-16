# api-server — Hono API + MCP mount + job runners.
# Build context must be the REPO ROOT (workspace deps).

FROM node:22-alpine AS deps
RUN apk add --no-cache openssl python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-logic/package.json ./packages/shared-logic/
COPY packages/mcp-server/package.json ./packages/mcp-server/
COPY packages/api-server/package.json ./packages/api-server/
RUN npm ci

FROM deps AS build
COPY tsconfig.json ./
COPY packages/shared-types ./packages/shared-types
COPY packages/shared-logic ./packages/shared-logic
COPY packages/mcp-server ./packages/mcp-server
COPY packages/api-server ./packages/api-server
WORKDIR /app/packages/api-server
RUN npx prisma generate && npm run bundle

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
# node_modules must come from the build stage — prisma generate
# writes the client into node_modules/.prisma there.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY package.json ./
WORKDIR /app/packages/api-server
ENV PORT=3001 HOST=0.0.0.0 DATABASE_URL=file:/app/db/custom.db
EXPOSE 3001
# Apply migrations, then serve — /api/* + /mcp on one port.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.mjs"]
