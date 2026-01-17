# Results Display Redesign Implementation Plan

Redesign the job results display to provide a more actionable, user-friendly interface for iterating through URL comparison results and resolving issues one at a time.

## Current Behavior

The existing results display (lines 552-598 in [page.tsx](file:///media/yannick/971c2f08-d6ef-40aa-86cd-2db02962e9f5/Projects/urlCompare/src/app/page.tsx#L552-L598)):
- Shows a red "Error" tag when source URL has no matching target URL, black "OK" tag for exact match, grey "Redirected" tag for redirect match
- Displays the source URL in bold after the tag
- Shows the target (new) URL on a separate line
- All results displayed in a simple scrollable list

## Proposed Changes

### Tag/Badge Updates

| Current | New | Color |
|---------|-----|-------|
| Error/Missing | Not Found | Red (`destructive`) |
| Redirected | Redirected | Yellow (`warning`) |
| OK | OK | Green (`success`) |

### Display Structure Per Result

Each result card will show:
1. **Status Tag** - Color-coded badge (Not Found/Redirected/OK) followed by the **target path only** (no domain)
2. **Source URL** - Full URL (with domain), hyperlinked
3. **Target URL** - Full URL (with domain), hyperlinked if resolved (OK or Redirected), grey + non-clickable if not found
4. **Retry Button** - Re-verifies the single URL and updates the result in-place

---

## Component Changes

### [MODIFY] [page.tsx](file:///media/yannick/971c2f08-d6ef-40aa-86cd-2db02962e9f5/Projects/urlCompare/src/app/page.tsx)

1. **Update `getStatusBadge()` function** (lines 331-345):
   - Change "Missing" → "Not Found"  
   - Add yellow/warning variant for "Redirected"
   - Use green for "OK"

2. **Refactor results rendering** (lines 552-598):
   - Extract into a new `<ResultCard />` component for clarity
   - Show path-only (no domain) for cleaner display
   - Add hyperlinks to source/target paths
   - Add retry button per result

3. **Add `retryVerification()` function**:
   - Accepts a single `UrlResult` object
   - Calls new API endpoint to re-verify one URL
   - Updates state in-place when result returns

4. **Add helper function `extractPath(url: string)`**:
   - Extracts pathname from full URL for display

---

### [NEW] [ResultCard.tsx](file:///media/yannick/971c2f08-d6ef-40aa-86cd-2db02962e9f5/Projects/urlCompare/src/components/ResultCard.tsx)

A dedicated component for individual result display with:

```tsx
interface ResultCardProps {
  result: UrlResult;
  onRetry: (result: UrlResult) => Promise<void>;
  isRetrying: boolean;
}
```

**Structure:**
```
┌──────────────────────────────────────────────────────────────────────┐
│ [NOT FOUND]  /products/old-item                                      │
│                                                                      │
│ Source: https://oldsite.com/products/old-item  (hyperlink)           │
│ Target: https://newsite.com/products/old-item  (grey if not found)   │
│                                                                      │
│                                                       [↻ Retry]      │
└──────────────────────────────────────────────────────────────────────┘
```

---

### [NEW] [route.ts](file:///media/yannick/971c2f08-d6ef-40aa-86cd-2db02962e9f5/Projects/urlCompare/src/app/api/verify/route.ts)

New API endpoint for single-URL re-verification:

**POST `/api/verify`**
```json
{
  "resultId": "string",
  "sourceUrl": "string",
  "newDomain": "string"
}
```

**Response:**
```json
{
  "id": "string",
  "sourceUrl": "string",
  "newUrl": "string",
  "statusCode": 200,
  "result": "OK" | "Missing" | "Redirected",
  "finalUrl": "string | null",
  "redirectChain": ["string"],
  "checkedAt": "ISO date"
}
```

**Logic:**
1. Fetch the existing `UrlResult` record
2. Re-run the URL check using existing `checkUrlStatus()` logic (extracted to shared util)
3. Update the database record with new results
4. Return updated result

---

### [MODIFY] [comparison/route.ts](file:///media/yannick/971c2f08-d6ef-40aa-86cd-2db02962e9f5/Projects/urlCompare/src/app/api/comparison/route.ts)

1. **Extract `checkUrlStatus()` to shared utility** (lines 254-360):
   - Move to new file [lib/urlChecker.ts](file:///media/yannick/971c2f08-d6ef-40aa-86cd-2db02962e9f5/Projects/urlCompare/src/lib/urlChecker.ts)
   - Export for reuse by both comparison and verify routes
   - Also extract `extractPath()` and `constructNewUrl()` helpers

---

### [NEW] [lib/urlChecker.ts](file:///media/yannick/971c2f08-d6ef-40aa-86cd-2db02962e9f5/Projects/urlCompare/src/lib/urlChecker.ts)

Shared utility containing:
- `extractPath(url: string): string`
- `constructNewUrl(path: string, domain: string): string`  
- `checkUrlStatus(sourceUrl, newDomain, config): Promise<ComparisonResult>`

---

### [MODIFY] [badge.tsx](file:///media/yannick/971c2f08-d6ef-40aa-86cd-2db02962e9f5/Projects/urlCompare/src/components/ui/badge.tsx)

Add a `warning` variant for yellow/amber badges:

```tsx
warning: "border-transparent bg-yellow-100 text-yellow-800 hover:bg-yellow-100/80",
```

---

## Summary of Changes

| File | Action | Description |
|------|--------|-------------|
| `page.tsx` | MODIFY | Update badge logic, add retry handler, use new ResultCard |
| `ResultCard.tsx` | NEW | Dedicated component for single result display |
| `api/verify/route.ts` | NEW | Single-URL re-verification endpoint |
| `lib/urlChecker.ts` | NEW | Shared URL checking utilities |
| `api/comparison/route.ts` | MODIFY | Import from shared urlChecker |
| `badge.tsx` | MODIFY | Add warning variant |

---

## Verification Plan

### Manual Testing

Since there are no existing automated tests in this project, verification will be manual:

1. **Start dev server**: `npm run dev` (already running)

2. **Create a test comparison job**:
   - Navigate to `http://localhost:3000`
   - Enter test URLs (e.g., `https://google.com/search`, `https://google.com/nonexistent-page-404`)
   - Enter a new domain (e.g., `https://google.com`)
   - Run comparison

3. **Verify results display**:
   - [ ] "OK" results show green badge with target path (no domain)
   - [ ] "Not Found" (404) results show red badge
   - [ ] "Redirected" results show yellow badge
   - [ ] Status line shows path only (no domain)
   - [ ] Source URL is full URL with domain, hyperlinked
   - [ ] Target URL is full URL with domain, hyperlinked for OK/Redirected, grey for Not Found

4. **Test retry functionality**:
   - [ ] Click "Retry" button on any result
   - [ ] Button shows loading state
   - [ ] Result updates in-place after verification completes
   - [ ] Timestamp updates to current time

5. **Verify from Job History**:
   - Navigate to `/jobs`
   - Click "View Results" on a completed job
   - Confirm new results format displays correctly

### TypeScript Verification

```bash
npx tsc --noEmit
```

Ensures no type errors in new/modified files.

---

## Open Questions

None - the requirements are clear. Proceeding after approval.
