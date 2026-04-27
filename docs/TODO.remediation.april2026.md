# Remediation TODO — urlCompare

**Source:** [PLAN.remediation.april26.md](./PLAN.remediation.april26.md)  
**Created:** April 27, 2026  
**Estimated effort:** 14–18 hours

---

## How to Use

Each task is a self-contained unit of work. Tasks within a phase should be completed in order. Phases should be completed sequentially (Phase 1 → 2 → 3 → 4 → 5 → 6). Commit after each phase.

**Legend:**  `[ ]` = pending · `[/]` = in progress · `[x]` = done · `[-]` = skipped

---

## Phase 1 — Critical Fixes (~1 hr)

**Commit message:** `fix: XSS in HTML export, Next.js 16 params typing, SSRF protection`

- [x] **1.1 — Fix XSS in HTML Export**
  - [x] Add `escapeHtml()` utility function at top of `src/app/api/export/route.ts`
  - [x] Apply `escapeHtml()` to `job.name` in HTML template
  - [x] Apply `escapeHtml()` to `job.id` in HTML template
  - [x] Apply `escapeHtml()` to `job.newDomain` in HTML template
  - [x] Apply `escapeHtml()` to `r.sourceUrl` in HTML table rows
  - [x] Apply `escapeHtml()` to `r.newUrl` in HTML table rows
  - [x] Apply `escapeHtml()` to `r.finalUrl` in HTML table rows
  - [x] Apply `escapeHtml()` to `r.error` in HTML table rows
  - [x] Apply `escapeHtml()` to redirect chain entries in HTML table rows
  - [x] Verify: export an HTML report containing `<script>alert(1)</script>` in a URL — must render as text

- [x] **1.2 — Fix `api/jobs/[id]` Params Typing for Next.js 16**
  - [x] Update `DELETE` handler params to `Promise<{ id: string }>` and `await params`
  - [x] Remove old `Params` interface
  - [x] Update `GET`, `POST`, `PUT`, `PATCH` stub signatures for consistency
  - [x] Verify: `npx tsc --noEmit` reports zero errors (ignore pre-existing warnings)

- [x] **1.3 — Add SSRF Protection on URL Input**
  - [x] Create `isPrivateIPv4(hostname)` helper in `src/lib/urlChecker.ts`
    - [x] Block `127.x.x.x` (loopback)
    - [x] Block `10.x.x.x` (RFC 1918)
    - [x] Block `192.168.x.x` (RFC 1918)
    - [x] Block `172.16.0.0 – 172.31.255.255` only (NOT all `172.x`) — parse second octet
    - [x] Block `169.254.x.x` (link-local + AWS metadata)
    - [x] Block `localhost` and `[::1]`
  - [x] Create `isUrlSafe(url)` export wrapping `isPrivateIPv4` + protocol check (HTTP/HTTPS only)
  - [x] Call `isUrlSafe()` in `checkUrlStatus()` before fetching
  - [x] Call `isUrlSafe()` in `comparison/route.ts` during URL validation
  - [x] Call `isUrlSafe()` in `crawler.ts` `fetchPage()` before fetching
  - [x] Verify: attempt comparison with `http://169.254.169.254/latest/meta-data/` — must be rejected

- [x] **1.4 — Conditional Prisma Query Logging**
  - [x] Change `db.ts` to use `PRISMA_DEBUG === 'true'` instead of unconditional `['query']`
  - [x] Verify: start server without `PRISMA_DEBUG` set — no SQL output in stdout

- [x] **Phase 1 gate: commit & verify**
  - [x] `npx tsc --noEmit` passes
  - [x] `npm run lint` passes
  - [x] `npm run dev` starts without errors
  - [x] Git commit: `fix: XSS in HTML export, Next.js 16 params typing, SSRF protection`

---

## Phase 2 — Infrastructure Cleanup (~1 hr)

**Commit message:** `chore: remove dead code, fix gitignore, audit dependencies`

- [x] **2.1 — Update `.gitignore`**
  - [x] Append `*.log`, `dev.log`, `server.log` entries
  - [x] Append `prisma/db/*.db`, `prisma/db/*.db-journal` entries
  - [x] Run `git rm --cached dev.log server.log prisma/db/custom.db` to untrack
  - [x] Verify: `git status` no longer shows log/db files as tracked

