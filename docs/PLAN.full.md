# Domain Scanner Feature - Implementation Plan

## Overview

This plan describes the implementation of an **automated domain scanner** feature that crawls an old domain to discover all URLs, then compares them against the new domain. This eliminates the need for users to manually compile and paste source URLs.

## Current State

The existing URL Compare tool:
- Requires users to **manually paste** a list of source URLs
- Compares each source URL path against a new target domain
- Tracks comparison jobs with progress and results in SQLite via Prisma
- Provides real-time progress via polling

## Proposed Feature

Add a new "Scan Domain" mode that:
1. Accepts a source domain URL to crawl
2. Automatically discovers all internal links by following anchor tags
3. Respects crawl limits and filters
4. Generates a list of discovered URLs
5. Optionally proceeds to compare discovered URLs against the new domain

---

## User Review Required

> [!IMPORTANT]
> **Crawling Approach**: The scanner will perform breadth-first crawling of HTML pages and extract internal links. It will NOT:
> - Execute JavaScript (no SPA/dynamic content discovery)
> - Parse sitemaps (could be added as enhancement)
> - Respect robots.txt by default (configurable)
>
> Please confirm this scope is acceptable or specify additional requirements.

> [!WARNING]
> **Rate Limiting**: Aggressive crawling may trigger rate limits or blocks on the source domain. Default settings will include delays between requests. Consider if this is used on domains you control.

---

## Proposed Changes

### Database Schema

#### [MODIFY] [schema.prisma](file:///media/yannick/971c2f08-d6ef-40aa-86cd-2db02962e9f5/Projects/urlCompare/prisma/schema.prisma)

Add a new `CrawlJob` model to track crawl operations:

```prisma
model CrawlJob {
  id              String   @id @default(cuid())
  name            String?
  sourceDomain    String           // Base domain to crawl (e.g., https://oldsite.com)
  status          String   @default("pending") // pending, crawling, completed, failed, cancelled
  maxPages        Int      @default(500)       // Maximum pages to crawl
  maxDepth        Int      @default(10)        // Maximum link depth from start
  delayMs         Int      @default(200)       // Delay between requests
  includePatterns String?          // JSON array of URL patterns to include
  excludePatterns String?          // JSON array of URL patterns to exclude
  discoveredUrls  String?          // JSON array of discovered URLs
  totalDiscovered Int      @default(0)
  pagesVisited    Int      @default(0)
  errorCount      Int      @default(0)
  lastError       String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  completedAt     DateTime?

  // Optional: Link to a comparison job if user proceeds with comparison
  comparisonJobId String?
  comparisonJob   ComparisonJob? @relation(fields: [comparisonJobId], references: [id])
}
```

Also add reverse relation to `ComparisonJob`:

```prisma
model ComparisonJob {
  // ... existing fields ...
  crawlJobs    CrawlJob[]  // Optional: crawl jobs that led to this comparison
}
```

---

### Backend API

#### [NEW] [route.ts](file:///media/yannick/971c2f08-d6ef-40aa-86cd-2db02962e9f5/Projects/urlCompare/src/app/api/crawl/route.ts)

New API endpoints for crawl operations:

| Method | Description |
|--------|-------------|
| `POST /api/crawl` | Start a new crawl job |
| `GET /api/crawl?jobId=X` | Get crawl job status and results |
| `DELETE /api/crawl?jobId=X` | Cancel an active crawl job |

**POST Request Body:**
```typescript
interface StartCrawlRequest {
  sourceDomain: string;       // Required: base URL to start crawling
  name?: string;              // Optional: job name
  maxPages?: number;          // Optional: max pages (default: 500)
  maxDepth?: number;          // Optional: max depth (default: 10)
  delayMs?: number;           // Optional: delay between requests (default: 200)
  includePatterns?: string[]; // Optional: URL patterns to include (glob)
  excludePatterns?: string[]; // Optional: URL patterns to exclude (glob)
}
```

**Response:**
```typescript
interface CrawlJobResponse {
  jobId: string;
  status: string;
  discoveredUrls?: string[];
  totalDiscovered: number;
  pagesVisited: number;
}
```

---

#### [NEW] [crawler.ts](file:///media/yannick/971c2f08-d6ef-40aa-86cd-2db02962e9f5/Projects/urlCompare/src/lib/crawler.ts)

Core crawler logic:

```typescript
interface CrawlerOptions {
  maxPages: number;
  maxDepth: number;
  delayMs: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  onProgress?: (visited: number, discovered: number) => void;
  onError?: (url: string, error: Error) => void;
  signal?: AbortSignal;  // For cancellation
}

class DomainCrawler {
  constructor(sourceDomain: string, options: CrawlerOptions);
  
  async crawl(): Promise<string[]>;  // Returns all discovered URLs
  
  private async fetchPage(url: string): Promise<string>;
  private extractLinks(html: string, baseUrl: string): string[];
  private matchesPatterns(url: string): boolean;
  private normalizeUrl(url: string): string;
}
```

**Crawler Algorithm:**
1. Start with seed URL (source domain root)
2. Maintain a queue of URLs to visit and a set of visited URLs
3. For each URL in queue:
   - Fetch the page
   - Parse HTML and extract all `<a href>` links
   - Filter to internal links only
   - Apply include/exclude patterns
   - Add new URLs to queue if not visited and under depth limit
   - Update progress
4. Continue until queue empty or maxPages reached
5. Return all discovered URLs

---

### Frontend Components

#### [NEW] [CrawlForm.tsx](file:///media/yannick/971c2f08-d6ef-40aa-86cd-2db02962e9f5/Projects/urlCompare/src/components/CrawlForm.tsx)

