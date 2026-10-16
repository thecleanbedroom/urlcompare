# Review Report — `PLAN.monorepo.md`

**Review date:** October 16, 2026  
**Scope:** architecture, package boundaries, schema, API/MCP surfaces, migration, deployment, security  
**Verdict:** Directionally sound. The monorepo split, shared packages, Hono API, and MCP design are coherent. The main gaps are security/auth, Prisma migration + bundling, comparison snapshot semantics, OAuth CSRF, and several DTO/pagination ambiguities. Below are findings and merge-ready amendments.

---

## Critical findings

### C1. API and MCP have no authentication/authorization model
`ALLOWED_ORIGINS` is CORS, not auth. If `api-server` is exposed, anyone can start crawls (SSRF risk), read discovered URLs, read comparison results, and call MCP tools. `/mcp` is mounted on the same server and has the same issue.

**Merge amendment — add to Decisions:**
> API/MCP exposure is private by default. `api-server` binds to `127.0.0.1` in dev and to the internal compose network in Docker. If `/mcp` or `/api/*` is exposed beyond the web proxy, require `Authorization: Bearer ${API_KEY}` on all routes except `GET /health`. Web-to-API traffic uses the internal network or a Next middleware-injected header. Document the chosen model in `.env.example` and README.

### C2. Prisma + esbuild single-bundle is likely to fail
Prisma Client depends on generated native query engine files. Bundling it into a single `server.mjs` with esbuild usually breaks unless `@prisma/client` and `.prisma` are externalized and copied into the image.

**Merge amendment — replace Stage 6 prod packaging note with:**
> Do not bundle Prisma into the esbuild output. Either externalize `@prisma/client` and copy `node_modules/.prisma` + `@prisma/client` into the runtime image, or run `prisma generate` in the Docker build and start with `node dist/server.js` with production dependencies present. Add `prisma migrate deploy` (or `prisma db push` only for local dev) as an explicit container startup step.

### C3. Legacy migration is underspecified and `prisma db push` will drop data
Renaming `CrawlJob` → `DiscoveryJob` and adding `UrlSet`/`DiscoveredUrl` is not a safe `db push` operation. `db push` may drop/rename tables or columns without preserving data.

**Merge amendment — replace migration paragraph with:**
> Use `prisma migrate dev` to generate the schema migration. For data, run `scripts/migrate-legacy.ts` before removing old tables/columns. Sequence: backup SQLite file → create new tables → copy `CrawlJob` rows to `DiscoveryJob` with `sources='["crawl"]'` → expand `discoveredUrls` JSON into `DiscoveredUrl` rows under a generated `UrlSet` → verify counts → remove legacy tables/columns in a follow-up migration. `db push` remains dev-only. Add rollback instructions.

### C4. Comparison jobs can race with `UrlSet` edits
`ComparisonJob` references `UrlSet`, but users can toggle `included` while a comparison is running. Results may be inconsistent, and the job may use URLs that were excluded mid-run.

**Merge amendment — add to Database Schema / comparison service:**
> At `POST /api/comparisons`, resolve `urlSetId` to its `included=true` URLs and snapshot them into the job (`sourceUrls` JSON or a `ComparisonJobUrl` join table). The job must not read the live `UrlSet` after creation. `urlSetId` remains for provenance. If `sourceUrls` is provided directly, no snapshot is needed. Validation: exactly one of `urlSetId` or `sourceUrls`; if `urlSetId` has zero included URLs, return `validation_failed`.

### C5. OAuth2 flow is missing `state` / CSRF protection
`/api/auth/google/start` and `/callback` are described without a `state` parameter. OAuth2 consent flows require CSRF protection.

**Merge amendment — add to REST API Surface and Stage 4 prerequisite:**
> `/api/auth/google/start` generates a random `state`, stores it in a short-lived HttpOnly cookie or DB row, and includes it in the consent URL. `/callback` validates `state` before exchanging the code. `GOOGLE_REDIRECT_URI` must exactly match the Google Cloud console value. Stage 4 prerequisite also includes: configure OAuth consent screen, add redirect URI, add test users if the app is in testing.

---

## High-priority findings

