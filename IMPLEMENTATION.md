# Implementation Log

> A record of recent changes and implemented features.

## 2026-03-20 (session 2)

- **`PhysicsHandOver` Field — Schema + API + UI (`src/db/schema.ts`, `src/data/pm.api.ts`, `src/data/workorders.api.ts`, `src/data/requests.api.ts`, `src/routes/_app/pm.tsx`, `src/db/seed-pm-csv.ts`)**
  - Added `physicsHandOver` (`text('physics_hand_over').notNull()`) to both `assetPm` and `workOrders` tables.
  - Generated migrations: `drizzle/0003_sparkling_thing.sql` (asset_pm) and `drizzle/0004_late_leopardon.sql` (work_orders).
  - All insert/update code paths set `physicsHandOver: 'Pending'` by default:
    - `savePm()`, `duplicatePmInstance()` in `pm.api.ts`
    - `createWorkOrder()` in `workorders.api.ts`
    - Auto-WO creation in `requests.api.ts`
    - CSV seed payloads for both PM instances and work orders.
  - Added `updatePmPhysicsHandOver` server function for inline editing from PM dialog.
  - `fetchPmExecutionData` now returns `physicsHandOver` in the `PmExecutionData` type.

- **PM Execution Dialog — PhysicsHandedOver Editable Field (`src/routes/_app/pm.tsx`)**
  - Added editable textarea for `PhysicsHandedOver` in top metadata section.
  - Textarea saves on blur via `updatePmPhysicsHandOver` mutation (only when value changed and non-empty).
  - Local state `physicsHandOverText` synced from server data on load.

- **PM Execution Dialog — Compact Top Section (`src/routes/_app/pm.tsx`)**
  - Increased metadata text from `text-xs` to `text-base` for readability.
  - Reorganized layout: Asset, Site, System, Interval in row 1; Scheduled, Status, PhysicsHandedOver in row 2 (same row).
  - Engineers table capped at `max-h-32` (~3 rows visible) with internal scroll.
  - Removed dialog title/subtitle (`DialogHeader`) and "Showing X of X tasks" footer text to maximize table space.

- **Engineer Seed Data Overhaul (`src/db/seed-pm-csv.ts`)**
  - Replaced 3 engineer records (previously named after auth test users) with 7 standalone engineers:
    James Hartley, Sophie Brennan, Marcus Okafor, Elena Vasquez, Tom Aldridge, Priya Nair, Daniel Kovalski.
  - All seeded with `userId: null` — no link to auth users.
  - Auth test users (admin/therapist/scientist) remain unchanged.

- **New Request — Asset-to-System Auto-Select (`src/routes/_app/index.tsx`)**
  - When an asset is selected in the New Request dialog, the system dropdown now auto-selects the first linked system for that asset (typically Linac).
  - Extracted `getAvailableSystemsForAsset()` helper to compute valid systems based on `equipment.assetSystemMap`.
  - Manual system override still available.

## 2026-03-20

- **PM Tasks Schema Update (`src/db/schema.ts`)**
  - Added nullable `category` column to `pm_tasks` to support the CSV source taxonomy (`RELIABILITY`, `SAFETY`, `PERFORMANCE`, etc.).

- **CSV-Driven Seed Pipeline (`src/db/seed-pm-csv.ts`, `package.json`, `pm-tasks.csv`)**
  - Added new seed entrypoint: `npm run seed:pm-csv`.
  - Implemented PM-task import from project-root `pm-tasks.csv` with required header validation:
    - `Section ID`
    - `Task Title`
    - `System`
    - `Category`
    - `Check Interval (months)`
  - CSV mapping:
    - `Section ID` -> `pm_tasks.doc_section`
    - `Task Title` -> `pm_tasks.instruction`
    - `System` -> `systems.system_name` (derived from CSV as source of truth)
    - `Category` -> `pm_tasks.category`
    - `Check Interval (months)` -> `pm_tasks.interval_months`
  - Added CSV parser + normalization + row-level validation + in-file dedupe before insert.

