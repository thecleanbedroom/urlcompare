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

- [ ] **Phase 2 gate: commit & verify**
  - [ ] `npm run build` succeeds
  - [ ] `npm run dev` starts without errors
  - [ ] Git commit: `chore: remove dead code, fix gitignore, audit dependencies`

---

## Phase 3 — Data Model Hardening (~1.5 hr)

**Commit message:** `refactor: harden data model, add lastError to ComparisonJob, JSON helpers`

- [ ] **3.1 — Add `lastError` Field to ComparisonJob**
  - [ ] Add `lastError String?` to `ComparisonJob` in `prisma/schema.prisma`
  - [ ] Update `processComparisonJob` catch block in `comparison/route.ts` to write `lastError`

- [ ] **3.2 — Add `updatedAt` to UrlResult**
  - [ ] Add `updatedAt DateTime @updatedAt` to `UrlResult` in `prisma/schema.prisma`

- [ ] **3.3 — Create JSON Serialization Helpers**
  - [ ] Create `src/lib/json.ts` with `safeParseJson<T>()` and `toJsonString()`
  - [ ] Replace bare `JSON.parse()` in `src/app/api/comparison/route.ts` with `safeParseJson()`
  - [ ] Replace bare `JSON.parse()` in `src/app/api/export/route.ts` with `safeParseJson()`
  - [ ] Replace bare `JSON.parse()` in `src/app/api/crawl/route.ts` with `safeParseJson()`
  - [ ] Replace bare `JSON.parse()` in `src/components/ResultCard.tsx` with `safeParseJson()`
  - [ ] Replace bare `JSON.stringify()` for DB writes with `toJsonString()` where applicable
  - [ ] Verify: corrupt a `redirectChain` value in DB to invalid JSON — app must not crash

- [ ] **3.4 — Run Schema Migration**
  - [ ] Run `npx prisma db push` (dev) or generate migration files (prod)
  - [ ] Run `npx prisma generate`
  - [ ] Verify: app starts and existing data is preserved

- [ ] **Phase 3 gate: commit & verify**
  - [ ] `npx tsc --noEmit` passes
  - [ ] `npm run dev` starts without errors
  - [ ] Git commit: `refactor: harden data model, add lastError to ComparisonJob, JSON helpers`

---

## Phase 4 — Backend Improvements (~2.5 hr)

**Commit message:** `feat: full redirect chain detection, comparison cancellation, API improvements`

- [ ] **4.1 — Fix Redirect Chain Detection**
  - [ ] Rewrite `checkUrlStatus()` in `src/lib/urlChecker.ts` to use manual redirect follow loop
    - [ ] Use `redirect: 'manual'` in fetch
    - [ ] Follow `Location` header through 301/302/303/307/308 responses
    - [ ] Resolve relative redirect URLs with `new URL(location, currentUrl)`
    - [ ] Cap at 10 hops maximum
    - [ ] Build `redirectChain` array with all intermediate URLs
  - [ ] Add `signal?: AbortSignal` to `CheckUrlConfig` interface
  - [ ] Compose timeout controller with external signal using `AbortSignal.any()`
  - [ ] Store redirect chain using `toJsonString()` (from Phase 3.3)
  - [ ] Verify: test against a URL with known multi-hop redirects — chain captures all hops

- [ ] **4.2 — Add Comparison Job Cancellation**
  - [ ] Add `activeComparisons` Map at module level in `comparison/route.ts`
  - [ ] Create `AbortController` at start of `processComparisonJob`, store in map
  - [ ] Pass signal to `checkUrlStatus` calls via `config.signal`
  - [ ] Check `signal.aborted` between batches, exit early if aborted
  - [ ] Clean up map entry in `finally` block
  - [ ] Add `DELETE` handler to `comparison/route.ts`
    - [ ] Accept `jobId` query param
    - [ ] Abort the controller and remove from map
    - [ ] Update job status to `cancelled` in DB
  - [ ] Add "Cancel" button to progress UI in `page.tsx`
  - [ ] Verify: start a large comparison, cancel mid-run — job status shows `cancelled`

