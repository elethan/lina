# Lina

Lina is an internal CMMS-style application for managing clinical engineering workflows around equipment requests, work orders, and planned maintenance.

## What The App Covers

- Request intake and tracking for equipment issues
- Work order lifecycle management
- Planned maintenance workflows and PM task execution
- Role-based access controls (`admin`, `engineer`, `scientist`, `user`)
- Authentication with Better Auth (email/password) and optional Microsoft Entra SSO

## Tech Stack

- Framework: TanStack Start (SSR)
- Routing: TanStack Router (file-based)
- UI: React 19 + Tailwind CSS v4 + shadcn/ui
- Data layer: TanStack Query + TanStack Table
- Database: SQLite (`better-sqlite3`) + Drizzle ORM
- Validation: Zod

## Quick Start (Local)

Prerequisites:

- Node.js 20+
- npm

Install and run:

```bash
npm install
npm run dev
```

App URL:

- `http://localhost:3000`

## Common Commands

```bash
npm run dev
npm run build
npm run start
npm run test
npm run seed:demo
npm run db:generate
npm run db:migrate
```

## Database Notes

- Local development defaults to `lina-local.db`.
- Docker runtime uses `/app/shared-lina-db-vol/lina_prod.db`.
- To prepare a production-seed file from local data:

```bash
node prepare4export-db.js
```

This generates `lina-prod.db`, which can be copied to the target VM for first-time seeding.

## Root Documentation Index

- [README.md](README.md): high-level project overview and entry point
- [corp-deploy.md](corp-deploy.md): corporate deployment standard (build-only CI + manual deploy)
- [manual-workflow.md](manual-workflow.md): day-to-day operational runbook for manual deployment flow
- [make-changes-request.md](make-changes-request.md): company-laptop setup, PR creation/merge guide, and no-PR fallback
