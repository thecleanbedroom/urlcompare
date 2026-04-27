# Code Review — urlCompare

**Date:** April 27, 2026  
**Scope:** Full application review  
**Stack:** Next.js 16 · React 19 · Prisma 7 · SQLite · Socket.IO · TypeScript 6  
**Custom code:** ~3,800 lines (excl. 48 shadcn/ui components)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Strengths](#2-strengths)
3. [Critical Issues](#3-critical-issues)
4. [Security](#4-security)
5. [Data Model & Database](#5-data-model--database)
6. [Backend / API Routes](#6-backend--api-routes)
7. [Frontend / UI](#7-frontend--ui)
8. [Performance](#8-performance)
9. [Code Quality](#9-code-quality)
10. [Infrastructure & DevOps](#10-infrastructure--devops)
11. [Dead Code & Unused Dependencies](#11-dead-code--unused-dependencies)
12. [Recommendations Summary](#12-recommendations-summary)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────┐
│  Custom HTTP Server (server.ts)                  │
│  ├── Next.js 16 App Router                       │
│  │   ├── / (page.tsx)        — Main comparison   │
│  │   ├── /jobs               — Job history       │
│  │   └── /crawl              — Crawl history     │
│  ├── API Routes                                  │
│  │   ├── /api/comparison     — Start & poll jobs  │
│  │   ├── /api/crawl          — Domain scanning    │
│  │   ├── /api/verify         — Re-check single URL│
│  │   ├── /api/export         — CSV/JSON/HTML      │
│  │   ├── /api/jobs           — Job CRUD           │
│  │   └── /api/health         — Health check       │
│  └── Socket.IO (echo-only)                       │
├──────────────────────────────────────────────────┤
│  Core Libraries                                  │
│  ├── urlChecker.ts           — URL status checker │
│  ├── crawler.ts              — BFS domain crawler │
│  ├── db.ts                   — Prisma singleton   │
│  └── socket.ts               — Socket.IO setup    │
├──────────────────────────────────────────────────┤
│  SQLite (prisma/db/custom.db)                    │
│  ├── ComparisonJob                               │
│  ├── CrawlJob                                    │
│  ├── UrlResult                                   │
│  ├── User (unused)                               │
│  └── Post (unused)                               │
└──────────────────────────────────────────────────┘
```

The app is a **URL migration validation tool** — it crawls a source domain, then checks each discovered URL against a target domain to identify broken links, redirects, and missing pages.

---

## 2. Strengths

### Well-structured core libraries
- `urlChecker.ts` is focused, well-typed, and handles retries/timeouts correctly.
- `crawler.ts` is a clean BFS implementation with configurable depth, delay, pattern matching, and signal-based cancellation.
- Good separation between the URL checking logic and the API route orchestration.

### Solid UX patterns
- Background job processing with polling is correctly implemented (no blocking the HTTP response).
- The fullscreen results overlay, path filtering, and per-result retry are useful power-user features.
- Crawl → comparison workflow is seamless (discovered URLs feed directly into the comparison tab).

### Good operational basics
- Auto-database initialization on first run (`db.ts` runs `prisma db push` if the .db file is missing).
- Health check endpoint for monitoring.
- Export in three formats (JSON, CSV, HTML report).
- The HTML export is a fully self-contained report with embedded styles.

### Clean dependency management
- Prisma singleton avoids dev-mode connection exhaustion.
- `nodemon` configuration is properly scoped to watch only `server.ts` and `src/`.

---

## 3. Critical Issues

### 3.1 — `page.tsx` is a 894-line God Component

**File:** `src/app/page.tsx`

The main page contains all state management, API calls, polling logic, export logic, status helpers, result filtering, and the entire UI — all in one function. This is the single biggest maintainability risk.

**Impact:** Any change to results display, configuration, or polling risks breaking unrelated functionality. The component re-renders entirely on any state change.

**Recommendation:** Extract into modules:
- `hooks/useComparison.ts` — state + polling + API calls
- `hooks/useResultFilter.ts` — filter/search logic
- `components/ComparisonForm.tsx` — the manual URL config panel
- `components/ResultsPanel.tsx` — summary + results list + export
- `components/SummaryCard.tsx` — the 5-stat summary grid

### 3.2 — Redirect chain detection is incomplete

**File:** `src/lib/urlChecker.ts:79-92`

```typescript
if (response.redirected) {
    const finalResponse = await fetch(newUrl, {
        method: 'GET',
        redirect: 'manual',
        headers
    })
    // Only captures a single hop
}
```

The code fires a second `fetch(..., redirect: 'manual')` after detecting `response.redirected`, but only captures **one hop**. Multi-hop redirect chains (A→B→C→D) are truncated to just the first hop. The `redirectChain` array will always have 0 or 1 entries.

**Recommendation:** Follow redirects manually in a loop (cap at ~10 hops) to build the full chain, or use the `response.url` from the first fetch (which already followed all redirects) and compare it to the original URL to detect the chain.

### 3.3 — No cancellation propagation for comparison jobs

**File:** `src/app/api/comparison/route.ts:78`

```typescript
processComparisonJob(job.id, validUrls, newDomain, config).catch(...)
```

Unlike crawl jobs which have an `activeCrawls` Map + `AbortController` + DELETE endpoint, comparison jobs have **no cancellation mechanism**. Once started, a comparison with thousands of URLs runs to completion with no way to stop it.

**Recommendation:** Add an `activeComparisons` Map with `AbortController` like the crawl system and expose a DELETE or PATCH endpoint to cancel running jobs.

---

## 4. Security

### 4.1 — XSS in HTML export (HIGH)

**File:** `src/app/api/export/route.ts:183-194`

```typescript
<td>${r.sourceUrl}</td>
<td>${r.newUrl}</td>
```

URL values are interpolated directly into the HTML template without escaping. A malicious URL like `https://evil.com/<script>alert(1)</script>` would execute in the exported report.

**Fix:** HTML-encode all interpolated values:
```typescript
function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;')
              .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

### 4.2 — Override token transmitted in API body (MEDIUM)

The `overrideToken` is sent in the JSON request body from the browser to the Next.js API routes. While this is a same-origin call, the token could appear in:
- Server logs (if request body logging is enabled)
- Browser DevTools Network tab
- `dev.log` file (via the `tee` in the dev script)

**Recommendation:** Consider accepting the token as a server-side environment variable (`EDGE_OVERRIDE_TOKEN`) instead of transmitting it from the client on every request. The UI toggle would just enable/disable its use.

### 4.3 — No input sanitization on URLs (LOW)

URLs from user input are validated for format (`new URL(url)`) but not sanitized. `file://`, `ftp://`, or internal network URLs (`http://169.254.169.254/...`) could be used for SSRF if this tool is deployed on a server with access to internal networks.

**Recommendation:** Reject non-HTTP(S) schemes and optionally block RFC 1918 / link-local IP ranges.

### 4.4 — `execSync` in db.ts (LOW)

```typescript
execSync('npx prisma db push', { stdio: 'inherit' })
```

Running `npx` with `execSync` at module load time is a startup side-effect. While the input isn't user-controlled, this blocks the event loop during initialization and introduces a dependency on `npx` being available at runtime.

**Recommendation:** Run migrations as a separate startup step (in `dev` script or `start.sh`) rather than at module import time.

---

## 5. Data Model & Database

### 5.1 — Unused models

```prisma
model User { ... }
model Post { ... }
```

These are scaffold leftovers from `create-next-app` and should be removed. They add noise to the schema and generate unused Prisma client code.

### 5.2 — JSON-in-text columns

Multiple fields store JSON as `String`:
- `ComparisonJob.sourceUrls` — JSON array
- `ComparisonJob.config` — JSON object
- `CrawlJob.discoveredUrls` — JSON array (can be **massive**)
- `CrawlJob.includePatterns` / `excludePatterns` — JSON arrays
- `UrlResult.redirectChain` — JSON array

This is a SQLite limitation (no native JSON type), but the code is inconsistent about parsing — some places use `JSON.parse()` with try/catch, others without. A helper function or a shared serialization layer would reduce bugs.

### 5.3 — `CrawlJob.discoveredUrls` scalability

Storing thousands of discovered URLs as a single JSON string in one column works for small crawls but will create very large rows (megabytes) for crawls of 1,000+ pages. Consider a separate `CrawlUrl` table or storing to a file on disk.

### 5.4 — Missing `updatedAt` on `UrlResult`

The `UrlResult` model has `checkedAt` but no `updatedAt`, making it hard to track when a result was re-verified. The verify endpoint updates the record but the only timestamp reflects the new check, losing the original check time.

### 5.5 — CrawlJob → ComparisonJob relation is unused

```prisma
comparisonJobId String?
comparisonJob   ComparisonJob? @relation(...)
```

This foreign key is defined but never populated in any code path. The crawl-to-comparison flow passes URLs through the UI (client-side) rather than linking the jobs in the database.

---

## 6. Backend / API Routes

### 6.1 — `processComparisonJob` error handling swallows context

**File:** `src/app/api/comparison/route.ts:238-244`

When a batch fails, the entire job is marked `failed` but the specific error is only logged to console — it's not persisted to the database. Users see "failed" with no diagnostic information.

**Recommendation:** Add an `error` or `lastError` field to `ComparisonJob` (like `CrawlJob` has) and save the error message.

### 6.2 — Progress updates are coarse-grained

Comparison progress updates only fire after each batch completes (batches of `maxConcurrency`, default 10). For a job with 100 URLs at concurrency 10, the progress jumps in 10% increments. This is fine but could feel laggy for large jobs.

### 6.3 — `api/jobs/[id]/route.ts` params typing is wrong for Next.js 16

```typescript
interface Params {
  params: { id: string }
}
export async function DELETE(_: Request, { params }: Params) {
```

Next.js 16 changed dynamic route params to be `Promise<{ id: string }>`. This is the source of the TypeScript error visible in `tsc --noEmit` output. Must be `await params` or typed as `Promise`.

### 6.4 — No rate limiting on any API endpoint

All API routes are unprotected. A misconfigured client could start hundreds of concurrent comparison or crawl jobs, overwhelming the server or the target domains being scanned.

### 6.5 — Verify endpoint doesn't validate ownership

The `/api/verify` endpoint accepts any `resultId` — there's no check that the result belongs to the user's session or a specific job. In a multi-user scenario this would be a data leakage issue.

---

## 7. Frontend / UI

### 7.1 — Duplicated type definitions

`UrlResult` interface is defined independently in:
- `src/app/page.tsx:19-28`
- `src/components/ResultCard.tsx:7-16`

These should be in a shared `types/` directory.

### 7.2 — Duplicated utility functions

`getStatusIcon()` and `getStatusBadge()` are implemented in both `page.tsx` and `ResultCard.tsx` with slightly different logic. The page versions include `text-` color classes while ResultCard's don't.

### 7.3 — `window.location.reload()` for state management

**File:** `src/components/JobCard.tsx:61`

After deleting a job, the component does a full page reload instead of updating React state. This is a jarring UX and loses any scroll position or filter state.

**Recommendation:** Accept an `onDelete` callback prop and update the parent's job list state.

### 7.4 — `matchExact` parameter is unused

**File:** `src/components/NavBar.tsx:17`

```typescript
const isActive = (href: string, matchExact: boolean) => {
    if (href === '/') return pathname === '/';
    return pathname === href;  // matchExact is never used
};
```

### 7.5 — CSS `min-width: 1024px` blocks mobile usage

**File:** `src/app/globals.css:121`

```css
body { min-width: 1024px; }
```

This prevents the app from being usable on tablets or phones. The two-column layout could collapse to a stacked layout at smaller screens.

### 7.6 — Crawl page is not linked in NavBar

The `/crawl` page exists but isn't accessible from the navigation bar. The NavBar only has "New Comparison" and "Job History". Users can only reach it by typing the URL directly.

---

## 8. Performance

### 8.1 — Client-side export for large result sets

**File:** `src/app/page.tsx:284-321`

The CSV/JSON export buttons in the main page construct the export data entirely in the browser memory via `Blob`. For jobs with tens of thousands of URLs, this could freeze the browser. The server-side `/api/export` endpoint exists but isn't being used by the UI buttons.

**Recommendation:** Wire the export buttons to use `/api/export?jobId=...&format=csv` instead.

### 8.2 — Polling interval is fixed at 2 seconds

Both comparison and crawl polling use a fixed 2-second interval. For long-running jobs, this generates unnecessary network traffic. Consider exponential backoff (2s → 4s → 8s, capped at 30s).

### 8.3 — Prisma `log: ['query']` in production

**File:** `src/lib/db.ts:43`

```typescript
new PrismaClient({ log: ['query'] })
```

Query logging is unconditionally enabled, including in production. This writes every SQL statement to stdout and adds overhead.

**Fix:**
```typescript
new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
})
```

### 8.4 — No pagination on results

The comparison API and jobs API return all results/jobs in a single response. After running many jobs, the `/api/jobs` endpoint and the results panel will load increasingly large payloads.

---

## 9. Code Quality

### 9.1 — Inconsistent `any` usage

Several places use `any` that could be properly typed:
- `processComparisonJob` config parameter is `any`
- `generateSummary` takes `any[]`
- `JobCard` casts `job.status as any`
- `processCrawlJob` uses `as any` for the options spread

### 9.2 — No test suite

Zero test files exist. The core libraries (`urlChecker.ts`, `crawler.ts`) are pure functions that would be straightforward to unit test. The API routes could use integration tests with a test database.

### 9.3 — Error handling inconsistency

Some API routes return errors with proper HTTP status codes and JSON bodies, while others (like `GET /api/jobs`) swallow errors and return empty arrays:

```typescript
// api/jobs/route.ts — silently returns [] on any error
return NextResponse.json([]);
```

This makes debugging harder — the client thinks there are simply no jobs.

### 9.4 — No request validation library

API inputs are validated with manual `if` checks. For a project of this size, this is fine, but as the API surface grows, a schema validator like Zod (already installed!) would catch more edge cases.

---

## 10. Infrastructure & DevOps

### 10.1 — Dev log file grows unbounded

```json
"dev": "nodemon ... 2>&1 | tee dev.log"
```

The `dev.log` file (currently 148KB) grows with every dev session and is never rotated. With query logging enabled, this can get large quickly.

### 10.2 — `server.log` is tracked in git

The git status shows `server.log` is a tracked file. Log files should be in `.gitignore`.

### 10.3 — Database file is tracked in git

`prisma/db/custom.db` appears in git status as modified. Binary SQLite databases should not be version-controlled — they create merge conflicts and bloat the repository.

### 10.4 — Docker configuration exists but may be stale

`Dockerfile`, `docker-compose.yml`, and `DOCKER.md` exist but reference Next.js 15 / Node 18 patterns. These likely need updating for the Node 22 / Next.js 16 migration.

### 10.5 — Socket.IO is scaffolded but unused

`socket.ts` implements a WebSocket echo server. No frontend component connects to it. It adds ~5MB of dependencies (`socket.io` + `socket.io-client`) for zero functionality.

---

## 11. Dead Code & Unused Dependencies

### Models
- `User` and `Post` Prisma models — scaffold leftovers

### Dependencies (in package.json but not imported anywhere in `src/`)
Potential candidates for removal (verify before removing):

| Package | Reason |
|---------|--------|
| `socket.io` + `socket.io-client` | Echo server scaffolding, not used by any UI |
| `@mdxeditor/editor` | No MDX editing anywhere |
| `@dnd-kit/*` | No drag-and-drop features |
| `next-auth` | No authentication implemented |
| `next-intl` | No internationalization |
| `next-themes` | No theme switching |
| `framer-motion` | No animations using it |
| `react-markdown` | No markdown rendering |
| `@tanstack/react-query` | All data fetching uses raw `fetch` |
| `@tanstack/react-table` | Tables use shadcn/ui Table directly |
| `zustand` | All state is in React `useState` |
| `axios` | All HTTP uses native `fetch` |
| `react-hook-form` + `@hookform/resolvers` | No forms use it |
| `zod` | Installed but not imported |
| `sharp` | No image processing |

Many of these are likely from the shadcn/ui initialization or used by UI components. Verify with:
```bash
for pkg in socket.io-client @mdxeditor/editor @dnd-kit/core next-auth next-intl framer-motion react-markdown @tanstack/react-query zustand axios react-hook-form zod sharp; do
  echo -n "$pkg: "; grep -r "from ['\"]$pkg" src/ | wc -l
done
```

### 48 shadcn/ui components installed

The project installs the full shadcn/ui component library (48 components) but only uses ~15 of them. Consider removing unused components to reduce bundle size or accept this as acceptable overhead for a tool app.

---

## 12. Recommendations Summary

### Priority Matrix

| Priority | Item | Effort |
|----------|------|--------|
| 🔴 HIGH | Fix XSS in HTML export | 30 min |
| 🔴 HIGH | Fix `api/jobs/[id]` params for Next.js 16 | 15 min |
| 🟠 MED | Break up `page.tsx` God component | 2-3 hrs |
| 🟠 MED | Fix incomplete redirect chain detection | 1 hr |
| 🟠 MED | Add comparison job cancellation | 1 hr |
| 🟠 MED | Move override token to env variable | 30 min |
| 🟡 LOW | Remove dead models (User, Post) | 10 min |
| 🟡 LOW | Remove unused dependencies | 30 min |
| 🟡 LOW | Add SSRF protection on URL input | 30 min |
| 🟡 LOW | Wire export buttons to server-side API | 30 min |
| 🟡 LOW | Extract shared types to `types/` dir | 30 min |
| 🟡 LOW | Conditional Prisma query logging | 5 min |
| 🟡 LOW | Add `.gitignore` entries for logs + db | 5 min |
| 🟢 NICE | Add unit tests for urlChecker + crawler | 2-3 hrs |
| 🟢 NICE | Add polling backoff | 30 min |
| 🟢 NICE | Audit unused dependencies | 1 hr |
| 🟢 NICE | Add result pagination | 1-2 hrs |
| 🟢 NICE | Update Docker config for Node 22 | 30 min |

### Quick Wins (< 30 minutes combined)

1. Escape HTML in export template
2. Fix `params` typing in `api/jobs/[id]`
3. Conditional Prisma logging
4. Add `*.log`, `prisma/db/*.db` to `.gitignore`
5. Remove `User` and `Post` from schema