- [ ] **4.3 — Move Override Token to Environment Variable**
  - [ ] Create `.env.example` file with `DATABASE_URL`, `PRISMA_DEBUG`, `EDGE_OVERRIDE_TOKEN`
  - [ ] Change `CheckUrlConfig.overrideToken` to `useOverrideToken: boolean`
  - [ ] Update `checkUrlStatus()` to read `process.env.EDGE_OVERRIDE_TOKEN` when `useOverrideToken` is true
  - [ ] Update `crawler.ts` `CrawlerOptions` the same way
  - [ ] Update `comparison/route.ts` to pass `useOverrideToken` boolean
  - [ ] Update `verify/route.ts` to pass `useOverrideToken` boolean
  - [ ] Update `crawl/route.ts` to pass `useOverrideToken` boolean
  - [ ] Update `page.tsx`: replace password input with checkbox toggle
  - [ ] Update `CrawlForm.tsx`: accept `useOverrideToken` boolean prop instead of string
  - [ ] Verify: set `EDGE_OVERRIDE_TOKEN` in `.env`, toggle checkbox — header is sent

- [ ] **4.4 — Persist Error Context on Comparison Failure**
  - [ ] Ensure catch block in `processComparisonJob` writes to `lastError` field (depends on 3.1)
  - [ ] Display `lastError` in the UI when job status is `failed`
  - [ ] Verify: trigger a job failure — error message is visible in UI

- [ ] **4.5 — Fix Error Handling in Jobs API**
  - [ ] Change `GET /api/jobs` catch block to return `{ error: '...' }` with status 500
  - [ ] Update `jobs/page.tsx` `fetchJobs()` to check `response.ok` before parsing
  - [ ] Verify: simulate DB error — user sees error message, not empty list

- [ ] **4.6 — Move Database Init Out of Module Import**
  - [ ] Remove `ensureDatabaseExists()` call from `src/lib/db.ts` module body
  - [ ] Remove `ensureDatabaseExists()` function definition
  - [ ] Remove `dbInitialized` global flag
  - [ ] Add `"predev"` and/or `"prestart"` script in `package.json` for `prisma db push`
  - [ ] Verify: delete `prisma/db/custom.db`, run `npm run dev` — DB is created by predev script

- [ ] **Phase 4 gate: commit & verify**
  - [ ] `npx tsc --noEmit` passes
  - [ ] `npm run lint` passes
  - [ ] `npm run dev` starts without errors
  - [ ] Git commit: `feat: full redirect chain detection, comparison cancellation, API improvements`

---

## Phase 5 — Frontend Refactor (~3-4 hr)

**Commit message:** `refactor: decompose page.tsx, shared types, UI improvements`

- [ ] **5.1 — Extract Shared Types**
  - [ ] Create `src/types/index.ts`
  - [ ] Define `UrlResult` interface (single source of truth)
  - [ ] Define `JobSummary` interface
  - [ ] Define `StatusFilter` type
  - [ ] Define `JobStatus` type (include `'cancelled'`)
  - [ ] Update imports in `page.tsx` to use shared type
  - [ ] Update imports in `ResultCard.tsx` to use shared type
  - [ ] Update imports in `JobCard.tsx` to use shared type
  - [ ] Update imports in `jobs/page.tsx` to use shared type
  - [ ] Delete duplicate type definitions from all files

- [ ] **5.2 — Extract Shared Status Utilities**
  - [ ] Create `src/lib/status.tsx`
  - [ ] Move `getStatusIcon()` to shared module
  - [ ] Move `getStatusBadge()` to shared module
  - [ ] Update `page.tsx` to import from shared module
  - [ ] Update `ResultCard.tsx` to import from shared module
  - [ ] Delete duplicate implementations

