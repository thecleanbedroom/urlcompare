# Remediation Plan — urlCompare

**Based on:** [CODEREVIEW.april26.md](./CODEREVIEW.april26.md)  
**Date:** April 27, 2026  
**Reviewed:** April 27, 2026 — 8 review items incorporated (2 high, 4 medium, 2 low)  
**Estimated total effort:** 14–18 hours across 6 phases

---

## Execution Strategy

The plan is organized into **6 sequential phases**, ordered by risk reduction:

| Phase | Focus | Time | Commit after? |
|-------|-------|------|---------------|
| 1 | Critical fixes (security + breakage) | 1 hr | ✅ |
| 2 | Infrastructure cleanup | 1 hr | ✅ |
| 3 | Data model hardening | 1.5 hr | ✅ |
| 4 | Backend improvements | 2.5 hr | ✅ |
| 5 | Frontend refactor | 3–4 hr | ✅ |
| 6 | Quality & testing | 3–4 hr | ✅ |

Each phase is self-contained — the app should remain functional between phases.

---

## Phase 1 — Critical Fixes

> **Goal:** Eliminate the active security vulnerability and the one broken API route.  
> **Time:** ~1 hour  
> **Commit message:** `fix: XSS in HTML export, Next.js 16 params typing, SSRF protection`

---

### 1.1 — Fix XSS in HTML Export

**Review ref:** §4.1  
**File:** `src/app/api/export/route.ts`

Add an `escapeHtml` utility and apply it to every interpolated value in the HTML template.

```typescript
// Add at top of file
function escapeHtml(str: string | null | undefined): string {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
```

Apply to every `${...}` inside the HTML template string (lines 115–203). Every user-derived value must pass through `escapeHtml()`:

```typescript
// Before
<td>${r.sourceUrl}</td>
// After
<td>${escapeHtml(r.sourceUrl)}</td>
```

Fields to escape: `job.name`, `job.id`, `job.newDomain`, `r.sourceUrl`, `r.newUrl`, `r.finalUrl`, `r.error`, redirect chain entries.

**Verify:** Export an HTML report for a job containing a URL like `https://test.com/<img src=x onerror=alert(1)>` and confirm the HTML renders the angle brackets as text, not markup.

---

### 1.2 — Fix `api/jobs/[id]` Params Typing for Next.js 16

**Review ref:** §6.3  
**File:** `src/app/api/jobs/[id]/route.ts`

Next.js 16 changed dynamic route segment params to `Promise`. Update the handler:

```typescript
// Before
interface Params {
  params: { id: string }
}
export async function DELETE(_: Request, { params }: Params) {
  const { id } = params;

// After
export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
```

