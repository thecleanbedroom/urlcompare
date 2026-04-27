# Layout Redesign - Implementation TODO

Task list for implementing the two-column desktop layout as specified in [PLAN.features.layout.md](file:///media/yannick/971c2f08-d6ef-40aa-86cd-2db02962e9f5/Projects/urlCompare/docs/PLAN.features.layout.md).

---

## Phase 1: Layout Container Restructuring

- [x] **1.1** Modify outer container in `page.tsx`
  - Remove `max-w-4xl mx-auto` constraint
  - Add CSS Grid: `grid grid-cols-[1fr_2fr] h-screen`

- [x] **1.2** Create left panel `<aside>` element
  - Add `border-r overflow-y-auto p-4 space-y-4`
  - Move header/title inside
  - Move Configuration card inside

- [x] **1.3** Create right panel `<main>` element
  - Add `h-screen overflow-y-auto p-4 space-y-4`
  - Move Summary card inside
  - Move Results card inside

- [x] **1.4** Update header section
  - Simplify for left panel (remove center alignment)
  - Keep title and tagline

---

## Phase 2: Empty State Component

- [x] **2.1** Create `src/components/EmptyState.tsx`
  - Props: `title`, `description`, `icon` (all optional)
  - Default title: "No Results"
  - Default description: Workflow instructions
  - Centered, full-height layout

- [x] **2.2** Add EmptyState to right panel
  - Import component in `page.tsx`
  - Show when `!summary && results.length === 0 && !isRunning`

---

## Phase 3: Export Buttons Relocation

- [x] **3.1** Remove export buttons from left panel
  - Delete export button JSX from Configuration card (lines ~560-579)

- [x] **3.2** Add export buttons to Results card header
  - Move to `CardHeader` of Results section
  - Group with existing fullscreen toggle
  - Use `size="sm"` for compact appearance

---

## Phase 4: Workflow State Display

- [x] **4.1** Add loading/progress state to right panel
  - Show when `isRunning && progress > 0`
  - Display centered spinner and progress bar

- [x] **4.2** Implement right panel conditional rendering
  - Loading state → Progress display
  - Has results → Summary + Results
  - Empty → EmptyState component

---

## Phase 5: CSS Updates

- [x] **5.1** Add desktop minimum width to `globals.css`
  - Add `min-width: 1024px` to body in `@layer base`

- [x] **5.2** Adjust Results card max-height
  - Remove the `max-h-96` constraint (or adjust for viewport)
  - Use `flex-1` or calculated height for scrolling area

---

## Phase 6: Verification

- [x] **6.1** Run TypeScript build check
  - Command: `npm run build`
  - Ensure no type errors

- [x] **6.2** Visual testing - Two-column layout
  - Open `http://localhost:3000`
  - Verify 1/3 + 2/3 column split
  - Verify right panel is viewport height

- [x] **6.3** Visual testing - Empty state
  - Load page without job
  - Verify "No Results" message appears

- [x] **6.4** Functional testing - Full workflow
  - Enter test URLs manually
  - Run comparison
  - Verify progress displays on right
  - Verify results appear when complete

- [x] **6.5** Functional testing - Export buttons
  - Verify buttons appear in Results header
  - Test CSV export
  - Test JSON export

- [x] **6.6** Functional testing - Fullscreen mode
  - Toggle fullscreen on Results
  - Verify it works correctly
  - Toggle back and verify layout restores

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 4 | Container restructuring to two-column grid |
| 2 | 2 | EmptyState component creation |
| 3 | 2 | Export buttons relocation |
| 4 | 2 | Workflow state display logic |
| 5 | 2 | CSS adjustments |
| 6 | 6 | Verification and testing |
| **Total** | **18** | ✅ All Complete |
