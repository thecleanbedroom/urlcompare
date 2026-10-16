# urlCompare — agent notes

npm workspaces monorepo (`apps/*`, `packages/*`).

## Layout

- `apps/web` — Next.js 16 frontend. No API routes; `/api/*` rewrites to `API_URL` (default `http://localhost:3001`). `transpilePackages` pulls `shared-types`/`shared-logic` source directly.
- `packages/api-server` — Hono REST + `/mcp` MCP mount. Prisma/SQLite, in-process job runners via `runner.ts`. `prisma.config.ts` is required (Prisma 7).
- `packages/mcp-server` — MCP surface. `spec/urlcompare.py` is the source of truth; `generated/` is toolkit output (never hand-edit). `src/handlers.ts` maps tool args → `UrlCompareService`. `src/http-client.ts` is the REST-backed impl for stdio.
- `packages/shared-types` — domain types, Zod request schemas, `UrlCompareService` interface.
- `packages/shared-logic` — pure logic: `checkUrlStatus`, `DomainCrawler`, `collectSitemapUrls`, `canonicalizeUrl`, `mergeUrlSources`, `gsc`/`gscSites`, `exportCsv/Json/Html`.

## Commands

- Dev: `npm run dev:api`, `npm run dev:web` (two terminals)
- Tests: `npm test` (vitest workspaces) — shared-logic, api-server, mcp-server have suites
- Typecheck: `npm run typecheck` — **must stay clean** (web `ignoreBuildErrors` was removed; don't re-add)
- Lint: `npm run lint:web`
- Prod bundle: `npm run build:api` → `packages/api-server/dist/server.mjs`
- DB: `npm run db:migrate|db:deploy --workspace=api-server`; `tsx packages/api-server/scripts/migrate-legacy.ts` for pre-monorepo `CrawlJob` rows
- Docker: `docker compose up --build` (build context = repo root)

## Conventions

- Workspace packages are **source-only** (exports point at `src/*.ts`); consumers bundle them. `api-server` esbuild-bundles workspace code, externalizing `@prisma/client`, `.prisma`, `better-sqlite3`.
- REST responses are `{data} | {error, message?, hint?}` — keep that shape; new list endpoints add `total`/`offset`/`limit`.
- `getGoogleAccessToken()` throws `GscNotConnectedError` (`gsc_not_connected` code + `hint`) — preserve the contract, MCP relies on it.
- SSRF: `isUrlSafe()` in shared-logic gates every outbound fetch (crawler, sitemap, checker) — never bypass.
- MCP spec changes: edit `spec/urlcompare.py`, then `mcp-toolkit validate` + `generate -o generated/` (+ `--target server-code` for the zod stubs). Handlers stay hand-written.
- Prisma 7: `migrate diff` uses `--from-schema`/`--to-schema` (the old `--to-schema-datamodel` flag is gone).

## Gotchas

- `DomainCrawler` assigns `this.options` before normalizing the seed URL — keep that order.
- Crawler default `queryPolicy: 'deny'` + empty key list preserves legacy keep-all-query behavior.
- `CrawlJob` table still exists for `migrate-legacy.ts` — drop via follow-up migration once legacy data is migrated.
- Docker: web's `API_URL` is a **build arg** (rewrites bake into standalone output). `prisma generate` writes into `node_modules` — runtime images must copy `node_modules` from the build stage.
- `CrawlJob`-era dev data lives in `packages/api-server/db/custom.db` (untracked; recreated by migrations if deleted).