Apply the same fix to the `GET`, `POST`, `PUT`, `PATCH` stubs if they access params (currently they don't, but update signatures for consistency).

**Verify:** `npx tsc --noEmit` reports zero errors.

---

### 1.3 — Add SSRF Protection on URL Input

**Review ref:** §4.3  
**File:** `src/lib/urlChecker.ts`

Add a URL scheme validation function and call it before fetching:

```typescript
/**
 * Check if an IPv4 address is in a private/reserved range (RFC 1918 + link-local + loopback)
 */
function isPrivateIPv4(hostname: string): boolean {
    if (hostname === 'localhost') return true;
    if (hostname.startsWith('127.')) return true;     // Loopback
    if (hostname.startsWith('10.')) return true;       // 10.0.0.0/8
    if (hostname.startsWith('192.168.')) return true;  // 192.168.0.0/16
    if (hostname === '169.254.169.254') return true;   // AWS metadata
    if (hostname.startsWith('169.254.')) return true;  // Link-local
    if (hostname === '[::1]') return true;              // IPv6 loopback

    // RFC 1918: 172.16.0.0/12 (172.16.0.0 – 172.31.255.255)
    // NOTE: 172.0-15.x.x and 172.32+.x.x are PUBLIC (e.g., 172.217.x.x = Google)
    if (hostname.startsWith('172.')) {
        const parts = hostname.split('.');
        if (parts.length >= 2) {
            const second = parseInt(parts[1], 10);
            if (second >= 16 && second <= 31) return true;
        }
    }

    return false;
}

/**
 * Validate that a URL is safe to fetch (HTTP/HTTPS only, no internal IPs)
 */
export function isUrlSafe(url: string): boolean {
    try {
        const parsed = new URL(url);
        // Only allow HTTP and HTTPS
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return false;
        }
        // Block private/reserved IP ranges
        if (isPrivateIPv4(parsed.hostname)) {
            return false;
        }
        return true;
    } catch {
        return false;
    }
}
```

Call `isUrlSafe()` in:
- `checkUrlStatus()` — before fetching the constructed URL
- `comparison/route.ts` — during URL validation before creating the job
- `crawler.ts` — in `fetchPage()` before fetching

**Verify:** Attempt a comparison with `http://169.254.169.254/latest/meta-data/` as a source URL and confirm it's rejected with a clear error.

---

### 1.4 — Conditional Prisma Query Logging

**Review ref:** §8.3  
**File:** `src/lib/db.ts`

Use a dedicated `PRISMA_DEBUG` env var rather than relying solely on `NODE_ENV` (preview/staging deployments often set `NODE_ENV=production` but still need debug logging):

```typescript
// Before
new PrismaClient({ log: ['query'] })

// After
new PrismaClient({
    log: process.env.PRISMA_DEBUG === 'true' ? ['query'] : ['error'],
})
```

Update `.env.example`:

```env
PRISMA_DEBUG=true  # Set to 'true' to enable SQL query logging
```

**Verify:** Start the server without `PRISMA_DEBUG` set and confirm no SQL queries appear in stdout.

---

## Phase 2 — Infrastructure Cleanup

> **Goal:** Clean up dead code, fix git hygiene, remove unused dependencies.  
> **Time:** ~1 hour  
> **Commit message:** `chore: remove dead code, fix gitignore, audit dependencies`

---

### 2.1 — Update `.gitignore`

**Review ref:** §10.2, §10.3  
**File:** `.gitignore`

Append:

```gitignore
# Logs
*.log
dev.log
server.log

# Database
prisma/db/*.db
prisma/db/*.db-journal
```

Then untrack the files:

```bash
git rm --cached dev.log server.log prisma/db/custom.db 2>/dev/null
```

---

### 2.2 — Remove Unused Prisma Models

**Review ref:** §5.1  
**File:** `prisma/schema.prisma`

Delete the `User` and `Post` models entirely. Then regenerate:

```bash
npx prisma generate
```

**Verify:** `npx prisma validate` passes. App starts normally.

---

### 2.3 — Remove Unused CrawlJob → ComparisonJob Relation

**Review ref:** §5.5  
**File:** `prisma/schema.prisma`

Remove from `CrawlJob`:

```diff
-  comparisonJobId String?
-  comparisonJob   ComparisonJob? @relation(fields: [comparisonJobId], references: [id])
```

Remove from `ComparisonJob`:

```diff
-  crawlJobs   CrawlJob[]
```

Run `npx prisma db push` to sync.

---

### 2.4 — Remove Socket.IO Scaffolding

**Review ref:** §10.5  
**Files affected:**
- Delete `src/lib/socket.ts`
- Edit `server.ts` — remove Socket.IO import, `Server` creation, `setupSocket()` call, and the `/api/socketio` request filter
- Edit `package.json` — remove `socket.io` and `socket.io-client` from dependencies

After removal, `server.ts` simplifies to:

```typescript
import { createServer } from 'http';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production';
const currentPort = 3000;
const hostname = '0.0.0.0';

async function createCustomServer() {
  const nextApp = next({ dev, dir: process.cwd() });
  await nextApp.prepare();
  const handle = nextApp.getRequestHandler();

  const server = createServer((req, res) => {
    handle(req, res);
  });

  server.on('upgrade', (req, socket, head) => {
    nextApp.getUpgradeHandler()(req, socket, head);
  });

  server.listen(currentPort, hostname, () => {
    console.log(`> Ready on http://${hostname}:${currentPort}`);
  });
}