- [ ] **5.3 — Decompose `page.tsx`**
  - [ ] Create `src/hooks/useComparison.ts`
    - [ ] Move all comparison state (`sourceUrls`, `newDomain`, `jobId`, `results`, etc.)
    - [ ] Move `runComparison()` function
    - [ ] Move `pollForCompletion()` function
    - [ ] Move `retryVerification()` function
    - [ ] Move job loading logic from `useEffect`
    - [ ] Export a single hook with all state and actions
  - [ ] Create `src/hooks/useResultFilter.ts`
    - [ ] Move `statusFilter` and `pathFilter` state
    - [ ] Move filter predicate logic
    - [ ] Export hook returning filter state + setters + filtered results function
  - [ ] Create `src/components/ComparisonConfig.tsx`
    - [ ] Move the entire left panel (Tabs, manual form, config grid, override token)
    - [ ] Accept comparison hook values as props
  - [ ] Create `src/components/SummaryCard.tsx`
    - [ ] Move the 5-stat summary grid (OK/Redirected/Missing/Error/Total)
    - [ ] Accept `JobSummary` as props
  - [ ] Create `src/components/ResultsPanel.tsx`
    - [ ] Move summary card + filter bar + result list + export buttons
    - [ ] Accept comparison + filter hook values as props
  - [ ] Create `src/components/FullscreenResults.tsx`
    - [ ] Move the fullscreen overlay
    - [ ] Accept comparison + filter hook values as props
  - [ ] Reduce `page.tsx` to ~60-line orchestrator
  - [ ] Verify: all functionality works identically (compare, filter, retry, export, fullscreen)

- [ ] **5.4 — Wire Export Buttons to Server-Side API**
  - [ ] Replace client-side `Blob` export with `window.open('/api/export?jobId=...&format=...')`
  - [ ] Remove `exportResults` function that builds Blobs in memory
  - [ ] Verify: CSV and JSON exports download correctly via server endpoint

- [ ] **5.5 — Fix `JobCard` Deletion UX**
  - [ ] Add `onDelete?: (id: string) => void` to `JobCardProps`
  - [ ] Replace `window.location.reload()` with `onDelete(id)` callback
  - [ ] Update `jobs/page.tsx` to pass `handleDelete` that removes job from state
  - [ ] Verify: delete a job — list updates without page reload

- [ ] **5.6 — Fix NavBar Issues**
  - [ ] Remove `matchExact` from `navItems` and `isActive()` parameter
  - [ ] Add "Crawl History" link (`/crawl`) to `navItems`
  - [ ] Verify: all three nav links work and highlight correctly

- [ ] **5.7 — Remove CSS Mobile Block**
  - [ ] Remove `min-width: 1024px` from `body` in `globals.css`
  - [ ] Verify: page loads on narrow viewport without being clipped (horizontal scroll is acceptable)

- [ ] **Phase 5 gate: commit & verify**
  - [ ] `npx tsc --noEmit` passes
  - [ ] `npm run lint` passes
  - [ ] Full UI smoke test (compare, scan, filter, retry, export, delete, navigate)
  - [ ] Git commit: `refactor: decompose page.tsx, shared types, UI improvements`

---

## Phase 6 — Quality & Testing (~3-4 hr)

**Commit message:** `test: add unit tests, improve type safety, update Docker config`

- [ ] **6.1 — Set Up Test Infrastructure**
  - [ ] `npm install -D vitest @testing-library/react @testing-library/jest-dom`
  - [ ] Add `"test": "vitest run"` and `"test:watch": "vitest"` to `package.json`
  - [ ] Create `vitest.config.ts` with `@` path alias
  - [ ] Verify: `npm test` runs (even if no tests yet)

- [ ] **6.2 — Unit Tests for `urlChecker.ts`**
  - [ ] Create `src/lib/__tests__/urlChecker.test.ts`
  - [ ] Test `extractPath()` with pathname, query params, hash fragments, invalid URL
  - [ ] Test `constructNewUrl()` with various path + domain combos
  - [ ] Test `isUrlSafe()`:
    - [ ] Allows HTTPS URLs
    - [ ] Allows public 172.x IPs (e.g., `172.217.0.1`)
    - [ ] Blocks private `172.16-31.x.x` range
    - [ ] Blocks `file://` URLs
    - [ ] Blocks metadata IP `169.254.169.254`
    - [ ] Blocks `localhost`
    - [ ] Blocks `10.x.x.x`
    - [ ] Blocks `192.168.x.x`
  - [ ] Verify: `npm test` — all pass

