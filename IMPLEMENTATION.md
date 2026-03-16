# Implementation Log

> A record of recent changes and implemented features.

## 2026-03-15

- **Work Order Execution Hub & Engineer Notes (`work-orders.tsx`, `workorders.api.ts`)**
  - Developed a comprehensive "Execution Dialog" for Work Orders, acting as a real-time field hub.
  - **Inline Editable History**: Integrated a nested TanStack Table for historical notes with a custom `EditableNoteCell` component. Engineers can click any note to swap it for a `textarea`, with `Ctrl+Enter` or Blur saving changes via the new `updateWorkOrderNote` API.
  - **Automated Lifecycle Events**:
    - **Auto-Start**: Opening an unstarted Work Order now automatically records the `startAt` timestamp in the database via the `startWorkOrder` API.
    - **Cascading Resolution**: Closing a Work Order now automatically transitions all linked User Requests to a `"Closed"` status in a single transaction.
  - **Reliable Date Handling**: Replaced manual "Just now..." UI labels with local state (`displayStartAt`, `displayEndAt`) that updates immediately from API responses, ensuring the engineer sees the recorded finish time before closing the dialog.
  - **Dynamic Controls**: The main Work Orders toolbar "Start" button now dynamically labels itself as "Continue" for active jobs.
  - **Schema Expansion**: Added the `work_order_notes` table to track commentary chronologically.
  - **Database Recovery Tools**: Created `src/db/wipe.ts` to forcefully clear SQLite indexes and tables, resolving persistent Drizzle/SQLite `unique constraint` conflicts during schema pushes.

- **Request Status Logic and Filtering (`requests.api.ts`, `workorders.api.ts`, `index.tsx`)**
  - Introduced an `"Active"` status for User Requests that are currently tied to a Work Order.
  - Updated the default Request page filter to display both `"Open"` and `"Active"` requests simultaneously on load (`status: 'OpenActive'`).
  - Added safety validations to block deletion of Requests that are in an `"Active"` or `"Closed"` state directly from the Requests page.

- **Work Order Deletion Flow (`workorders.api.ts`, `work-orders.tsx`)**
  - Replaced the simple delete logic behind the "Close" Work Order button with a detailed Shadcn Dialog flow.
  - Users are now prompted when deleting a Work Order to resolve tied User Requests: either delete everything permanently, or detach the Requests and revert their status back to `"Open"`.
  - Added full cleanup of junction tables (`work_order_requests`, `work_order_engineers`, `work_order_parts`) during the Work Order deletion process to maintain referential integrity.

- **New Request Dialog (`_app/index.tsx`, `requests.api.ts`, `equipment.api.ts`)**
  - Built a modal dialog for raising new requests, utilizing TanStack Form natively with Zod schema parsing directly in the `onSubmit` block.
  - Omitted the `@tanstack/zod-form-adapter` dependency due to peer dependency conflicts (`zod@^3.x` vs `zod@^4.x`).
  - Added a responsive `siteId` filter derived from URL parameters, auto-filtering the Systems/Assets dropdown to equipment explicitly at that location.
  - **Important Database Lesson:** Removed `createdAt: new Date()` from the backend insert. Passing Javascript dates into `better-sqlite3` via Drizzle outputs Unix epoch numbers, which breaks standard SQLite `datetime('now')` string queries (hiding records from lists). It is critical to omit explicit javascript dates and exclusively let the SQLite schema `.default(sql\`CURRENT_TIMESTAMP\`)` handle native date formatting.

## 2026-03-06

- **Structured JSON Logging & Auditing (`src/lib/logger.ts`, `auth.ts`)**
  - Introduced a zero-dependency structured logger that directs strict JSON strings to standard output/error, preparing the app for modern orchestrator log ingestion.
  - Linked the logger into the `globalMiddleware` (from previous step) so that unhandled API exceptions automatically emit `API_UNHANDLED_EXCEPTION` JSON trails.
  - Tapped into Better Auth's `databaseHooks` specifically listening for session creation (`login`) and user creation (`signup`) to emit `USER_LOGIN` and `USER_CREATED` audit lines.

- **Centralized API Error Handling (`src/lib/server-utils.ts`)**
  - Engineered a generic error-catching middleware for TanStack Start via `createMiddleware().server()`.
  - Introduced standard `authServerFn` builder to replace naked `createServerFn` calls across the project.
  - Intercepts uncaught rejections within API operations (e.g. database disconnects), logs the raw stack traces securely to the Node console, and throws sanitized generic Errors to the client to strictly prevent credential leakage.
  - Refactored `requests.api.ts`, `workorders.api.ts`, `engineers.api.ts`, and root `fetchSession` to enforce the new global catching rule.

- **Preventive Maintenance (PM) Schema Foundation (`schema.ts`)**
  - Upgraded the PM tracking schema to support tracking individual maintenance sessions against explicit systems and intervals.
  - Added `systemId`, `intervalMonths`, and `startAt` (no default timestamp) to the `asset_pm` table.
  - Added an `engineer` text field to the `asset_pm_results` table to act as a granular audit trail for who specifically passed/failed individual tasks within a session.
  - Local SQLite database constraint limitations required a clean wipe and regeneration (`npm run db:push`) to apply these structural changes.

- **PM Test Data Expansion (`seed-dev.ts`)**
  - Expanded the base `pmTasks` template seed data from 6 to 11 comprehensive tasks.
  - Ensured tasks cover multiple systems (MRI, Cooling, Thyratron, Magnetron) across varying intervals (1, 3, 6, 12 months) to provide a robust testing environment for future UI development.

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