- **Seed Taxonomy Reset + Asset Rules (`src/db/seed-pm-csv.ts`)**
  - Seed now creates/uses sites: `Oxford`, `Chelmsford`, `Bristol`.
  - Systems are seeded from unique CSV system values (current demo systems are not preserved).
  - Replaced demo asset seed list with cleaned Elekta assets and enforced constraints:
    - Asset names must not include `genesiscare`.
    - Elekta linac serial numbers must match `15xxxx` (six digits).
  - Seed links all seeded assets to CSV-derived systems through `asset_systems`.

- **Auth User Bootstrap in CSV Seed (`src/db/seed-pm-csv.ts`)**
  - Added seeded credential users in the same seed flow:
    - `admin@lina.com` / `linaAdmin` -> role `admin`
    - `therapist@lina.com` / `therapist` -> role `user`
    - `scientist@lina.com` / `scientist` -> role `scientist`
  - Role assignment is enforced after user creation to ensure requested roles are set explicitly.

- **Legacy Seed Retirement (`src/db/seed-dev.ts`)**
  - Retired old seed script and replaced it with a fail-fast shim that exits with guidance to use `npm run seed:pm-csv`.

## 2026-03-19 (session 2)

- **Auto Work Order Creation from Downtime Requests (`src/data/requests.api.ts`, `src/db/schema.ts`, `src/routes/_app/index.tsx`)**
  - Made `downtimeEvents.woId` NOT NULL — standalone downtime events no longer exist; every downtime must belong to a WO.
  - `createRequest()` now runs a full auto-WO workflow when `downtimeStartAt + assetId + systemId` are all provided:
    - Searches for an existing open WO for the same `assetId + systemId` (status ≠ `'Closed'`).
    - **Reuses** existing WO: links request, creates downtime event only if no open one already exists on that WO.
    - **Creates new WO** if none found: inserts WO, links request, creates downtime event, sets request → `'Active'`.
    - Returns `{ id, linkedWoId, woIsNew }` so the UI can show contextual feedback.
  - `getRequestDbDeps()` expanded: imports `workOrders`, `workOrderRequests`, `downtimeEvents`, `and`, `ne`, `isNull`.
  - `createDowntimeEvent()` validator: `woId` is now required (was optional).
  - Auto-WO notification popup in `RequestsPage`: appears after downtime request submission, shows WO number, differentiates new vs. linked WO, dismissable.

- **Seed Data Taxonomy Overhaul (`src/db/seed-dev.ts`)**
  - Site names: removed `GenesisCare` prefix → `Oxford`, `Chelmsford`, `Bristol`.
  - Systems replaced with six domain-accurate sub-systems: `Linac`, `iViewGT`, `XVI`, `PPS`, `MRL`, `Magnet`.
  - Asset-to-system linkage: conventional linacs → Linac/iViewGT/XVI/PPS; MR-Linacs → MRL/Magnet/PPS.
  - PM tasks and request/downtime `systemId` references updated to match new taxonomy.

- **New Request — Inline Validation Toast (`src/routes/_app/index.tsx`)**
  - Replaced blocking `alert()` with an in-dialog toast (top-right, red, auto-dismisses after 2 s).
  - Shows specific Zod error message (e.g. `"System is required"`).
  - Added `noValidate` on `<form>` to suppress browser-native validation popups.

- **Dialog Centering Fix (`src/components/ui/dialog.tsx`)**
  - Replaced `top-[50%] translate-x/y-[-50%]` with `inset-0 m-auto h-fit` — avoids Tailwind v4 `translate` property conflicts, reliably centers all dialogs.
  - Added `max-h-[90vh] overflow-y-auto` to base; removed `sm:max-w-lg` default so per-dialog `max-w-*` overrides always win.

- **WO Execution Dialog Width (`src/routes/_app/work-orders.tsx`)**
  - Set `sm:max-w-4xl` (896 px) for a wider two-column layout.

## 2026-03-19 (session 1)

