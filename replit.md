# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Sikka is a Cairo transit planning app migrated from Lovable.dev/Supabase to a Replit-native stack.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 (api-server on port 8080)
- **Database**: Replit PostgreSQL + Drizzle ORM (`lib/db`)
- **Auth (users)**: Clerk (`@clerk/clerk-sdk-node` on API, `@clerk/clerk-react` on frontend)
- **Auth (admin)**: Clerk user + `POST /api/auth/setup-admin` grants isAdmin role (credentials in Replit Secrets: `ADMIN_USERNAME`, `ADMIN_PASSWORD`)
- **Frontend**: React + Vite (`artifacts/sikka`, port 18322)
- **Map**: Mapbox GL JS (`react-map-gl/mapbox`)

## Key Commands

- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server
- `pnpm --filter @workspace/sikka run dev` — run frontend

## Project: Sikka (Cairo Transit App)

### Architecture

- **Frontend** (`artifacts/sikka/`) — React + Vite app, Vite proxy forwards `/api/*` → `localhost:8080`
- **API Server** (`artifacts/api-server/`) — Express app with all data routes
- **DB** (`lib/db/`) — Drizzle schema (14 tables), Replit PostgreSQL

### Auth Flow

- **Regular users**: Clerk sign-in (email + Google OAuth) → `useUser()` in frontend → `clerkAuth` middleware on API reads `Authorization: Bearer <session_token>`
- **Admin users**: Any Clerk user can call `POST /api/auth/setup-admin` with `{username, password}` matching Replit Secrets to gain `isAdmin: true` on their profile
- **Profile auto-creation**: `GET /api/profile` creates the profile row on first access for new Clerk users
- **Clerk env vars**: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`

### API Routes

| Route | Description |
|---|---|
| `POST /api/auth/setup-admin` | Grant admin role to authenticated Clerk user |
| `GET/PUT /api/profile` | User profile (auto-creates on first GET) |
| `GET/POST/PUT/DELETE /api/transport-types` | Transport types |
| `GET/POST/PUT/DELETE /api/transit-lines` | Transit lines |
| `GET/POST/PUT/DELETE /api/locations` | Locations |
| `GET/POST/PUT/DELETE /api/mawaqef` | Bus/transit terminals |
| `GET/POST/DELETE /api/reviews` | User reviews |
| `GET/POST/PUT/DELETE /api/heatmaps` | Heatmap data |
| `GET /api/analytics` | Admin analytics |
| `GET/POST/DELETE /api/trips` | User trips |
| `POST /api/trips/plan` | AI trip planning (OpenAI + fallback) |

### DB Schema (14 tables)

All Drizzle columns use camelCase in JS/TS. API responses are camelCase.

- `profiles`, `user_roles`, `otp_codes`, `phone_sessions` (otp/phone tables unused but kept)
- `transport_types`, `transit_lines`, `locations`, `mawaqef`
- `trips`, `trip_segments`, `reviews`, `transport_heatmaps`
- `trip_notifications`, `trip_shares`

**No unique constraint on `transit_lines`** (only PK on `id`). `line_number` is intentionally non-unique: it is nullable for microbuses and is legitimately shared across routes (e.g. dual-number merges like `"123 / 456"`, and the same number reused in different governorates). Do not assume `(transport_type_id, line_number)` is unique.

**`transit_lines.governorate`** (text, default 'Cairo') — drives the admin map's governorate filter; the "All stations" selector derives unique stop strings from `via_stops`/`from_area`/`to_area` of lines in the active governorate.

### Transport Types (seeded in DB)

| Name | Arabic | Price | Routes |
|---|---|---|---|
| Metro | مترو | fixed | 3 GTFS lines (M1/M2/M3, named stations + real geometry) |
| Train | قطار | fixed | 28 intercity routes |
| Monorail | مونوريل | fixed | 16 stop-pair routes |
| NTA Bus | أتوبيس النقل الجماعي | 19 EGP | 177 routes (149 legacy + 28 GTFS CTA) |
| CTA Bus | أتوبيس الهيئة | 13 EGP | 146 routes (Alexandria APTA + legacy Cairo CTA, untouched by GTFS) |
| Serfis | سرفيس | 5 EGP + 0.5/km | 61 routes (36 legacy + 25 GTFS CTA_M/COOP) |
| Bus (CTA) | أتوبيس الهيئة | legacy | 0 (legacy type, superseded by CTA Bus) |
| Microbus | ميكروباص | variable | 187 routes (26 legacy + 161 GTFS BOX/P_B_8/P_O_14) |
| Tuktuk | توك توك | heatmap only | no fixed routes |
| White Taxi | تاكسي أبيض | heatmap only | no fixed routes |
| Uber / Careem | أوبر / كريم | dynamic | always provided as AI fallback |

### Seed Endpoints (admin only)

| Endpoint | Description |
|---|---|
| `POST /api/admin/seed-cairo` | All Cairo types + Metro/Monorail/Train/NTA Bus/Serfis |
| `POST /api/admin/seed-cairo?section=nta` | NTA Bus routes only |
| `POST /api/admin/seed-cairo?section=serfis` | Serfis routes only |
| `POST /api/admin/seed-cairo?generatePaths=true` | Also geocode + snap to roads via Mapbox |
| `POST /api/admin/seed-alexandria` | Alexandria APTA routes (CTA Bus type, 31 routes) |
| `POST /api/admin/seed-alexandria?generatePaths=true` | Also geocode + snap to roads |
| `POST /api/admin/seed-gtfs` | Import authoritative Transport-for-Cairo GTFS (Metro replace + bus/serfis/microbus merge) |
| `POST /api/admin/seed-gtfs?dryRun=true` | Report what GTFS import would change without writing |

### Deterministic Routing Engine (`artifacts/api-server/src/engine/`)

`POST /api/trips/plan` (city mode) runs a deterministic transfer-graph + Dijkstra search over verified DB data only — it never invents routes (AI is for optional explanations only, with a deterministic fallback).

- **Board-anywhere densification** (`graph.ts`): bus/serfis/microbus lines (`hasFixedStops=false`) get synthetic boarding points sampled ~every 1 km along `route_path` (labeled with nearest named stop). Riders board at the nearest point and ride only the needed slice instead of detouring to sparse hubs. Rail keeps named stops only.
- **Pathfinder** (`pathfinder.ts`): Pareto-dominance labeling over `(weight, totalWalk, contiguousWalk)`. The contiguous-walk term forbids chaining two short walk edges through an unboarded stop into one over-long walk. Walk caps derive from `WALK_MAX_KM` (0.8 km) in `cost.ts` (single ~0.8 km, total ~1.6 km). `CONNECTOR_MODES` (walk/taxi/tuktuk) are always traversable; per-profile availability is decided in `buildOverlay`.
- **Connector fill** (`planner.ts` `buildOverlay`): a single `connect()` helper makes a walk edge only when the access gap is ≤ `WALK_MAX_KM` (0.8 km); any longer gap is bridged on-street by a tuktuk (economic/comfortable, ≤3 km) and/or a taxi (every profile, ≤5 km). Premium also always offers a door-to-door taxi.
- **Connector geometry snapping** (`planner.ts` `adaptPlanToApi`, async): walk legs are snapped to the pedestrian network via OSRM foot routing (`snapFootOsrm()`, FOSSGIS public instance by default, no token, override with `OSRM_FOOT_URL`; falls back to Mapbox `walking` then straight-line). Taxi/tuktuk legs are snapped via Mapbox `snapConnector("driving")`. Transit legs keep their DB `route_path` polyline.
- **Fares** (`cost.ts`): `FARE_MARKUP` (1.25) is applied once each in `directFare`/`boardingFare`/`rideCostPerKm`, so transit + taxi/tuktuk fares rise together. API `budget_range` is `min*0.8 / max*1.6` (estimate band, not exact fare).
- **Detour cap**: a plan's total distance must stay under `max(directKm*2.8 + 3, 5)` km; otherwise the least-distance valid plan is returned. `validatePlan` is a hard gate — only valid plans are returned, else the caller falls back to a verified taxi option.
- Leg distance is computed from consecutive `line.stops[]` haversine (NOT from the stored `route_path` polyline, which can be noisy); the polyline is for map display only.

### GTFS Import (Transport-for-Cairo)

`POST /api/admin/seed-gtfs` imports the authoritative Transport-for-Cairo GTFS feed (GCR Digital Cairo 2017 — `20180906_GTFSfullworking_Bus_Metro`). Source data is vendored compact at `artifacts/api-server/src/data/gtfsCairo.json` (3 metro lines + 214 bus/paratransit routes, each with real shape geometry); generated once from the feed, no runtime dependency on the raw CSVs. Core logic is `runGtfsImport()` in `routes/seedGtfs.ts`, also runnable as a build script (`node dist/scripts/runGtfsImport.mjs [--apply]`, dry-run by default).

- **Agency → type mapping** (all target types pre-exist): `NAT`→Metro, `CTA`→NTA Bus, `CTA_M`+`COOP`→Serfis, `P_O_14`+`P_B_8`+`BOX`→Microbus.
- **Metro = full replace**: existing Metro lines are deleted and replaced by the 3 GTFS lines (`hasFixedStops=true`, ordered named stations in `via_stops`, real `route_path`); station `locations` are upserted (isStation=true).
- **Bus/Serfis/Microbus = insert + keep**: every GTFS route is inserted; every existing non-covered line is KEPT. When a GTFS route matches an existing same-type line by endpoint proximity (≤1.5 km, either orientation) it is merged into one line carrying BOTH numbers (`"<gtfs#> / <old#>"`) and the authoritative GTFS geometry. In the current feed the GTFS bus routes cover satellite cities (6th October, 10th Ramadan, New Cairo) that don't overlap the legacy central-Cairo data, so no merges occur — all legacy lines are retained.
- **CTA Bus type (Alexandria) and Monorail are untouched.**
- GTFS geometry appears on the map automatically: `AdminMap` renders every line's `route_path`, and the routing engine uses it for trip legs.

### Route Path Generation

- Client-side: `buildPathFromLineText` in AdminMap.tsx — geocodes stops + Mapbox Directions snap-to-roads
- Server-side: `artifacts/api-server/src/utils/routePathGenerator.ts` — same logic, used by seed endpoints with `?generatePaths=true`
- All bus/serfis routes use `hasFixedStops: false` — users board/alight anywhere along the route

### Key Files

- `artifacts/sikka/src/contexts/AuthContext.tsx` — Clerk-based auth context (`useUser`, `useClerkAuth`)
- `artifacts/sikka/src/pages/SignIn.tsx` / `SignUp.tsx` — Clerk branded sign-in/up pages
- `artifacts/sikka/src/lib/api.ts` — Fetch wrapper (Clerk session token via `getToken()`)
- `artifacts/sikka/src/App.tsx` — `ClerkProvider` wrapping `AppRoutes` inside `BrowserRouter`
- `artifacts/api-server/src/middlewares/clerkAuth.ts` — Clerk middleware (sets `req.userId`)
- `artifacts/api-server/src/app.ts` — Express app with Clerk proxy + middleware
- `artifacts/api-server/src/routes/auth.ts` — `setup-admin` endpoint
- `artifacts/api-server/src/routes/profile.ts` — Auto-creates profile on first access
- `artifacts/api-server/src/routes/index.ts` — All routes wired with `clerkAuth`
- `lib/db/src/schema/sikka.ts` — Full 14-table Drizzle schema
- `artifacts/api-server/src/routes/seedCairo.ts` — Cairo seed: Metro/Monorail/Train/CTA Bus/NTA Bus (~110 routes)/Serfis
- `artifacts/api-server/src/routes/seedAlexandria.ts` — Alexandria APTA 31 routes
- `artifacts/api-server/src/utils/routePathGenerator.ts` — Server-side geocode + snap-to-roads

### Environment Variables / Secrets

- `CLERK_SECRET_KEY` — Clerk backend secret key (Replit Secret)
- `CLERK_PUBLISHABLE_KEY` — Clerk publishable key (Replit Secret)
- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key for Vite frontend (Replit Secret)
- `ADMIN_USERNAME` — Admin setup username (Replit Secret)
- `ADMIN_PASSWORD` — Admin setup password (Replit Secret)
- `DATABASE_URL` — Replit PostgreSQL connection string (auto-provided)
- `VITE_MAPBOX_TOKEN` — Mapbox access token
- `OPENAI_API_KEY` — OpenAI key for trip planning (optional, falls back gracefully)
