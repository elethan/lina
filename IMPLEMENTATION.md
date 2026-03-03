# Implementation Log

> A record of recent changes and implemented features.

## 2026-03-03

- **Work Orders Toolbar Unification (`_app/work-orders.tsx`)**
  - Moved the **Start / Assign / Close** action buttons from a standalone in-page `<div>` into the toolbar's `rightContent` — matching the Requests page pattern exactly. No separate action bar row below the toolbar exists anymore.
  - Added `selectedCount` to the `useMemo` dependency array so button `disabled` states stay reactive to row selection changes.

- **Toolbar Layout Overhaul (`Toolbar.tsx`)**
  - Removed the three-column centering hack (`w-1/4` title | centered `flex-1` middle | `w-1/4` spacer).
  - New layout: data components (`leftContent`) are **left-anchored** via `flex-1`; action buttons (`rightContent`) are **right-pinned** via `shrink-0`. Natural flex gap between the two groups.
  - **Removed the `<h1>` page title** from the toolbar entirely. Active page is communicated via the sidebar highlight instead. This eliminates layout shift when navigating between pages — the search box always starts at the same X position.
  - `title` remains in `ToolbarContext` for future use (e.g. `document.title`) but is not rendered.

- **Engineer Dropdown Deduplication (`engineers.api.ts`, `seed-dev.ts`)**
  - Both the Requests and Work Orders engineer filter dropdowns were showing duplicate entries because `seed-dev.ts` lacked a guard on the engineers insert and re-inserted the same 3 engineers on every run.
  - Fixed in `engineers.api.ts`: added `.groupBy(firstName, lastName)` to the Drizzle query so only one row per unique name is returned — immediate fix, no schema change or migration needed.
  - Fixed in `seed-dev.ts`: added an existence check before inserting engineers; subsequent seed runs now skip the insert and log the count of existing engineers.

- **Status Filter Simplification (both pages)**
  - Removed the `"In Progress"` option from the Status column-header dropdowns on both Requests and Work Orders pages. Options are now **All / Open / Closed** only.

## 2026-03-02

- **Requests & Work Orders Tables (`_app/index.tsx`, `_app/work-orders.tsx`)**
  - Restructured the top toolbar to move the primary Action Buttons ("New", "Create WO", "Start", "Assign", "Close") out of the top right and instead placed them directly above the table in a centered row with larger, equal-width primary buttons (`w-40`).
  - Replaced the floating "Status" and "Engineer" toolbar `<select>` dropdowns with in-header column filters natively tied to TanStack Table's `columnFilters` API.
  - Preserved backward compatibility with the URL context using a bidirectional sync between `onColumnFiltersChange` and `useNavigate({ search })`.
  - Updated the backend API query in `requests.api.ts` to only fetch records from trailing 6 months using an SQLite `datetime` condition `datetime('now', '-6 months')`.

## 2026-02-28

- **Work Orders Page (`/work-orders`)**
  - Updated the ambiguously named "Asset" table column header to "**Serial No.**".
  - Refined table typography by applying a monospaced font to all columns (except the "Description" column) for improved glanceability.
  - Adjusted the Status dropdown filter to default to "**Open**" instead of showing all statuses by default.
  - Ensured URL routing search parameters remained clean (e.g., hiding `?status=Open` from the URL since it's the new default state).
