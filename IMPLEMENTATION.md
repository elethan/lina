# Implementation Log

> A record of recent changes and implemented features.

## 2026-02-28

- **Work Orders Page (`/work-orders`)**
  - Updated the ambiguously named "Asset" table column header to "**Serial No.**".
  - Refined table typography by applying a monospaced font to all columns (except the "Description" column) for improved glanceability.
  - Adjusted the Status dropdown filter to default to "**Open**" instead of showing all statuses by default.
  - Ensured URL routing search parameters remained clean (e.g., hiding `?status=Open` from the URL since it's the new default state).
