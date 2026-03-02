# Lina — Architecture Overview

> CMMS (Computerised Maintenance Management System) for medical equipment.
> Last updated: 2026-02-27

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
│   ├── workorders.api.ts  # fetchWorkOrders(), createWorkOrder()
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

Each page sets its toolbar content (title, search, filters, action buttons) via `useSetToolbar()` which sets state **synchronously during render** — not inside `useEffect`. This prevents the toolbar from disappearing on hard refresh.

```tsx
const toolbarConfig = useMemo(() => ({
    title: 'Requests',
    leftContent: (<>...</>),
    rightContent: (<>...</>),
}), [deps])

useSetToolbar(toolbarConfig)
```

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

**Requests toolbar** (rightContent): engineer dropdown, Create WO / Merge / Close buttons
**Work Orders toolbar** (rightContent): status dropdown, engineer dropdown, Start / Assign / Close buttons

---

## Database Schema (Key Tables)

| Table | Purpose |
|-------|---------|
| `user` | Auth users (Better Auth) with `role` field |
| `session`, `account`, `verification` | Better Auth internals |
| `sites` | Physical locations (e.g. "GenesisCare Oxford") |
| `systems` | Equipment types (e.g. "CT Scanner", "MRI") |
| `engineers` | Field engineers (first/last name, email) |
| `assets` | Individual machines (serial number, linked to site + system) |
| `user_requests` | Service requests from users (linked to asset, engineer) |
| `work_orders` | Work orders grouping requests |
| `work_order_requests` | Junction: WO ↔ requests (many-to-many) |
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
