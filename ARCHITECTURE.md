# Lina — Architecture Overview

> CMMS (Computerised Maintenance Management System) for medical equipment.
> Last updated: 2026-03-03

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
| **Auth** | Better Auth (email/password + MS Entra ID SSO) |
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
│   ├── auth.ts          # Better Auth server config (roles, Entra ID)
│   ├── auth-client.ts   # Better Auth client
│   └── utils.ts         # cn() helper (clsx + tailwind-merge)
├── routes/
│   ├── __root.tsx       # Root layout — fetches session, redirects unauthenticated
│   ├── _app.tsx         # App layout — Sidebar + Toolbar + Outlet, passes user context
│   ├── _app/
│   │   ├── index.tsx    # Requests page (TanStack Table + toolbar filters)
│   │   └── work-orders.tsx  # Work Orders page (TanStack Table + toolbar filters)
│   ├── login.tsx        # Login page
│   └── api/
│       └── auth.$.ts    # Better Auth API catch-all
└── styles.css           # Tailwind v4 + shadcn CSS variables + brand colors
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

| Role | Requests | Work Orders | PMs | Config |
|------|----------|-------------|-----|--------|
| `admin` | ✅ | ✅ | ✅ | ✅ |
| `engineer` | ✅ | ✅ | ✅ | ❌ |
| `scientist` | ✅ | ❌ | ❌ | ❌ |
| `user` (radiographer) | ✅ | ❌ | ❌ | ❌ |

**How it works:**

- `__root.tsx` fetches session → returns `{ user }` in route context
- `_app.tsx` passes user to child routes via `beforeLoad` + to `<Sidebar userRole={...} />`
- Restricted routes have `beforeLoad` guards that `throw redirect({ to: '/' })`
- `Sidebar.tsx` filters nav items by `allowedRoles` array

### 4. Table Pattern (TanStack Table)

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
|
| ### 6. Work Order Execution & Inline Editing
|
| Work Orders are no longer just rows in a table; they feature a dedicated **Execution Dialog** (`WorkOrderExecutionDialog`) that serves as the central hub for field work:
|
| - **Auto-Start**: Opening a Work Order that hasn't been started automatically triggers `startWorkOrder()` to record the `startAt` timestamp.
| - **Status Cascading**: Closing a Work Order via `closeWorkOrder()` automatically transitions all linked `user_requests` to `"Closed"`.
| - **Historical Notes**: Uses a nested TanStack Table to show engineer commentary.
| - **Inline Editing**: Implemented via a `EditableNoteCell` pattern — clicking text swaps the cell for a `textarea`, saving on blur or `Ctrl+Enter`. This reduces UI clutter compared to traditional "Edit" modals.
| - **Immediate UI Sync**: Local state within the dialog (`displayStartAt`, `displayEndAt`) provides instant feedback after mutations before the global router refresh completes.

### 5. Server Error Handling (TanStack Start Middleware)

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
```