- **Asset Downtime Tracking (`src/db/schema.ts`, `src/data/workorders.api.ts`, `src/data/requests.api.ts`, `src/routes/_app/index.tsx`, `src/routes/_app/work-orders.tsx`)**
  - Added `downtimeStartAt` (nullable TEXT, ISO 8601) to `userRequests` table — allows users to optionally report when the system went down.
  - Created new `downtimeEvents` table with `assetId` (required FK), `systemId` (required FK), `woId` (NOT NULL FK), `startAt` (required), `endAt` (nullable — enforced before WO close), `notes`, and `commonCols`.
  - Updated `createRequest()` to accept optional `downtimeStartAt` parameter.
  - Updated `createWorkOrder()` to auto-create a `downtime_events` row when the first linked request has `downtimeStartAt`, inheriting `assetId` and `systemId` from the WO.
  - Updated `closeWorkOrder()` with a server-side guard: blocks close if any linked `downtime_events` have null `endAt`. Returns error "Cannot close: record downtime end time first".
  - Added `WorkOrderRow.assetId` and `WorkOrderRow.systemId` to the fetch query so the execution dialog can reference them for downtime creation.
  - New server functions: `fetchDowntimeByWoId()` (GET), `createDowntimeEvent()` (POST), `updateDowntimeEvent()` (POST) — all using `authServerFn` with `requirePermission('workOrders', 'update')`.
  - New Request dialog: added optional "System Down Since" `datetime-local` input below the description textarea, with reset-on-open.
  - WO Execution Dialog: added amber-highlighted "System Downtime" section between snapshot and notes table.
    - If downtime exists: shows inherited start time (read-only) + manual `endAt` input with Save button + computed total duration (hours+minutes or days+hours).
    - If no downtime: "Record Downtime" button opens inline form with start + optional end inputs.
    - Close WO button shows alert if blocked by open downtime.
  - Updated `seed-dev.ts`: added two sample downtime events (one closed with 7h15m duration, one open/ongoing) linked to existing WOs.
  - Build verified successful (`npm run build`).

## 2026-03-18

- **PM Completed Filter Moved to Header (`src/routes/_app/pm.tsx`)**
  - Removed the toolbar-level completion filter dropdown from the PM page.
  - Added an in-header Completed filter select (`All / Pending / Completed`) inside the `completedAt` TanStack column definition, matching the Requests page pattern.
  - Switched PM completion filtering to TanStack `columnFilters` state + `filterFn` on the `completedAt` column, instead of manual pre-filtering in `filteredData`.
  - Added URL sync for the header filter via `onColumnFiltersChange` with `completedAt` search param.
  - Preserved backward compatibility for older PM links using `completionState` by mapping legacy values in `validateSearch`.

- **SQLite TEXT Date Convention (`src/db/schema.ts`, `src/data/pm.api.ts`, `src/data/workorders.api.ts`)**
  - Converted all domain date columns from `integer('col', { mode: 'timestamp' })` to `text('col')` storing ISO 8601 strings.
  - Root cause: Drizzle's integer timestamp mode stores Unix seconds, but `sql<string>` read casts bypass the ORM's mode layer, returning raw seconds as strings. Frontend `new Date("1234567890")` produced wrong dates. Additionally, `.default(sql\`CURRENT_TIMESTAMP\`)` on integer columns created a TEXT/INTEGER type mismatch.
  - Affected schema tables: `commonCols` (updatedAt, deletedAt), `syncState`, `assetInfo`, `assets`, `assetPm`, `userRequests`, `workOrders`, `workOrderNotes`.
  - Better Auth tables (`user`, `session`, `account`, `verification`) excluded — library-managed with their own integer timestamp expectations.
  - `pm.api.ts`: `savePm()` and `duplicatePmInstance()` now pass `.toISOString()` strings instead of `Date` objects.
  - `workorders.api.ts`: `createWorkOrder()` now passes `new Date().toISOString()` for `createdAt`.
  - `startWorkOrder()` and `closeWorkOrder()` already used `sql\`CURRENT_TIMESTAMP\`` — no change needed.
  - `commonCols.$onUpdate` changed from `() => new Date()` to `() => new Date().toISOString()`.
  - Added permanent "Date Storage Convention" section to `ARCHITECTURE.md`.
  - Fixed `src/db/wipe.ts`: corrected DB path to `lina-local.db` and added `pragma('foreign_keys = OFF')` to prevent FK constraint errors during wipe.

## 2026-03-17

