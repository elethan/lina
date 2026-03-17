# Lina — Architecture Overview

> CMMS (Computerised Maintenance Management System) for medical equipment.
> Last updated: 2026-03-16

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [TanStack Start](https://tanstack.com/start) (SSR + client) |
| **Routing** | TanStack Router (file-based, `src/routes/`) |
| **State / Tables** | TanStack Table (with pagination, column resizing) |
| **UI Components** | [shadcn/ui](https://ui.shadcn.com) (New York style, neutral base) |
| **Styling** | Tailwind CSS v4 + CSS variables (`src/styles.css`) |
| **Icons** | Lucide React |
| **Auth** | Better Auth (email/password; optional MS Entra ID SSO) |
| **Database** | SQLite via `better-sqlite3` |
| **ORM** | Drizzle ORM |
| **Validation** | Zod |

---

## Project Structure

```
src/
├── components/
│   ├── ui/              # shadcn/ui primitives (Button, Input, Select, Badge)
│   ├── Sidebar.tsx      # Role-filtered nav sidebar
│   ├── Toolbar.tsx      # Shared toolbar (renders ToolbarContext state)
│   └── ToolbarContext.tsx  # SSR-safe toolbar state via useSetToolbar()
├── data/                # Server functions (API layer)
│   ├── requests.api.ts  # fetchRequests()
│   ├── workorders.api.ts  # fetchWorkOrders(), startWorkOrder(), closeWorkOrder(), workOrderNotes
│   └── engineers.api.ts # fetchEngineers(), assignRequestsToEngineer()
├── db/
│   ├── schema.ts        # Drizzle schema (all tables)
│   ├── client.ts        # DB connection (better-sqlite3)
│   ├── migrate.ts       # Migration runner
│   └── seed-dev.ts      # Dev seed data (users, sites, assets, requests, WOs)
├── lib/
│   ├── auth.ts          # Better Auth server config (roles, optional Entra ID SSO)
│   ├── auth-guards.server.ts  # Server-only role/session guards
│   ├── auth-client.ts   # Better Auth client
│   ├── session.server.ts # Server-only session fetch helper
│   ├── server-utils.ts  # authServerFn builder + global error middleware
│   ├── logger.ts        # Structured JSON logger (stdout/stderr)
│   └── utils.ts         # cn() helper (clsx + tailwind-merge)
├── routes/
│   ├── __root.tsx       # Root layout — fetches session, redirects unauthenticated
│   ├── _app.tsx         # App layout — Sidebar + Toolbar + Outlet, passes user context
│   ├── _app/
│   │   ├── index.tsx    # Requests page (TanStack Table + toolbar filters)
│   │   └── work-orders.tsx  # Work Orders page (TanStack Table + toolbar filters)
│   ├── login.tsx        # Login page (email/password; MS SSO button when enabled)
│   └── api/
│       └── auth.$.ts    # Better Auth API catch-all
├── styles.css           # Tailwind v4 + shadcn CSS variables + brand colors
.env.example             # Template for all environment variables (MS SSO vars commented out)
```

---

## Key Patterns

### 1. SSR-Safe Toolbar (`useSetToolbar`)

Each page sets its toolbar content via `useSetToolbar()` which sets state **synchronously during render** — not inside `useEffect`. This prevents the toolbar from disappearing on hard refresh.

**Layout (as of 2026-03-03):** The toolbar title `<h1>` has been removed. Active page context is communicated solely via the sidebar highlight. This keeps all data components anchored at the same left position on every page (no layout shift on navigation).

```tsx
const toolbarConfig = useMemo(() => ({
    title: 'Requests',          // still stored in context (e.g. for document title), not rendered
    leftContent: (<>...</>),    // search + date pickers — left-anchored, flex-1
    rightContent: (<>...</>),   // action buttons — right-anchored, shrink-0
}), [deps])

useSetToolbar(toolbarConfig)
```

**Toolbar flex structure** (`Toolbar.tsx`):

- `leftContent` wrapper: `flex items-center gap-4 flex-1` — fills available space, stays left
- `rightContent` wrapper: `flex items-center gap-2 shrink-0` — pinned to the far right
- No balancing spacer or centering needed

### 2. URL Search Params (`validateSearch`)

Filter state lives in the URL, not `useState`. This makes filters bookmarkable and shareable.

```tsx
export const Route = createFileRoute('/_app/')({
    validateSearch: (search: Record<string, unknown>): RequestSearchParams => ({
        search: typeof search.search === 'string' ? search.search : undefined,
        dateFrom: typeof search.dateFrom === 'string' ? search.dateFrom : undefined,
        // ...
    }),
    // ...
})

// In the component:
const { search, dateFrom } = Route.useSearch()
const navigate = useNavigate({ from: '/' })
const setSearch = (value: string) =>
    navigate({ search: (prev) => ({ ...prev, search: value || undefined }) })
```

### 3. Role-Based Access

**Roles** (defined in `schema.ts`): `admin`, `engineer`, `scientist`, `user`

Current permission policy baseline:

| Role | Requests | Work Orders | PM Instances | Assets / Systems | PM Tasks |
|------|----------|-------------|--------------|------------------|----------|
| `admin` | Full CRUD | Full CRUD | Full CRUD | Full CRUD | Full CRUD |
| `engineer` | Full CRUD | Full CRUD | Full CRUD | View only (no create/edit) | View only (no create/edit) |
| `scientist` | View + create requests | View only | View only | View only | View only |
| `user` (radiographer) | View + create requests | No access | No access | No access | No access |

Interpretation notes:

- Engineers can do everything operational except creating/editing assets/systems and creating/editing PM task templates.
- Scientists can see everything but cannot create/edit operational records outside request creation.
- Users can only create and view requests.

**How it works:**

- `__root.tsx` fetches session → returns `{ user }` in route context
- `_app.tsx` passes user to child routes via `beforeLoad` + to `<Sidebar userRole={...} />`
- Restricted routes have `beforeLoad` guards that `throw redirect({ to: '/' })`
- `Sidebar.tsx` filters nav items by `allowedRoles` array
- Server mutations enforce role checks in the API layer (`requireRole(...)`) so direct server-function calls cannot bypass UI route guards
- Capability-based authorization is enforced server-side via `requirePermission(context, resource, action)` to keep permission rules centralized and consistent with the role policy matrix.

### 4. Entra Group Role Mapping

Entra users are mapped to app roles using group IDs from environment variables during Microsoft sign-in:

- `MICROSOFT_GROUP_ADMIN_IDS`
- `MICROSOFT_GROUP_ENGINEER_IDS`
- `MICROSOFT_GROUP_SCIENTIST_IDS`
- `MICROSOFT_GROUP_USER_IDS`

All values are comma-separated Entra Group Object IDs. Role precedence is: `admin` > `engineer` > `scientist` > `user`.

Mandatory bootstrap email lists:

- `BOOTSTRAP_ADMIN_EMAILS` (comma-separated)
- `BOOTSTRAP_USER_EMAILS` (comma-separated)

### 5. Table Pattern (TanStack Table)

Both pages follow the same pattern:

- Resizable columns via `columnResizeMode: 'onChange'`
- Fuzzy search via `@tanstack/match-sorter-utils`
- Pagination: `getPaginationRowModel()`, page size 20, first/prev/next/last controls
- Horizontal scroll: `<table>` uses `style={{ width: table.getTotalSize() }}` with `min-w-full`
- Table container has `overflow-x-auto`
- Row selection: click to select, selected rows highlight green
- Server-side sorting (newest first): Requests by `createdAt DESC`, Work Orders by `startAt DESC, id DESC`
- Header-level column filtering: Instead of keeping dropdown filters inside `Toolbar.tsx`, both Requests and Work Orders use custom TanStack Table headers to display Status / Engineer select elements right inside the table head, mapping state into `@tanstack/react-table`'s `columnFilters` object, and syncing changes to the URL via TanStack Router `.navigate()`.

**Requests toolbar** `rightContent`: New / Create WO / Merge / Close buttons — all `w-40`, equal-width.
**Work Orders toolbar** `rightContent`: Start / Assign / Close buttons — same pattern. Both pages now use `rightContent` identically; no separate in-page action bar div exists.
**Status filter options**:

- **Requests**: Defaults to a custom `OpenActive` composite filter. Exposes `All / Open & Active / Open / Active / Closed` options.
- **Work Orders**: Exposes `All / Open / Closed`.

### 6. Work Order Execution & Inline Editing

Work Orders are no longer just rows in a table; they feature a dedicated **Execution Dialog** (`WorkOrderExecutionDialog`) that serves as the central hub for field work:

- **Auto-Start**: Opening a Work Order that hasn't been started automatically triggers `startWorkOrder()` to record the `startAt` timestamp.
- **Status Cascading**: Closing a Work Order via `closeWorkOrder()` automatically transitions all linked `user_requests` to `"Closed"`.
- **Historical Notes**: Uses a nested TanStack Table to show engineer commentary.
- **Inline Editing**: Implemented via a `EditableNoteCell` pattern — clicking text swaps the cell for a `textarea`, saving on blur or `Ctrl+Enter`. This reduces UI clutter compared to traditional "Edit" modals.
- **Immediate UI Sync**: Local state within the dialog (`displayStartAt`, `displayEndAt`) provides instant feedback after mutations before the global router refresh completes.

### 7. Server Error Handling (TanStack Start Middleware)

All TanStack Start server functions must be explicitly wrapped in the centralized error interception middleware to prevent backend failures from leaking database credentials or stack traces to the client.

Instead of importing and using `createServerFn` directly, **always import and use `authServerFn` from `src/lib/server-utils.ts`**.

**Incorrect:**

```tsx
import { createServerFn } from '@tanstack/react-start'
export const myApi = createServerFn().handler(...) 
```

**Correct:**

```tsx
import { authServerFn } from '../lib/server-utils'
export const myApi = authServerFn({ method: 'GET' }).handler(...)
```

The global middleware captures raw thrown errors locally (logging them securely to the Node console) and strictly throws a sanitized generic `Error` back across the network boundary to the frontend.

Expected authorization rejections (`Unauthorized`, `Forbidden`) are classified separately as `API_AUTH_REJECTED` warnings and are deduplicated over a short time window to reduce terminal noise during repeated user actions.

To keep client bundles clean, auth/session guards are isolated in server-only modules (`auth-guards.server.ts`, `session.server.ts`) and imported dynamically inside server handlers.

---

### 8. Optional Microsoft Entra ID SSO

Microsoft Entra ID (Azure AD) SSO is **opt-in**: the app starts and runs normally with email/password authentication alone, which is the default for local development. SSO is activated only when the required environment variables are present.

**Server (`src/lib/auth.ts`)**

`socialProviders.microsoft` is conditionally spread into the `betterAuth` config using a runtime env-var check. When any of the three MS vars are absent the key is simply omitted, so `better-auth` never tries to initialise the provider and no startup crash occurs:

```ts
...(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_TENANT_ID
    ? {
          socialProviders: {
              microsoft: {
                  clientId: process.env.MICROSOFT_CLIENT_ID,
                  clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
                  tenantId: process.env.MICROSOFT_TENANT_ID,
              },
          },
      }
    : {})
```

**Client (`src/routes/login.tsx`)**

The "Sign in with Microsoft" button and its `or` divider are gated on the `VITE_ENABLE_MICROSOFT_SSO` Vite env var. Without it the login page renders the email/password form only:

```tsx
const microsoftSsoEnabled = !!import.meta.env.VITE_ENABLE_MICROSOFT_SSO

// In JSX:
{microsoftSsoEnabled && (
    <>
        <button onClick={handleMicrosoftSignIn}>Sign in with Microsoft</button>
        <div>{/* divider */}</div>
    </>
)}
```

**To enable SSO (production)**

Set all four vars in `.env` (copy from `.env.example`):

```
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_TENANT_ID=...
VITE_ENABLE_MICROSOFT_SSO=true
```

**Dev default (no `.env` file needed)**

The app starts, and the hardwired admin (`super@lina.com` / `genesiscare`) can log in with email/password.

---

## Database Schema (Key Tables)

| Table | Purpose |
|-------|---------|
| `user` | Auth users (Better Auth) with `role` field |
| `session`, `account`, `verification` | Better Auth internals |
| `sites` | Physical locations (e.g. "GenesisCare Oxford") |
| `systems` | Equipment types (e.g. "CT Scanner", "MRI") |
| `engineers` | Field engineers (first/last name). No UNIQUE constraint on name columns — deduplication handled in `fetchEngineers()` via `.groupBy(firstName, lastName)`. |
| `assets` | Individual machines (serial number, linked to site + system) |
| `user_requests` | Service requests from users (linked to asset, engineer) |
| `work_orders` | Work orders grouping requests (includes `startAt`, `endAt`) |
| `work_order_notes` | Chronological engineer commentary per WO |
| `work_order_requests` | Junction: WO ↔ requests (many-to-many, auto-closed on WO close) |
| `work_order_engineers` | Junction: WO ↔ engineers (many-to-many) |
| `role_permissions` | Role-based permission rules |

---

## Brand Colors

Primary green: `#00BF6F` — mapped to shadcn's `--primary` CSS variable.

Custom shades available as Tailwind classes:

- `text-primary-dark` → `#16A668`
- `text-primary-darker` → `#008169`
- `bg-primary-50` through `bg-primary-900`

---

## Dev Credentials

| User | Email | Password | Role |
|------|-------|----------|------|
| Super Admin | `super@lina.com` | `genesiscare` | `admin` |
| Test Radiographer | `radiographer@lina.com` | `linaradio1` | `user` |

---

## Commands

```bash
npm run dev         # Start dev server (port 3000)
npm run build       # Production build
npx tsx src/db/seed-dev.ts  # Seed dev database
npx drizzle-kit push       # Push schema changes to DB
npx drizzle-kit generate   # Generate migration files
npx drizzle-kit studio     # Open Drizzle Studio (DB browser)
npx shadcn@latest add <component>  # Add a shadcn/ui component
cp .env.example .env       # Bootstrap local environment config (edit as needed)
```