createCustomServer();
```

**Verify:** `npm run dev` starts without errors. No WebSocket errors in browser console.

---

### 2.5 — Audit & Remove Unused Dependencies

**Review ref:** §11  

Run this verification script first:

```bash
for pkg in socket.io-client @mdxeditor/editor @dnd-kit/core @dnd-kit/sortable \
  @dnd-kit/utilities next-auth next-intl next-themes framer-motion react-markdown \
  @tanstack/react-query @tanstack/react-table zustand axios react-hook-form \
  @hookform/resolvers zod sharp @reactuses/core; do
  # Check direct imports in src/ (static and dynamic)
  count=$(grep -rE "from ['\"]$pkg|import\(['\"]$pkg" src/ 2>/dev/null | wc -l)
  # Also check if it's used by an installed shadcn/ui component
  ui_count=$(grep -rE "from ['\"]$pkg" src/components/ui/ 2>/dev/null | wc -l)
  echo "$pkg: $count direct imports, $ui_count in shadcn/ui"
done
```

For every package with **0 direct imports** in `src/` AND `src/components/ui/`:
- Run `npm ls <package> --depth=0` to check if it's a peer dependency of another installed package
- Also check config files (`next.config.ts`, `tailwind.config.ts`) for usage
- If no usage found anywhere, remove it: `npm uninstall <package>`
- If a UI component imports it but that component is unused, consider removing both

> [!WARNING]
> Do NOT remove packages that are peer dependencies of other installed packages.
> The `grep` pattern may miss `import * as` and dynamic `import()` calls — always verify with `npm ls` before uninstalling.

**Verify:** `npm run build` succeeds after removals.

---

### 2.6 — Truncate Dev Log in Dev Script

**Review ref:** §10.1  
**File:** `package.json`

Change the dev script to truncate the log on each start:

```json
"dev": ": > dev.log && nodemon --exec \"npx tsx server.ts\" --watch server.ts --watch src --ext ts,tsx,js,jsx 2>&1 | tee dev.log"
```

---

## Phase 3 — Data Model Hardening

> **Goal:** Improve schema robustness, add missing fields, improve JSON handling.  
> **Time:** ~1.5 hours  
> **Commit message:** `refactor: harden data model, add lastError to ComparisonJob, JSON helpers`

---

### 3.1 — Add `lastError` Field to ComparisonJob

**Review ref:** §6.1  
**File:** `prisma/schema.prisma`

```prisma
model ComparisonJob {
  // ... existing fields ...
  lastError     String?   // NEW: persists error message on failure
}
```

**File:** `src/app/api/comparison/route.ts`

Update the failure handler:

```typescript
// In the catch block of processComparisonJob
await db.comparisonJob.update({
    where: { id: jobId },
    data: {
        status: 'failed',
        lastError: error instanceof Error ? error.message : String(error)
    }
})
```

---

### 3.2 — Add `updatedAt` to UrlResult

**Review ref:** §5.4  
**File:** `prisma/schema.prisma`

```prisma
model UrlResult {
  // ... existing fields ...
  updatedAt   DateTime  @updatedAt  // NEW: tracks re-verification time
}
```

---

### 3.3 — Create JSON Serialization Helpers

**Review ref:** §5.2  
**File:** `src/lib/json.ts` (NEW)

```typescript
/**
 * Safely parse a JSON string, returning a fallback on failure.
 */
export function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

/**
 * Stringify a value for storage in a JSON text column.
 */