### H1. `shared-types` contains runtime code but lacks runtime dependencies and export conditions
`shared-types` is described as pure types, but it also contains zod schemas and `UrlCompareService`. The conditional exports shown are missing top-level `types` and a `require` condition; CJS consumers or some TS resolution modes may fall through to `./src/index.ts`.

**Merge amendment — add to `packages/shared-types` spec:**
> Add `zod` as a dependency. Consider renaming to `shared-contracts` to reflect runtime schemas. Export shape should include `"types"` at top level and either a `"require"` condition or an explicit ESM-only statement. Verify `shared-types` is not imported by CJS-only tooling. If any consumer uses `require`, add `"require": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }`.

### H2. `gsc.ts` in `shared-logic` violates the pure/DB-free boundary
OAuth token refresh needs `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, refresh token, and usually DB access. That belongs in `api-server`, not pure shared logic.

**Merge amendment — split `gsc.ts`:**
> `shared-logic/gsc.ts`: pure Search Console API client. Accepts `accessToken`, date range, row limit, pagination cursor; returns page URLs. No OAuth, no DB, no env.
> `api-server/services/google-auth-service.ts`: OAuth start/callback/status/disconnect, token refresh, credential storage. It calls `shared-logic/gsc.ts` with a fresh access token.

### H3. `DiscoveredUrl.source` cannot represent multi-source discovery
A URL can appear in crawl, sitemap, and GSC. A single `source` field loses information or forces an arbitrary priority.

**Merge amendment — schema:**
> Replace `source String` with `sources String` (JSON array) or add `DiscoveredUrlSource { urlId, source }`. If keeping a single field, define priority explicitly: `gsc > sitemap > crawl > manual`, and document that lower-priority sources are discarded. Array is preferred for auditing and filtering.

### H4. List/report/urlset endpoints lack pagination and filtering
`GET /api/discovery`, `GET /api/urlsets/:id`, `GET /api/comparisons`, and MCP `get_url_set`/`get_comparison_report` can return thousands of rows.

**Merge amendment — add to REST API Surface:**
> All list/report endpoints accept `limit` (default 100, max 1000) and `cursor` or `offset`. `GET /api/urlsets/:id` accepts `included`, `source`, `q`. `GET /api/comparisons/:jobId` accepts `status` filter. `GET /api/discovery` and `GET /api/comparisons` accept `status`, `type`, `limit`, `cursor`. MCP tools must enforce the same limits.

### H5. Several DTOs are undefined
`POST /api/verify`, `PATCH /api/urlsets/:id`, `POST /api/discovery`, `POST /api/comparisons`, and MCP `check_url` lack request/response schemas.

**Merge amendment — add to `shared-types` DTO list:**
> Add zod schemas and inferred types for:
> - `StartDiscoveryRequest`: `{ sourceDomain, sources, maxPages?, maxDepth?, delayMs?, includePatterns?, excludePatterns?, queryPolicy?, queryAllowKeys?, queryDenyKeys?, normalizeQuery?, ignoreAnchors? }`
> - `PatchUrlSetRequest`: `{ included?: { urlId: string; included: boolean }[]; addManualUrls?: string[] }`
> - `StartComparisonRequest`: `{ urlSetId?, sourceUrls?, newDomain, config }` with exactly-one validation
> - `VerifyRequest`: `{ jobId, resultId }` or `{ sourceUrl, newDomain, config }` — choose one and document
> - `CheckUrlRequest` / `CheckUrlResponse` for MCP `check_url`

### H6. `GET /api/comparisons[?jobId=]` is ambiguous
A single route for list and detail is harder to document, paginate, and validate.

**Merge amendment — REST API Surface:**
> Split into `GET /api/comparisons` (list, paginated, optional `status`) and `GET /api/comparisons/:jobId` (detail, paginated results, optional `status` filter). Keep `DELETE /api/comparisons/:jobId` or `DELETE /api/comparisons?jobId=` but document idempotency.

### H7. `maxDepth` default of 1000 is effectively unlimited
For web crawling, depth 1000 is not a meaningful safety bound. It may mislead users and complicate queue memory expectations.

**Merge amendment — crawler defaults:**
> Set `maxDepth` default to `10` (or `20`). Allow up to `1000` only as an advanced override with a UI warning. Keep `maxPages` default at `10000`.

### H8. Pattern and query-policy semantics are undefined
`includePatterns`, `excludePatterns`, `queryPolicy`, `queryAllowKeys`, `queryDenyKeys`, `normalizeQuery`, and `ignoreAnchors` need exact behavior.

**Merge amendment — add to `shared-logic/querystring.ts` and crawler spec:**
> - `ignore`: strip the entire query string.
> - `allow`: keep only keys in `queryAllowKeys`; drop all others.
> - `deny`: drop keys in `queryDenyKeys`; keep all others.
> - `normalizeQuery`: sort keys, lowercase keys, drop empty values, use consistent percent-encoding.
> - `ignoreAnchors`: strip `#fragment` before dedup/check.
> - `includePatterns`/`excludePatterns`: JSON arrays of regex strings. Include first, then exclude. Document examples.