- [x] **2.2 — Remove Unused Prisma Models**
  - [x] Delete `User` model from `prisma/schema.prisma`
  - [x] Delete `Post` model from `prisma/schema.prisma`
  - [x] Run `npx prisma generate`
  - [x] Verify: `npx prisma validate` passes

- [x] **2.3 — Remove Unused CrawlJob → ComparisonJob Relation**
  - [x] Remove `comparisonJobId` and `comparisonJob` from `CrawlJob` in schema
  - [x] Remove `crawlJobs CrawlJob[]` from `ComparisonJob` in schema
  - [x] Run `npx prisma db push`
  - [x] Verify: app starts normally

- [x] **2.4 — Remove Socket.IO Scaffolding**
  - [x] Delete `src/lib/socket.ts`
  - [x] Edit `server.ts`: remove `socket.io` import, `Server` creation, `setupSocket()` call
  - [x] Edit `server.ts`: remove `/api/socketio` request filter in `createServer` callback
  - [x] Simplify `server.ts` to just Next.js + HTTP + upgrade handler
  - [x] Run `npm uninstall socket.io socket.io-client`
  - [x] Verify: `npm run dev` starts without errors, no WebSocket errors in browser

- [x] **2.5 — Audit & Remove Unused Dependencies**
  - [x] Run dependency audit script (grep for imports + check `npm ls`)
  - [x] For each package with 0 imports in `src/` and `src/components/ui/`:
    - [x] Check config files (`next.config.ts`, `tailwind.config.ts`)
    - [x] Check `npm ls <pkg> --depth=0` for peer dependency usage
    - [x] If unused everywhere: `npm uninstall <pkg>`
  - [x] Verify: `npm run build` succeeds after all removals

- [x] **2.6 — Truncate Dev Log in Dev Script**
  - [x] Update `package.json` dev script to truncate `dev.log` on each start (`: > dev.log && ...`)
  - [x] Verify: restart dev server, confirm `dev.log` starts fresh

- [x] **Phase 2 gate: commit & verify**
  - [x] `npm run build` succeeds
  - [x] `npm run dev` starts without errors
  - [x] Git commit: `chore: remove dead code, fix gitignore, audit dependencies`

---

## Phase 3 — Data Model Hardening (~1.5 hr)

**Commit message:** `refactor: harden data model, add lastError to ComparisonJob, JSON helpers`

- [x] **3.1 — Add `lastError` Field to ComparisonJob**
  - [x] Add `lastError String?` to `ComparisonJob` in `prisma/schema.prisma`
  - [x] Update `processComparisonJob` catch block in `comparison/route.ts` to write `lastError`

- [x] **3.2 — Add `updatedAt` to UrlResult**
  - [x] Add `updatedAt DateTime @updatedAt` to `UrlResult` in `prisma/schema.prisma`

- [x] **3.3 — Create JSON Serialization Helpers**
  - [x] Create `src/lib/json.ts` with `safeParseJson<T>()` and `toJsonString()`
  - [x] Replace bare `JSON.parse()` in `src/app/api/comparison/route.ts` with `safeParseJson()`
  - [x] Replace bare `JSON.parse()` in `src/app/api/export/route.ts` with `safeParseJson()`
  - [x] Replace bare `JSON.parse()` in `src/app/api/crawl/route.ts` with `safeParseJson()`
  - [x] Replace bare `JSON.parse()` in `src/components/ResultCard.tsx` with `safeParseJson()`
  - [x] Replace bare `JSON.stringify()` for DB writes with `toJsonString()` where applicable
  - [x] Verify: corrupt a `redirectChain` value in DB to invalid JSON — app must not crash

- [x] **3.4 — Run Schema Migration**
  - [x] Run `npx prisma db push` (dev) or generate migration files (prod)
  - [x] Run `npx prisma generate`
  - [x] Verify: app starts and existing data is preserved

- [x] **Phase 3 gate: commit & verify**
  - [x] `npx tsc --noEmit` passes
  - [x] `npm run dev` starts without errors
  - [x] Git commit: `refactor: harden data model, add lastError to ComparisonJob, JSON helpers`

---

## Phase 4 — Backend Improvements (~2.5 hr)

**Commit message:** `feat: full redirect chain detection, comparison cancellation, API improvements`

