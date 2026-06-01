---
name: Sikka transit_lines seeding
description: Non-obvious gotchas when seeding/clearing transit_lines (buses, serfis, microbus) from CSV
---

# Seeding transit_lines

**`via_stops` is a Postgres `text[]` array, NOT jsonb.** When inserting via raw `pg`,
pass a native JS array (`o.viaStops`), never `JSON.stringify(...)` — stringifying
produces a malformed-array error.
**Why:** the column is declared `text("via_stops").array()` in the Drizzle schema.

**`line_number` is nullable** so microbuses (which genuinely have no route number)
can be seeded. Postgres treats multiple NULLs as distinct, so a unique constraint on
`(transport_type_id, line_number)` still prevents duplicate *numbered* lines while
allowing many unnumbered microbus rows.
**How to apply:** any UI/type consuming a line must treat `lineNumber` as `string | null`
(guard `.toLowerCase()` etc.) and only display the number when present.

**Seeding needs admin auth** (`requireAdmin`). For a one-off clear+reseed without auth,
run the standalone Node script `artifacts/api-server/scripts/seedRun.mjs` from **bash**
(it reads `DATABASE_URL` from env; the code_execution sandbox lacks env vars, so it
fails there). The canonical path is the `POST /api/admin/seed-from-csv?clear=true` route.
