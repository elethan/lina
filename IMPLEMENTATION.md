# Implementation Log

> A record of recent changes and implemented features.

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