- [ ] **6.3 — Unit Tests for `json.ts`**
  - [ ] Create `src/lib/__tests__/json.test.ts`
  - [ ] Test `safeParseJson()` with valid JSON
  - [ ] Test `safeParseJson()` with invalid JSON — returns fallback
  - [ ] Test `safeParseJson()` with null/undefined — returns fallback
  - [ ] Test `toJsonString()` with arrays and objects
  - [ ] Verify: `npm test` — all pass

- [ ] **6.4 — Unit Tests for `crawler.ts`**
  - [ ] Create `src/lib/__tests__/crawler.test.ts`
  - [ ] Test URL normalization
  - [ ] Test glob pattern matching (include/exclude)
  - [ ] Test link extraction from HTML
  - [ ] Verify: `npm test` — all pass

- [ ] **6.5 — Eliminate `any` Types**
  - [ ] Create `ComparisonConfig` interface for `processComparisonJob` config param
  - [ ] Type `generateSummary` parameter as Prisma `UrlResult[]`
  - [ ] Replace `job.status as any` in `jobs/page.tsx` with `JobStatus` type
  - [ ] Define proper options interface for `processCrawlJob` (remove `as any`)
  - [ ] Verify: `npx tsc --noEmit` passes, grep for remaining `any` — only intentional suppressed ones

- [ ] **6.6 — Add Polling Backoff**
  - [ ] Create `getBackoffDelay(pollCount)` utility (2s → 3s → 4.5s → ... → 15s cap)
  - [ ] Apply to comparison polling in `useComparison.ts` (or `page.tsx`)
  - [ ] Apply to crawl polling in `CrawlForm.tsx`
  - [ ] Verify: start a long job — observe increasing poll intervals in Network tab

- [ ] **6.7 — Add Input Validation with Zod**
  - [ ] Create `src/lib/schemas.ts`
  - [ ] Define `ComparisonRequestSchema` with Zod
  - [ ] Define `CrawlRequestSchema` with Zod
  - [ ] Use `ComparisonRequestSchema.safeParse()` in `comparison/route.ts` POST handler
  - [ ] Use `CrawlRequestSchema.safeParse()` in `crawl/route.ts` POST handler
  - [ ] Return `400` with `.error.flatten()` on validation failure
  - [ ] Verify: send malformed request body — get structured error response

- [ ] **6.8 — Update Docker Configuration**
  - [ ] Update `Dockerfile` base image to `node:22-alpine`
  - [ ] Review/update build steps for Next.js 16 output structure
  - [ ] Update `docker-compose.yml` if needed
  - [ ] Verify: `docker build -t urlcompare .` succeeds

- [ ] **Phase 6 gate: commit & verify**
  - [ ] `npm test` — all tests pass
  - [ ] `npx tsc --noEmit` passes
  - [ ] `npm run lint` passes
  - [ ] `npm run build` succeeds
  - [ ] Git commit: `test: add unit tests, improve type safety, update Docker config`

---

## Final Verification Checklist

- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npm run lint` — zero errors
- [ ] `npm test` — all pass
- [ ] `npm run build` — successful production build
- [ ] `npm run dev` — starts without warnings
- [ ] Browser: create a comparison job → verify results → export HTML
- [ ] Browser: run a domain crawl → use results for comparison
- [ ] Browser: cancel a running comparison job
- [ ] Browser: delete a job from history (no page reload)
- [ ] Browser: navigate to Crawl History via NavBar
- [ ] Browser: toggle Edge Override Token checkbox
- [ ] Confirm `dev.log` truncates on restart
- [ ] Confirm `.env.example` is committed to git