- **PM In-Page Modals — New / Edit / Duplicate / Reopen (`src/routes/_app/pm.tsx`)**
  - Converted the New PM flow from route navigation (`/pm-form`) to an in-page dialog modal on `/pm`. The table and topbar remain fully visible behind the dialog.
  - Converted the Edit PM flow to the same in-page modal pattern. Selecting a row and clicking Edit opens a pre-populated dialog; no route change occurs.
  - Reopen flow (for completed PMs) now feeds into the Edit modal after confirmation, instead of navigating away.
  - Duplicate flow unchanged — already used an in-page dialog.
  - PM page loader now fetches both table rows and form dropdown options (`fetchPmFormOptions`) in parallel so modal selects render immediately.
  - Removed the standalone `/pm-form` route file (`src/routes/_app/pm-form.tsx`) entirely since all CRUD is now handled on-page.
  - New PM dialog resets all form fields on each open to prevent stale data from the previous entry.

- **Infinite Re-render Loop Fix (`src/routes/_app/pm.tsx`)**
  - `handleEdit` and `handleOpenDuplicateDialog` were plain functions recreated every render, which caused the toolbar `useMemo` to recompute → `useSetToolbar` to set state → infinite loop.
  - Wrapped both handlers in `useCallback([selectedPm])` to stabilize references.

- **Auth Resolution Rewrite — `getRequest()` (`src/lib/auth-guards.server.ts`)**
  - Replaced the unreliable `context`-based header resolution with `getRequest()` from `@tanstack/react-start/server` — the same pattern the root route's `fetchSession` uses.
  - `requireSessionUser()`, `requirePermission()`, and `requireRole()` no longer accept a `context` parameter; they read the HTTP request directly.
  - Updated all 13 callsites across `pm.api.ts`, `workorders.api.ts`, `requests.api.ts`, and `engineers.api.ts` to remove the `context` argument.
  - This permanently fixes the "Unauthorized" errors that occurred on both GET loaders and POST mutations.

- **GET Loader Auth Guard Removal (`src/data/pm.api.ts`)**
  - Removed `requirePermission` calls from `fetchPmFormOptions` and `fetchPmById` GET handlers. TanStack Start GET server functions called from route loaders don't propagate request context reliably. Route-level `beforeLoad` guards already enforce access for these read paths.

- **Server-Side Capability Guards (`src/lib/auth-guards.server.ts`, `src/lib/role-permissions.ts`)**
  - Added centralized capability policy constants (`ROLE_CAPABILITIES`) with resource/action checks and shared role helpers.
  - Introduced `requirePermission(context, resource, action)` to enforce authorization by capability instead of scattered role arrays.
  - Migrated Requests, Work Orders, Engineers assignment, and PM mutation APIs to capability checks for consistent policy enforcement.
  - Updated PM UI flow so scientists remain read-only for PM operations while retaining visibility.

- **Sidebar Role Menu UX (`src/components/Sidebar.tsx`)**
  - Moved the role indicator into the top-left brand row and aligned it to the far right of the logo/title area.
  - Replaced the static role hint with a clickable dropdown menu showing current role context and a quick Sign Out action.
  - Removed the toolbar-level role badge so toolbar control sizing/layout remains stable for page filters and action buttons.

- **Permission Policy Documentation Refresh (`ARCHITECTURE.md`)**
  - Updated the RBAC section to document the agreed operational baseline:
    - Engineers: full operational workflows except creating/editing assets/systems and PM task templates.
    - Scientists: view-all posture, with request creation allowed; no broader create/edit operations.
    - Users: request-only create/view access.
  - Added explicit role matrix coverage for Requests, Work Orders, PM instances, Assets/Systems, and PM Tasks.

## 2026-03-16

- **Bundle Optimization Second Pass (Server-Only Boundaries + Chunking)**
  - Moved devtools to a lazily loaded DEV-only component (`src/components/AppDevtools.tsx`) so production client bundles do not include devtools code by default.
  - Updated Vite config to apply chunk grouping (`table`, `icons`, `ui-radix`, `vendor`) and run the TanStack devtools Vite plugin only in dev mode.
  - Removed server-only auth/session coupling from shared imports by introducing `src/lib/auth-guards.server.ts` and `src/lib/session.server.ts`.
  - Refactored API modules (`requests.api.ts`, `workorders.api.ts`, `engineers.api.ts`, `equipment.api.ts`) to dynamically load DB/schema/ORM dependencies inside server handlers.
  - Validation outcome: build warning for oversized chunks cleared; client build graph reduced significantly and no longer emits better-sqlite3 browser externalization warnings.