New component for the domain scanner form:

- Source domain input field
- Advanced options (collapsible):
  - Max pages (slider or input)
  - Max depth
  - Request delay
  - Include/exclude patterns (text areas)
- Start Crawl button
- Progress display during crawl
- Results preview with:
  - Total URLs discovered
  - Option to filter/review URLs
  - "Use for Comparison" button to proceed

---

#### [MODIFY] [page.tsx](file:///media/yannick/971c2f08-d6ef-40aa-86cd-2db02962e9f5/Projects/urlCompare/src/app/page.tsx)

Modify the home page to include two modes:

1. **Manual Mode** (existing): Paste URLs manually
2. **Scan Mode** (new): Crawl a domain to discover URLs

Add a tab or toggle to switch between modes:

```tsx
<Tabs defaultValue="manual">
  <TabsList>
    <TabsTrigger value="manual">Manual URLs</TabsTrigger>
    <TabsTrigger value="scan">Scan Domain</TabsTrigger>
  </TabsList>
  <TabsContent value="manual">
    {/* Existing manual URL input form */}
  </TabsContent>
  <TabsContent value="scan">
    <CrawlForm onComplete={(urls) => setSourceUrls(urls.join('\n'))} />
  </TabsContent>
</Tabs>
```

---

#### [NEW] [crawl/page.tsx](file:///media/yannick/971c2f08-d6ef-40aa-86cd-2db02962e9f5/Projects/urlCompare/src/app/crawl/page.tsx)

Optional standalone page for crawl jobs (similar to `/jobs` for comparison jobs):

- List of past crawl jobs
- Status, discovered count, date
- Actions: View URLs, Start Comparison, Delete

---

### Supporting Changes

#### [MODIFY] [db.ts](file:///media/yannick/971c2f08-d6ef-40aa-86cd-2db02962e9f5/Projects/urlCompare/src/lib/db.ts)

No changes needed - the auto-initialization already handles new schema changes.

---

## Implementation Phases

### Phase 1: Database & API Foundation
1. Update Prisma schema with `CrawlJob` model
2. Run `prisma db push` to apply changes
3. Create `/api/crawl` route with POST and GET handlers
4. Implement basic crawler logic in `src/lib/crawler.ts`

### Phase 2: Crawler Core
1. Implement BFS crawling algorithm
2. Add link extraction with proper URL normalization
3. Implement include/exclude pattern matching
4. Add progress updates and error handling
5. Implement cancellation via AbortController

### Phase 3: Frontend Integration
1. Create `CrawlForm` component
2. Add tabs to home page for Manual/Scan modes
3. Implement real-time progress display for crawl jobs
4. Add "Use for Comparison" flow to pre-fill comparison form

### Phase 4: Polish & Edge Cases
1. Add crawl job history page (`/crawl`)
2. Handle edge cases (redirects, rate limits, timeouts)
3. Add validation and error messages
4. Update navigation to include crawl jobs link

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | MODIFY | Add `CrawlJob` model |
| `src/app/api/crawl/route.ts` | NEW | Crawl API endpoints |
| `src/lib/crawler.ts` | NEW | Domain crawler logic |
| `src/components/CrawlForm.tsx` | NEW | Crawl form component |
| `src/app/page.tsx` | MODIFY | Add scan mode tabs |
| `src/app/crawl/page.tsx` | NEW | Crawl jobs list page |

---

## Verification Plan

### Automated Testing

Currently there are no automated tests in this project. We will add manual verification steps.

### Manual Verification

#### Test 1: Basic Crawl Functionality
1. Start the dev server: `npm run dev`
2. Navigate to `http://localhost:3000`
3. Switch to the "Scan Domain" tab
4. Enter a test domain (e.g., `https://example.com` or a site you control)
5. Set max pages to 10 for quick testing
6. Click "Start Crawl"
7. **Expected**: Progress updates shown, URLs discovered displayed in real-time

#### Test 2: Crawl to Comparison Flow
1. Complete a crawl job (Test 1)
2. Click "Use for Comparison" button
3. Enter a new domain
4. Click "Start Comparison"
5. **Expected**: Comparison runs using discovered URLs, results shown

#### Test 3: Crawl Job Persistence
1. Start a crawl and let it complete
2. Navigate to `/crawl` (crawl jobs page)
3. **Expected**: Crawl job appears in list with status "completed" and URL count
4. Refresh the page
5. **Expected**: Job still visible (persisted in database)

#### Test 4: Crawl Cancellation
1. Start a crawl with maxPages set to 100+ on a large site
2. Click "Cancel" while crawl is in progress
3. **Expected**: Crawl stops, status shows "cancelled"

#### Test 5: Edge Cases
1. Enter an invalid domain URL and start crawl
2. **Expected**: Error message shown, no crash
3. Enter a domain that doesn't exist
4. **Expected**: Error shown after timeout

> [!NOTE]
> **User Testing Request**: Once Phase 1-2 are complete, please verify the crawler works correctly on a domain you intend to migrate. This ensures the link discovery logic handles your specific site structure.

---

## Questions for User

1. **Sitemap Support**: Should the crawler optionally parse `/sitemap.xml` to discover URLs? This would be faster for sites with complete sitemaps.

2. **JavaScript Rendering**: Current plan is HTML-only crawling. Do you need JavaScript rendering support (via Puppeteer/Playwright)? This would be significantly more complex.

3. **Concurrent Requests**: Should multiple pages be fetched in parallel during crawl? Current plan is sequential with delays. Parallel would be faster but riskier for rate limits.

4. **Default Patterns**: Any specific URL patterns to exclude by default (e.g., `/wp-admin/*`, `*.pdf`, `/feed/*`)?