- [x] **4.1 — Fix Redirect Chain Detection**
  - [x] Rewrite `checkUrlStatus()` in `src/lib/urlChecker.ts` to use manual redirect follow loop
    - [x] Use `redirect: 'manual'` in fetch
    - [x] Follow `Location` header through 301/302/303/307/308 responses
    - [x] Resolve relative redirect URLs with `new URL(location, currentUrl)`
    - [x] Cap at 10 hops maximum
    - [x] Build `redirectChain` array with all intermediate URLs
  - [x] Add `signal?: AbortSignal` to `CheckUrlConfig` interface
  - [x] Compose timeout controller with external signal using `AbortSignal.any()`
  - [x] Store redirect chain using `toJsonString()` (from Phase 3.3)
  - [x] Verify: test against a URL with known multi-hop redirects — chain captures all hops

- [x] **4.2 — Add Comparison Job Cancellation**
  - [x] Add `activeComparisons` Map at module level in `comparison/route.ts`
  - [x] Create `AbortController` at start of `processComparisonJob`, store in map
  - [x] Pass signal to `checkUrlStatus` calls via `config.signal`
  - [x] Check `signal.aborted` between batches, exit early if aborted
  - [x] Clean up map entry in `finally` block
  - [x] Add `DELETE` handler to `comparison/route.ts`
    - [x] Accept `jobId` query param
    - [x] Abort the controller and remove from map
    - [x] Update job status to `cancelled` in DB
  - [x] Add "Cancel" button to progress UI in `page.tsx`
  - [x] Verify: start a large comparison, cancel mid-run — job status shows `cancelled`

- [x] **4.3 — Move Override Token to Environment Variable**
  - [x] Create `.env.example` file with `DATABASE_URL`, `PRISMA_DEBUG`, `EDGE_OVERRIDE_TOKEN`
  - [x] Change `CheckUrlConfig.overrideToken` to `useOverrideToken: boolean`
  - [x] Update `checkUrlStatus()` to read `process.env.EDGE_OVERRIDE_TOKEN` when `useOverrideToken` is true
  - [x] Update `crawler.ts` `CrawlerOptions` the same way
  - [x] Update `comparison/route.ts` to pass `useOverrideToken` boolean
  - [x] Update `verify/route.ts` to pass `useOverrideToken` boolean
  - [x] Update `crawl/route.ts` to pass `useOverrideToken` boolean
  - [x] Update `page.tsx`: replace password input with checkbox toggle
  - [x] Update `CrawlForm.tsx`: accept `useOverrideToken` boolean prop instead of string
  - [x] Verify: set `EDGE_OVERRIDE_TOKEN` in `.env`, toggle checkbox — header is sent

- [x] **4.4 — Persist Error Context on Comparison Failure**
  - [x] Ensure catch block in `processComparisonJob` writes to `lastError` field (depends on 3.1)
  - [x] Display `lastError` in the UI when job status is `failed`
  - [x] Verify: trigger a job failure — error message is visible in UI

- [x] **4.5 — Fix Error Handling in Jobs API**
  - [x] Change `GET /api/jobs` catch block to return `{ error: '...' }` with status 500
  - [x] Update `jobs/page.tsx` `fetchJobs()` to check `response.ok` before parsing
  - [x] Verify: simulate DB error — user sees error message, not empty list

- [x] **4.6 — Move Database Init Out of Module Import**
  - [x] Remove `ensureDatabaseExists()` call from `src/lib/db.ts` module body
  - [x] Remove `ensureDatabaseExists()` function definition
  - [x] Remove `dbInitialized` global flag
  - [x] Add `"predev"` and/or `"prestart"` script in `package.json` for `prisma db push`
  - [x] Verify: delete `prisma/db/custom.db`, run `npm run dev` — DB is created by predev script

- [x] **Phase 4 gate: commit & verify**
  - [x] `npx tsc --noEmit` passes
  - [x] `npm run lint` passes
  - [x] `npm run dev` starts without errors
  - [x] Git commit: `feat: full redirect chain detection, comparison cancellation, API improvements`

---

## Phase 5 — Frontend Refactor (~3-4 hr)

**Commit message:** `refactor: decompose page.tsx, shared types, UI improvements`