export function toJsonString(value: unknown): string {
    return JSON.stringify(value);
}
```

Replace all bare `JSON.parse()` calls across API routes with `safeParseJson()`:
- `src/app/api/comparison/route.ts` — parsing `sourceUrls`
- `src/app/api/export/route.ts` — parsing `redirectChain`
- `src/app/api/crawl/route.ts` — parsing `discoveredUrls`, `includePatterns`, `excludePatterns`
- `src/components/ResultCard.tsx` — parsing `redirectChain`

> [!NOTE]
> **Clarification on `redirectChain` storage:** The `redirectChain` field remains a `String` (not `Json`) type in the Prisma schema. It stores a JSON-encoded `string[]`. All reads must use `safeParseJson<string[]>(value, [])` and all writes must use `toJsonString(chain)`. This is consistent with the existing pattern for other JSON-in-text columns in the schema.

When Phase 4.1 rewrites `checkUrlStatus`, the redirect chain result should be stored with `toJsonString()`:
```typescript
redirectChain: toJsonString(result.redirectChain)
```

**Verify:** Manually corrupt a `redirectChain` value in the database to invalid JSON and confirm the app doesn't crash.

---

### 3.4 — Run Schema Migration

After all schema changes:

```bash
npx prisma db push
npx prisma generate
```

> [!IMPORTANT]
> **For production data**, do NOT use `prisma db push` (it may be destructive). Instead:
> 1. Run `npx prisma migrate dev --name add_last_error_and_updated_at` locally to generate migration files
> 2. Commit the generated migration files to git
> 3. On production: `npx prisma migrate deploy`
>
> All additions in this phase are nullable/defaulted fields, so existing data is preserved.

---

## Phase 4 — Backend Improvements

> **Goal:** Fix redirect chain detection, add comparison cancellation, improve API robustness.  
> **Time:** ~2.5 hours  
> **Commit message:** `feat: full redirect chain detection, comparison cancellation, API improvements`

---

### 4.1 — Fix Redirect Chain Detection

**Review ref:** §3.2  
**File:** `src/lib/urlChecker.ts`

Replace the current redirect detection logic with a manual follow loop:

```typescript
export async function checkUrlStatus(
    sourceUrl: string,
    newDomain: string,
    config: CheckUrlConfig = {}
): Promise<ComparisonResult> {
    // ... existing retry loop ...

    // Replace the two-fetch approach with a single manual-follow loop
    const redirectChain: string[] = [];
    let currentUrl = newUrl;
    let finalResponse: Response | null = null;
    const maxHops = 10;

    for (let hop = 0; hop < maxHops; hop++) {
        const response = await fetch(currentUrl, {
            method: 'GET',
            signal: controller.signal,
            redirect: 'manual',
            headers
        });

        const statusCode = response.status;

        if ([301, 302, 303, 307, 308].includes(statusCode)) {
            const location = response.headers.get('location');
            if (location) {
                // Resolve relative redirects
                const resolvedUrl = new URL(location, currentUrl).href;
                redirectChain.push(resolvedUrl);
                currentUrl = resolvedUrl;
                continue;
            }
        }

        // Non-redirect response — we've arrived
        finalResponse = response;
        break;
    }

    const finalUrl = currentUrl;
    const statusCode = finalResponse?.status ?? null;

    let result: 'OK' | 'Missing' | 'Error' | 'Redirected' = 'OK';
    if (statusCode === 404) result = 'Missing';
    else if (statusCode && statusCode >= 400) result = 'Error';
    if (redirectChain.length > 0) result = 'Redirected';

    // ... return ComparisonResult ...
}
```

**Verify:** Test against a URL known to have a multi-hop redirect chain (e.g., `http://` → `https://` → `www.` → `/new-path`). The `redirectChain` array should contain all intermediate URLs.

---

### 4.2 — Add Comparison Job Cancellation

**Review ref:** §3.3  
**File:** `src/app/api/comparison/route.ts`

Add an in-memory `activeComparisons` map (same pattern as the crawl system):

```typescript
// At module level
const activeComparisons = new Map<string, AbortController>();
```

In `processComparisonJob`:
- Create an `AbortController` and store it in the map
- Pass the signal to `checkUrlStatus` (add `signal` to `CheckUrlConfig`)
- Check `signal.aborted` between batches
- Clean up the map entry in a `finally` block