- **Auth Error Log Noise Reduction (`src/lib/server-utils.ts`)**
  - Reclassified expected auth failures (`Unauthorized`, `Forbidden`) from `API_UNHANDLED_EXCEPTION` to `API_AUTH_REJECTED` warnings.
  - Added short-window dedupe for repeated auth warnings to prevent terminal spam during repeated unauthorized UI actions.
  - Preserved full-stack structured error logging for unexpected exceptions.

- **Optional Microsoft Entra ID SSO (`src/lib/auth.ts`, `src/routes/login.tsx`, `.env.example`)**
  - Fixed a startup crash (`Missing required environment variable: MICROSOFT_GROUP_ADMIN_IDS`) that occurred because `better-auth` evaluates social-provider env vars at module load time, blocking all users — even email/password login — when the MS vars were absent.
  - `auth.ts`: All env var reads (`MICROSOFT_GROUP_*`, `BOOTSTRAP_*`) are now lazy (read inside functions at call time). `socialProviders.microsoft` is conditionally spread — omitted entirely when the three MS client vars are absent so `better-auth` never initialises the provider.
  - `login.tsx`: The "Sign in with Microsoft" button and its `or` divider are gated on the `VITE_ENABLE_MICROSOFT_SSO` Vite env var. Without it the login page renders the email/password form only.
  - `databaseHooks.user.create.before`: When `BOOTSTRAP_ADMIN_EMAILS` / `BOOTSTRAP_USER_EMAILS` are not set (dev), falls back gracefully to the user's default role instead of throwing. When they are set (production), the strict deny behaviour is preserved.
  - **Dev default**: no `.env` file required — the app starts cleanly and the hardwired admin (`super@lina.com` / `genesiscare`) can log in via email/password immediately.
  - **Production / SSO**: set `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`, and `VITE_ENABLE_MICROSOFT_SSO=true` (see `.env.example`).
  - Added `.env.example` documenting all environment variables; MS SSO block commented out by default.

- **Phase 1 Scope Hardening (Routes + RBAC + Auth Mapping)**
  - Removed dead sidebar entries for non-shipped routes (`PMs`, `Config`) from `Sidebar.tsx` to eliminate broken navigation.
  - Added server-side role enforcement helper (`requireRole`) in `server-utils.ts` and applied it to restricted mutation APIs:
    - `workorders.api.ts`: create/delete/start/close work order and note edit/create mutations now require `admin` or `engineer`.
    - `engineers.api.ts`: request assignment now requires `admin` or `engineer`.
    - `requests.api.ts`: request deletion now requires `admin` / `engineer` / `scientist`.
  - Implemented Entra group-based role mapping in `auth.ts` via Microsoft provider profile mapping:
    - `MICROSOFT_GROUP_ADMIN_IDS`
    - `MICROSOFT_GROUP_ENGINEER_IDS`
    - `MICROSOFT_GROUP_SCIENTIST_IDS`
    - `MICROSOFT_GROUP_USER_IDS`
  - Added build verification pass (`npm run build`) confirming production compile succeeds after hardening changes.

- **Auth Provisioning Tightening (MICROSOFT_GROUP_USER_IDS + Bootstrap Emails)**
  - Added required `MICROSOFT_GROUP_USER_IDS` mapping for standard users so Entra sign-ins must match an authorized user group instead of falling back implicitly.
  - Group env config uses `MICROSOFT_GROUP_ADMIN_IDS`, `MICROSOFT_GROUP_ENGINEER_IDS`, `MICROSOFT_GROUP_SCIENTIST_IDS`, and `MICROSOFT_GROUP_USER_IDS`.
  - `BOOTSTRAP_ADMIN_EMAILS` and `BOOTSTRAP_USER_EMAILS` enforce explicit provisioning in `databaseHooks.user.create.before` when set; when absent (dev), the hook falls back to a default role gracefully.
  - Added explicit deny behavior for unprovisioned users in production (`User is not in an authorized Entra group` / `User is not provisioned for Lina access`).
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