- [x] **5.1 — Extract Shared Types**
  - [x] Create `src/types/index.ts`
  - [x] Define `UrlResult` interface (single source of truth)
  - [x] Define `JobSummary` interface
  - [x] Define `StatusFilter` type
  - [x] Define `JobStatus` type (include `'cancelled'`)
  - [x] Update imports in `page.tsx` to use shared type
  - [x] Update imports in `ResultCard.tsx` to use shared type
  - [x] Update imports in `JobCard.tsx` to use shared type
  - [x] Update imports in `jobs/page.tsx` to use shared type
  - [x] Delete duplicate type definitions from all files

- [x] **5.2 — Extract Shared Status Utilities**
  - [x] Create `src/lib/status.tsx`
  - [x] Move `getStatusIcon()` to shared module
  - [x] Move `getStatusBadge()` to shared module
  - [x] Update `page.tsx` to import from shared module
  - [x] Update `ResultCard.tsx` to import from shared module
  - [x] Delete duplicate implementations

- [x] **5.3 — Decompose `page.tsx`**
  - [x] Create `src/hooks/useComparison.ts`
    - [x] Move all comparison state (`sourceUrls`, `newDomain`, `jobId`, `results`, etc.)
    - [x] Move `runComparison()` function
    - [x] Move `pollForCompletion()` function
    - [x] Move `retryVerification()` function
    - [x] Move job loading logic from `useEffect`
    - [x] Export a single hook with all state and actions
  - [x] Create `src/hooks/useResultFilter.ts`
    - [x] Move `statusFilter` and `pathFilter` state
    - [x] Move filter predicate logic
    - [x] Export hook returning filter state + setters + filtered results function
  - [x] Create `src/components/ComparisonConfig.tsx`
    - [x] Move the entire left panel (Tabs, manual form, config grid, override token)
    - [x] Accept comparison hook values as props
  - [x] Create `src/components/SummaryCard.tsx`
    - [x] Move the 5-stat summary grid (OK/Redirected/Missing/Error/Total)
    - [x] Accept `JobSummary` as props
  - [x] Create `src/components/ResultsPanel.tsx`
    - [x] Move summary card + filter bar + result list + export buttons
    - [x] Accept comparison + filter hook values as props
  - [x] Create `src/components/FullscreenResults.tsx`
    - [x] Move the fullscreen overlay
    - [x] Accept comparison + filter hook values as props
  - [x] Reduce `page.tsx` to ~60-line orchestrator
  - [x] Verify: all functionality works identically (compare, filter, retry, export, fullscreen)

- [x] **5.4 — Wire Export Buttons to Server-Side API**
  - [x] Replace client-side `Blob` export with `window.open('/api/export?jobId=...&format=...')`
  - [x] Remove `exportResults` function that builds Blobs in memory
  - [x] Verify: CSV and JSON exports download correctly via server endpoint

- [x] **5.5 — Fix `JobCard` Deletion UX**
  - [x] Add `onDelete?: (id: string) => void` to `JobCardProps`
  - [x] Replace `window.location.reload()` with `onDelete(id)` callback
  - [x] Update `jobs/page.tsx` to pass `handleDelete` that removes job from state
  - [x] Verify: delete a job — list updates without page reload

- [x] **5.6 — Fix NavBar Issues**
  - [x] Remove `matchExact` from `navItems` and `isActive()` parameter
  - [x] Add "Crawl History" link (`/crawl`) to `navItems`
  - [x] Verify: all three nav links work and highlight correctly

- [x] **5.7 — Remove CSS Mobile Block**
  - [x] Remove `min-width: 1024px` from `body` in `globals.css`
  - [x] Verify: page loads on narrow viewport without being clipped (horizontal scroll is acceptable)

- [x] **Phase 5 gate: commit & verify**
  - [x] `npx tsc --noEmit` passes
  - [x] `npm run lint` passes
  - [x] Full UI smoke test (compare, scan, filter, retry, export, delete, navigate)
  - [x] Git commit: `refactor: decompose page.tsx, shared types, UI improvements`

---

## Phase 6 — Quality & Testing (~3-4 hr)

**Commit message:** `test: add unit tests, improve type safety, update Docker config`

- [x] **6.1 — Set Up Test Infrastructure**
  - [x] `npm install -D vitest @testing-library/react @testing-library/jest-dom`
  - [x] Add `"test": "vitest run"` and `"test:watch": "vitest"` to `package.json`
  - [x] Create `vitest.config.ts` with `@` path alias
  - [x] Verify: `npm test` runs (even if no tests yet)

