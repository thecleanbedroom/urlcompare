# Monorepo Restructure + MCP — Implementation Plan

**Branch:** `feature/ai`
**Date:** October 16, 2026
**Reviewed:** October 16, 2026 — `PLAN.monorepo.diff.md` merged (5 critical, 10 high, 10 medium findings incorporated; pattern semantics and `maxDepth` default adjusted — see notes)
**Status:** Proposed — awaiting review
**References:** [PLAN.full.md](./PLAN.full.md) (domain scanner), [todo.urlreplace.md](./todo.urlreplace.md) (layout + crawl features), AGL monorepo (`Calculators/_Calculators/Football/AGL`), MCP toolkit (`Projects/MCP toolkit`)

---

## Overview

Restructure urlCompare from a Next.js monolith into an npm-workspaces monorepo matching the calculator-app convention (AGL): a web app, a standalone API server, shared logic packages, and a first-class MCP server. The restructure also folds in the pending discovery features — sitemap source, Google Search Console source (OAuth2), query-string policies, and editable URL sets — so the "scan → review → compare" workflow is backed by a real data model.

### Decisions (agreed)

| Decision | Choice |
|---|---|
| Web app | Keep Next.js 16 in `apps/web`; API access via `next.config.ts` rewrites (no CORS) |
| API framework | Hono 4 on `@hono/node-server` (AGL convention) |
| Monorepo tooling | npm workspaces, `apps/*` + `packages/*`, unscoped package names |
| MCP transports | Both: stateless Streamable HTTP mounted at `/mcp` on api-server, plus a stdio `bin` for local agents |
| MCP design | Spec-driven via MCP toolkit (`new-spec` → `validate` → `eval` → `generate`) |
| Discovery sources | Crawl + Sitemap + GSC (OAuth2 consent flow, `webmasters.readonly`) |
| Data model | `DiscoveryJob` → `UrlSet` → `DiscoveredUrl`; comparisons reference a reviewed set |
| API/MCP auth | Private network by default; `API_KEY` bearer required if exposed beyond the web proxy |
| Comparison URL source | Snapshot `included=true` URLs at job creation; `urlSetId` is provenance only |
| Migration | `prisma migrate` + `scripts/migrate-legacy.ts`; `db push` dev-only |
| Prisma packaging | Externalize `@prisma/client` + `better-sqlite3`; no single-file esbuild bundle |

### Key structural difference vs AGL

