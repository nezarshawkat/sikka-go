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

**Unique constraint**: `transit_lines(transport_type_id, line_number)` — added to prevent duplicate route entries.

**`transit_lines.governorate`** (text, default 'Cairo') — drives the admin map's governorate filter; the "All stations" selector derives unique stop strings from `via_stops`/`from_area`/`to_area` of lines in the active governorate.

### Transport Types (seeded in DB)

| Name | Arabic | Price | Routes |
|---|---|---|---|
| Metro | مترو | fixed | 77 stop-pair routes (Lines 1-3) |
| Train | قطار | fixed | 28 intercity routes |
| Monorail | مونوريل | fixed | 16 stop-pair routes |
| NTA Bus | أتوبيس النقل الجماعي | 19 EGP | 110 Cairo routes |
| CTA Bus | أتوبيس الهيئة | 13 EGP | 31 Alexandria (APTA) routes |
| Serfis | سرفيس | 5 EGP + 0.5/km | 20 Cairo routes |
| Bus (CTA) | أتوبيس الهيئة | legacy | 0 (legacy type, superseded by CTA Bus) |
| Microbus | ميكروباص | variable | variable routes via stops |
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
