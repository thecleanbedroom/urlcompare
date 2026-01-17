# Results Display Redesign - TODO

Based on [PLAN.results.md](./PLAN.results.md)

---

## 1. Shared Utilities

- [x] Create `src/lib/urlChecker.ts`
  - [x] Add `extractPath(url: string): string` helper
  - [x] Add `constructNewUrl(path: string, domain: string): string` helper
  - [x] Move `checkUrlStatus()` function from comparison route
  - [x] Export `ComparisonResult` type

---

## 2. Update Comparison API

- [x] Modify `src/app/api/comparison/route.ts`
  - [x] Import utilities from `lib/urlChecker.ts`
  - [x] Remove duplicate `checkUrlStatus()`, `extractPath()`, `constructNewUrl()`
  - [x] Verify existing functionality still works

---

## 3. Create Verify API

- [x] Create `src/app/api/verify/route.ts`
  - [x] Implement POST handler
  - [x] Accept `resultId`, `sourceUrl`, `newDomain` in request body
  - [x] Fetch existing `UrlResult` record
  - [x] Re-run URL check using shared `checkUrlStatus()`
  - [x] Update database record with new results
  - [x] Return updated result object

---

## 4. Update Badge Component

- [x] Modify `src/components/ui/badge.tsx`
  - [x] Add `warning` variant (yellow/amber styling)

---

## 5. Create ResultCard Component

- [x] Create `src/components/ResultCard.tsx`
  - [x] Define `ResultCardProps` interface
  - [x] Display status badge (Not Found/Redirected/OK)
  - [x] Show target path only (no domain) next to badge on status line
  - [x] Add hyperlinked source URL (full URL with domain)
  - [x] Add conditionally hyperlinked target URL (full URL with domain, grey if not found)
  - [x] Add retry button with loading state
  - [x] Handle retry click → call `onRetry` prop

---

## 6. Update Main Page

- [x] Modify `src/app/page.tsx`
  - [x] Update `getStatusBadge()` function
    - [x] Change "Missing" label → "Not Found"
    - [x] Use warning variant for "Redirected"
    - [x] Use green/success for "OK"
  - [x] Add `retryVerification()` function
    - [x] Call `/api/verify` endpoint
    - [x] Update results state in-place
  - [x] Add `extractPath()` helper for display
  - [x] Replace inline result rendering with `<ResultCard />`
  - [x] Track retrying state per result ID

---

## 7. Manual Verification

- [x] Test with dev server (`npm run dev`)
- [ ] Create test comparison job with mixed results
- [ ] Verify badge colors
  - [ ] OK → green
  - [ ] Redirected → yellow
  - [ ] Not Found → red
- [ ] Verify URL display
  - [ ] Status line shows path only (no domain)
  - [ ] Source URL shows full URL with domain, hyperlinked
  - [ ] Target URL shows full URL with domain, hyperlinked (OK/Redirected) or grey (Not Found)
- [ ] Test retry functionality
  - [ ] Button shows loading state
  - [ ] Result updates in-place
  - [ ] Timestamp updates
- [ ] Verify from Job History (`/jobs` → View Results)
- [x] Run `npx tsc --noEmit` - no type errors

---

## 8. Cleanup

- [x] Remove any unused imports
- [ ] Test export CSV/JSON still works
- [ ] Final review of all changes