### H9. URL canonicalization must be shared and explicit
Crawler, sitemap, GSC, and `urlset.ts` must dedup on the same canonical form.

**Merge amendment — add `canonicalizeUrl` to `shared-logic`:**
> Rules: lowercase scheme and host, remove default ports (`:80`, `:443`), strip fragment, apply query policy, sort remaining query keys, normalize trailing slash policy (document choice), decode/encode consistently. All sources and `DiscoveredUrl` uniqueness use this function.

### H10. Sitemap support is missing operational limits and safety
Sitemaps can be gzipped, can be sitemap indexes, and can point to private IPs.

**Merge amendment — `sitemap.ts`:**
> Support `.xml` and `.xml.gz`. Enforce max sitemap index depth (e.g., 3), max child sitemaps (e.g., 50), max URLs per sitemap (e.g., 50k), and timeout. Apply `isUrlSafe` to every fetched URL. Discover sitemaps from `robots.txt` only after SSRF check. Document rate limiting/backoff.

---

## Medium-priority findings

### M1. Path inconsistencies in `api-server` layout
Target structure shows `packages/api-server/prisma/schema.prisma`, but the `api-server` layout shows `src/prisma/schema.prisma`. Prisma convention is package-root `prisma/`.

**Merge amendment:** Use `packages/api-server/prisma/schema.prisma` and `packages/api-server/tests/api.test.ts`.

### M2. Missing env vars
Add to `.env.example` and config:
- `API_KEY` (if auth enabled)
- `OPENROUTER_API_KEY` (MCP toolkit eval, Stage 5)
- `URLCOMPARE_API_URL` (stdio MCP bin)
- `WEB_API_URL` or `API_URL` (Next rewrites, dev vs compose)
- `GOOGLE_REDIRECT_URI` already listed; add `GOOGLE_OAUTH_STATE_TTL_SECONDS` if using DB state
- `GSC_ROW_LIMIT`, `GSC_MAX_PAGES` if pagination limits are configurable

### M3. Stage 4 Google prerequisite is incomplete
Add: OAuth consent screen configured, redirect URI registered, test users added if in testing, Search Console API enabled, and a verified site in GSC for the account.

### M4. Stage 6 missing migration/deploy step
Add: `prisma migrate deploy` at container start, DB backup before migration, and healthcheck that waits for migration completion.

### M5. MCP resources need templates and list/read handlers
`urlcompare://urlsets/{id}` and `urlcompare://jobs/{id}` are mentioned, but MCP requires resource listing and read handlers.

**Merge amendment:** Define `resources/list` and `resources/read` for both templates. Document that clients need IDs from `discover_urls`/`start_comparison`.

### M6. `discover_urls` GSC error behavior is ambiguous
Does a missing GSC credential fail the tool call, or start a job that later errors?

**Merge amendment:** Validate credentials at tool call time. If `sources` includes `gsc` and no credential exists, return `gsc_not_connected` immediately with a `recovery_hint` pointing to the web UI. Do not create a partial job.

### M7. `get_comparison_report` running behavior is ambiguous
Should it return `job_still_running` or partial results?

**Merge amendment:** Return `job_still_running` until the job is completed or failed. For progress, use `get_job_status`. If partial results are desired later, add a separate `include_partial` flag.