AGL is stateless — `apps/web` computes in-browser via `shared-logic`, and the API/MCP exist only as external surfaces. urlCompare is **stateful with long-running jobs** (crawling + checking hundreds of URLs can't run in a browser). The API server is therefore the core backend, not an optional surface, and `apps/web` must talk to it for everything except pure presentation helpers.

---

## Target Structure

```
urlcompare/
├── apps/
│   └── web/                        # Next.js 16 app (moved from repo root)
│       ├── src/{app,components,hooks,lib}
│       ├── next.config.ts          # rewrites /api/* → api-server
│       ├── package.json            # name: "web"
│       └── Dockerfile              # Next standalone build
├── packages/
│   ├── shared-types/               # DTOs, enums, zod schemas, service interface
│   ├── shared-logic/               # urlChecker, crawler, sitemap, gsc, querystring, exporters
│   ├── api-server/                 # Hono + Prisma + job runner + /mcp mount
│   │   ├── prisma/schema.prisma
│   │   └── Dockerfile
│   └── mcp-server/                 # createMcpServer(service) + stdio bin
├── docs/
├── docker-compose.yml              # api + web + db volume
├── package.json                    # workspaces + orchestration scripts
├── tsconfig.json                   # shared base + paths
└── .env.example
```

Package names are unscoped (`shared-types`, `shared-logic`, `api-server`, `mcp-server`, `web`), all `private: true`.

---

## Package Specs

### `packages/shared-types`

Shared contract: domain types **plus runtime zod schemas** consumed by web, api-server, and mcp-server. Not purely types — it has a runtime dep on `zod`. (Optional rename to `shared-contracts` deferred; keeping `shared-types` for consistency with the other apps.)

**Contents:**
- Domain types: `ResultStatus` (`'OK' | 'Missing' | 'Error' | 'Redirected'`), `ComparisonResult`, `CheckUrlConfig`, `CrawlerOptions`, `DiscoverySource` (`'crawl' | 'sitemap' | 'gsc' | 'manual'`), `QueryStringPolicy` (`'ignore' | 'allow' | 'deny'`)
- API DTOs: `ComparisonJobDto`, `DiscoveryJobDto`, `UrlSetDto`, `DiscoveredUrlDto`, `JobSummary`, response shapes for every REST route
- **`UrlCompareService` interface** — the contract both MCP transports bind to (see mcp-server)

**Zod request schemas** (moved from `src/lib/schemas.ts`, extended):

| Schema | Shape |
|---|---|
| `StartDiscoveryRequest` | `{ sourceDomain, sources: DiscoverySource[], name?, maxPages?, maxDepth?, delayMs?, includePatterns?, excludePatterns?, queryPolicy?, queryAllowKeys?, queryDenyKeys?, normalizeQuery?, ignoreAnchors? }` |
| `PatchUrlSetRequest` | `{ included?: { urlId: string; included: boolean }[]; addManualUrls?: string[] }` |
| `StartComparisonRequest` | `{ urlSetId?, sourceUrls?, newDomain, name?, config? }` — exactly one of `urlSetId`/`sourceUrls`; urlSetId with zero included URLs → `validation_failed` |
| `VerifyRequest` | `{ resultId }` — re-checks the stored sourceUrl/newDomain (keeps current `/api/verify` semantics) |
| `CheckUrlRequest`/`CheckUrlResponse` | `{ sourceUrl, newDomain, config? }` → `ComparisonResult`; applies `isUrlSafe` to both sides, `url_blocked` on SSRF (also the MCP `check_url` contract) |

**Runtime requirements:** `zod` is a real dependency (not devDep). Consumers are all ESM/TS (Next, Hono via esbuild, vitest) — no CJS consumer expected; if one appears, add a `"require"` condition + CJS build.

**Package conventions (from AGL):**
```json
"types": "./dist/index.d.ts",
"exports": { ".": {
  "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
  "default": "./src/index.ts" } }
```
Built `dist/` for real ESM imports; raw `src/*.ts` fallback so Vite/vitest/esbuild consume TS source with no build step in dev. Add subpath exports (`"./schemas"`) only if a consumer actually needs them. **Verify which condition Next.js/Turbopack resolves** — it may need `transpilePackages` or a different condition order.

### `packages/shared-logic`

Pure, DB-free, framework-free logic. Deps: `shared-types` only.

| Module | Source | Notes |
|---|---|---|
| `url-checker.ts` | `src/lib/urlChecker.ts` | `checkUrlStatus`, `isUrlSafe`, `isPrivateIPv4`, `extractPath`, `constructNewUrl` — unchanged |
| `crawler.ts` | `src/lib/crawler.ts` | `DomainCrawler` + new options: `ignoreAnchors`, `queryPolicy`, `queryKeys`, `normalizeQuery`. Defaults: `maxPages` 10 000, `maxDepth` **20** (up to 1000 accepted as explicit override with UI warning) |
| `sitemap.ts` | NEW | Fetch/parse `sitemap.xml` **and `.xml.gz`**, sitemap indexes (depth ≤3, ≤50 child sitemaps), ≤50k URLs per sitemap, timeout + backoff. `robots.txt` sitemap discovery only after `isUrlSafe` on every fetched URL |
| `canonicalize.ts` | NEW | `canonicalizeUrl()` — the single canonical form for all dedup: lowercase scheme+host, drop default ports, strip `#fragment`, apply query policy, sort query keys, consistent %-encoding. Used by crawler, sitemap, GSC merge, and `DiscoveredUrl` uniqueness |
| `querystring.ts` | NEW | `applyQueryPolicy(url, policy, allowKeys, denyKeys)`, `normalizeQuery(url)`. Exact semantics: `ignore` = strip entire query; `allow` = keep only `queryAllowKeys`; `deny` = drop `queryDenyKeys`, keep rest; normalize = sort keys, lowercase keys, drop empty values. Include/exclude patterns stay **glob** (current `matchGlob`), **exclude evaluated first** |
| `gsc.ts` | NEW | Pure Search Console API client: paged `searchanalytics.query` given an `accessToken`, returns page URLs. **No OAuth, no env, no DB** — token refresh and credential storage live in `api-server` |
| `export.ts` | `src/app/api/export/route.ts` (extracted) | `toJson`, `toCsv`, `toHtml` generators — pure transforms; keeps `escapeHtml` on every interpolated user value |
| `summary.ts` | `route.ts` `generateSummary` (extracted) | Result counting |
| `json.ts` | `src/lib/json.ts` | `toJsonString`, `safeParseJson` |
| `urlset.ts` | NEW | Merge/dedup canonicalized URLs from multiple sources; each `DiscoveredUrl` records **all** contributing sources |

Extra deps: `fast-xml-parser` (sitemap parsing), `p-limit` if concurrency limiting is factored out of the route layer.

Tests (vitest) move with the modules: `urlChecker`, `crawler`, `json` already have tests; add `sitemap`, `querystring`, `export`, `urlset`.

### `packages/api-server`

Hono 4 server, ESM, `"type": "module"`. Owns **all** state: Prisma client, SQLite, in-process job runner, abort maps.

**Layout (AGL conventions):**
```
src/
├── server.ts             # Hono app, cors, onError, notFound, /health, mounts
├── config.ts             # PORT (default 3001), DATABASE_URL, GOOGLE_*, ALLOWED_ORIGINS
├── routes/
│   ├── discovery.ts      # POST/GET/DELETE /api/discovery
│   ├── urlsets.ts        # GET/PATCH /api/urlsets[/:id]
│   ├── comparisons.ts    # POST/GET/DELETE /api/comparisons
│   ├── verify.ts         # POST /api/verify
│   ├── export.ts         # GET /api/export?jobId&format
│   └── auth-google.ts    # GET /api/auth/google/{start,callback,status}, DELETE .../disconnect
├── services/
│   ├── discovery-service.ts   # job lifecycle: create → run → persist → cancel
│   ├── comparison-service.ts  # was processComparisonJob; snapshots UrlSet at create
│   ├── urlset-service.ts
│   ├── google-auth-service.ts # OAuth start/callback/status/disconnect + token refresh
│   └── index.ts               # assembles UrlCompareService impl (injected into MCP)
├── lib/
│   ├── db.ts             # Prisma client singleton
│   ├── http.ts           # badRequest, notFound, formatIssues, startTiming
│   ├── auth.ts           # API_KEY bearer middleware (when configured)
│   └── runner.ts         # in-process background runner + AbortController registry
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── scripts/migrate-legacy.ts # one-shot CrawlJob → DiscoveryJob data migration
└── tests/api.test.ts     # vitest, app.request() — no listening socket
```

**Exposure & auth:** private by default — bind `127.0.0.1` in dev, internal compose network in Docker; web reaches it via Next rewrites. If `api-server` is exposed beyond the web proxy (including `/mcp`), all routes except `GET /health` require `Authorization: Bearer ${API_KEY}`. Rationale: crawl endpoints are an SSRF surface and job data is not public.

**Response envelope:** adopt AGL's `{ success: true, result, metadata: { processingTimeMs } }` / `{ success: false, error }`. (Breaking change vs current `{error}` shapes — acceptable; web is the only consumer and moves with it.)

**Dev:** `scripts/dev.mjs` esbuild watch+restart (copy from AGL). **Prod:** esbuild bundle → `server.mjs`, but **`@prisma/client`, generated output, and `better-sqlite3` stay external** — the native `.node` module can't be bundled (this is what actually breaks under esbuild on Prisma 7; there is no Rust engine to ship). Copy `node_modules/.prisma` + `@prisma/client` + `better-sqlite3` into the runtime image, or `prisma generate` in the image with prod deps present. `DATABASE_URL` resolved relative to package root, not `process.cwd()` (fixes current fragility).

### `packages/mcp-server`

`@modelcontextprotocol/sdk` (^1.30+). Exports two entry points:

```typescript
// src/index.ts — HTTP mount (AGL pattern)
export function createMcpServer(service: UrlCompareService): Server
export async function handleMcpRequest(req: Request, service): Promise<Response>
//   stateless: WebStandardStreamableHTTPServerTransport,
//   sessionIdGenerator: undefined, enableJsonResponse: true, fresh Server per request

// src/bin/stdio.ts — bin entry ("urlcompare-mcp")
//   wraps service = new HttpUrlCompareService(process.env.URLCOMPARE_API_URL)
//   server.connect(new StdioServerTransport())
```

`UrlCompareService` has **two implementations** of one interface (defined in `shared-types`):
- `api-server/services/` — in-process, direct DB (used by HTTP mount)
- `mcp-server/src/http-service.ts` — thin fetch client over REST (used by stdio bin; also usable against remote deployments)

This dogfoods the REST API and keeps `mcp-server` a pure, testable surface.

### `apps/web`

The current Next.js app, moved intact. Changes after the move:

- `next.config.ts`: `rewrites()` → `/api/:path*` → `http://localhost:3001/api/:path*` (dev) / `http://api:3001/api/:path*` (compose). Browser stays same-origin; no CORS.
- Remove `src/app/api/**` entirely — all route handlers move to api-server
- `src/lib/{urlChecker,crawler,schemas,json,db}.ts` deleted; imports repointed to `shared-logic`/`shared-types` where the client genuinely needs them (types, filter helpers); `polling.ts`, `status.tsx`, hooks stay
- `transpilePackages: ['shared-types', 'shared-logic']` if Next resolves the `import` condition
- `server.ts` custom server + `nodemon` can likely be dropped — plain `next dev`/`next start` (rewrites don't need a custom server)
- UI additions (stage 4+): Sources checkboxes (Crawl/Sitemap/GSC), Advanced tab fields (query policy radio + key lists, ignore anchors, raised limits), "URLs" tab for reviewing a `UrlSet` (include/exclude toggles), "Connect Google" button + status

---

## Database Schema

```prisma
model DiscoveryJob {              // generalizes CrawlJob
  id              String   @id @default(cuid())
  name            String?
  sourceDomain    String
  status          String   @default("pending")  // pending, running, completed, failed, cancelled
  sources         String   // JSON array: ["crawl","sitemap","gsc"]
  maxPages        Int      @default(10000)
  maxDepth        Int      @default(20)           // up to 1000 via explicit override
  delayMs         Int      @default(200)
  includePatterns String?
  excludePatterns String?
  queryPolicy     String   @default("ignore")   // ignore | allow | deny
  queryAllowKeys  String?  // JSON array
  queryDenyKeys   String?  // JSON array
  normalizeQuery  Boolean  @default(true)
  ignoreAnchors   Boolean  @default(true)
  pagesVisited    Int      @default(0)
  errorCount      Int      @default(0)
  lastError       String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  completedAt     DateTime?
  urlSet          UrlSet?
  @@index([status]) @@index([createdAt])
}

model UrlSet {
  id        String   @id @default(cuid())
  name      String?
  jobId     String?  @unique
  job       DiscoveryJob? @relation(fields: [jobId], references: [id], onDelete: Cascade)
  urls      DiscoveredUrl[]
  comparisons ComparisonJob[]
  createdAt DateTime @default(now())
}

model DiscoveredUrl {
  id       String  @id @default(cuid())
  urlSetId String
  url      String             // canonicalized form (shared-logic/canonicalize.ts)
  sources  String             // JSON array of contributing sources: ["crawl","sitemap",…]
  included Boolean @default(true)
  urlSet   UrlSet  @relation(fields: [urlSetId], references: [id], onDelete: Cascade)
  @@index([urlSetId])
  @@unique([urlSetId, url])
}

model ComparisonJob {
  // … existing fields; sourceUrls stays for ad-hoc runs AND as the snapshot store
  urlSetId  String?
  urlSet    UrlSet?  @relation(fields: [urlSetId], references: [id])
}

model OAuthCredential {         // one row per provider
  id           String   @id @default(cuid())
  provider     String   @unique  // "google"
  refreshToken String
  accessToken  String?
  expiresAt    DateTime?
  scopes       String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

**Snapshot semantics:** at `POST /api/comparisons`, resolve `urlSetId` to its `included=true` URLs and snapshot them into the job's `sourceUrls` JSON. The job must never read the live `UrlSet` after creation — `urlSetId` is kept for provenance only. This prevents mid-run `included` toggles from changing a running job's scope.

**Migration:** `prisma db push` is **dev-only** — renaming `CrawlJob` → `DiscoveryJob` under `db push` drops the table and its data. Use `prisma migrate dev` to generate the schema migration, and run `scripts/migrate-legacy.ts` for data, in this order:

1. Back up the SQLite file
2. `migrate dev` — create new tables (keep legacy table for now)
3. Script copies `CrawlJob` rows → `DiscoveryJob` (`sources='["crawl"]'`), expands `discoveredUrls` JSON → `DiscoveredUrl` rows under a generated `UrlSet` (source `crawl`)
4. Verify row counts, then a follow-up migration removes the legacy table/columns
5. Rollback: restore the SQLite backup; keep the legacy table until the follow-up is confirmed

---

## REST API Surface

| Route | Methods | Replaces |
|---|---|---|
| `POST /api/discovery` | start discovery job (sources, domain, options) | `POST /api/crawl` |
| `GET /api/discovery?jobId=` | status + urlSetId | `GET /api/crawl` |
| `GET /api/discovery` | list recent discovery jobs | same |
| `DELETE /api/discovery?jobId=` | cancel | same |
| `GET /api/urlsets/:id` | url list; filters: `included`, `source`, `q` + pagination | NEW |
| `PATCH /api/urlsets/:id` | toggle `included`, add manual urls (`PatchUrlSetRequest`) | NEW |
| `POST /api/comparisons` | `{urlSetId} or {sourceUrls}` + newDomain + config; snapshots included URLs | `POST /api/comparison` |
| `GET /api/comparisons` | list, paginated, `status` filter | `GET /api/jobs` |
| `GET /api/comparisons/:jobId` | detail + summary + paginated results, `status` filter | `GET /api/comparison?jobId=` |
| `DELETE /api/comparisons/:jobId` | cancel; idempotent — completed/failed → no-op success with current status | `DELETE /api/comparison?jobId=` |
| `POST /api/verify` | re-check single result by `resultId` | same |
| `GET /api/export?jobId&format` | json/csv/html | same |
| `GET /api/auth/google/start` | OAuth consent redirect — generates random `state`, stores in short-lived HttpOnly cookie, included in consent URL | NEW |
| `GET /api/auth/google/callback` | validates `state` (CSRF) → exchange code → `OAuthCredential`; `GOOGLE_REDIRECT_URI` must exactly match the console value | NEW |
| `GET /api/auth/google/status` | connected? | NEW |
| `DELETE /api/auth/google/disconnect` | revoke + delete credential | NEW |
| `GET /health` | liveness | same |
| `ALL /mcp` | MCP Streamable HTTP | NEW |

**Pagination:** all list endpoints take `limit` (default 100, max 1000) + `cursor` (or `offset`). MCP tools enforce the same limits — a urlSet or report can be thousands of rows.

Env vars: `PORT` (3001), `DATABASE_URL`, `ALLOWED_ORIGINS`, `API_KEY` (only if exposed), `API_URL`/`WEB_API_URL` (Next rewrite target — dev vs compose, no hardcoded hosts in `next.config.ts`), `URLCOMPARE_API_URL` (stdio MCP bin), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_OAUTH_STATE_TTL_SECONDS`, `GSC_ROW_LIMIT`/`GSC_MAX_PAGES` (pagination caps), `OPENROUTER_API_KEY` (MCP toolkit eval — dev only, stage 5).

---

## MCP Surface (design — finalized via toolkit spec loop)

Workflow: `mcp-toolkit new-spec --name urlcompare` → iterate `validate` (collision detection, rubric) → `eval` (OpenRouter routing accuracy, needs `OPENROUTER_API_KEY`) → `generate --target server-code` → drop `*-tools.generated.ts` into `packages/mcp-server`, hand-fill handlers, adapt transport (toolkit emits stdio scaffold — we keep it for the bin and add the AGL-style HTTP mount).

| Tool | Intent | Notes |
|---|---|---|
| `discover_urls` | Start a discovery job on a domain (sources: crawl/sitemap/gsc) → `{jobId}` | async; validates GSC credential **at call time** — `sources` containing `gsc` with no credential → immediate `gsc_not_connected`, no partial job created |
| `list_jobs` | Recent discovery and comparison jobs | filters by type/status, paginated |
| `get_job_status` | Progress/state of one job | candidate for merge with report pending collision eval |
| `get_url_set` | Discovered URLs of a job/urlSet | paginated, `included`/`source`/`q` filters; also resource `urlcompare://urlsets/{id}` |
| `start_comparison` | urlSetId or sourceUrls + newDomain + config → `{jobId}` | async; same validation as REST |
| `get_comparison_report` | Summary + results, filterable by result status | returns `job_still_running` until completed/failed (progress via `get_job_status`); optional `include_partial` flag deferred |
| `check_url` | Synchronous single-URL check on new domain | `{sourceUrl, newDomain, config?}` → `ComparisonResult`; `isUrlSafe` on both sides, `url_blocked` on SSRF; only "computation" tool, no job created |
| `cancel_job` | Abort a running discovery/comparison | `destructiveHint: true`; idempotent — already completed/failed → success with current status |

**Resources:** `urlcompare://urlsets/{id}` and `urlcompare://jobs/{id}` get `resources/list` + `resources/read` handlers (uri templates); IDs come from `discover_urls`/`start_comparison`/`list_jobs` outputs.

Error contract (AGL pattern, extended): `{ code, message, recovery_hint?, details? }` — `details` carries the zod `issues` array for `validation_failed`. Expected codes: `job_not_found`, `job_still_running`, `invalid_url`, `url_blocked` (SSRF), `gsc_not_connected`, `validation_failed`.

Trust justifications: mostly `"state"` (model can't see job results) — `check_url` is `"computation + network"`.

---

## Execution Strategy

Six stages, each self-contained and committable. The app stays functional throughout — stages 1–3 are pure lift-and-shift.

| Stage | Focus | Commit after? |
|---|---|---|
| 1 | Workspaces + `git mv` app → `apps/web` | ✅ |
| 2 | Extract `shared-types` + `shared-logic` | ✅ |
| 3 | `api-server` (Hono), Prisma move, web repoints | ✅ |
| 4 | Discovery rework: schema, sitemap, query-string, GSC OAuth | ✅ |
| 5 | `mcp-server`: toolkit spec → eval → tools → HTTP + stdio | ✅ |
| 6 | docker-compose, docs, cleanup | ✅ |

### Stage 1 — Workspaces + move
- Root `package.json` → workspaces, root `tsconfig.json` base + `paths`
- `git mv` everything app-related into `apps/web/`; fix `package.json` name, prisma output path, `DATABASE_URL` relative resolution
- Verify: `npm run dev` in `apps/web` still works

### Stage 2 — Shared packages
- Create `shared-types`, `shared-logic` with AGL conditional-exports convention
- Move `src/lib/{urlChecker,crawler,schemas,json}.ts`, `src/types/`; extract `generateSummary`, export generators
- Web imports repointed; existing vitest tests move and stay green

### Stage 3 — API server
- `api-server` scaffold (Hono, config, http helpers, dev.mjs)
- Port 6 route handlers → routes; move `prisma/` + `db.ts`; runner + abort maps → `lib/runner.ts`
- Web: delete `src/app/api/**`, add rewrites, repoint fetches
- Verify: full app works on two processes; API tests via `app.request()`

### Stage 4 — Discovery rework
- Schema: `DiscoveryJob`/`UrlSet`/`DiscoveredUrl`/`OAuthCredential` + legacy migration script
- `shared-logic`: `sitemap.ts`, `querystring.ts`, `gsc.ts`, `urlset.ts`; crawler options
- API: discovery/urlsets routes, google auth routes
- Web: Sources checkboxes, Advanced fields, URLs tab, Connect Google
- **Prerequisite (user):** Google Cloud project with Search Console API enabled; OAuth consent screen configured; `GOOGLE_REDIRECT_URI` registered; test users added while the app is in testing; a verified GSC property for the connecting account → env vars

### Stage 5 — MCP server
- Toolkit: `new-spec` → `validate`/`eval` loop until routing stable → `generate`
- `mcp-server`: tools + adapter + `createMcpServer`; stdio bin with HTTP service client
- api-server mounts `/mcp`
- Verify: MCP inspector / real client against both transports; `eval-status record-deploy`

### Stage 6 — Deploy + cleanup
- `docker-compose.yml`: `api` (esbuild bundle, Prisma externalized) + `web` (Next standalone or nginx) + named db volume; healthchecks; `web` depends on healthy `api`
- Container start runs `prisma migrate deploy` (never `db push` in prod); DB file backed up before migration; healthcheck waits for migration completion; SQLite volume permissions verified at init
- Dockerfiles per AGL pattern (monorepo-aware: workspace manifests first, ordered builds)
- `DATABASE_URL=file:./db/custom.db` in a mounted volume; `GOOGLE_*` env
- Cleanup: delete `urlcompare-deployment-20250827.zip` (52 MB), `dev.log`, `server.log`, `dev`, `start.sh`, `prepare-deployment.sh`, stale `specs/` templates; prune unused shadcn `ui/` components; rewrite `README.md` (currently Z.ai boilerplate); unify vitest versions
- `.env.example` for the full var list

---

## Risks / Open Items

1. **Next.js package resolution** — AGL's conditional-exports trick is unproven under Turbopack; fallback is `transpilePackages` or plain source-only exports. Resolve at stage 2 before api-server depends on the pattern.
2. **Two processes in dev** — no `concurrently` in AGL (separate terminals). Decide whether to add `npm run dev` orchestration at root or copy the AGL convention.
3. **In-process job runner** — kept as-is (single node process, abort maps). Fine for SQLite/self-hosted; a real queue is explicitly out of scope.
4. **GSC page quotas** — `searchanalytics.query` returns max 50k rows/page; large sites need pagination. Also only returns pages with impressions — document that a GSC-only source isn't exhaustive.
5. **Spec–handler divergence** — toolkit validates the spec and evals routing, but nothing verifies handlers honor the spec's promises. The `apply`/regenerate flow will overwrite tool surfaces — keep handler logic in `engine-adapter`-style files that generation doesn't touch.
6. **Stdio + OAuth** — stdio MCP server can't drive the OAuth flow; `gsc_not_connected` errors must point users to the web UI. If running stdio against a remote API, the credential lives server-side — same UX either way.
7. **Token storage** — refresh token stored plaintext in SQLite. Acceptable for self-hosted single-user; revisit if multi-user ever lands.
8. **API/MCP auth** — no auth is specified today. Public exposure allows job creation, SSRF, and data reads. Addressed by the private-by-default + `API_KEY` decision; revisit if multi-tenant is ever needed.
9. **Prisma bundling** — esbuild single-file output breaks on `better-sqlite3`'s native module. Externalize or ship generated client + node_modules.
10. **Migration safety** — `db push` is not a data migration. `prisma migrate` + one-shot script + backup (see Database Schema).
11. **Comparison snapshot** — live `UrlSet` edits during a comparison would change the job's scope. Snapshot `included` URLs at creation.
12. **OAuth `state`** — required CSRF protection on the Google flow; generated at `/start`, validated at `/callback`.
13. **Rate limiting** — GSC and sitemap fetching need their own backoff/caps beyond crawler `delayMs` (`GSC_ROW_LIMIT`, `GSC_MAX_PAGES`, sitemap limits in `sitemap.ts`).
14. **Data retention** — jobs, URL sets, and results grow without bound. Pagination helps reads; a cleanup/vacuum policy is deferred but worth scheduling.
15. **API pagination** — list/report endpoints need limits before UI/MCP can safely handle large sets (specified above).

**Notes from review merge:**
- The review suggested include-patterns evaluated first with regex; the current code uses **glob patterns, exclude-first** — kept as-is (standard deny-list semantics) and documented.
- `maxDepth` default: `todo.urlreplace.md` asked for 1000; review flagged it as effectively-unbounded/misleading. Compromise: default **20**, up to 1000 as an explicit advanced override.
- Unscoped package names can collide on the public registry if ever published — fine while `private: true`.
- Verify removing the custom `server.ts` doesn't break anything non-rewrite (HMR upgrade handling was its only real job).
- Worth adding later: per-workspace CI (`npm test` + `prisma validate` + typecheck).