> [!IMPORTANT]
> **Signal composition:** `checkUrlStatus` already creates its own `AbortController` for per-request timeouts. The cancellation signal from the job must be composed with it. Use `AbortSignal.any()` (Node 20+) to merge them:
>
> ```typescript
> // Inside checkUrlStatus, compose timeout + external cancel signals:
> const timeoutController = new AbortController();
> const timeout = setTimeout(() => timeoutController.abort(), timeoutSeconds * 1000);
> const mergedSignal = config.signal
>     ? AbortSignal.any([timeoutController.signal, config.signal])
>     : timeoutController.signal;
> // Use mergedSignal in fetch()
> ```
>
> Also update `CheckUrlConfig` in Phase 4.1 (not just 4.2):
> ```typescript
> export interface CheckUrlConfig {
>     followRedirects?: boolean;
>     retryAttempts?: number;
>     timeoutSeconds?: number;
>     useOverrideToken?: boolean;
>     signal?: AbortSignal;  // External cancellation signal
> }
> ```

Add a `DELETE` handler:

```typescript
export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
        return NextResponse.json({ error: 'jobId required' }, { status: 400 });
    }

    const controller = activeComparisons.get(jobId);
    if (controller) {
        controller.abort();
        activeComparisons.delete(jobId);
    }

    await db.comparisonJob.update({
        where: { id: jobId },
        data: { status: 'cancelled' }
    });

    return NextResponse.json({ status: 'cancelled' });
}
```

**Frontend:** Add a "Cancel" button to the progress UI in `page.tsx` that calls `DELETE /api/comparison?jobId=...`.

---

### 4.3 — Move Override Token to Environment Variable

**Review ref:** §4.2  