- [x] **6.2 — Unit Tests for `urlChecker.ts`**
  - [x] Create `src/lib/__tests__/urlChecker.test.ts`
  - [x] Test `extractPath()` with pathname, query params, hash fragments, invalid URL
  - [x] Test `constructNewUrl()` with various path + domain combos
  - [x] Test `isUrlSafe()`:
    - [x] Allows HTTPS URLs
    - [x] Allows public 172.x IPs (e.g., `172.217.0.1`)
    - [x] Blocks private `172.16-31.x.x` range
    - [x] Blocks `file://` URLs
    - [x] Blocks metadata IP `169.254.169.254`
    - [x] Blocks `localhost`
    - [x] Blocks `10.x.x.x`
    - [x] Blocks `192.168.x.x`
  - [x] Verify: `npm test` — all pass

- [x] **6.3 — Unit Tests for `json.ts`**
  - [x] Create `src/lib/__tests__/json.test.ts`
  - [x] Test `safeParseJson()` with valid JSON
  - [x] Test `safeParseJson()` with invalid JSON — returns fallback
  - [x] Test `safeParseJson()` with null/undefined — returns fallback
  - [x] Test `toJsonString()` with arrays and objects
  - [x] Verify: `npm test` — all pass

- [x] **6.4 — Unit Tests for `crawler.ts`**
  - [x] Create `src/lib/__tests__/crawler.test.ts`
  - [x] Test URL normalization
  - [x] Test glob pattern matching (include/exclude)
  - [x] Test link extraction from HTML
  - [x] Verify: `npm test` — all pass

- [x] **6.5 — Eliminate `any` Types**
  - [x] Create `ComparisonConfig` interface for `processComparisonJob` config param
  - [x] Type `generateSummary` parameter as Prisma `UrlResult[]`
  - [x] Replace `job.status as any` in `jobs/page.tsx` with `JobStatus` type
  - [x] Define proper options interface for `processCrawlJob` (remove `as any`)
  - [x] Verify: `npx tsc --noEmit` passes, grep for remaining `any` — only intentional suppressed ones

- [x] **6.6 — Add Polling Backoff**
  - [x] Create `getBackoffDelay(pollCount)` utility (2s → 3s → 4.5s → ... → 15s cap)
  - [x] Apply to comparison polling in `useComparison.ts` (or `page.tsx`)
  - [x] Apply to crawl polling in `CrawlForm.tsx`
  - [x] Verify: start a long job — observe increasing poll intervals in Network tab

- [x] **6.7 — Add Input Validation with Zod**
  - [x] Create `src/lib/schemas.ts`
  - [x] Define `ComparisonRequestSchema` with Zod
  - [x] Define `CrawlRequestSchema` with Zod
  - [x] Use `ComparisonRequestSchema.safeParse()` in `comparison/route.ts` POST handler
  - [x] Use `CrawlRequestSchema.safeParse()` in `crawl/route.ts` POST handler
  - [x] Return `400` with `.error.flatten()` on validation failure
  - [x] Verify: send malformed request body — get structured error response

- [x] **6.8 — Update Docker Configuration**
  - [x] Update `Dockerfile` base image to `node:22-alpine`
  - [x] Review/update build steps for Next.js 16 output structure
  - [x] Update `docker-compose.yml` if needed
  - [x] Verify: `docker build -t urlcompare .` succeeds

- [x] **Phase 6 gate: commit & verify**
  - [x] `npm test` — all tests pass
  - [x] `npx tsc --noEmit` passes
  - [x] `npm run lint` passes
  - [x] `npm run build` succeeds
  - [x] Git commit: `test: add unit tests, improve type safety, update Docker config`

---

## Final Verification Checklist

- [x] `npx tsc --noEmit` — zero errors (pre-existing chart.tsx/resizable.tsx only)
- [x] `npm run lint` — zero errors (pre-existing use-toast.ts warning only)
- [x] `npm test` — all pass (65 tests)
- [x] `npm run build` — successful production build
- [x] `npm run dev` — starts without warnings
- [x] Browser: create a comparison job → verify results → export HTML
- [x] Browser: run a domain crawl → use results for comparison
- [x] Browser: cancel a running comparison job
- [x] Browser: delete a job from history (no page reload)
- [x] Browser: navigate to Crawl History via NavBar
- [x] Browser: toggle Edge Override Token checkbox
- [x] Confirm `dev.log` truncates on restart
- [x] Confirm `.env.example` is committed to git