### M8. `check_url` DTO is undefined
**Merge amendment:** Define `check_url` input as `{ sourceUrl, newDomain, config? }`, output as `ComparisonResult`. It must apply `isUrlSafe` to both URLs and return `url_blocked` on SSRF.

### M9. `cancel_job` semantics undefined
**Merge amendment:** `cancel_job` aborts via the runner’s `AbortController`, sets status to `cancelled`, and is idempotent. If the job is already completed/failed, return `job_not_found` or a no-op success with current status. Document choice.

### M10. Error contract should carry validation details
`validation_failed` is useful only if it includes field-level issues.

**Merge amendment:** Error shape: `{ code, message, recovery_hint?, details? }`. `details` is a zod `issues` array for `validation_failed`.

---

## Low-priority / polish

- Unscoped package names (`web`, `api-server`, `shared-types`) are fine while `private: true`, but note possible registry collisions if ever published.
- `exports` only has `"."`. Add subpath exports if consumers need `shared-types/schemas`.
- `shared-logic` deps: add `fast-xml-parser` (or `xml2js`) for sitemaps, and `p-limit` if concurrency limiting is used.
- `export.ts` HTML generator must escape user-controlled URLs to avoid XSS in exported HTML.
- Docker compose: add SQLite volume permission check/init step.
- Next rewrites: use `process.env.API_URL` rather than hardcoding `localhost`/`api` in `next.config.ts`.
- Confirm removing custom `server.ts` does not break any non-rewrite custom behavior.
- Consider CI: `npm test` per workspace + `prisma validate` + typecheck.

---

## Merge-ready additions to Risks / Open Items

Add these to the existing risks list:

8. **API/MCP auth** — no auth is specified. Public exposure allows job creation, SSRF, and data reads. Decide private-network-only vs `API_KEY`.
9. **Prisma bundling** — esbuild single-file output likely breaks Prisma. Externalize or ship generated client + engine.
10. **Migration safety** — `db push` is not a data migration. Use `prisma migrate` + one-shot script + backup.
11. **Comparison snapshot** — live `UrlSet` edits during a comparison can change the job’s URL set. Snapshot at creation.
12. **OAuth state** — missing CSRF protection. Add `state` validation.
13. **Rate limiting** — GSC and sitemap fetching need backoff and max limits beyond crawler `delayMs`.
14. **Data retention** — jobs, URL sets, and results grow without bound. Add cleanup policy or pagination.
15. **API pagination** — list/report endpoints need limits before UI/MCP can safely handle large sets.

---

## Suggested exact text to insert into the plan

**In Decisions table, add row:**
| API/MCP auth | Private network by default; `API_KEY` bearer required if exposed beyond web proxy |
| Comparison URL source | Snapshot `included=true` URLs at job creation; `urlSetId` is provenance only |
| Migration | `prisma migrate` + `scripts/migrate-legacy.ts`; `db push` dev-only |
| Prisma packaging | Externalize Prisma client + engine; no single-file esbuild bundle |

**In `shared-logic` table, change `gsc.ts` row to:**
| `gsc.ts` | NEW | Pure Search Console API client: `searchanalytics.query` paged fetch by access token. OAuth refresh/storage lives in `api-server`. |

**In `api-server` layout, change:**
`prisma/schema.prisma` → `packages/api-server/prisma/schema.prisma`  
`tests/api.test.ts` → `packages/api-server/tests/api.test.ts`

**In Database Schema, add after `DiscoveredUrl`:**
```prisma
// If multiple sources per URL are needed:
// replace source String with sources String // JSON array
```

**In REST API Surface, add:**
- `GET /api/comparisons` and `GET /api/comparisons/:jobId` are separate.
- All list endpoints: `limit`, `cursor`/`offset`.
- OAuth start/callback require `state`.

**In MCP Surface, add:**
- `check_url` input/output DTO.
- `discover_urls` validates GSC credential before creating job.
- `get_comparison_report` returns `job_still_running` until complete.
- Resources: define `resources/list` + `resources/read`.

**In Stage 4 prerequisite, add:**
> Google Cloud OAuth consent screen, redirect URI, test users, Search Console API enabled, verified site in GSC.

**In Stage 6, add:**
> Run `prisma migrate deploy` at container start. Do not bundle Prisma into esbuild output. Back up SQLite before migration.