**File:** `.env.example` (CREATE if it doesn't exist)

```env
DATABASE_URL="file:./db/custom.db"
PRISMA_DEBUG=true           # Set to 'true' to enable SQL query logging
EDGE_OVERRIDE_TOKEN=       # Optional: Cloudflare edge redirect override token
```

> [!NOTE]
> Ensure `.env.example` is committed to git (add it explicitly if `.env*` is in `.gitignore`). The actual `.env` file should remain gitignored.

**File:** `src/lib/urlChecker.ts`

```typescript
export interface CheckUrlConfig {
    followRedirects?: boolean
    retryAttempts?: number
    timeoutSeconds?: number
    useOverrideToken?: boolean  // Changed from overrideToken string
}
```

Inside the fetch setup:

```typescript
const headers: Record<string, string> = {};
if (useOverrideToken && process.env.EDGE_OVERRIDE_TOKEN) {
    headers['X-EdgeRedirect-Override'] = process.env.EDGE_OVERRIDE_TOKEN;
}
```

**Frontend changes:**
- Replace the password input with a checkbox toggle: "Use Edge Override Token"
- The config sends `useOverrideToken: true/false` instead of the actual secret
- Add a helper hint: "Set EDGE_OVERRIDE_TOKEN in .env to configure"

Apply the same pattern to `crawler.ts` and all API routes.

---

### 4.4 — Persist Error Context on Comparison Failure

**Review ref:** §6.1  
**File:** `src/app/api/comparison/route.ts`

Already covered by the schema change in §3.1. Ensure the catch block in `processComparisonJob` writes to `lastError`:

```typescript
catch (error) {
    console.error(`Error processing job ${jobId}:`, error);
    await db.comparisonJob.update({
        where: { id: jobId },
        data: {
            status: 'failed',
            lastError: error instanceof Error ? error.message : String(error)
        }
    });
}
```

---

### 4.5 — Fix Error Handling in Jobs API

**Review ref:** §9.3  
**File:** `src/app/api/jobs/route.ts`

```typescript
// Before: silently swallows errors
catch (error) {
    return NextResponse.json([]);
}

// After: returns proper error response
catch (error) {
    console.error('Error fetching jobs:', error);
    return NextResponse.json(
        { error: 'Failed to fetch jobs' },
        { status: 500 }
    );
}
```

Update the frontend `JobsContent` component to handle error responses properly (it already has error state, just needs to check `response.ok`).

---

### 4.6 — Move Database Init Out of Module Import

**Review ref:** §4.4  
**File:** `src/lib/db.ts`

Remove the `ensureDatabaseExists()` call from the module body.

**File:** `package.json`

Add a `predev` and `prestart` script:

```json
"predev": "npx prisma db push --skip-generate 2>/dev/null || true",
"prestart": "npx prisma db push --skip-generate 2>/dev/null || true",
```

Or handle it in `start.sh` / the dev script.

---

## Phase 5 — Frontend Refactor

> **Goal:** Break up the God component, eliminate duplication, improve UX.  
> **Time:** 3–4 hours  
> **Commit message:** `refactor: decompose page.tsx, shared types, UI improvements`

---

### 5.1 — Extract Shared Types

**Review ref:** §7.1  
**File:** `src/types/index.ts` (NEW)

```typescript
export interface UrlResult {
    id?: string;
    sourceUrl: string;
    newUrl: string;
    statusCode: number | null;
    redirectChain: string[];
    finalUrl: string | null;
    result: 'OK' | 'Missing' | 'Error' | 'Redirected';
    error?: string;
}

export interface JobSummary {
    totalUrls: number;
    ok: number;
    redirected: number;
    missing: number;
    error: number;
}

export type StatusFilter = 'all' | 'ok' | 'redirected' | 'not-found';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
```

Update imports in `page.tsx`, `ResultCard.tsx`, `JobCard.tsx`, and `jobs/page.tsx`.

---

### 5.2 — Extract Shared Status Utilities

**Review ref:** §7.2  
**File:** `src/lib/status.tsx` (NEW)

Move `getStatusIcon()` and `getStatusBadge()` into a shared module. Remove the duplicate implementations from `page.tsx` and `ResultCard.tsx`.

---

### 5.3 — Decompose `page.tsx`

**Review ref:** §3.1  

Target decomposition:

| New file | Extracted from | Contents |
|----------|---------------|----------|
| `src/hooks/useComparison.ts` | `page.tsx` L38–282 | All state, `runComparison()`, `pollForCompletion()`, `retryVerification()`, job loading |
| `src/hooks/useResultFilter.ts` | `page.tsx` L56–57 | `statusFilter`, `pathFilter` state and filter predicate |
| `src/components/ComparisonConfig.tsx` | `page.tsx` L558–701 | The entire left panel (Tabs + forms + config + override token) |
| `src/components/ResultsPanel.tsx` | `page.tsx` L742–849 | Summary card + filter bar + result list + export buttons |
| `src/components/FullscreenResults.tsx` | `page.tsx` L426–537 | The fullscreen overlay |
| `src/components/SummaryCard.tsx` | `page.tsx` L709–738 | The 5-stat summary grid |

After extraction, `page.tsx` becomes a ~60-line orchestrator:

```tsx
function HomeContent() {
    const comparison = useComparison();
    const filters = useResultFilter();

    if (comparison.isResultsExpanded && comparison.results.length > 0) {
        return <FullscreenResults {...comparison} {...filters} />;
    }

    return (
        <div className="min-h-screen h-screen bg-background">
            <div className="grid grid-cols-[1fr_2fr] h-full">
                <ComparisonConfig {...comparison} />
                <ResultsPanel {...comparison} {...filters} />
            </div>
        </div>
    );
}
```

---

### 5.4 — Wire Export Buttons to Server-Side API

**Review ref:** §8.1  
**File:** `src/components/ResultsPanel.tsx` (after refactor) or `page.tsx`

Replace the client-side `Blob`-based export with links to the server endpoint:

```typescript
const exportResults = (format: 'csv' | 'json') => {
    if (!jobId) return;
    window.open(`/api/export?jobId=${jobId}&format=${format}`, '_blank');
};
```

Remove the `exportResults` function that builds Blobs in memory.

---

### 5.5 — Fix `JobCard` Deletion UX

**Review ref:** §7.3  
**File:** `src/components/JobCard.tsx`

Add an `onDelete` callback prop:

```typescript
interface JobCardProps {
    // ... existing props ...
    onDelete?: (id: string) => void;
}
```

Replace `window.location.reload()` with:

```typescript
if (onDelete) onDelete(id);
```

Update `jobs/page.tsx` to pass a handler that removes the job from state:

```typescript
const handleDelete = (id: string) => {
    setJobs(prev => prev.filter(j => j.id !== id));
};
```

---

### 5.6 — Fix NavBar Issues

**Review ref:** §7.4, §7.6  
**File:** `src/components/NavBar.tsx`

1. Remove the unused `matchExact` parameter from `isActive()` and `navItems`
2. Add the crawl page to navigation:

```typescript
const navItems = [
    { name: 'New Comparison', href: '/' },
    { name: 'Job History', href: '/jobs' },
    { name: 'Crawl History', href: '/crawl' },
];
```

---

### 5.7 — Remove CSS Mobile Block

**Review ref:** §7.5  
**File:** `src/app/globals.css`

```diff
  body {
    @apply bg-background text-foreground;
-   min-width: 1024px;
  }
```

> [!NOTE]
> The two-column layout in `page.tsx` won't collapse gracefully without additional responsive work. For now, removing the hard block allows at least horizontal scrolling on smaller screens. A proper responsive layout can be done as a future enhancement.

---

## Phase 6 — Quality & Testing

> **Goal:** Add test coverage, improve type safety, add polling backoff, update Docker.  
> **Time:** 3–4 hours  
> **Commit message:** `test: add unit tests, improve type safety, update Docker config`

---

### 6.1 — Set Up Test Infrastructure

Install test dependencies:

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

Add to `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'node',
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
```

---

### 6.2 — Unit Tests for Core Libraries

**File:** `src/lib/__tests__/urlChecker.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { extractPath, constructNewUrl, isUrlSafe } from '../urlChecker';

describe('extractPath', () => {
    it('extracts pathname from full URL', () => {
        expect(extractPath('https://example.com/blog/post-1')).toBe('/blog/post-1');
    });
    it('includes query params', () => {
        expect(extractPath('https://example.com/search?q=test')).toBe('/search?q=test');
    });
    it('includes hash fragments', () => {
        // extractPath preserves hashes (they're part of the client-side URL)
        expect(extractPath('https://example.com/page#section')).toBe('/page#section');
    });
    it('returns / for invalid URLs', () => {
        expect(extractPath('not-a-url')).toBe('/');
    });
});

describe('constructNewUrl', () => {
    it('combines path with domain', () => {
        expect(constructNewUrl('/blog/post', 'https://new.com')).toBe('https://new.com/blog/post');
    });
    it('handles trailing slash on domain', () => {
        expect(constructNewUrl('/path', 'https://new.com/')).toBe('https://new.com/path');
    });
});

describe('isUrlSafe', () => {
    it('allows HTTPS URLs', () => {
        expect(isUrlSafe('https://example.com')).toBe(true);
    });
    it('allows public 172.x IPs (e.g., Google 172.217.x.x)', () => {
        expect(isUrlSafe('http://172.217.0.1')).toBe(true);
    });
    it('blocks private 172.16-31.x.x range', () => {
        expect(isUrlSafe('http://172.16.0.1')).toBe(false);
        expect(isUrlSafe('http://172.31.255.255')).toBe(false);
    });
    it('blocks file:// URLs', () => {
        expect(isUrlSafe('file:///etc/passwd')).toBe(false);
    });
    it('blocks metadata IP', () => {
        expect(isUrlSafe('http://169.254.169.254/latest')).toBe(false);
    });
    it('blocks localhost', () => {
        expect(isUrlSafe('http://localhost:3000')).toBe(false);
    });
    it('blocks 10.x.x.x range', () => {
        expect(isUrlSafe('http://10.0.0.1')).toBe(false);
    });
    it('blocks 192.168.x.x range', () => {
        expect(isUrlSafe('http://192.168.1.1')).toBe(false);
    });
});
```

**File:** `src/lib/__tests__/crawler.test.ts`

Test `normalizeUrl`, `matchGlob`, `extractLinks` (make private methods testable or test via the public `crawl()` API with a mocked fetch).

**File:** `src/lib/__tests__/json.test.ts`

Test `safeParseJson` with valid JSON, invalid JSON, null, undefined.

---

### 6.3 — Eliminate `any` Types

**Review ref:** §9.1  

| Location | Current | Fix |
|----------|---------|-----|
| `comparison/route.ts` `processComparisonJob` config | `any` | `ComparisonConfig` interface |
| `comparison/route.ts` `generateSummary` | `any[]` | `UrlResult[]` (Prisma type) |
| `jobs/page.tsx` `job.status as any` | cast | Use `JobStatus` union type |
| `crawl/route.ts` `as any` | cast | Define proper options interface |

---

### 6.4 — Add Polling Backoff

**Review ref:** §8.2  
**Files:** `src/app/page.tsx` (or `hooks/useComparison.ts` after refactor)

Replace the fixed 2-second delay with exponential backoff:

```typescript
const getBackoffDelay = (pollCount: number): number => {
    // 2s, 3s, 4.5s, 6.75s, capped at 15s
    return Math.min(2000 * Math.pow(1.5, pollCount), 15000);
};
```

Apply the same to `CrawlForm.tsx` polling.

---

### 6.5 — Update Docker Configuration

**Review ref:** §10.4  
**File:** `Dockerfile`

Update the base image:

```dockerfile
FROM node:22-alpine AS base
```

Review and update the build steps for Next.js 16's output structure if needed. Test with:

```bash
docker build -t urlcompare .
docker run -p 3000:3000 urlcompare
```

---

### 6.6 — Add Input Validation with Zod

**Review ref:** §9.4  

Since Zod is already installed, define schemas for API inputs:

**File:** `src/lib/schemas.ts` (NEW)

```typescript
import { z } from 'zod';

export const ComparisonRequestSchema = z.object({
    sourceUrls: z.array(z.string().url()).min(1),
    newDomain: z.string().url(),
    config: z.object({
        followRedirects: z.boolean().default(true),
        maxConcurrency: z.number().int().min(1).max(50).default(10),
        retryAttempts: z.number().int().min(0).max(10).default(3),
        timeoutSeconds: z.number().int().min(1).max(60).default(10),
        useOverrideToken: z.boolean().default(false),
    }).optional(),
    name: z.string().optional(),
});

export const CrawlRequestSchema = z.object({
    sourceDomain: z.string().url(),
    name: z.string().optional(),
    maxPages: z.number().int().min(1).max(5000).default(500),
    maxDepth: z.number().int().min(1).max(50).default(10),
    delayMs: z.number().int().min(0).max(5000).default(200),
    includePatterns: z.array(z.string()).optional(),
    excludePatterns: z.array(z.string()).optional(),
    useOverrideToken: z.boolean().default(false),
});
```

Use in API routes:

```typescript
const parseResult = ComparisonRequestSchema.safeParse(body);
if (!parseResult.success) {
    return NextResponse.json(
        { error: 'Invalid request', details: parseResult.error.flatten() },
        { status: 400 }
    );
}
const { sourceUrls, newDomain, config, name } = parseResult.data;
```

---

## Verification Checklist

After completing all phases, run this final checklist:

```bash
# Type safety
npx tsc --noEmit                    # Zero errors

# Lint
npm run lint                        # Zero errors

# Tests
npm test                            # All pass

# Build
npm run build                       # Successful production build

# Runtime
npm run dev                         # Starts without warnings
# Browser: create a comparison job, verify results, export HTML
# Browser: run a domain crawl, use results for comparison
# Browser: cancel a running comparison job
# Browser: delete a job from history (no page reload)
```

---

## Deferred / Future Work

These items were noted in the review but are not included in this remediation plan because they require design decisions or are lower priority:

| Item | Reason deferred |
|------|----------------|
| Result pagination | Needs UI/UX design for pagination controls |
| Rate limiting | Requires choosing a strategy (per-IP, per-session, global) |
| Verify endpoint ownership | Requires authentication first (currently single-user) |
| Responsive mobile layout | Needs responsive breakpoints for the two-column grid (stack on <1024px). Est: 1–2 hrs |
| Remove unused shadcn/ui components | Acceptable overhead; may be needed for future features |
| `CrawlJob.discoveredUrls` scalability | Only a problem at 1,000+ pages; monitor usage first |
| Full IPv6 SSRF protection | Current implementation covers IPv4 ranges + `[::1]`. Full IPv6 private range blocking would need `ipaddr.js` or similar |
